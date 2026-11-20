import { walkBackward } from "./movement";
import { nextFloat, pick, randInt, rollDie, shuffle } from "./rng";
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
  Trap,
} from "./types";

export interface ItemInfo {
  name: string;
  tier: ItemTier;
  /** What the player has to pick when using it. */
  target: "none" | "player" | "space" | "amount";
  /** Works from inventory without being chosen. Can't be "used" from the decision panel. */
  passive?: boolean;
  description: string;
}

export const ITEMS: Record<ItemKind, ItemInfo> = {
  shield: {
    name: "Hard Candy Shell",
    tier: "defensive",
    target: "none",
    description: "protects you from item effects and traps this round",
  },
  coinThief: {
    name: "Chocolate Coin Monster",
    tier: "offensive",
    target: "player",
    description: "Steal 10 to 20 coins from a player.",
  },
  weight: {
    name: "Poisoned Candy",
    tier: "offensive",
    target: "player",
    description: "Reduce a player's movement roll by 3 this round (minimum 0).",
  },
  sandDie: {
    name: "Foul Sugar Cube",
    tier: "offensive",
    target: "player",
    description: "A player rolls a d3 for movement this round. A saved die they picked is not used up.",
  },
  shove: {
    name: "Gummy Spring",
    tier: "offensive",
    target: "player",
    description: "Send a player back 5 spaces now. Stops at the checkpoint behind them.",
  },
  collision: {
    name: "Hooked Gobstopper",
    tier: "offensive",
    target: "player",
    description: "After movement, send a player back to the last checkpoint, even if they're alone.",
  },
  booster: {
    name: "Refreshing Candy",
    tier: "self",
    target: "none",
    description: "Add 3 to your movement roll this round.",
  },
  extraDie: {
    name: "Sugar Cube",
    tier: "self",
    target: "none",
    description: "Roll an extra d6 and add it to your movement roll this round.",
  },
  sandTrap: {
    name: "Coin Trap",
    tier: "self",
    target: "space",
    description: "Hide a trap up to 10 spaces ahead. The next other player to stop there loses 15 to 25 coins, all transferred to you.",
  },
  floatie: {
    name: "Life Ring",
    tier: "self",
    target: "none",
    passive: true,
    description: "While you hold it, the first time you'd be sent back by a collision or Hooked Gobstopper, you stay and lose the Life Ring.",
  },
  candyMissile: { name: "Candy Missile", tier: "offensive", target: "none", description: "Knock out a random living player, including yourself." },
  holySugarDust: { name: "Holy Sugar Dust", tier: "self", target: "none", description: "Use only while knocked out to revive immediately." },
  ghostFeet: {
    name: "Ghost Feet",
    tier: "self",
    target: "none",
    passive: true,
    description: "While held, blocks one trap that would affect you, then is consumed.",
  },
  itemTrap: { name: "Item Trap", tier: "self", target: "space", description: "Hide a trap up to 10 spaces ahead. The next other player to stop there loses a random item to you." },
  deathTrap: { name: "Death Trap", tier: "self", target: "space", description: "Hide a trap up to 10 spaces ahead. The next other player to stop there is knocked out." },
  mimic: { name: "Mimic", tier: "itemSteal", target: "none", description: "Steal a random item from a random other player." },
  chaosCandy: { name: "Chaos Candy", tier: "self", target: "none", description: "Immediately trigger a Monochrome Chaos effect, with you as the initiator." },
  stickyCandy: { name: "Sticky Candy", tier: "offensive", target: "player", description: "Prevent a player from moving this round." },
  bread: { name: "Bread", tier: "self", target: "none", description: "Increase your movement roll by 5." },
  poisonedBread: { name: "Poisoned Bread", tier: "offensive", target: "player", description: "Decrease a player's movement roll by 5." },
  customDiceRoll: { name: "Custom Dice Roll", tier: "self", target: "none", description: "Choose a movement distance up to the sides of the die you use." },
  hyperCandy: { name: "Hyper Candy", tier: "self", target: "none", description: "Double your modified roll; a result over 10 knocks you out." },
  swapCandy: { name: "Swap Candy", tier: "offensive", target: "none", description: "Swap board positions with a random living opponent." },
  trainedMimic: { name: "Trained Mimic", tier: "itemSteal", target: "player", description: "Steal a random item from any player." },
  jellyBoxingGloves: { name: "Jelly Boxing Gloves", tier: "offensive", target: "player", description: "Challenge a player to a knockout battle before movement." },
  chocolateCoinBag: { name: "Chocolate Coin Bag", tier: "self", target: "none", description: "Gain 10–25 coins." },
  chocolateCoinMachine: { name: "Chocolate Coin Machine", tier: "self", target: "amount", description: "Spend coins for extra movement: +1 roll for every 4 coins spent." },
  batchPoisonedCandy: { name: "Batch of Poisoned Candy", tier: "offensive", target: "none", description: "Decrease every other player's roll by 3 this round." },
  magicSugarDice: { name: "Magic Sugar Dice", tier: "offensive", target: "none", description: "Make every other player roll a d4 this round." },
  infiniteItemBag: { name: "Infinite Item Bag", tier: "self", target: "amount", description: "Gain a random item, plus one more for every 15 coins spent." },
  candyGun: { name: "Candy Gun", tier: "offensive", target: "player", description: "Try to knock out a player. Guaranteed within 3 spaces; chance drops 15% per additional space, to a minimum of 10%." },
  candySniper: { name: "Candy Sniper", tier: "offensive", target: "none", description: "Knock out the player in first place." },
  candyExplosion: { name: "Candy Explosion", tier: "offensive", target: "player", description: "A 50% chance to knock out your target and everyone within 2 spaces; on failure, you and everyone within 2 spaces of you are knocked out." },
  sugarAbsorb: { name: "Sugar Absorb", tier: "self", target: "none", description: "Steal 1 movement from every other player this round." },
  powerCreep: { name: "Power Creep", tier: "self", target: "none", description: "Gain 1 movement for every 3 spaces you are behind first place." },
  pairOfCandy: { name: "Pair of Candy", tier: "self", target: "none", description: "Trigger your landing-space effect twice, except on Black spaces." },
  candySpirit: { name: "Candy Spirit", tier: "self", target: "none", passive: true, description: "When knocked out, revive and knock out a random living opponent." },
  candyShotgun: { name: "Candy Shotgun", tier: "offensive", target: "none", description: "Knock out all living opponents 1–3 spaces ahead of you." },
  moonwalkRing: { name: "Moonwalk Ring", tier: "self", target: "none", description: "Make all opponents move backward this round; skip your turn. Backward movement stops at checkpoints." },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];
