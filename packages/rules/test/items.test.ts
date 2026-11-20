import { describe, expect, it } from "vitest";
import {
  BOUGHT_ITEM,
  awardAuctionItem,
  DEFAULT_ITEM_RULES,
  botItemChoice,
  candyGunSuccessChance,
  checkItemChoice,
  createRng,
  knockOutPlayer,
  randomRewardItem,
  rollDie,
  SHOP_ITEM_KINDS,
  SPECIAL_ITEM_KINDS,
  privateEventOwner,
  pendingDecisions,
  refreshShop,
  resolveCollisions,
  resolvePhase,
  triggerTraps,
  type ItemChoice,
  type ItemKind,
  type MatchEvent,
  type MatchState,
  type MoveChoice,
} from "../src/index";
import { firstSpace, makeMatch, singletonRanking } from "./helpers";

/** Items and the shop open in round 2. */
function itemMatch(playerCount: number): MatchState {
  const state = makeMatch(playerCount);
  state.round = 2;
  state.phase = { kind: "items" };
  refreshShop(state);
  return state;
}

/** Put a rotating item on sale for a test that needs it. */
function stock(state: MatchState, kind: ItemKind): void {
  if (!state.shop.includes(kind)) state.shop = [...state.rules.items.shopAlways, kind];
}

describe("auction awards", () => {
  it("charges the winning bid and adds the selected item without ending the item phase", () => {
    const state = itemMatch(4);
    const beforeCoins = state.players[0]!.coins;
    const result = awardAuctionItem(state, "p1", "trainedMimic", 6);

    expect(result.state.players[0]!.coins).toBe(beforeCoins - 6);
    expect(result.state.players[0]!.items.at(-1)).toMatchObject({ id: "item1", kind: "trainedMimic" });
    expect(result.state.phase).toEqual({ kind: "items" });
    expect(result.events).toEqual([
      { type: "coinsChanged", playerId: "p1", delta: -6, reason: "auction" },
      { type: "auctionWon", playerId: "p1", item: { id: "item1", kind: "trainedMimic" }, bid: 6 },
    ]);
    expect(state.players[0]!.coins).toBe(beforeCoins);
  });
});

function give(state: MatchState, playerId: string, kind: ItemKind): string {
  const id = `item${state.nextItemId++}`;
  state.players.find((p) => p.id === playerId)!.items.push({ id, kind });
  return id;
}

type TestChoice = Partial<MoveChoice & ItemChoice>;

/** Resolves the item phase (when it is next) and then the move phase, so tests can set both at once. */
function move(state: MatchState, choices: Record<string, TestChoice>) {
  const events: MatchEvent[] = [];
  let next = state;
  if (next.phase.kind === "items") {
    const itemChoices = Object.fromEntries(
      Object.entries(choices).map(([id, c]) => [id, { use: c.use ?? null, buy: c.buy ?? null }]),
    );
    const result = resolvePhase(next, { kind: "items", choices: itemChoices });
    next = result.state;
    events.push(...result.events);
    while (next.phase.kind === "battle" && next.phase.beforeMove) {
      const battleChoices = Object.fromEntries(
        next.phase.groups[next.phase.groupIndex]!.contenders.map((id) => [id, { die: null }]),
      );
      const battleResult = resolvePhase(next, { kind: "battle", choices: battleChoices });
      next = battleResult.state;
      events.push(...battleResult.events);
    }
  }
  const full = Object.fromEntries(Object.entries(choices).map(([id, c]) => [id, {
    die: c.die ?? null, lane: c.lane ?? 0, ...(c.customSpaces !== undefined ? { customSpaces: c.customSpaces } : {}),
  }]));
  const result = resolvePhase(next, { kind: "move", choices: full });
  return { state: result.state, events: [...events, ...result.events] };
}

function player(state: MatchState, id: string) {
  return state.players.find((p) => p.id === id)!;
}

function ofType<T extends MatchEvent["type"]>(events: MatchEvent[], type: T) {
  return events.filter((e): e is Extract<MatchEvent, { type: T }> => e.type === type);
}

/** A space after the first checkpoint that collisions apply to, and the checkpoint behind it. */
function midBoard(state: MatchState, stepsPastCheckpoint: number) {
  const checkpoint = firstSpace(state, (s) => s.type === "checkpoint");
  const space = firstSpace(
    state,
    (s) =>
      !s.collisionFree &&
      s.checkpointBehind === checkpoint.id &&
      (s.lane ?? 0) === 0 &&
      checkpoint.distanceToFinish - s.distanceToFinish === stepsPastCheckpoint,
  );
  return { checkpoint, space };
}

describe("first round", () => {
  it("has no item use and no shop", () => {
    const state = makeMatch(4);
    const booster = give(state, "p1", "booster");
    expect(checkItemChoice(state, "p1", { buy: "booster" })).toMatch(/after the first round/);
    expect(checkItemChoice(state, "p1", { use: { itemId: booster } })).toMatch(
      /after the first round/,
    );

    const { state: after, events } = move(state, { p1: { buy: "shove", use: { itemId: booster } } });
    expect(player(after, "p1").items).toContainEqual({ id: booster, kind: "booster" });
    expect(player(after, "p1").coins).toBeGreaterThanOrEqual(10 - 3);
    expect(events.some((e) => e.type === "itemBought" || e.type === "itemUsed")).toBe(false);
  });
});

