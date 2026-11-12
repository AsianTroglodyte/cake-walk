import { describe, expect, it } from "vitest";
import {
  BOUGHT_ITEM,
  checkMoveChoice,
  privateEventOwner,
  refreshShop,
  resolveCollisions,
  resolvePhase,
  triggerTraps,
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
  refreshShop(state);
  return state;
}

/** Put a rotating item on sale for a test that needs it. */
function stock(state: MatchState, kind: ItemKind): void {
  if (!state.shop.includes(kind)) state.shop = [...state.rules.items.shopAlways, kind];
}

function give(state: MatchState, playerId: string, kind: ItemKind): string {
  const id = `item${state.nextItemId++}`;
  state.players.find((p) => p.id === playerId)!.items.push({ id, kind });
  return id;
}

function move(state: MatchState, choices: Record<string, Partial<MoveChoice>>) {
  const full = Object.fromEntries(Object.entries(choices).map(([id, c]) => [id, { die: null, lane: 0, ...c }]));
  return resolvePhase(state, { kind: "move", choices: full });
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
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, buy: "booster" })).toMatch(/after the first round/);
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, use: { itemId: booster } })).toMatch(
      /after the first round/,
    );

    const { state: after, events } = move(state, { p1: { buy: "shove", use: { itemId: booster } } });
    expect(player(after, "p1").items).toEqual([{ id: booster, kind: "booster" }]);
    expect(player(after, "p1").coins).toBeGreaterThanOrEqual(10 - 3);
    expect(events.some((e) => e.type === "itemBought" || e.type === "itemUsed")).toBe(false);
  });
});

describe("shop", () => {
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
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, buy: "booster" })).toMatch(/coins/);

    player(state, "p2").coins = 50;
    stock(state, "shove");
    const kept = give(state, "p2", "booster");
    give(state, "p2", "booster");
    give(state, "p2", "booster");
    expect(checkMoveChoice(state, "p2", { die: null, lane: 0, buy: "shove" })).toMatch(/hold 3/);
    expect(checkMoveChoice(state, "p2", { die: null, lane: 0, buy: "shove", use: { itemId: kept } })).toBeNull();
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
    for (let i = 0; i < 3; i++) give(state, "p1", "booster");
    stock(state, "extraDie");
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, buy: "booster", use: { itemId: BOUGHT_ITEM } })).toBeNull();
    const { state: after } = move(state, { p1: { buy: "extraDie", use: { itemId: BOUGHT_ITEM } } });
    expect(player(after, "p1").items.map((i) => i.kind)).toEqual(["booster", "booster", "booster"]);
  });

  it("won't use a bought item without a purchase, or when the purchase fails", () => {
    const state = itemMatch(4);
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, use: { itemId: BOUGHT_ITEM } })).toMatch(/Buy an item/);
    player(state, "p1").coins = 2;
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, buy: "booster", use: { itemId: BOUGHT_ITEM } })).toMatch(
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

describe("item choices", () => {
  it("rejects using an item you don't have, using an attack on yourself, and far-away traps", () => {
    const state = itemMatch(4);
    const weight = give(state, "p1", "weight");
    const trap = give(state, "p1", "sandTrap");

    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, use: { itemId: "nope" } })).toMatch(/don't have/);
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, use: { itemId: weight, target: "p1" } })).toMatch(
      /another player/,
    );
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, use: { itemId: trap, space: state.board.finish } })).toMatch(
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
});

describe("Coin Thief", () => {
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

    expect(after.traps).toEqual([{ spaceId: target.id, ownerId: "p1" }]);
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
    expect(player(after, refunded.playerId).items.map((i) => i.kind)).toEqual(["sandTrap"]);
  });

  it("hits every other player who stopped on it, then disappears", () => {
    const state = itemMatch(4);
    state.rules.items.trapCoinsMin = state.rules.items.trapCoinsMax = 7;
    const { space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p1" }];
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

  it("does nothing to its owner", () => {
    const state = itemMatch(4);
    const { space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p1" }];
    player(state, "p1").position = space.id;

    triggerTraps(state, []);

    expect(state.traps).toHaveLength(1);
    expect(player(state, "p1").coins).toBe(10);
  });

  it("triggers before collisions send players back", () => {
    const state = itemMatch(6);
    const { checkpoint, space } = midBoard(state, 3);
    state.traps = [{ spaceId: space.id, ownerId: "p6" }];
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
  it("always stocks Booster, Weight, Floatie, and Collision, plus one rotating item", () => {
    const state = itemMatch(4);
    expect(state.shop).toHaveLength(5);
    expect(state.shop.slice(0, 4)).toEqual(["booster", "weight", "floatie", "collision"]);
    expect(state.rules.items.shopRotating).toContain(state.shop[4]);
  });

  it("never repeats the rotating item on consecutive rounds", () => {
    const state = itemMatch(4);
    const first = state.shop[4]!;
    refreshShop(state);
    expect(state.shop[4]).not.toBe(first);
    expect(state.lastRotating).toBe(state.shop[4]);
  });

  it("refuses items that aren't for sale this round", () => {
    const state = itemMatch(4);
    const missing = state.rules.items.shopRotating.find((k) => !state.shop.includes(k))!;
    player(state, "p1").coins = 100;
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, buy: missing })).toMatch(/for sale/);
  });
});

describe("Floatie and Collision", () => {
  it("won't let you actively use a Floatie", () => {
    const state = itemMatch(4);
    const floatie = give(state, "p1", "floatie");
    expect(checkMoveChoice(state, "p1", { die: null, lane: 0, use: { itemId: floatie } })).toMatch(/on its own/);
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

    expect(ofType(events, "forcedBack")[0]).toEqual({ type: "forcedBack", playerId: "p2", sentTo: checkpoint.id });
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
    const next = resolvePhase(state, { kind: "move", choices: {} }).state;
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
    for (let i = 0; i < 3; i++) give(state, "p1", "booster");
    const { state: after, events } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(ofType(events, "itemAwardSkipped")[0]!.playerId).toBe("p1");
    expect(player(after, "p1").items).toHaveLength(3);
  });
});
