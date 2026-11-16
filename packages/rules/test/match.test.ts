import { describe, expect, it } from "vitest";
import { createMatch, createRng, pendingDecisions, randInt, resolvePhase, rollDie, runBotMatch, walkForward } from "../src/index";
import { makeMatch } from "./helpers";

describe("createMatch", () => {
  it.each([3, 13])("rejects %i players", (count) => {
    expect(() => makeMatch(count)).toThrow();
  });

  it("rejects duplicate player ids", () => {
    const players = Array.from({ length: 4 }, () => ({ id: "same", name: "X", isBot: true }));
    expect(() => createMatch({ players, seed: 1 })).toThrow();
  });

  it("starts everyone on the start space with a d6", () => {
    const state = makeMatch(8);
    for (const player of state.players) {
      expect(player.position).toBe(state.board.start);
      expect(player.defaultDie).toBe(6);
    }
    expect(state.phase).toEqual({ kind: "move" });
  });
});

describe("move phase", () => {
  it("asks every player for a die and a path", () => {
    const state = makeMatch(7);
    const decisions = pendingDecisions(state);
    expect(decisions).toHaveLength(7);
    expect(decisions[0]).toMatchObject({
      playerId: "p1",
      kind: "move",
      dice: [{ id: null, sides: 6 }],
      lanes: 2,
    });
  });

  it("asks for items and shop choices from round 2", () => {
    const state = makeMatch(4);
    state.round = 2;
    state.phase = { kind: "items" };
    const decisions = pendingDecisions(state);
    expect(decisions[0]).toMatchObject({
      playerId: "p1",
      kind: "items",
      items: [],
      targets: ["p2", "p3", "p4"],
      maxHeld: 99,
    });
    expect(decisions[0]!.kind === "items" && decisions[0]!.trapSpaces.length).toBeGreaterThan(0);
  });

  it("uses up a saved die and rolls it", () => {
    const state = makeMatch(4);
    state.players[0]!.dice.push({ id: "die7", sides: 10 });
    const { state: after, events } = resolvePhase(state, { kind: "move", choices: { p1: { die: "die7", lane: 0 } } });

    expect(after.players[0]!.dice).toEqual([]);
    expect(events.find((e) => e.type === "dieRolled" && e.playerId === "p1")).toMatchObject({ sides: 10, saved: true });
  });

  it("lets a dead player choose a saved die even during a d4 penalty", () => {
    const state = makeMatch(4);
    state.players[0]!.dead = true;
    state.players[0]!.defaultDie = 4;
    state.players[0]!.dice.push({ id: "saved", sides: 10 });
    const decision = pendingDecisions(state).find((item) => item.playerId === "p1")!;
    expect(decision.kind === "move" ? decision.dice : []).toEqual([
      { id: null, sides: 4 },
      { id: "saved", sides: 10 },
    ]);
  });

  it("does not offer saved dice on a Maroon-skipped move", () => {
    const state = makeMatch(4);
    state.players[0]!.skipNextMove = true;
    state.players[0]!.dice.push({ id: "saved", sides: 12 });
    const decision = pendingDecisions(state).find((item) => item.playerId === "p1")!;
    expect(decision.kind === "move" ? decision.dice : []).toEqual([{ id: null, sides: 6 }]);

    const { events } = resolvePhase(state, { kind: "move", choices: { p1: { die: null, lane: 0 } } });
    expect(events).toContainEqual({ type: "moveSkipped", playerId: "p1" });
    expect(events.some((event) => event.type === "dieRolled" && event.playerId === "p1")).toBe(false);
  });

  it("knocks out a player who lands on Black", () => {
    const state = makeMatch(4);
    const route = walkForward(state.board, state.board.start, 3, 0);
    state.board.spaces[route[0]!]!.type = "black";
    const seed = Array.from({ length: 10_000 }, (_, i) => i + 1)
      .find((value) => rollDie(createRng(value), 6) === 1)!;
    state.rng = createRng(seed);

    const { state: after, events } = resolvePhase(state, {
      kind: "move",
      choices: { p1: { die: null, lane: 0 } },
    });

    expect(after.players[0]!.dead).toBe(true);
    expect(after.players[0]!.reviveRequirement).toBe(6);
    expect(events).toContainEqual({ type: "playerDied", playerId: "p1", reason: "blackSpace" });
  });

  it("lowers revival requirement after a failed roll and revives without triggering the current space at zero movement", () => {
    const state = makeMatch(4);
    const player = state.players[0]!;
    player.dead = true;
    player.reviveRequirement = 6;
    const failSeed = Array.from({ length: 10_000 }, (_, i) => i + 1)
      .find((value) => rollDie(createRng(value), 6) === 5)!;
    state.rng = createRng(failSeed);
    const failed = resolvePhase(state, {
      kind: "move",
      choices: { p1: { die: null, lane: 0 } },
    });
    expect(failed.state.players[0]!.dead).toBe(true);
    expect(failed.state.players[0]!.reviveRequirement).toBe(5);
    expect(failed.events).toContainEqual({
      type: "revivalFailed", playerId: "p1", rolled: 5, requirement: 6, nextRequirement: 5,
    });

    const retry = structuredClone(failed.state);
    retry.phase = { kind: "move" };
    retry.players[0]!.reviveRequirement = 1;
    const successSeed = Array.from({ length: 10_000 }, (_, i) => i + 1)
      .find((value) => rollDie(createRng(value), 6) === 1)!;
    retry.rng = createRng(successSeed);
    const revived = resolvePhase(retry, {
      kind: "move",
      choices: { p1: { die: null, lane: 0 } },
    });
    expect(revived.state.players[0]!.dead).toBe(false);
    expect(revived.state.players[0]!.position).toBe(retry.board.start);
    expect(revived.events).toContainEqual({
      type: "playerRevived", playerId: "p1", rolled: 1, requirement: 1, spaces: 0,
    });
    expect(revived.events.some((event) => event.type === "moved" && event.playerId === "p1")).toBe(false);
  });

  it("counts item roll modifiers toward a dead player's revival requirement", () => {
    const state = makeMatch(4);
    const player = state.players[0]!;
    player.dead = true;
    player.reviveRequirement = 6;
    state.pendingItems = {
      mods: {
        p1: { sandDie: false, weights: 0, weightSources: [], booster: true, extraDie: false },
      },
      forcedBack: [],
      plays: [],
    };
    const seed = Array.from({ length: 10_000 }, (_, i) => i + 1)
      .find((value) => rollDie(createRng(value), 6) === 3)!;
    state.rng = createRng(seed);

    const { state: after, events } = resolvePhase(state, {
      kind: "move",
      choices: { p1: { die: null, lane: 0 } },
    });

    expect(after.players[0]!.dead).toBe(false);
    expect(events).toContainEqual({
      type: "playerRevived", playerId: "p1", rolled: 6, requirement: 6, spaces: 0,
    });
  });

  it("triggers each arrow space at most once during a chained landing", () => {
    const state = makeMatch(4);
    const route = walkForward(state.board, state.board.start, 40, 0);
    for (const space of state.board.spaces) if (space.lane !== null) space.type = "blue";
    const start = route[10]!;
    const green = route[11]!;
    state.players[0]!.position = start;
    state.board.spaces[green]!.type = "orange";
    const seed = Array.from({ length: 10_000 }, (_, i) => i + 1).find((n) => {
      const rng = createRng(n);
      const firstRoll = rollDie(rng, 6);
      randInt(rng, 0, 0); rollDie(rng, 6);
      randInt(rng, 0, 0); rollDie(rng, 6);
      randInt(rng, 0, 0); rollDie(rng, 6);
      const forward = randInt(rng, 2, 4);
      const backward = randInt(rng, 2, 4);
      return firstRoll === 1 && forward === backward;
    })!;
    const rng = createRng(seed);
    rollDie(rng, 6);
    randInt(rng, 0, 0); rollDie(rng, 6);
    randInt(rng, 0, 0); rollDie(rng, 6);
    randInt(rng, 0, 0); rollDie(rng, 6);
    const forward = randInt(rng, 2, 4);
    state.board.spaces[route[11 + forward]!]!.type = "purple";
    state.rng = createRng(seed);

    const { state: after, events } = resolvePhase(state, {
      kind: "move",
      choices: { p1: { die: null, lane: 0 } },
    });
    const arrows = events.filter((event) => event.type === "arrow" && event.playerId === "p1");
    expect(arrows).toHaveLength(2);
    expect(arrows.map((event) => event.type === "arrow" && event.direction)).toEqual(["forward", "back"]);
    expect(after.players[0]!.position).toBe(green);
  });

  it("falls back to the default die for an unknown die id", () => {
    const state = makeMatch(4);
    const { events } = resolvePhase(state, { kind: "move", choices: { p1: { die: "nope", lane: 0 } } });
    expect(events.find((e) => e.type === "dieRolled" && e.playerId === "p1")).toMatchObject({ sides: 6, saved: false });
  });

  it("does not mutate the state passed in", () => {
    const state = makeMatch(6);
    const before = structuredClone(state);
    resolvePhase(state, { kind: "move", choices: {} });
    expect(state).toEqual(before);
  });

  it("rejects input for the wrong phase", () => {
    const state = makeMatch(4);
    expect(() => resolvePhase(state, { kind: "minigame", ranking: [] })).toThrow(/move/);
  });
});

describe("full bot matches", () => {
  it.each([1, 2, 3, 4, 5])("a 6-bot match reaches a winner (seed %i)", (seed) => {
    const result = runBotMatch({ playerCount: 6, seed });
    expect(result.stalled).toBe(false);
    expect(result.winner).not.toBeNull();
    expect(result.events.at(-1)).toMatchObject({ type: "matchWon" });
  });

  it("replays identically from the same seed", () => {
    const a = runBotMatch({ playerCount: 12, seed: 42 });
    const b = runBotMatch({ playerCount: 12, seed: 42 });
    expect(a.events).toEqual(b.events);
  });
});