describe("shop", () => {
  it("prices Floaties at 20 coins and Collisions at 15 coins", () => {
    expect(DEFAULT_ITEM_RULES.prices.floatie).toBe(20);
    expect(DEFAULT_ITEM_RULES.prices.collision).toBe(15);
    expect(DEFAULT_ITEM_RULES.trapCoinsMin).toBe(15);
    expect(DEFAULT_ITEM_RULES.trapCoinsMax).toBe(25);
  });

  it("charges the price and adds the item privately", () => {
    const state = itemMatch(4);
    const { state: after, events } = move(state, { p1: { buy: "booster" } });

    expect(player(after, "p1").items.map((i) => i.kind)).toEqual(["booster"]);
    expect(events).toContainEqual({ type: "coinsChanged", playerId: "p1", delta: -7, reason: "shop" });
    const bought = ofType(events, "itemBought")[0]!;
    expect(privateEventOwner(bought)).toBe("p1");
  });

  it("refuses purchases you can't afford or have no room for", () => {
    const state = itemMatch(4);
    player(state, "p1").coins = 4;
    expect(checkItemChoice(state, "p1", { buy: "booster" })).toMatch(/coins/);

    player(state, "p2").coins = 50;
    stock(state, "shove");
    const kept = give(state, "p2", "booster");
    for (let i = 0; i < 98; i++) give(state, "p2", "booster");
    expect(checkItemChoice(state, "p2", { buy: "shove" })).toMatch(/hold 99/);
    expect(checkItemChoice(state, "p2", { buy: "shove", use: { itemId: kept } })).toBeNull();
  });

  it("lets you use the item you buy in the same round", () => {
    const state = itemMatch(4);
    const { state: after, events } = move(state, { p1: { buy: "weight", use: { itemId: BOUGHT_ITEM, target: "p2" } } });

    expect(player(after, "p1").items).toEqual([]);
    expect(player(after, "p1").coins).toBeLessThanOrEqual(10 - 7 + 3);
    expect(events).toContainEqual({ type: "itemUsed", playerId: "p1", kind: "weight", target: "p2" });
    expect(ofType(events, "rollChanged").find((e) => e.playerId === "p2")).toMatchObject({ kind: "weight" });
  });

  it("lets a full inventory buy and use an item, but only one item use per round", () => {
    const state = itemMatch(4);
    player(state, "p1").coins = 50;
    for (let i = 0; i < 99; i++) give(state, "p1", "booster");
    stock(state, "extraDie");
    expect(checkItemChoice(state, "p1", { buy: "booster", use: { itemId: BOUGHT_ITEM } })).toBeNull();
    const { state: after } = move(state, { p1: { buy: "extraDie", use: { itemId: BOUGHT_ITEM } } });
    expect(player(after, "p1").items).toHaveLength(99);
    expect(player(after, "p1").items.every((i) => i.kind === "booster")).toBe(true);
  });

  it("won't use a bought item without a purchase, or when the purchase fails", () => {
    const state = itemMatch(4);
    expect(checkItemChoice(state, "p1", { use: { itemId: BOUGHT_ITEM } })).toMatch(/Buy an item/);
    player(state, "p1").coins = 2;
    expect(checkItemChoice(state, "p1", { buy: "booster", use: { itemId: BOUGHT_ITEM } })).toMatch(
      /coins/,
    );
    const { events } = move(state, { p1: { buy: "booster", use: { itemId: BOUGHT_ITEM } } });
    expect(events.some((e) => e.type === "itemUsed" || e.type === "itemBought")).toBe(false);
  });

  it("ignores an invalid purchase but still moves the player", () => {
    const state = itemMatch(4);
    player(state, "p1").coins = 0;
    const { state: after, events } = move(state, { p1: { buy: "shove" } });

    expect(player(after, "p1").items).toEqual([]);
    expect(ofType(events, "dieRolled").some((e) => e.playerId === "p1")).toBe(true);
  });
});

describe("Candy Gun chance", () => {
  it.each([
    [0, 1],
    [3, 1],
    [4, 0.85],
    [9, 0.1],
    [20, 0.1],
  ])("uses the same success chance formula at distance %i", (distance, chance) => {
    expect(candyGunSuccessChance(distance)).toBeCloseTo(chance);
  });

  it("records a successful guaranteed-range shot in the item result", () => {
    const state = itemMatch(4);
    const itemId = give(state, "p1", "candyGun");
    const result = resolvePhase(state, {
      kind: "items",
      choices: { p1: { use: { itemId, target: "p2" }, buy: null } },
    });
    expect(result.itemPlays?.find((play) => play.kind === "candyGun")).toMatchObject({
      outcome: "success",
      affectedPlayers: ["p2"],
    });
  });

  it("counts a knocked-out first-place player when recording Power Creep's movement gain", () => {
    const state = itemMatch(4);
    const leader = state.board.spaces.find((space) => space.distanceToFinish === 10)!;
    const trailingPlayer = state.board.spaces.find((space) => space.distanceToFinish === 28)!;
    player(state, "p1").position = trailingPlayer.id;
    player(state, "p2").position = leader.id;
    player(state, "p2").dead = true;
    const itemId = give(state, "p1", "powerCreep");
    const result = resolvePhase(state, {
      kind: "items",
      choices: { p1: { use: { itemId }, buy: null } },
    });
    expect(result.itemPlays?.find((play) => play.kind === "powerCreep")?.amount).toBe(6);
  });
});