export const SHOP_ALWAYS: ItemKind[] = ["booster", "weight", "floatie", "collision", "candyMissile", "holySugarDust"];
export const SHOP_ROTATING: ItemKind[] = [
  "ghostFeet", "sandDie", "shove", "shield", "coinThief", "extraDie", "sandTrap",
  "itemTrap", "deathTrap", "mimic", "chaosCandy", "stickyCandy", "bread", "poisonedBread",
  "customDiceRoll", "hyperCandy", "swapCandy",
];
export const SHOP_ITEM_KINDS = [...SHOP_ALWAYS, ...SHOP_ROTATING] as ItemKind[];
export const SPECIAL_ITEM_KINDS: ItemKind[] = [
  "trainedMimic", "jellyBoxingGloves", "chocolateCoinBag", "chocolateCoinMachine",
  "batchPoisonedCandy", "magicSugarDice", "infiniteItemBag", "candyGun", "candySniper",
  "candyExplosion", "sugarAbsorb", "powerCreep", "pairOfCandy", "candySpirit",
  "candyShotgun", "moonwalkRing",
];

export function randomRewardItem(s: MatchState, specialChance: number): ItemKind {
  const pool = nextFloat(s.rng) < specialChance ? SPECIAL_ITEM_KINDS : SHOP_ITEM_KINDS;
  return pick(s.rng, pool);
}

