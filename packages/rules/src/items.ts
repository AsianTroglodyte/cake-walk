import { walkBackward } from "./movement";
import { pick, randInt, rollDie, shuffle } from "./rng";
import type {
  Board,
  ItemKind,
  ItemRules,
  ItemUse,
  MatchEvent,
  MatchState,
  MoveChoice,
  OwnedItem,
  Player,
  PlayerId,
  SpaceId,
  SpaceType,
} from "./types";

export type ItemTier = "defensive" | "offensive" | "self";

export interface ItemInfo {
  name: string;
  tier: ItemTier;
  /** What the player has to pick when using it. */
  target: "none" | "player" | "space";
  description: string;
}

export const ITEMS: Record<ItemKind, ItemInfo> = {
  shield: {
    name: "Shield",
    tier: "defensive",
    target: "none",
    description: "Cancels every item used on you this round. Doesn't stop traps.",
  },
  coinThief: {
    name: "Coin Thief",
    tier: "offensive",
    target: "player",
    description: "Steal 5 to 10 coins from a player.",
  },
  weight: {
    name: "Weight",
    tier: "offensive",
    target: "player",
    description: "A player's movement roll is reduced by 3 this round (never below 0).",
  },
  sandDie: {
    name: "Sand Die",
    tier: "offensive",
    target: "player",
    description: "A player rolls a d3 for movement this round. A saved die they picked is not used up.",
  },
  shove: {
    name: "Shove",
    tier: "offensive",
    target: "player",
    description: "Send a player back 5 spaces now. Stops at the checkpoint behind them.",
  },
  booster: {
    name: "Booster",
    tier: "self",
    target: "none",
    description: "Add 3 to your movement roll this round.",
  },
  extraDie: {
    name: "Extra Die",
    tier: "self",
    target: "none",
    description: "Roll an extra d6 and add it to your movement roll this round.",
  },
  sandTrap: {
    name: "Sand Trap",
    tier: "self",
    target: "space",
    description: "Hide a trap up to 10 spaces ahead. The next other player to stop there loses 5 to 15 coins to you.",
  },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export const DEFAULT_ITEM_RULES: ItemRules = {
  firstItemRound: 2,
  prices: { shield: 6, coinThief: 6, weight: 5, sandDie: 7, shove: 9, booster: 5, extraDie: 8, sandTrap: 6 },
  maxHeld: 3,
  coinThiefMin: 5,
  coinThiefMax: 10,
  weightAmount: 3,
  sandDieSides: 3,
  shoveDistance: 5,
  boosterAmount: 3,
  extraDieSides: 6,
  trapRange: 10,
  trapCoinsMin: 5,
  trapCoinsMax: 15,
};

const NO_TRAPS: ReadonlySet<SpaceType> = new Set(["start", "checkpoint", "finish"]);

/** Spaces 1 to `range` steps ahead on any path that can hold a trap. */
export function trapSpaces(board: Board, from: SpaceId, range: number): SpaceId[] {
  const seen = new Set<SpaceId>([from]);
  const found: SpaceId[] = [];
  let frontier = [from];
  for (let step = 0; step < range && frontier.length > 0; step++) {
    const next: SpaceId[] = [];
    for (const id of frontier) {
      for (const n of board.spaces[id]!.next) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
        if (!NO_TRAPS.has(board.spaces[n]!.type)) found.push(n);
      }
    }
    frontier = next;
  }
  return found;
}

function findPlayer(s: MatchState, id: PlayerId): Player | undefined {
  return s.players.find((p) => p.id === id);
}

export function itemsAllowed(s: MatchState): boolean {
  return s.round >= s.rules.items.firstItemRound;
}

const NO_ITEMS_YET = "Items and the shop open after the first round";

/** As `ItemUse.itemId`: use the item bought in the same move choice. */
export const BOUGHT_ITEM = "bought";

/** Returns why the item use isn't allowed, or null if it is. `bought` is what the same choice buys. */
export function checkUse(s: MatchState, player: Player, use: ItemUse, bought: ItemKind | null = null): string | null {
  if (!itemsAllowed(s)) return NO_ITEMS_YET;
  const kind = use.itemId === BOUGHT_ITEM ? bought : player.items.find((i) => i.id === use.itemId)?.kind;
  if (!kind) return use.itemId === BOUGHT_ITEM ? "Buy an item to use it this round" : "You don't have that item";
  switch (ITEMS[kind].target) {
    case "player":
      if (!use.target || use.target === player.id || !findPlayer(s, use.target)) return "Pick another player";
      return null;
    case "space":
      if (use.space === undefined || !trapSpaces(s.board, player.position, s.rules.items.trapRange).includes(use.space)) {
        return "Pick a space up to 10 spaces ahead that isn't the start, a checkpoint, or the finish";
      }
      return null;
    case "none":
      return null;
  }
}