describe("bot Collision timing", () => {
  it("saves Collision until someone has passed the first checkpoint", () => {
    let usedBeforeCheckpoint = false;
    let usedAfterCheckpoint = false;
    for (let seed = 1; seed <= 200; seed++) {
      const before = itemMatch(4);
      const itemId = give(before, "p1", "collision");
      const early = botItemChoice(before, "p1", createRng(seed));
      if (early.use?.itemId === itemId) usedBeforeCheckpoint = true;

      const after = itemMatch(4);
      const afterItemId = give(after, "p1", "collision");
      const checkpoint = firstSpace(after, (space) => space.type === "checkpoint" && space.segment === 0);
      after.players[1]!.position = after.board.spaces[checkpoint.id]!.next[0]!;
      const late = botItemChoice(after, "p1", createRng(seed));
      if (late.use?.itemId === afterItemId && late.use.target === "p2") usedAfterCheckpoint = true;
    }
    expect(usedBeforeCheckpoint).toBe(false);
    expect(usedAfterCheckpoint).toBe(true);
  });
});

describe("item choices", () => {
  it("rejects using an item you don't have, using an attack on yourself, and far-away traps", () => {
    const state = itemMatch(4);
    const weight = give(state, "p1", "weight");
    const trap = give(state, "p1", "sandTrap");

    expect(checkItemChoice(state, "p1", { use: { itemId: "nope" } })).toMatch(/don't have/);
    expect(checkItemChoice(state, "p1", { use: { itemId: weight, target: "p1" } })).toMatch(
      /another player/,
    );
    expect(checkItemChoice(state, "p1", { use: { itemId: trap, space: state.board.finish } })).toMatch(
      /up to 10/,
    );
  });

  it("uses up the item even when it is blocked", () => {
    const state = itemMatch(4);
    const weight = give(state, "p1", "weight");
    const shield = give(state, "p2", "shield");
    const { state: after, events } = move(state, {
      p1: { use: { itemId: weight, target: "p2" } },
      p2: { use: { itemId: shield } },
    });

    expect(player(after, "p1").items).toEqual([]);
    expect(events).toContainEqual({ type: "itemBlocked", playerId: "p1", kind: "weight", target: "p2" });
    expect(ofType(events, "rollChanged").filter((e) => e.playerId === "p2")).toEqual([]);
  });

  it("Custom Dice Roll overrides item movement effects aimed at its user", () => {
    const state = itemMatch(4);
    const custom = give(state, "p1", "customDiceRoll");
    const weight = give(state, "p2", "weight");
    const result = resolvePhase(state, {
      kind: "items",
      choices: {
        p1: { use: { itemId: custom } },
        p2: { use: { itemId: weight, target: "p1" } },
      },
    });
    const mods = result.state.pendingItems!.mods.p1!;

    expect(mods.customRoll).toBe(true);
    expect(mods.weights).toBe(0);
    expect(mods.weightSources).toEqual([]);
    expect(mods.rollBonuses).toEqual([]);
    expect(result.itemPlays?.find((play) => play.kind === "weight")?.cancelledByCustom).toBe(true);
  });

  it("rejects Jelly Boxing Gloves while the user is knocked out", () => {
    const state = itemMatch(4);
    const gloves = give(state, "p1", "jellyBoxingGloves");
    player(state, "p1").dead = true;
    expect(checkItemChoice(state, "p1", { use: { itemId: gloves, target: "p2" } }))
      .toMatch(/while knocked out/);
  });
});

describe("item priority tiers", () => {
  it("resolves item-stealing items after defenses but before other offense", () => {
    const state = itemMatch(4);
    const mimic = give(state, "p1", "mimic");
    const missile = give(state, "p2", "candyMissile");
    const result = resolvePhase(state, {
      kind: "items",
      choices: {
        p1: { use: { itemId: mimic } },
        p2: { use: { itemId: missile } },
      },
    });

    expect(result.itemPlays?.map((play) => play.kind)).toEqual(["mimic", "candyMissile"]);
    expect(result.itemPlays?.[0]?.tier).toBe("itemSteal");
  });
});

describe("Coin Thief", () => {
  it("records the players actually affected by targeted and random sabotage", () => {
    const state = itemMatch(4);
    const weight = give(state, "p1", "weight");
    const missile = give(state, "p2", "candyMissile");
    const result = resolvePhase(state, {
      kind: "items",
      choices: {
        p1: { use: { itemId: weight, target: "p3" } },
        p2: { use: { itemId: missile } },
      },
    });
    const missileKnockout = ofType(result.events, "playerDied").find((event) => event.cause === "candyMissile");

    expect(result.itemPlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "weight", affectedPlayers: ["p3"] }),
      expect.objectContaining({ kind: "candyMissile", affectedPlayers: [missileKnockout!.playerId] }),
    ]));
  });

  it("steals the rolled amount", () => {
    const state = itemMatch(4);
    state.rules.items.coinThiefMin = state.rules.items.coinThiefMax = 8;
    const thief = give(state, "p1", "coinThief");
    const { events } = move(state, { p1: { use: { itemId: thief, target: "p2" } } });

    expect(ofType(events, "coinsStolen")).toEqual([
      { type: "coinsStolen", from: "p2", to: "p1", amount: 8, reason: "coinThief" },
    ]);
  });

  it("can't take more coins than the target has, and splits them evenly between thieves", () => {
    const state = itemMatch(4);
    state.rules.items.coinThiefMin = state.rules.items.coinThiefMax = 8;
    player(state, "p3").coins = 5;
    const a = give(state, "p1", "coinThief");
    const b = give(state, "p2", "coinThief");
    const { events } = move(state, {
      p1: { use: { itemId: a, target: "p3" } },
      p2: { use: { itemId: b, target: "p3" } },
    });

    const amounts = ofType(events, "coinsStolen").map((e) => e.amount).sort();
    expect(amounts).toEqual([2, 3]);
  });

  it("resolves mutual steals at the same time", () => {
    const state = itemMatch(4);
    state.rules.items.coinThiefMin = state.rules.items.coinThiefMax = 8;
    player(state, "p2").coins = 3;
    const a = give(state, "p1", "coinThief");
    const b = give(state, "p2", "coinThief");
    const { events } = move(state, {
      p1: { use: { itemId: a, target: "p2" } },
      p2: { use: { itemId: b, target: "p1" } },
    });

    // p2 had only 3 coins before either steal, so p1's haul isn't inflated by what p2 just took.
    const steals = ofType(events, "coinsStolen");
    expect(steals.find((e) => e.to === "p1")!.amount).toBe(3);
    expect(steals.find((e) => e.to === "p2")!.amount).toBe(8);
  });
});