export const DEFAULT_ITEM_RULES: ItemRules = {
  firstItemRound: 2,
  prices: {
    shield: 20,
    coinThief: 10,
    weight: 7,
    sandDie: 12,
    shove: 15,
    collision: 15,
    booster: 7,
    extraDie: 15,
    sandTrap: 10,
    floatie: 20,
    candyMissile: 15,
    holySugarDust: 30,
    ghostFeet: 15,
    itemTrap: 15,
    deathTrap: 20,
    mimic: 20,
    chaosCandy: 15,
    stickyCandy: 15,
    bread: 10,
    poisonedBread: 10,
    customDiceRoll: 12,
    hyperCandy: 15,
    swapCandy: 20,
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
  trapCoinsMin: 15,
  trapCoinsMax: 25,
  shopAlways: SHOP_ALWAYS,
  shopRotating: SHOP_ROTATING,
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

/** Awards a live-auction item and charges the winning bid without advancing the current phase. */
export function awardAuctionItem(
  state: MatchState,
  playerId: PlayerId,
  kind: ItemKind,
  bid: number,
): { state: MatchState; events: MatchEvent[] } {
  if (!Number.isInteger(bid) || bid < 1) throw new Error("Auction bids must be positive whole coins");
  const s = structuredClone(state);
  const player = findPlayer(s, playerId);
  if (!player) throw new Error(`Unknown player "${playerId}"`);
  if (player.coins < bid) throw new Error("The winning bid exceeds the player's coins");
  const item = { id: `item${s.nextItemId++}`, kind };
  player.coins -= bid;
  player.items.push(item);
  return {
    state: s,
    events: [
      { type: "coinsChanged", playerId, delta: -bid, reason: "auction" },
      { type: "auctionWon", playerId, item, bid },
    ],
  };
}

/**
 * Picks this round's shop stock. Two rotating items are selected and avoid the previous picks where possible.
 * Call when a new move phase begins and items are allowed.
 */
export function refreshShop(s: MatchState): void {
  if (!itemsAllowed(s)) {
    s.shop = [];
    return;
  }
  const pool = s.rules.items.shopRotating.filter((kind) => !s.lastRotating.includes(kind));
  const available = pool.length >= 2 ? pool : s.rules.items.shopRotating;
  const rotating = shuffle(s.rng, available).slice(0, Math.min(2, available.length));
  s.lastRotating = rotating;
  s.shop = [...s.rules.items.shopAlways, ...rotating];
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
  if (kind === "holySugarDust" && !player.dead) return "You can only use Holy Sugar Dust while knocked out";
  if (kind === "jellyBoxingGloves" && player.dead) return "You can't use Jelly Boxing Gloves while knocked out";
  if (kind === "jellyBoxingGloves" && use.target && findPlayer(s, use.target)?.position === s.board.finish) {
    return "You can't start a battle at the final boss space";
  }
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
    case "amount":
      if (!Number.isInteger(use.amount) || use.amount! < 0 || use.amount! > player.coins) return "Choose a whole number of coins you can afford";
      if (kind === "infiniteItemBag" && use.amount! % 15 !== 0) {
        return "Infinite Item Bag costs 15 coins for each item after the first";
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
  const price = s.rules.items.prices[kind];
  if (price === undefined || player.coins < price) return "Not enough coins";
  if (player.items.length - (using ? 1 : 0) >= s.rules.items.maxHeld) {
    return `You can only hold ${s.rules.items.maxHeld} items`;
  }
  return null;
}

/** Purchases a shop item immediately, returning the updated match and its public events. */
export function purchaseShopItem(
  state: MatchState,
  playerId: PlayerId,
  kind: ItemKind,
  using: boolean,
): { state: MatchState; item: OwnedItem; events: MatchEvent[] } {
  const next = structuredClone(state);
  const player = findPlayer(next, playerId);
  if (!player) throw new Error(`Unknown player "${playerId}"`);
  const problem = checkBuy(next, player, kind, using);
  if (problem) throw new Error(problem);
  const events: MatchEvent[] = [];
  const item = buy(next, player, kind, events);
  return { state: next, item, events };
}

export function checkMoveChoice(s: MatchState, playerId: PlayerId, choice: MoveChoice): string | null {
  const player = findPlayer(s, playerId);
  if (!player) return "Unknown player";
  if (!Number.isInteger(choice.lane) || choice.lane < 0 || choice.lane >= s.board.paths) return "Unknown path";
  if (player.skipNextMove && choice.die !== null) return "Saved dice can't be used on a skipped move";
  if (choice.die !== null && !player.dice.some((d) => d.id === choice.die)) return "You don't have that die";
  const mods = s.pendingItems?.mods[playerId];
  if (mods?.forcedSides && choice.die !== null) return "A forced die overrides your saved dice";
  if ((player.skipNextMove || s.pendingItems?.stuck.includes(playerId)) && choice.die !== null) {
    return "You can't use a saved die when skipping movement";
  }
  if (choice.customSpaces !== undefined) {
    if (!mods?.customRoll || !Number.isInteger(choice.customSpaces) || choice.customSpaces < 0) return "Choose a valid custom movement distance";
    const saved = player.dice.find((candidate) => candidate.id === choice.die);
    const sides = mods.forcedSides ?? (mods.sandDie ? s.rules.items.sandDieSides : saved?.sides ?? player.defaultDie);
    if (choice.customSpaces > sides) return "Custom movement can't exceed the selected die";
  } else if (mods?.customRoll) return "Choose your custom movement distance";
  return null;
}

export function checkItemChoice(s: MatchState, playerId: PlayerId, choice: ItemChoice): string | null {
  const player = findPlayer(s, playerId);
  if (!player) return "Unknown player";
  const use = choice.use ?? null;
  const buyProblem = choice.buy ? checkBuy(s, player, choice.buy, use !== null) : null;
  if (buyProblem) return buyProblem;
  if (use?.amount !== undefined && choice.buy) {
    const remaining = player.coins - (s.rules.items.prices[choice.buy] ?? 0);
    if (use.amount > remaining) return "You can't spend coins reserved for your purchase";
  }
  return use ? checkUse(s, player, use, choice.buy ?? null) : null;
}

export interface ItemResolution {
  mods: Map<PlayerId, RollMods>;
  /** Players hit by an unblocked Collision item this round. */
  forcedBack: Set<PlayerId>;
  /** Players protected by Hard Candy Shell for the remainder of this round. */
  shielded: Set<PlayerId>;
  trapImmune: Set<PlayerId>;
  stuck: Set<PlayerId>;
  jellyBattles: { spaceId: SpaceId; contenders: PlayerId[] }[];
  chaosInitiators: PlayerId[];
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
 * Shop purchases, then item uses by tier: defensive, item steals, offensive, self-only.
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
      {
        sandDie: false, weights: 0, weightSources: [], booster: false, extraDie: false,
        extraDice: 0, rollBonuses: [], customRoll: false, hyperCandy: false, moveBackwards: false, pairOfCandy: false,
      },
    ]),
  );
  const forcedBack = new Set<PlayerId>();
  const shielded = new Set<PlayerId>();
  const trapImmune = new Set<PlayerId>();
  const stuck = new Set<PlayerId>();
  const jellyBattles: ItemResolution["jellyBattles"] = [];
  const chaosInitiators: PlayerId[] = [];
  const uses: PendingUse[] = [];
  const customRollers = new Set<PlayerId>();
  const plays: ItemPlay[] = [];
  const playByUse = new Map<PendingUse, ItemPlay>();
  const coinThiefUses: PendingUse[] = [];

  for (const player of s.players) {
    const choice = choices[player.id];
    if (!choice) continue;
    let use = choice.use && checkUse(s, player, choice.use, choice.buy ?? null) === null ? choice.use : null;
    let buyOk = !!choice.buy && checkBuy(s, player, choice.buy, use !== null) === null;
    if (buyOk && use?.amount !== undefined && use.amount > player.coins - s.rules.items.prices[choice.buy!]!) {
      use = null;
      buyOk = checkBuy(s, player, choice.buy!, false) === null;
    }
    if (!buyOk && use?.itemId === BOUGHT_ITEM) use = null;
    const bought = buyOk ? buy(s, player, choice.buy!, events) : null;
    if (use) {
      const index = player.items.findIndex((i) => i.id === (use.itemId === BOUGHT_ITEM ? bought!.id : use.itemId));
      const [item] = player.items.splice(index, 1);
      uses.push({ player, item: item!, use });
      if (item!.kind === "customDiceRoll") customRollers.add(player.id);
    }
  }

  const tierPriority: Record<ItemTier, number> = {
    defensive: 0,
    itemSteal: 1,
    offensive: 2,
    self: 3,
  };
  uses.sort((a, b) => tierPriority[ITEMS[a.item.kind].tier] - tierPriority[ITEMS[b.item.kind].tier]);

  const addPlay = (u: PendingUse, status: ItemPlay["status"] = "resolved"): ItemPlay => {
    const tier = ITEMS[u.item.kind].tier;
    const play: ItemPlay = {
      playerId: u.player.id,
      kind: u.item.kind,
      tier,
      ...(u.use.target !== undefined ? { target: u.use.target } : {}),
      ...(u.use.space !== undefined ? { space: u.use.space } : {}),
      ...(u.use.amount !== undefined ? { amount: u.use.amount } : {}),
      status,
    };
    plays.push(play);
    playByUse.set(u, play);
    return play;
  };

  const placements = new Map<SpaceId, PendingUse[]>();
  for (const u of uses) {
    const { player, item, use } = u;
    const kind = item.kind;
    const mod = mods.get(player.id)!;
    if (kind === "shield") shielded.add(player.id);
  }
  for (const id of shielded) events.push({ type: "itemUsed", playerId: id, kind: "shield" });

  const blocked = (u: PendingUse, target: Player): boolean => {
    if (!shielded.has(target.id)) return false;
    events.push({ type: "itemBlocked", playerId: u.player.id, kind: u.item.kind, target: target.id });
    const play = playByUse.get(u) ?? addPlay(u, "blocked");
    play.status = "blocked";
    play.blockedBy = target.id;
    return true;
  };
  const playFor = (u: PendingUse) => playByUse.get(u) ?? addPlay(u);
  const markAffected = (u: PendingUse, targets: PlayerId[]) => {
    const play = playFor(u);
    play.affectedPlayers = [...new Set([...(play.affectedPlayers ?? []), ...targets])];
  };
  const stealRandomItem = (u: PendingUse, target: Player) => {
    if (blocked(u, target)) return;
    if (target.items.length === 0) return;
    const item = pick(s.rng, target.items);
    target.items.splice(target.items.indexOf(item), 1);
    u.player.items.push(item);
    playFor(u).stolenItem = item.kind;
    events.push({ type: "itemStolen", from: target.id, to: u.player.id, item });
    markAffected(u, [target.id]);
  };
  const randomAlivePlayer = () => {
    const living = s.players.filter((p) => !p.dead);
    return living.length ? pick(s.rng, living) : undefined;
  };
  const randomOpponent = (player: Player) => {
    const living = s.players.filter((p) => p.id !== player.id && !p.dead);
    return living.length ? pick(s.rng, living) : undefined;
  };
  const others = (player: Player) => s.players.filter((p) => p.id !== player.id);
  const distance = (a: Player, b: Player) => shortestBoardDistance(s.board, a.position, b.position);

  for (const u of uses) {
    const { player, item, use } = u;
    const kind = item.kind;
    const mod = mods.get(player.id)!;
    if (kind === "shield") {
      playFor(u);
      continue;
    }
    if (kind === "holySugarDust") {
      player.dead = false;
      player.reviveRequirement = 6;
      events.push({ type: "itemUsed", playerId: player.id, kind });
      events.push({ type: "playerRevived", playerId: player.id, rolled: 0, requirement: 0, spaces: 0 });
      playFor(u);
      continue;
    }
    if (kind === "sandTrap" || kind === "itemTrap" || kind === "deathTrap") {
      const group = placements.get(u.use.space!) ?? [];
      group.push(u);
      placements.set(u.use.space!, group);
      playFor(u);
      continue;
    }
    events.push({ type: "itemUsed", playerId: player.id, kind, ...(use.target ? { target: use.target } : {}) });

    if (kind === "weight" || kind === "sandDie" || kind === "shove" || kind === "collision" ||
        kind === "stickyCandy" || kind === "poisonedBread" || kind === "candyGun" ||
        kind === "candyExplosion" || kind === "trainedMimic" || kind === "jellyBoxingGloves") {
      const target = findPlayer(s, use.target!)!;
      if (blocked(u, target)) continue;
      playFor(u);
      if (kind !== "candyGun" && kind !== "candyExplosion" && kind !== "trainedMimic") {
        markAffected(u, [target.id]);
      }
      if (customRollers.has(target.id) &&
          ["weight", "sandDie", "shove", "collision", "stickyCandy", "poisonedBread"].includes(kind)) {
        playFor(u).cancelledByCustom = true;
        continue;
      }
      switch (kind) {
        case "weight":
          mods.get(target.id)!.weights++;
          mods.get(target.id)!.weightSources.push(player.id);
          break;
        case "sandDie":
          mods.get(target.id)!.sandDie = true;
          mods.get(target.id)!.sandDieSource = player.id;
          break;
        case "shove":
          u.amount = shove(s, target, s.rules.items.shoveDistance, events);
          playFor(u).amount = u.amount;
          break;
        case "collision": forcedBack.add(target.id); break;
        case "stickyCandy": stuck.add(target.id); break;
        case "poisonedBread":
          mods.get(target.id)!.rollBonuses.push({ kind, source: player.id, amount: -5 });
          break;
        case "candyGun": {
          const spaces = distance(player, target);
          const chance = candyGunSuccessChance(spaces);
          playFor(u).outcome = nextFloat(s.rng) < chance ? "success" : "failure";
          if (playFor(u).outcome === "success") {
            markAffected(u, [target.id]);
            knockOutPlayer(s, target, "item", events, { item: kind, sourcePlayerId: player.id });
          }
          break;
        }
        case "candyExplosion": {
          const affected: PlayerId[] = [];
          const success = nextFloat(s.rng) < 0.5;
      playFor(u).outcome = success ? "success" : "backfire";
          if (success) {
            for (const victim of s.players.filter((p) => !p.dead && (p.id === target.id || distance(p, target) <= 2))) {
              if (!blocked(u, victim)) {
                affected.push(victim.id);
                knockOutPlayer(s, victim, "item", events, { item: kind, sourcePlayerId: player.id });
              }
            }
          } else {
            for (const victim of s.players.filter((p) => !p.dead && (p.id === player.id || distance(p, player) <= 2))) {
              if (!blocked(u, victim)) {
                affected.push(victim.id);
                knockOutPlayer(s, victim, "item", events, { item: kind, sourcePlayerId: player.id });
              }
            }
          }
          markAffected(u, affected);
          break;
        }
        case "trainedMimic": stealRandomItem(u, target); break;
        case "jellyBoxingGloves":
          jellyBattles.push({ spaceId: target.position, contenders: [player.id, target.id] });
          break;
      }
      continue;
    }

    playFor(u);
    switch (kind) {
      case "coinThief": {
        const target = findPlayer(s, use.target!)!;
        if (!blocked(u, target)) coinThiefUses.push(u);
        break;
      }
      case "booster": mod.booster = true; break;
      case "extraDie": mod.extraDie = true; mod.extraDice++; break;
      case "bread": mod.rollBonuses.push({ kind, amount: 5 }); break;
      case "chocolateCoinMachine": {
        const amount = use.amount ?? 0;
        player.coins -= amount;
        if (amount > 0) events.push({ type: "coinsChanged", playerId: player.id, delta: -amount, reason: "item" });
        mod.rollBonuses.push({ kind, amount: Math.floor(amount / 4) });
        break;
      }
      case "infiniteItemBag": {
        const amount = use.amount ?? 0;
        player.coins -= amount;
        if (amount > 0) events.push({ type: "coinsChanged", playerId: player.id, delta: -amount, reason: "item" });
        for (let count = 0; count < 1 + Math.floor(amount / 15); count++) awardRandomItem(s, player, events);
        break;
      }
      case "chocolateCoinBag": {
        const amount = randInt(s.rng, 10, 25);
        player.coins += amount;
        playFor(u).amount = amount;
        events.push({ type: "coinsChanged", playerId: player.id, delta: amount, reason: "item" });
        break;
      }
      case "customDiceRoll": mod.customRoll = true; break;
      case "hyperCandy": mod.hyperCandy = true; break;
      case "pairOfCandy": mod.pairOfCandy = true; break;
      case "sugarAbsorb":
        {
          const affected: PlayerId[] = [];
        for (const target of others(player)) {
          if (!blocked(u, target)) {
            mods.get(target.id)!.rollBonuses.push({ kind, source: player.id, amount: -1 });
            affected.push(target.id);
          }
        }
        markAffected(u, affected);
        mod.rollBonuses.push({ kind, amount: others(player).filter((target) => !shielded.has(target.id)).length });
        break;
        }
      case "powerCreep": {
        const leaderDistance = Math.min(...s.players.map((p) => s.board.spaces[p.position]!.distanceToFinish));
        const behind = Math.max(0, s.board.spaces[player.position]!.distanceToFinish - leaderDistance);
        const gained = Math.floor(behind / 3);
        mod.rollBonuses.push({ kind, amount: gained });
        playFor(u).amount = gained;
        break;
      }
      case "magicSugarDice":
      case "batchPoisonedCandy":
        {
          const affected: PlayerId[] = [];
        for (const target of others(player)) {
          if (blocked(u, target)) continue;
          affected.push(target.id);
          const targetMods = mods.get(target.id)!;
          if (kind === "magicSugarDice") targetMods.forcedSides = 4;
          else targetMods.rollBonuses.push({ kind, source: player.id, amount: -3 });
        }
        markAffected(u, affected);
        break;
        }
      case "candyMissile": {
        const target = randomAlivePlayer();
        if (target) {
          if (!blocked(u, target)) {
            markAffected(u, [target.id]);
            knockOutPlayer(s, target, "item", events, { item: kind, sourcePlayerId: player.id });
          }
        }
        break;
      }
      case "candySniper": {
        const living = s.players.filter((p) => !p.dead);
        const bestDistance = living.length ? Math.min(...living.map((p) => s.board.spaces[p.position]!.distanceToFinish)) : null;
        const leaders = bestDistance === null ? [] : living.filter((p) => s.board.spaces[p.position]!.distanceToFinish === bestDistance);
        const target = leaders.length ? pick(s.rng, leaders) : undefined;
        if (target && !blocked(u, target)) {
          markAffected(u, [target.id]);
          knockOutPlayer(s, target, "item", events, { item: kind, sourcePlayerId: player.id });
        }
        break;
      }
      case "candyShotgun":
        const affected = s.players.filter((p) =>
          !p.dead && p.id !== player.id &&
          s.board.spaces[p.position]!.distanceToFinish < s.board.spaces[player.position]!.distanceToFinish &&
          s.board.spaces[player.position]!.distanceToFinish - s.board.spaces[p.position]!.distanceToFinish <= 3,
        );
        const victims: PlayerId[] = [];
        for (const target of affected) if (!blocked(u, target)) {
          victims.push(target.id);
          knockOutPlayer(s, target, "item", events, { item: kind, sourcePlayerId: player.id });
        }
        markAffected(u, victims);
        break;
      case "mimic": {
        const target = randomOpponent(player);
        if (target) stealRandomItem(u, target);
        break;
      }
      case "swapCandy": {
        const target = randomOpponent(player);
        if (target && !blocked(u, target)) {
          [player.position, target.position] = [target.position, player.position];
          markAffected(u, [target.id]);
        }
        break;
      }
      case "chaosCandy": chaosInitiators.push(player.id); break;
      case "moonwalkRing":
        stuck.add(player.id);
        {
          const affected: PlayerId[] = [];
        for (const target of others(player)) {
          if (!blocked(u, target)) {
            mods.get(target.id)!.moveBackwards = true;
            affected.push(target.id);
          }
        }
        markAffected(u, affected);
        break;
        }
      case "floatie":
      case "candySpirit":
        break;
    }
  }
  const stolenCoins = resolveSteals(s, coinThiefUses, events);
  for (const [use, amount] of stolenCoins) {
    playFor(use).amount = amount;
    if (amount > 0) markAffected(use, [use.use.target!]);
  }
  for (const [spaceId, group] of placements) placeTrap(s, spaceId, group, playByUse, events);

  // A custom distance overrides item-caused movement modifiers and forced movement.
  for (const [playerId, mod] of mods) {
    if (!mod.customRoll) continue;
    for (const play of plays) {
      const selfMovementEffect = play.playerId === playerId &&
        ["booster", "extraDie", "bread", "chocolateCoinMachine", "hyperCandy", "pairOfCandy",
          "powerCreep", "sugarAbsorb", "moonwalkRing", "customDiceRoll"].includes(play.kind);
      if (play.kind !== "customDiceRoll" &&
          (selfMovementEffect || play.affectedPlayers?.includes(playerId))) {
         play.cancelledByCustom = true;
         play.cancelledByCustomPlayerId = playerId;
      }
    }
    mod.sandDie = false;
    delete mod.sandDieSource;
    mod.forcedSides = undefined;
    mod.weights = 0;
    mod.weightSources = [];
    mod.rollBonuses = [];
    mod.booster = false;
    mod.extraDie = false;
    mod.extraDice = 0;
    mod.hyperCandy = false;
    mod.moveBackwards = false;
    mod.pairOfCandy = false;
    stuck.delete(playerId);
    forcedBack.delete(playerId);
  }

  return { mods, forcedBack, shielded, trapImmune, stuck, jellyBattles, chaosInitiators, plays };
}

