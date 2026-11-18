import { describe, expect, it } from "vitest";
import { botBattleChoice, botBattleInitiationChoice, botItemChoice, botMoveChoice, createRng, walkForward } from "../src/index";
import { makeMatch } from "./helpers";

describe("bot saved-die choices", () => {
  it("sometimes spends a lower-tier die on movement while preserving higher dice", () => {
    const state = makeMatch(4);
    state.players[0]!.dice.push(
      { id: "d8", sides: 8 },
      { id: "d10", sides: 10 },
      { id: "d12", sides: 12 },
    );
    const choice = Array.from({ length: 100 }, (_, seed) =>
      botMoveChoice(state, "p1", createRng(seed + 1)),
    ).find((candidate) => candidate.die === "d8");

    expect(choice?.die).toBe("d8");
  });

  it("spends a saved die to improve revival odds, but keeps the higher tier for battle", () => {
    const state = makeMatch(4);
    const player = state.players[0]!;
    player.dead = true;
    player.reviveRequirement = 6;
    player.dice.push(
      { id: "d8", sides: 8 },
      { id: "d10", sides: 10 },
      { id: "d12", sides: 12 },
    );

    const choices = Array.from({ length: 1_000 }, (_, seed) =>
      botMoveChoice(state, "p1", createRng(seed + 1)),
    );
    expect(choices.some((candidate) => candidate.die === "d8")).toBe(true);
    expect(choices.some((candidate) => candidate.die === "d12")).toBe(true);
    expect(botBattleChoice(state, "p1").die).toBe("d12");
  });

  it("makes bots more likely to initiate battles as they approach the finish", () => {
    const state = makeMatch(4);
    const startDistance = state.board.spaces[state.board.start]!.distanceToFinish;
    const lateSpace = state.board.spaces.find(
      (space) => space.lane !== null && space.distanceToFinish > 0 && space.distanceToFinish < startDistance / 10,
    )!;
    const countInitiations = (position: number) => {
      state.players[0]!.position = position;
      state.players[1]!.position = position;
      return Array.from({ length: 500 }, (_, seed) =>
        botBattleInitiationChoice(state, "p1", ["p2"], createRng(seed + 1)).target,
      ).filter((target) => target !== null).length;
    };

    expect(countInitiations(lateSpace.id)).toBeGreaterThan(countInitiations(state.board.start));
  });

  it("never initiates battles when stuck with a d4", () => {
    const state = makeMatch(4);
    state.players[0]!.defaultDie = 4;
    for (let seed = 1; seed <= 20; seed++) {
      expect(botBattleInitiationChoice(state, "p1", ["p2"], createRng(seed)).target).toBeNull();
    }
  });

  it("prefers d4 opponents as battle targets", () => {
    const state = makeMatch(4);
    const startDistance = state.board.spaces[state.board.start]!.distanceToFinish;
    const lateSpace = state.board.spaces.find(
      (space) => space.lane !== null && space.distanceToFinish > 0 && space.distanceToFinish < startDistance / 10,
    )!;
    state.players[0]!.position = lateSpace.id;
    state.players[1]!.position = lateSpace.id;
    state.players[1]!.defaultDie = 4;
    state.players[2]!.position = lateSpace.id;

    let d4Challenges = 0;
    let d6Challenges = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const target = botBattleInitiationChoice(state, "p1", ["p2", "p3"], createRng(seed)).target;
      if (target === "p2") d4Challenges++;
      if (target === "p3") d6Challenges++;
    }
    expect(d4Challenges).toBeGreaterThan(d6Challenges);
  });
});