describe("roll changes", () => {
  it("stacks Weights but never goes below 0", () => {
    const state = itemMatch(4);
    const a = give(state, "p1", "weight");
    const b = give(state, "p2", "weight");
    const { events } = move(state, {
      p1: { use: { itemId: a, target: "p3" } },
      p2: { use: { itemId: b, target: "p3" } },
    });

    const rolled = ofType(events, "dieRolled").find((e) => e.playerId === "p3")!.value;
    expect(ofType(events, "rollChanged").find((e) => e.playerId === "p3")).toMatchObject({
      kind: "weight",
      from: rolled,
      to: Math.max(0, rolled - 6),
    });
  });

  it("makes a Sand Die target roll a d3 and keeps the saved die they picked", () => {
    const state = itemMatch(4);
    player(state, "p2").dice.push({ id: "die9", sides: 12 });
    const sand = give(state, "p1", "sandDie");
    const { state: after, events } = move(state, {
      p1: { use: { itemId: sand, target: "p2" } },
      p2: { die: "die9" },
    });

    expect(ofType(events, "dieRolled").find((e) => e.playerId === "p2")).toMatchObject({ sides: 3, saved: false });
    expect(player(after, "p2").dice).toEqual([{ id: "die9", sides: 12 }]);
  });

  it("applies a Weight after a Sand Die, so the target can't move", () => {
    const state = itemMatch(4);
    const sand = give(state, "p1", "sandDie");
    const weight = give(state, "p2", "weight");
    const { state: after, events } = move(state, {
      p1: { use: { itemId: sand, target: "p3" } },
      p2: { use: { itemId: weight, target: "p3" } },
    });

    expect(ofType(events, "rollChanged").find((e) => e.playerId === "p3")!.to).toBe(0);
    expect(player(after, "p3").position).toBe(state.board.start);
  });

  it("applies Weights before the target's own Booster", () => {
    const state = itemMatch(4);
    const weight = give(state, "p1", "weight");
    const booster = give(state, "p2", "booster");
    const { events } = move(state, {
      p1: { use: { itemId: weight, target: "p2" } },
      p2: { use: { itemId: booster } },
    });

    const changes = ofType(events, "rollChanged").filter((e) => e.playerId === "p2");
    expect(changes.map((e) => e.kind)).toEqual(["weight", "booster"]);
    expect(changes[1]!.to).toBe(changes[0]!.to + 3);
  });

  it("adds an extra d6 with Extra Die", () => {
    const state = itemMatch(4);
    const extra = give(state, "p1", "extraDie");
    const { events } = move(state, { p1: { use: { itemId: extra } } });

    const change = ofType(events, "rollChanged").find((e) => e.playerId === "p1")!;
    expect(change.kind).toBe("extraDie");
    expect(change.to - change.from).toBeGreaterThanOrEqual(1);
    expect(change.to - change.from).toBeLessThanOrEqual(6);
  });

  it("names who used each Weight and the Sand Die", () => {
    const state = itemMatch(4);
    const a = give(state, "p1", "weight");
    const b = give(state, "p2", "weight");
    const sand = give(state, "p3", "sandDie");
    const { events } = move(state, {
      p1: { use: { itemId: a, target: "p4" } },
      p2: { use: { itemId: b, target: "p4" } },
      p3: { use: { itemId: sand, target: "p4" } },
    });

    const weights = ofType(events, "rollChanged").filter((e) => e.playerId === "p4" && e.kind === "weight");
    expect(weights.map((e) => e.source)).toEqual(["p1", "p2"]);
    expect(ofType(events, "dieRolled").find((e) => e.playerId === "p4")).toMatchObject({ sides: 3, source: "p3" });
  });
});