export function boardDistance(board: Board, from: SpaceId, to: SpaceId): number {
  return shortestBoardDistance(board, from, to);
}

export function candyGunSuccessChance(distance: number): number {
  return distance <= 3 ? 1 : Math.max(0.1, 1 - (distance - 3) * 0.15);
}

function shortestBoardDistance(board: Board, from: SpaceId, to: SpaceId): number {
  if (from === to) return 0;
  const seen = new Set<SpaceId>([from]);
  let frontier = [from];
  for (let distance = 1; frontier.length > 0; distance++) {
    const next: SpaceId[] = [];
    for (const id of frontier) for (const adjacent of [...board.spaces[id]!.next, ...board.spaces[id]!.prev]) {
      if (adjacent === to) return distance;
      if (!seen.has(adjacent)) {
        seen.add(adjacent);
        next.push(adjacent);
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

function awardRandomItem(s: MatchState, player: Player, events: MatchEvent[]): void {
  const kind = pick(s.rng, ITEM_KINDS);
  if (player.items.length >= s.rules.items.maxHeld) {
    events.push({ type: "itemAwardSkipped", playerId: player.id, kind });
    return;
  }
  const item = newItem(s, kind);
  player.items.push(item);
  events.push({ type: "itemAwarded", playerId: player.id, item });
}

function newItem(s: MatchState, kind: ItemKind): OwnedItem {
  return { id: `item${s.nextItemId++}`, kind };
}

function buy(s: MatchState, player: Player, kind: ItemKind, events: MatchEvent[]): OwnedItem {
  const price = s.rules.items.prices[kind];
  player.coins -= price!;
  events.push({ type: "coinsChanged", playerId: player.id, delta: -price!, reason: "shop" });
  const item = newItem(s, kind);
  player.items.push(item);
  events.push({ type: "itemBought", playerId: player.id, item, price: price! });
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
      s.traps.push({ spaceId, ownerId: u.player.id, kind: u.item.kind as Trap["kind"] });
      events.push({ type: "itemUsed", playerId: u.player.id, kind: u.item.kind });
      events.push({ type: "trapPlaced", playerId: u.player.id, spaceId, kind: u.item.kind as Trap["kind"] });
    } else {
      u.player.items.push(u.item);
      playByUse.get(u)!.status = "refunded";
      events.push({ type: "trapRefunded", playerId: u.player.id, spaceId, kind: u.item.kind as Trap["kind"] });
    }
  }
}

/** Applies flat roll effects, then extra dice, then Hyper Candy. Rolls never fall below 0. */
export function applyRollMods(
  s: MatchState,
  playerId: PlayerId,
  roll: number,
  mods: RollMods,
  events: MatchEvent[],
): number {
  if (mods.customRoll) return roll;
  const rules = s.rules.items;
  let value = roll;
  const change = (kind: ItemKind, to: number, source?: PlayerId) => {
    events.push({ type: "rollChanged", playerId, kind, from: value, to, ...(source ? { source } : {}) });
    value = to;
  };
  for (const source of mods.weightSources) {
    change("weight", Math.max(0, value - rules.weightAmount), source);
  }
  for (const bonus of mods.rollBonuses) {
    change(bonus.kind, Math.max(0, value + bonus.amount), bonus.source);
  }
  if (mods.booster) change("booster", value + rules.boosterAmount);
  const extraCount = Math.max(mods.extraDice, Number(mods.extraDie));
  for (let i = 0; i < extraCount; i++) change("extraDie", value + rollDie(s.rng, rules.extraDieSides));
  if (mods.hyperCandy) change("hyperCandy", value * 2);
  return value;
}

/** Final positions only, before collisions. Each trap hits everyone but its owner who stopped on it, then is gone. */
export function triggerTraps(
  s: MatchState,
  events: MatchEvent[],
  shielded: ReadonlySet<PlayerId> = new Set(),
  trapImmune: ReadonlySet<PlayerId> = new Set(),
): void {
  for (const trap of [...s.traps]) {
    const landed = s.players.filter((p) =>
      !p.dead && p.position === trap.spaceId && p.id !== trap.ownerId,
    );
    if (landed.length === 0) continue;
    const blocked: PlayerId[] = [];
    const victims: Player[] = [];
    for (const player of landed) {
      if (shielded.has(player.id) || trapImmune.has(player.id)) {
        blocked.push(player.id);
        continue;
      }
      const ghostFeetIndex = player.items.findIndex((item) => item.kind === "ghostFeet");
      if (ghostFeetIndex >= 0) {
        player.items.splice(ghostFeetIndex, 1);
        blocked.push(player.id);
        events.push({ type: "ghostFeetSaved", playerId: player.id, spaceId: trap.spaceId, trapKind: trap.kind });
      } else {
        victims.push(player);
      }
    }
    s.traps = s.traps.filter((t) => t !== trap);
    events.push({ type: "trapTriggered", ownerId: trap.ownerId, spaceId: trap.spaceId, kind: trap.kind, victims: victims.map((v) => v.id), ...(blocked.length ? { blocked } : {}) });
    const owner = findPlayer(s, trap.ownerId)!;
    for (const victim of victims) {
      if (trap.kind === "sandTrap") {
        const amount = Math.min(victim.coins, randInt(s.rng, s.rules.items.trapCoinsMin, s.rules.items.trapCoinsMax));
        victim.coins -= amount;
        owner.coins += amount;
        events.push({ type: "coinsStolen", from: victim.id, to: owner.id, amount, reason: "trap" });
      } else if (trap.kind === "itemTrap") {
        if (victim.items.length > 0) {
          const item = pick(s.rng, victim.items);
          victim.items.splice(victim.items.indexOf(item), 1);
          owner.items.push(item);
          events.push({ type: "itemStolen", from: victim.id, to: owner.id, item });
        }
      } else {
        knockOutPlayer(s, victim, "item", events, { item: "deathTrap", sourcePlayerId: owner.id });
      }
    }
  }
}

export function knockOutPlayer(
  s: MatchState,
  player: Player,
  reason: Extract<MatchEvent, { type: "playerDied" }>["reason"],
  events: MatchEvent[],
  cause?: { item?: ItemKind; sourcePlayerId?: PlayerId },
): void {
  if (player.dead) return;
  const spiritIndex = player.items.findIndex((item) => item.kind === "candySpirit");
  if (spiritIndex >= 0) {
    player.items.splice(spiritIndex, 1);
    const opponents = s.players.filter((other) => other.id !== player.id && !other.dead);
    const target = opponents.length ? pick(s.rng, opponents) : undefined;
    player.dead = false;
    player.reviveRequirement = 6;
    if (target) {
      const trigger: Extract<MatchEvent, { type: "candySpiritTriggered" }> = {
        type: "candySpiritTriggered",
        playerId: player.id,
        target: target.id,
      };
      events.push(trigger);
      knockOutPlayer(s, target, "item", events, { item: "candySpirit", sourcePlayerId: player.id });
      if (target.dead) trigger.knockedOut = target.id;
    }
    return;
  }
  player.dead = true;
  player.reviveRequirement = 6;
  events.push({
    type: "playerDied",
    playerId: player.id,
    reason,
    ...(cause?.item ? { cause: cause.item } : {}),
    ...(cause?.sourcePlayerId ? { sourcePlayerId: cause.sourcePlayerId } : {}),
  });
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
  const kind = randomRewardItem(s, 0.5);
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