/** Returns why the purchase isn't allowed, or null if it is. Using an item this round (even the one bought) frees a slot. */
export function checkBuy(s: MatchState, player: Player, kind: ItemKind, using: boolean): string | null {
  if (!itemsAllowed(s)) return NO_ITEMS_YET;
  if (!(kind in ITEMS)) return "Unknown item";
  if (player.coins < s.rules.items.prices[kind]) return "Not enough coins";
  if (player.items.length - (using ? 1 : 0) >= s.rules.items.maxHeld) {
    return `You can only hold ${s.rules.items.maxHeld} items`;
  }
  return null;
}

export function checkMoveChoice(s: MatchState, playerId: PlayerId, choice: MoveChoice): string | null {
  const player = findPlayer(s, playerId);
  if (!player) return "Unknown player";
  const use = choice.use ?? null;
  const buyProblem = choice.buy ? checkBuy(s, player, choice.buy, use !== null) : null;
  if (buyProblem) return buyProblem;
  return use ? checkUse(s, player, use, choice.buy ?? null) : null;
}

export interface RollMods {
  sandDie: boolean;
  weights: number;
  booster: boolean;
  extraDie: boolean;
}

interface PendingUse {
  player: Player;
  item: OwnedItem;
  use: ItemUse;
}

/**
 * Shop purchases, then item uses by tier: defensive, offensive (steals first), self-only.
 * Items in the same tier resolve simultaneously. Invalid uses and purchases are ignored.
 * Returns the changes each player's movement roll will get.
 */
export function resolveItems(
  s: MatchState,
  choices: Partial<Record<PlayerId, MoveChoice>>,
  events: MatchEvent[],
): Map<PlayerId, RollMods> {
  const mods = new Map<PlayerId, RollMods>(
    s.players.map((p) => [p.id, { sandDie: false, weights: 0, booster: false, extraDie: false }]),
  );
  const uses: PendingUse[] = [];

  for (const player of s.players) {
    const choice = choices[player.id];
    if (!choice) continue;
    let use = choice.use && checkUse(s, player, choice.use, choice.buy ?? null) === null ? choice.use : null;
    const buyOk = !!choice.buy && checkBuy(s, player, choice.buy, use !== null) === null;
    if (!buyOk && use?.itemId === BOUGHT_ITEM) use = null;
    const bought = buyOk ? buy(s, player, choice.buy!, events) : null;
    if (use) {
      const index = player.items.findIndex((i) => i.id === (use.itemId === BOUGHT_ITEM ? bought!.id : use.itemId));
      const [item] = player.items.splice(index, 1);
      uses.push({ player, item: item!, use });
    }
  }

  const ofTier = (tier: ItemTier) => uses.filter((u) => ITEMS[u.item.kind].tier === tier);

  const shielded = new Set<PlayerId>();
  for (const u of ofTier("defensive")) {
    events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
    shielded.add(u.player.id);
  }

  const offensive: PendingUse[] = [];
  for (const u of ofTier("offensive")) {
    const target = u.use.target!;
    events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind, target });
    if (shielded.has(target)) events.push({ type: "itemBlocked", playerId: u.player.id, kind: u.item.kind, target });
    else offensive.push(u);
  }
  resolveSteals(
    s,
    offensive.filter((u) => u.item.kind === "coinThief"),
    events,
  );
  const shoves = new Map<PlayerId, number>();
  for (const u of offensive) {
    const target = u.use.target!;
    const m = mods.get(target)!;
    if (u.item.kind === "weight") m.weights++;
    if (u.item.kind === "sandDie") m.sandDie = true;
    if (u.item.kind === "shove") shoves.set(target, (shoves.get(target) ?? 0) + 1);
  }
  for (const [id, count] of shoves) shove(s, findPlayer(s, id)!, count * s.rules.items.shoveDistance, events);

  const placements = new Map<SpaceId, PendingUse[]>();
  for (const u of ofTier("self")) {
    const m = mods.get(u.player.id)!;
    if (u.item.kind === "booster") m.booster = true;
    if (u.item.kind === "extraDie") m.extraDie = true;
    if (u.item.kind === "sandTrap") {
      const group = placements.get(u.use.space!) ?? [];
      group.push(u);
      placements.set(u.use.space!, group);
      continue;
    }
    events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
  }
  for (const [spaceId, group] of placements) placeTrap(s, spaceId, group, events);

  return mods;
}

function newItem(s: MatchState, kind: ItemKind): OwnedItem {
  return { id: `item${s.nextItemId++}`, kind };
}

function buy(s: MatchState, player: Player, kind: ItemKind, events: MatchEvent[]): OwnedItem {
  const price = s.rules.items.prices[kind];
  player.coins -= price;
  events.push({ type: "coinsChanged", playerId: player.id, delta: -price, reason: "shop" });
  const item = newItem(s, kind);
  player.items.push(item);
  events.push({ type: "itemBought", playerId: player.id, item, price });
  return item;
}