describe("Shove", () => {
  it("stops at the checkpoint behind the target", () => {
    const state = itemMatch(4);
    const { checkpoint, space } = midBoard(state, 3);
    player(state, "p2").position = space.id;
    const shove = give(state, "p1", "shove");
    const { events } = move(state, { p1: { use: { itemId: shove, target: "p2" } } });

    const shoved = ofType(events, "shoved")[0]!;
    expect(shoved.path).toHaveLength(3);
    expect(shoved.path[2]).toBe(checkpoint.id);
  });

  it("doesn't move a player standing on a checkpoint", () => {
    const state = itemMatch(4);
    const { checkpoint } = midBoard(state, 3);
    player(state, "p2").position = checkpoint.id;
    const shove = give(state, "p1", "shove");
    const { events } = move(state, { p1: { use: { itemId: shove, target: "p2" } } });

    expect(ofType(events, "shoved")[0]!.path).toEqual([]);
  });
});

describe("Sand Trap", () => {
  it("can be placed ahead and stays hidden from everyone else", () => {
    const state = itemMatch(4);
    const trap = give(state, "p1", "sandTrap");
    const target = firstSpace(state, (s) => s.type !== "start" && s.distanceToFinish === 40);
    const { state: after, events } = move(state, { p1: { use: { itemId: trap, space: target.id } } });

    expect(after.traps).toEqual([{ spaceId: target.id, ownerId: "p1", kind: "sandTrap" }]);
    expect(privateEventOwner(ofType(events, "trapPlaced")[0]!)).toBe("p1");
    expect(ofType(events, "itemUsed")[0]).toEqual({ type: "itemUsed", playerId: "p1", kind: "sandTrap" });
  });

  it("gives the item back when two players pick the same space", () => {
    const state = itemMatch(4);
    const a = give(state, "p1", "sandTrap");
    const b = give(state, "p2", "sandTrap");
    const target = firstSpace(state, (s) => s.type !== "start" && s.distanceToFinish === 40);
    const { state: after, events } = move(state, {
      p1: { use: { itemId: a, space: target.id } },
      p2: { use: { itemId: b, space: target.id } },
    });

    expect(after.traps).toHaveLength(1);
    const refunded = ofType(events, "trapRefunded")[0]!;
    expect(refunded.playerId).not.toBe(after.traps[0]!.ownerId);
    expect(player(after, refunded.playerId).items.map((i) => i.kind)).toContain("sandTrap");
  });

  it("hits every other player who stopped on it, then disappears", () => {
    const state = itemMatch(4);
    state.rules.items.trapCoinsMin = state.rules.items.trapCoinsMax = 7;
    const { space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p1", kind: "sandTrap" }];
    player(state, "p2").position = space.id;
    player(state, "p3").position = space.id;
    player(state, "p3").coins = 2;
    const events: MatchEvent[] = [];

    triggerTraps(state, events);

    expect(state.traps).toEqual([]);
    expect(player(state, "p1").coins).toBe(10 + 7 + 2);
    expect(player(state, "p3").coins).toBe(0);
    expect(ofType(events, "trapTriggered")[0]!.victims).toEqual(["p2", "p3"]);
  });

  it("Hard Candy Shell blocks Coin Traps for the round", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p1", kind: "sandTrap" }];
    player(state, "p2").position = space.id;
    player(state, "p3").position = space.id;
    player(state, "p2").skipNextMove = true;
    player(state, "p3").skipNextMove = true;
    player(state, "p1").skipNextMove = true;
    player(state, "p4").skipNextMove = true;
    const shell = give(state, "p2", "shield");

    const { state: after, events } = move(state, { p2: { use: { itemId: shell } } });

    const stolenFromP3 = ofType(events, "coinsStolen").find((event) => event.from === "p3")?.amount ?? 0;
    expect(player(after, "p1").coins).toBe(10 + stolenFromP3);
    expect(player(after, "p2").coins).toBe(10);
    expect(player(after, "p3").coins).toBeLessThan(10);
    expect(ofType(events, "trapTriggered")[0]).toMatchObject({
      victims: ["p3"],
      blocked: ["p2"],
    });
  });

  it("does nothing to its owner", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p1", kind: "sandTrap" }];
    player(state, "p1").position = space.id;

    triggerTraps(state, []);

    expect(state.traps).toHaveLength(1);
    expect(player(state, "p1").coins).toBe(10);
  });

  it("triggers before collisions send players back", () => {
    const state = itemMatch(6);
    const { checkpoint, space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p6", kind: "sandTrap" }];
    player(state, "p1").position = space.id;
    player(state, "p2").position = space.id;
    // Sand Die plus Weight pins p1 and p2 in place.
    const { state: after, events } = move(state, {
      p3: { use: { itemId: give(state, "p3", "sandDie"), target: "p1" } },
      p4: { use: { itemId: give(state, "p4", "weight"), target: "p1" } },
      p5: { use: { itemId: give(state, "p5", "sandDie"), target: "p2" } },
      p6: { use: { itemId: give(state, "p6", "weight"), target: "p2" } },
    });

    const trapAt = events.findIndex((e) => e.type === "trapTriggered");
    const collisionAt = events.findIndex((e) => e.type === "collision");
    expect(trapAt).toBeGreaterThan(-1);
    expect(collisionAt).toBeGreaterThan(trapAt);
    expect(player(after, "p1").position).toBe(checkpoint.id);
  });
});

