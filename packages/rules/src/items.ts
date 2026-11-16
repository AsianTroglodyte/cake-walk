import { walkBackward } from "./movement";
import { pick, randInt, rollDie, shuffle } from "./rng";
import type {
  Board,
  ItemChoice,
  ItemKind,
  ItemPlay,
  ItemRules,
  ItemTier,
  ItemUse,
  MatchEvent,
  MatchState,
  MoveChoice,
  OwnedItem,
  Player,
  PlayerId,
  RollMods,
  SpaceId,
  SpaceType,
} from "./types";

export interface ItemInfo {
  name: string;
  tier: ItemTier;
  /** What the player has to pick when using it. */
  target: "none" | "player" | "space";
  /** Works from inventory without being chosen. Can't be "used" from the decision panel. */
  passive?: boolean;
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
    description: "Steal 10 to 20 coins from a player.",
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
  collision: {
    name: "Collision",
    tier: "offensive",
    target: "player",
    description: "After movement, send a player back to the last checkpoint, even if they're alone.",
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
  floatie: {
    name: "Floatie",
    tier: "self",
    target: "none",
    passive: true,
    description: "While you hold it, the first time you'd be sent back by a collision or Collision item, you stay and lose the Floatie.",
  },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

export const DEFAULT_ITEM_RULES: ItemRules = {
  firstItemRound: 2,
  prices: {
    shield: 30,
    coinThief: 10,
    weight: 7,
    sandDie: 12,
    shove: 15,
    collision: 15,
    booster: 7,
    extraDie: 15,
    sandTrap: 10,
    floatie: 20,
  },
  maxHeld: 99,
  coinThiefMin: 10,
  coinThiefMax: 20,
  weightAmount: 3,
  sandDieSides: 3,
  shoveDistance: 5,
  boosterAmount: 3,
  extraDieSides: 6,
  trapRange: 10,
  trapCoinsMin: 5,
  trapCoinsMax: 15,
  shopAlways: ["booster", "weight", "floatie", "collision"],
  shopRotating: ["shield", "coinThief", "sandDie", "shove", "extraDie", "sandTrap"],
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

/**
 * Picks this round's 5 shop items. The rotating slot never repeats the previous round's pick.
 * Call when a new move phase begins and items are allowed.
 */
export function refreshShop(s: MatchState): void {
  if (!itemsAllowed(s)) {
    s.shop = [];
    return;
  }
  const pool = s.rules.items.shopRotating.filter((k) => k !== s.lastRotating);
  const rotating = pick(s.rng, pool.length > 0 ? pool : s.rules.items.shopRotating);
  s.lastRotating = rotating;
  s.shop = [...s.rules.items.shopAlways, rotating];
}

const NO_ITEMS_YET = "Items and the shop open after the first round";

/** As `ItemUse.itemId`: use the item bought in the same move choice. */
export const BOUGHT_ITEM = "bought";

/** Returns why the item use isn't allowed, or null if it is. `bought` is what the same choice buys. */
export function checkUse(s: MatchState, player: Player, use: ItemUse, bought: ItemKind | null = null): string | null {
  if (!itemsAllowed(s)) return NO_ITEMS_YET;
  const kind = use.itemId === BOUGHT_ITEM ? bought : player.items.find((i) => i.id === use.itemId)?.kind;
  if (!kind) return use.itemId === BOUGHT_ITEM ? "Buy an item to use it this round" : "You don't have that item";
  if (ITEMS[kind].passive) return "This item works on its own";
  switch (ITEMS[kind].target) {
    case "player":
      if (!use.target || use.target === player.id || !findPlayer(s, use.target)) return "Pick another player";
      if (findPlayer(s, use.target)!.dead) return "You can't target a dead player";
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
  if (!s.shop.includes(kind)) return "That item isn't for sale this round";
  if (player.coins < s.rules.items.prices[kind]) return "Not enough coins";
  if (player.items.length - (using ? 1 : 0) >= s.rules.items.maxHeld) {
    return `You can only hold ${s.rules.items.maxHeld} items`;
  }
  return null;
}

export function checkMoveChoice(s: MatchState, playerId: PlayerId, choice: MoveChoice): string | null {
  const player = findPlayer(s, playerId);
  if (!player) return "Unknown player";
  if (!Number.isInteger(choice.lane) || choice.lane < 0 || choice.lane >= s.board.paths) return "Unknown path";
  if (player.skipNextMove && choice.die !== null) return "Saved dice can't be used on a skipped move";
  if (choice.die !== null && !player.dice.some((d) => d.id === choice.die)) return "You don't have that die";
  return null;
}

export function checkItemChoice(s: MatchState, playerId: PlayerId, choice: ItemChoice): string | null {
  const player = findPlayer(s, playerId);
  if (!player) return "Unknown player";
  const use = choice.use ?? null;
  const buyProblem = choice.buy ? checkBuy(s, player, choice.buy, use !== null) : null;
  if (buyProblem) return buyProblem;
  return use ? checkUse(s, player, use, choice.buy ?? null) : null;
}

export interface ItemResolution {
  mods: Map<PlayerId, RollMods>;
  /** Players hit by an unblocked Collision item this round. */
  forcedBack: Set<PlayerId>;
  /** Every item use, in the order it was resolved. */
  plays: ItemPlay[];
}

interface PendingUse {
  player: Player;
  item: OwnedItem;
  use: ItemUse;
  amount?: number;
}

/**
 * Shop purchases, then item uses by tier: defensive, offensive (steals first), self-only.
 * Items in the same tier resolve simultaneously. Invalid uses and purchases are ignored.
 */
export function resolveItems(
  s: MatchState,
  choices: Partial<Record<PlayerId, ItemChoice>>,
  events: MatchEvent[],
): ItemResolution {
  const mods = new Map<PlayerId, RollMods>(
    s.players.map((p) => [
      p.id,
      { sandDie: false, weights: 0, weightSources: [], booster: false, extraDie: false },
    ]),
  );
  const forcedBack = new Set<PlayerId>();
  const uses: PendingUse[] = [];
  const plays: ItemPlay[] = [];
  const playByUse = new Map<PendingUse, ItemPlay>();

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

  const addPlay = (u: PendingUse, status: ItemPlay["status"] = "resolved"): ItemPlay => {
    const tier = ITEMS[u.item.kind].tier;
    const play: ItemPlay = {
      playerId: u.player.id,
      kind: u.item.kind,
      tier,
      ...(u.use.target !== undefined ? { target: u.use.target } : {}),
      ...(u.use.space !== undefined ? { space: u.use.space } : {}),
      status,
    };
    plays.push(play);
    playByUse.set(u, play);
    return play;
  };

  const ofTier = (tier: ItemTier) => uses.filter((u) => ITEMS[u.item.kind].tier === tier);

  const shielded = new Map<PlayerId, PlayerId>();
  for (const u of ofTier("defensive")) {
    events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
    shielded.set(u.player.id, u.player.id);
    addPlay(u);
  }

  const offensive: PendingUse[] = [];
  const steals = ofTier("offensive").filter((u) => u.item.kind === "coinThief");
  const attacks = ofTier("offensive").filter((u) => u.item.kind !== "coinThief");
  for (const u of [...steals, ...attacks]) {
    const target = u.use.target!;
    events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind, target });
    const shieldOwner = shielded.get(target);
    if (shieldOwner !== undefined) {
      events.push({ type: "itemBlocked", playerId: u.player.id, kind: u.item.kind, target });
      addPlay(u, "blocked").blockedBy = shieldOwner;
    } else {
      offensive.push(u);
      addPlay(u);
    }
  }

  const stolen = resolveSteals(s, steals.filter((u) => offensive.includes(u)), events);
  for (const [u, amount] of stolen) {
    u.amount = amount;
    const play = playByUse.get(u);
    if (play) play.amount = amount;
  }

  const shoves = new Map<PlayerId, number>();
  for (const u of offensive) {
    const target = u.use.target!;
    const m = mods.get(target)!;
    if (u.item.kind === "weight") {
      m.weights++;
      m.weightSources.push(u.player.id);
    }
    if (u.item.kind === "sandDie") {
      m.sandDie = true;
      m.sandDieSource = u.player.id;
    }
    if (u.item.kind === "shove") shoves.set(target, (shoves.get(target) ?? 0) + 1);
    if (u.item.kind === "collision") forcedBack.add(target);
  }
  for (const [id, count] of shoves) {
    const spaces = shove(s, findPlayer(s, id)!, count * s.rules.items.shoveDistance, events);
    for (const u of offensive) {
      if (u.item.kind === "shove" && u.use.target === id) playByUse.get(u)!.amount = spaces;
    }
  }

  const placements = new Map<SpaceId, PendingUse[]>();
  for (const u of ofTier("self")) {
    const m = mods.get(u.player.id)!;
    if (u.item.kind === "booster") m.booster = true;
    if (u.item.kind === "extraDie") m.extraDie = true;
    if (u.item.kind === "sandTrap") {
      const group = placements.get(u.use.space!) ?? [];
      group.push(u);
      placements.set(u.use.space!, group);
      addPlay(u);
      continue;
    }
    events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
    addPlay(u);
  }
  for (const [spaceId, group] of placements) placeTrap(s, spaceId, group, playByUse, events);

  return { mods, forcedBack, plays };
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
function resolveSteals(s: MatchState, steals: PendingUse[], events: MatchEvent[]): Map<PendingUse, number> {
  const byTarget = new Map<PlayerId, PendingUse[]>();
  for (const u of steals) {
    const group = byTarget.get(u.use.target!) ?? [];
    group.push(u);
    byTarget.set(u.use.target!, group);
  }

  const transfers: { from: Player; to: Player; amount: number; use: PendingUse }[] = [];
  for (const [targetId, thieves] of byTarget) {
    const target = findPlayer(s, targetId)!;
    const claims = thieves.map((u) => ({
      use: u,
      thief: u.player,
      want: randInt(s.rng, s.rules.items.coinThiefMin, s.rules.items.coinThiefMax),
      got: 0,
    }));
    let available = target.coins;
    if (claims.reduce((sum, c) => sum + c.want, 0) <= available) {
      for (const c of claims) c.got = c.want;
    } else {
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
    for (const c of claims) transfers.push({ from: target, to: c.thief, amount: c.got, use: c.use });
  }

  const got = new Map<PendingUse, number>();
  for (const t of transfers) {
    t.from.coins -= t.amount;
    t.to.coins += t.amount;
    got.set(t.use, (got.get(t.use) ?? 0) + t.amount);
    events.push({ type: "coinsStolen", from: t.from.id, to: t.to.id, amount: t.amount, reason: "coinThief" });
  }
  return got;
}

/** Players on the start or a checkpoint can't be pushed past it. Returns how many spaces they moved. */
function shove(s: MatchState, player: Player, spaces: number, events: MatchEvent[]): number {
  const type = s.board.spaces[player.position]!.type;
  const path =
    type === "start" || type === "checkpoint"
      ? []
      : walkBackward(s.board, player.position, spaces, s.rng, { stopAtCheckpoint: true });
  if (path.length > 0) player.position = path[path.length - 1]!;
  events.push({ type: "shoved", playerId: player.id, path });
  return path.length;
}

/** One trap per space: a random placer wins, everyone else (or everyone, if a trap is already there) gets the item back. */
function placeTrap(
  s: MatchState,
  spaceId: SpaceId,
  group: PendingUse[],
  playByUse: Map<PendingUse, ItemPlay>,
  events: MatchEvent[],
): void {
  const occupied = s.traps.some((t) => t.spaceId === spaceId);
  const winner = occupied ? null : pick(s.rng, group);
  for (const u of group) {
    if (u === winner) {
      s.traps.push({ spaceId, ownerId: u.player.id });
      events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
      events.push({ type: "trapPlaced", playerId: u.player.id, spaceId });
    } else {
      u.player.items.push(u.item);
      playByUse.get(u)!.status = "refunded";
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
  const change = (kind: "weight" | "booster" | "extraDie", to: number, source?: PlayerId) => {
    events.push({ type: "rollChanged", playerId, kind, from: value, to, ...(source ? { source } : {}) });
    value = to;
  };
  for (const source of mods.weightSources) {
    change("weight", Math.max(0, value - rules.weightAmount), source);
  }
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

/** Consumes one Floatie and returns true if the player was saved. */
export function consumeFloatie(player: Player, spaceId: SpaceId, events: MatchEvent[]): boolean {
  const index = player.items.findIndex((i) => i.kind === "floatie");
  if (index < 0) return false;
  player.items.splice(index, 1);
  events.push({ type: "floatieSaved", playerId: player.id, spaceId });
  return true;
}

/** Every first-place player gets a random item, unless their inventory is full. */
export function awardMinigameItem(s: MatchState, firstPlace: PlayerId[], events: MatchEvent[]): void {
  if (firstPlace.length === 0) return;
  const kind = pick(s.rng, ITEM_KINDS);
  for (const id of firstPlace) {
    const player = findPlayer(s, id)!;
    if (player.items.length >= s.rules.items.maxHeld) {
      events.push({ type: "itemAwardSkipped", playerId: player.id, kind });
      continue;
    }
    const item = newItem(s, kind);
    player.items.push(item);
    events.push({ type: "itemAwarded", playerId: player.id, item });
  }
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