describe("bot item-use decisions", () => {
  function hold(state: ReturnType<typeof makeMatch>, kind: string): void {
    state.players[0]!.items = [{ id: "item1", kind: kind as never }];
    state.players[0]!.coins = 0;
  }

  it("always prioritizes Holy Sugar Dust when knocked out", () => {
    const state = makeMatch(4);
    state.players[0]!.dead = true;
    state.players[0]!.items = [
      { id: "dust", kind: "holySugarDust" },
      { id: "missile", kind: "candyMissile" },
    ];

    for (let seed = 1; seed <= 100; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toEqual({ itemId: "dust" });
    }
  });

  it("targets the opponent with the most coins using Chocolate Coin Monster", () => {
    const state = makeMatch(4);
    hold(state, "coinThief");
    state.players[1]!.coins = 5;
    state.players[2]!.coins = 40;
    state.players[3]!.coins = 20;

    for (let seed = 1; seed <= 100; seed++) {
      const use = botItemChoice(state, "p1", createRng(seed)).use;
      if (use?.itemId === "item1") expect(use.target).toBe("p3");
    }
  });

  it("uses Hyper Candy only when the bot has a d4 or d6", () => {
    const state = makeMatch(4);
    hold(state, "hyperCandy");
    for (let seed = 1; seed <= 100; seed++) {
      const use = botItemChoice(state, "p1", createRng(seed)).use;
      if (use?.itemId === "item1") expect([4, 6]).toContain(state.players[0]!.defaultDie);
    }
    state.players[0]!.defaultDie = 4;
    expect(
      Array.from({ length: 100 }, (_, seed) => botItemChoice(state, "p1", createRng(seed + 1)).use)
        .some((use) => use?.itemId === "item1"),
    ).toBe(true);
    state.players[0]!.defaultDie = 6;
    expect(
      Array.from({ length: 100 }, (_, seed) => botItemChoice(state, "p1", createRng(seed + 1)).use)
        .some((use) => use?.itemId === "item1"),
    ).toBe(true);
  });

  it("only uses Swap Candy when first place is at least ten spaces ahead", () => {
    const state = makeMatch(4);
    hold(state, "swapCandy");
    const back = state.board.spaces[state.board.start]!;
    const front = state.board.spaces.find((space) =>
      space.distanceToFinish === back.distanceToFinish - 10,
    )!;
    state.players[0]!.position = front.id;
    for (const player of state.players.slice(1)) player.position = back.id;
    for (let seed = 1; seed <= 100; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
    }

    state.players[0]!.position = back.id;
    for (const player of state.players.slice(1)) player.position = front.id;
    const uses = Array.from({ length: 500 }, (_, seed) =>
      botItemChoice(state, "p1", createRng(seed + 1)).use,
    ).filter((use) => use?.itemId === "item1").length;
    expect(uses).toBeGreaterThan(100);
  });

  it("makes Moonwalk Ring more likely to be used near the front", () => {
    const state = makeMatch(4);
    hold(state, "moonwalkRing");
    const start = state.board.spaces[state.board.start]!;
    const front = state.board.spaces.find((space) =>
      space.distanceToFinish < start.distanceToFinish &&
      space.distanceToFinish < start.distanceToFinish / 2,
    )!;
    const ahead = state.board.spaces.find((space) => space.distanceToFinish < front.distanceToFinish)!;
    const useCount = (position: number) => {
      for (const opponent of state.players.slice(1)) opponent.position = front.id;
      state.players[0]!.position = position;
      return Array.from({ length: 500 }, (_, seed) =>
        botItemChoice(state, "p1", createRng(seed + 1)).use,
      ).filter((use) => use?.itemId === "item1").length;
    };
    expect(useCount(ahead.id)).toBeGreaterThan(useCount(start.id));
  });

  it("chooses the furthest safe Custom Dice Roll destination within the roll", () => {
    const state = makeMatch(4);
    const player = state.players[0]!;
    player.position = state.board.start;
    player.dice = [];
    state.pendingItems = {
      mods: Object.fromEntries(state.players.map((candidate) => [candidate.id, {
        sandDie: false, weights: 0, weightSources: [], booster: false, extraDie: false,
        extraDice: 0, rollBonuses: [], customRoll: candidate.id === player.id,
        hyperCandy: false, moveBackwards: false, pairOfCandy: false,
      }])),
      forcedBack: [], shielded: [], trapImmune: [], stuck: [], jellyBattles: [], plays: [],
    };
    const choice = botMoveChoice(state, player.id, createRng(1));
    expect(choice.customSpaces).toBeDefined();
    const path = walkForward(state.board, player.position, choice.customSpaces!, choice.lane);
    const destination = path.length ? state.board.spaces[path.at(-1)!]! : state.board.spaces[player.position]!;
    expect(["black", "maroon", "purple"]).not.toContain(destination.type);
  });

  it("does not waste Candy Gun outside its guaranteed-hit range", () => {
    const state = makeMatch(4);
    hold(state, "candyGun");
    const farSpace = state.board.spaces.find((space) =>
      space.id !== state.board.start &&
      Math.abs(space.distanceToFinish - state.board.spaces[state.board.start]!.distanceToFinish) >= 5,
    )!;
    for (const opponent of state.players.slice(1)) opponent.position = farSpace.id;

    for (let seed = 1; seed <= 30; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
    }
  });

  it("only uses Swap Candy when first place is at least ten spaces ahead", () => {
    const state = makeMatch(4);
    hold(state, "swapCandy");
    const start = state.board.spaces[state.board.start]!;
    const tenAhead = state.board.spaces.find((space) =>
      space.distanceToFinish === start.distanceToFinish - 10,
    )!;
    state.players[0]!.position = start.id;
    state.players[1]!.position = tenAhead.id;
    for (const opponent of state.players.slice(2)) opponent.position = start.id;
    for (let seed = 1; seed <= 30; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
    }

    state.players[2]!.position = tenAhead.id;
    expect(Array.from({ length: 30 }, (_, seed) => botItemChoice(state, "p1", createRng(seed + 1)).use)
      .some((use) => use?.itemId === "item1")).toBe(true);
    const nineAhead = state.board.spaces.find((space) =>
      space.distanceToFinish === start.distanceToFinish - 9,
    )!.id;
    state.players[1]!.position = nineAhead;
    state.players[2]!.position = nineAhead;
    for (let seed = 1; seed <= 30; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
    }
  });

  it("avoids Candy Explosion targets whose success radius would include the bot", () => {
    const state = makeMatch(4);
    hold(state, "candyExplosion");
    const start = state.board.spaces[state.board.start]!;
    state.players[0]!.position = start.id;
    for (const opponent of state.players.slice(1)) opponent.position = start.id;
    for (let seed = 1; seed <= 30; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
    }
  });

  it("uses Candy Shotgun only when an opponent is within three spaces ahead", () => {
    const state = makeMatch(4);
    hold(state, "candyShotgun");
    for (let seed = 1; seed <= 30; seed++) {
      expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
    }

    const start = state.board.spaces[state.board.start]!;
    const ahead = state.board.spaces.find((space) =>
      space.distanceToFinish < start.distanceToFinish &&
      start.distanceToFinish - space.distanceToFinish <= 3,
    )!;
    state.players[1]!.position = ahead.id;
    expect(
      Array.from({ length: 30 }, (_, seed) => botItemChoice(state, "p1", createRng(seed + 1)).use)
        .some((use) => use?.itemId === "item1"),
    ).toBe(true);
  });

  it("does not use Mimic or Trained Mimic when opponents have no items", () => {
    for (const kind of ["mimic", "trainedMimic"]) {
      const state = makeMatch(4);
      hold(state, kind);
      for (let seed = 1; seed <= 30; seed++) {
        expect(botItemChoice(state, "p1", createRng(seed)).use).toBeNull();
      }
    }
  });
});