describe("shop rotation", () => {
  it("always stocks six items plus two rotating items", () => {
    const state = itemMatch(4);
    expect(state.shop).toHaveLength(8);
    expect(state.shop.slice(0, 6)).toEqual(["booster", "weight", "floatie", "collision", "candyMissile", "holySugarDust"]);
    expect(state.shop.slice(6).every((kind) => state.rules.items.shopRotating.includes(kind))).toBe(true);
    expect(
      pendingDecisions(state).map((decision) => decision.kind === "items" ? decision.shop : []),
    ).toEqual(state.players.map(() => state.shop));
  });

  it("does not repeat either rotating item on consecutive rounds", () => {
    const state = itemMatch(4);
    const first = state.shop.slice(6);
    refreshShop(state);
    const next = state.shop.slice(6);
    expect(next.some((kind) => first.includes(kind))).toBe(false);
    expect(state.lastRotating).toEqual(next);
  });

  it("refuses items that aren't for sale this round", () => {
    const state = itemMatch(4);
    const missing = state.rules.items.shopRotating.find((k) => !state.shop.includes(k))!;
    player(state, "p1").coins = 100;
    expect(checkItemChoice(state, "p1", { buy: missing })).toMatch(/for sale/);
  });
});

describe("Chocolate Coin Bag", () => {
  it("reports the exact number of coins gained in item results", () => {
    const state = itemMatch(4);
    const bag = give(state, "p1", "chocolateCoinBag");
    const result = resolvePhase(state, {
      kind: "items",
      choices: { p1: { use: { itemId: bag } } },
    });

    expect(result.itemPlays).toEqual([
      expect.objectContaining({ kind: "chocolateCoinBag", amount: expect.any(Number) }),
    ]);
    expect(result.itemPlays![0]!.amount).toBeGreaterThanOrEqual(10);
    expect(result.itemPlays![0]!.amount).toBeLessThanOrEqual(25);
  });
});

describe("Infinite Item Bag", () => {
  it("charges 15 coins per requested item after the first", () => {
    const state = itemMatch(4);
    player(state, "p1").coins = 100;
    const bag = give(state, "p1", "infiniteItemBag");

    expect(checkItemChoice(state, "p1", { use: { itemId: bag, amount: 14 } }))
      .toMatch(/15 coins for each item after the first/);
    expect(checkItemChoice(state, "p1", { use: { itemId: bag, amount: 30 } })).toBeNull();

    const result = resolvePhase(state, {
      kind: "items",
      choices: { p1: { use: { itemId: bag, amount: 30 } } },
    });
    expect(player(result.state, "p1").coins).toBe(70);
    expect(ofType(result.events, "itemAwarded").filter((event) => event.playerId === "p1")).toHaveLength(3);
  });
});