/** All steals are worked out from the coins everyone had before any of them, then applied together. */
function resolveSteals(s: MatchState, steals: PendingUse[], events: MatchEvent[]): void {
  const byTarget = new Map<PlayerId, PendingUse[]>();
  for (const u of steals) {
    const group = byTarget.get(u.use.target!) ?? [];
    group.push(u);
    byTarget.set(u.use.target!, group);
  }

  const transfers: { from: Player; to: Player; amount: number }[] = [];
  for (const [targetId, thieves] of byTarget) {
    const target = findPlayer(s, targetId)!;
    const claims = thieves.map((u) => ({
      thief: u.player,
      want: randInt(s.rng, s.rules.items.coinThiefMin, s.rules.items.coinThiefMax),
      got: 0,
    }));
    let available = target.coins;
    if (claims.reduce((sum, c) => sum + c.want, 0) <= available) {
      for (const c of claims) c.got = c.want;
    } else {
      // Hand out one coin at a time so the split is as even as possible; leftovers land randomly.
      while (available > 0) {
        const open = claims.filter((c) => c.got < c.want);
        if (open.length === 0) break;
        for (const c of shuffle(s.rng, open)) {
          if (available === 0) break;
          c.got++;
          available--;
        }
      }
    }
    for (const c of claims) transfers.push({ from: target, to: c.thief, amount: c.got });
  }

  for (const t of transfers) {
    t.from.coins -= t.amount;
    t.to.coins += t.amount;
    events.push({ type: "coinsStolen", from: t.from.id, to: t.to.id, amount: t.amount, reason: "coinThief" });
  }
}

/** Players on the start or a checkpoint can't be pushed past it. */
function shove(s: MatchState, player: Player, spaces: number, events: MatchEvent[]): void {
  const type = s.board.spaces[player.position]!.type;
  const path =
    type === "start" || type === "checkpoint"
      ? []
      : walkBackward(s.board, player.position, spaces, s.rng, { stopAtCheckpoint: true });
  if (path.length > 0) player.position = path[path.length - 1]!;
  events.push({ type: "shoved", playerId: player.id, path });
}

/** One trap per space: a random placer wins, everyone else (or everyone, if a trap is already there) gets the item back. */
function placeTrap(s: MatchState, spaceId: SpaceId, group: PendingUse[], events: MatchEvent[]): void {
  const occupied = s.traps.some((t) => t.spaceId === spaceId);
  const winner = occupied ? null : pick(s.rng, group);
  for (const u of group) {
    if (u === winner) {
      s.traps.push({ spaceId, ownerId: u.player.id });
      events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
      events.push({ type: "trapPlaced", playerId: u.player.id, spaceId });
    } else {
      u.player.items.push(u.item);
      events.push({ type: "trapRefunded", playerId: u.player.id, spaceId });
    }
  }
}

/** Order: Sand Die replaces the die, then Weights, then the player's own Booster and Extra Die. Never below 0. */
export function applyRollMods(
  s: MatchState,
  playerId: PlayerId,
  roll: number,
  mods: RollMods,
  events: MatchEvent[],
): number {
  const rules = s.rules.items;
  let value = roll;
  const change = (kind: "weight" | "booster" | "extraDie", to: number) => {
    events.push({ type: "rollChanged", playerId, kind, from: value, to });
    value = to;
  };
  if (mods.weights > 0) change("weight", Math.max(0, value - rules.weightAmount * mods.weights));
  if (mods.booster) change("booster", value + rules.boosterAmount);
  if (mods.extraDie) change("extraDie", value + rollDie(s.rng, rules.extraDieSides));
  return value;
}

/** Final positions only, before collisions. Each trap hits everyone but its owner who stopped on it, then is gone. */
export function triggerTraps(s: MatchState, events: MatchEvent[]): void {
  for (const trap of [...s.traps]) {
    const victims = s.players.filter((p) => p.position === trap.spaceId && p.id !== trap.ownerId);
    if (victims.length === 0) continue;
    s.traps = s.traps.filter((t) => t !== trap);
    events.push({ type: "trapTriggered", ownerId: trap.ownerId, spaceId: trap.spaceId, victims: victims.map((v) => v.id) });
    const owner = findPlayer(s, trap.ownerId)!;
    for (const victim of victims) {
      const amount = Math.min(victim.coins, randInt(s.rng, s.rules.items.trapCoinsMin, s.rules.items.trapCoinsMax));
      victim.coins -= amount;
      owner.coins += amount;
      events.push({ type: "coinsStolen", from: victim.id, to: owner.id, amount, reason: "trap" });
    }
  }
}

/** 1st place (a random one if tied) gets a random item, unless their inventory is full. */
export function awardMinigameItem(s: MatchState, firstPlace: PlayerId[], events: MatchEvent[]): void {
  const player = findPlayer(s, pick(s.rng, firstPlace))!;
  const kind = pick(s.rng, ITEM_KINDS);
  if (player.items.length >= s.rules.items.maxHeld) {
    events.push({ type: "itemAwardSkipped", playerId: player.id, kind });
    return;
  }
  const item = newItem(s, kind);
  player.items.push(item);
  events.push({ type: "itemAwarded", playerId: player.id, item });
}

/** Events only one player may see; everything else is public, including minigame prizes. */
export function privateEventOwner(event: MatchEvent): PlayerId | null {
  switch (event.type) {
    case "itemBought":
    case "trapPlaced":
    case "trapRefunded":
      return event.playerId;
    default:
      return null;
  }
}