describe("expanded item groups", () => {
  it("has the six always-on items, two rotating slots, and separate reward-only items", () => {
    const state = itemMatch(4);
    expect(state.shop).toHaveLength(8);
    expect(state.rules.items.shopAlways).toHaveLength(6);
    expect(state.shop.slice(6)).toHaveLength(2);
    expect(SHOP_ITEM_KINDS).not.toContain("candySpirit");
    expect(SPECIAL_ITEM_KINDS).toContain("candySpirit");
    expect(Object.keys(state.rules.items.prices)).toHaveLength(SHOP_ITEM_KINDS.length);
  });

  it("draws shop or special items from the configured reward pool", () => {
    const state = itemMatch(4);
    for (const [chance, expectedPool] of [[0, SHOP_ITEM_KINDS], [1, SPECIAL_ITEM_KINDS]] as const) {
      for (let seed = 1; seed <= 50; seed++) {
        state.rng = createRng(seed);
        expect(expectedPool).toContain(randomRewardItem(state, chance));
      }
    }
  });

  it("Ghost Feet passively blocks one trap and is consumed", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p1", kind: "sandTrap" }];
    for (const p of state.players) p.skipNextMove = true;
    player(state, "p2").position = space.id;
    const ghostFeet = give(state, "p2", "ghostFeet");

    expect(state.rules.items.prices.ghostFeet).toBe(15);
    expect(checkItemChoice(state, "p2", { use: { itemId: ghostFeet } })).toMatch(/works on its own/);
    const { state: after, events } = move(state, {});

    expect(player(after, "p2").coins).toBe(10);
    expect(ofType(events, "trapTriggered")[0]!.blocked).toEqual(["p2"]);
    expect(ofType(events, "ghostFeetSaved")).toMatchObject([{ playerId: "p2", trapKind: "sandTrap" }]);
    expect(player(after, "p2").items).not.toContainEqual({ id: ghostFeet, kind: "ghostFeet" });
    expect(player(after, "p1").coins).toBe(10);
  });

  it("Item Trap transfers a passive item, and Death Trap knocks out its victim", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    const lifeRing = give(state, "p2", "floatie");
    state.traps = [{ spaceId: space.id, ownerId: "p1", kind: "itemTrap" }];
    player(state, "p2").position = space.id;
    const itemEvents: MatchEvent[] = [];
    triggerTraps(state, itemEvents);
    expect(player(state, "p1").items).toContainEqual({ id: lifeRing, kind: "floatie" });
    expect(ofType(itemEvents, "itemStolen")[0]).toMatchObject({ from: "p2", to: "p1" });

    state.traps = [{ spaceId: space.id, ownerId: "p1", kind: "deathTrap" }];
    const deathEvents: MatchEvent[] = [];
    triggerTraps(state, deathEvents);
    expect(player(state, "p2").dead).toBe(true);
    expect(ofType(deathEvents, "playerDied")[0]).toMatchObject({
      playerId: "p2", reason: "item", cause: "deathTrap", sourcePlayerId: "p1",
    });
  });

  it("allows Holy Sugar Dust only while knocked out and revives immediately", () => {
    const state = itemMatch(4);
    const dust = give(state, "p1", "holySugarDust");
    expect(checkItemChoice(state, "p1", { use: { itemId: dust } })).toMatch(/knocked out/);
    player(state, "p1").dead = true;
    const result = resolvePhase(state, { kind: "items", choices: { p1: { use: { itemId: dust } } } });
    expect(player(result.state, "p1").dead).toBe(false);
    expect(ofType(result.events, "playerRevived")).toHaveLength(1);
  });

  it("Candy Spirit revives its holder and knocks out another living player", () => {
    const state = itemMatch(4);
    give(state, "p1", "candySpirit");
    const events: MatchEvent[] = [];
    knockOutPlayer(state, player(state, "p1"), "item", events);
    expect(player(state, "p1").dead).toBe(false);
    expect(player(state, "p1").items).toHaveLength(0);
    expect(ofType(events, "candySpiritTriggered")).toHaveLength(1);
    expect(ofType(events, "playerDied")[0]).toMatchObject({
      reason: "item", cause: "candySpirit", sourcePlayerId: "p1",
    });
    expect(state.players.filter((p) => p.dead)).toHaveLength(1);
  });

  it("Jelly Boxing Gloves resolves a knockout battle before movement", () => {
    const state = itemMatch(4);
    const gloves = give(state, "p1", "jellyBoxingGloves");
    const { state: after, events } = move(state, { p1: { use: { itemId: gloves, target: "p2" } } });
    expect(ofType(events, "battleFinished")).toHaveLength(1);
    expect(state.phase.kind).toBe("items");
    expect(after.phase.kind).not.toBe("battle");
    expect(after.players.some((p) => p.dead)).toBe(true);
  });

  it("does not let Jelly Boxing Gloves start a battle at the final boss space", () => {
    const state = itemMatch(4);
    const gloves = give(state, "p1", "jellyBoxingGloves");
    player(state, "p2").position = state.board.finish;

    expect(checkItemChoice(state, "p1", {
      use: { itemId: gloves, target: "p2" },
    })).toMatch(/final boss space/);
  });

  it("Pair of Candy doubles a blue-space coin grant", () => {
    const state = itemMatch(4);
    const pair = give(state, "p1", "pairOfCandy");
    const first = state.board.spaces[state.board.start]!.next.find((id) => state.board.spaces[id]!.lane === 0)!;
    state.board.spaces[first]!.type = "blue";
    const itemPhase = resolvePhase(state, { kind: "items", choices: { p1: { use: { itemId: pair } } } }).state;
    const seed = Array.from({ length: 1000 }, (_, i) => i + 1).find((value) => rollDie(createRng(value), 6) === 1)!;
    itemPhase.rng = createRng(seed);
    const result = resolvePhase(itemPhase, { kind: "move", choices: { p1: { die: null, lane: 0 } } });
    expect(player(result.state, "p1").coins).toBe(16);
    expect(result.events.some((event) => event.type === "pairEffect")).toBe(true);
  });
});

describe("Floatie and Collision", () => {
  it("won't let you actively use a Floatie", () => {
    const state = itemMatch(4);
    const floatie = give(state, "p1", "floatie");
    expect(checkItemChoice(state, "p1", { use: { itemId: floatie } })).toMatch(/on its own/);
  });

  it("lets a Floatie holder stay in a collision while others go back", () => {
    const state = itemMatch(4);
    const { checkpoint, space } = midBoard(state, 3);
    give(state, "p1", "floatie");
    player(state, "p1").position = space.id;
    player(state, "p2").position = space.id;
    const events: MatchEvent[] = [];
    resolveCollisions(state, new Set(), events);

    expect(player(state, "p1").position).toBe(space.id);
    expect(player(state, "p1").items).toEqual([]);
    expect(player(state, "p2").position).toBe(checkpoint.id);
    expect(ofType(events, "floatieSaved")[0]).toMatchObject({ playerId: "p1", spaceId: space.id });
    expect(ofType(events, "collision")[0]!.saved).toEqual(["p1"]);
  });

  it("resolves simultaneous collisions at multiple spaces independently", () => {
    const state = itemMatch(6);
    const spaces = state.board.spaces.filter((space) => !space.collisionFree && space.checkpointBehind !== space.id).slice(0, 3);
    expect(spaces).toHaveLength(3);
    for (let i = 0; i < spaces.length; i++) {
      player(state, `p${i * 2 + 1}`).position = spaces[i]!.id;
      player(state, `p${i * 2 + 2}`).position = spaces[i]!.id;
    }
    const events: MatchEvent[] = [];
    resolveCollisions(state, new Set(), events);

    for (let i = 0; i < spaces.length; i++) {
      expect(player(state, `p${i * 2 + 1}`).position).toBe(spaces[i]!.checkpointBehind);
      expect(player(state, `p${i * 2 + 2}`).position).toBe(spaces[i]!.checkpointBehind);
    }
    expect(ofType(events, "collision")).toHaveLength(3);
  });

  it("sends a Collision target back after movement", () => {
    const state = itemMatch(4);
    const { checkpoint, space } = midBoard(state, 3);
    // Keep everyone else at the start so they can't land on p2.
    for (const id of ["p1", "p3", "p4"]) player(state, id).position = state.board.start;
    player(state, "p2").position = space.id;
    const collision = give(state, "p1", "collision");
    const sand = give(state, "p3", "sandDie");
    const weight = give(state, "p4", "weight");
    const { state: after, events } = move(state, {
      p1: { use: { itemId: collision, target: "p2" } },
      p3: { use: { itemId: sand, target: "p2" } },
      p4: { use: { itemId: weight, target: "p2" } },
    });

    expect(ofType(events, "forcedBack")[0]).toEqual({
      type: "forcedBack", playerId: "p2", spaceId: space.id, sentTo: checkpoint.id,
    });
    expect(player(after, "p2").position).toBe(checkpoint.id);
  });

  it("lets a Floatie block a Collision item", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    for (const id of ["p1", "p3", "p4"]) player(state, id).position = state.board.start;
    player(state, "p2").position = space.id;
    give(state, "p2", "floatie");
    const collision = give(state, "p1", "collision");
    const sand = give(state, "p3", "sandDie");
    const weight = give(state, "p4", "weight");
    const { state: after, events } = move(state, {
      p1: { use: { itemId: collision, target: "p2" } },
      p3: { use: { itemId: sand, target: "p2" } },
      p4: { use: { itemId: weight, target: "p2" } },
    });

    expect(player(after, "p2").position).toBe(space.id);
    expect(player(after, "p2").items).toEqual([]);
    expect(ofType(events, "floatieSaved")[0]!.playerId).toBe("p2");
    expect(ofType(events, "forcedBack")).toEqual([]);
  });

  it("lets a Shield block a Collision item", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    player(state, "p2").position = space.id;
    const collision = give(state, "p1", "collision");
    const shield = give(state, "p2", "shield");
    const { events } = move(state, {
      p1: { use: { itemId: collision, target: "p2" } },
      p2: { use: { itemId: shield } },
    });

    expect(events).toContainEqual({ type: "itemBlocked", playerId: "p1", kind: "collision", target: "p2" });
    expect(ofType(events, "forcedBack")).toEqual([]);
  });
});

describe("minigame item reward", () => {
  function toMinigame(state: MatchState) {
    let next = move(state, {}).state;
    if (next.phase.kind === "battleInitiation") {
      next = resolvePhase(next, {
        kind: "battleInitiation",
        choices: Object.fromEntries(state.players.map((player) => [player.id, { target: null }])),
      }).state;
    }
    expect(next.phase.kind).toBe("minigame");
    return next;
  }

  it("gives 1st place a random item", () => {
    const state = toMinigame(itemMatch(4));
    const { state: after, events } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    const award = ofType(events, "itemAwarded")[0]!;
    expect(award.playerId).toBe("p1");
    expect(player(after, "p1").items).toContainEqual(award.item);
    expect(privateEventOwner(award)).toBeNull();
  });

  it("skips the item when 1st place is full", () => {
    const state = toMinigame(itemMatch(4));
    for (let i = 0; i < 99; i++) give(state, "p1", "booster");
    const { state: after, events } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(ofType(events, "itemAwardSkipped")[0]!.playerId).toBe("p1");
    expect(player(after, "p1").items).toHaveLength(99);
  });
});
