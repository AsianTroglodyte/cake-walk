import type { MinigameKind } from "./minigames";
import type { Rng } from "./rng";

export type PlayerId = string;
export type SpaceId = number;
export type BoardSize = "short" | "medium" | "large";

export type BoardTileType = "white" | "blue" | "red" | "green" | "orange" | "purple" | "pink" | "maroon" | "black";
export type SpaceType = "start" | "checkpoint" | "finish" | BoardTileType | "monochromeChaos" | "rainbowChaos";

export interface Space {
  id: SpaceId;
  type: SpaceType;
  next: SpaceId[];
  prev: SpaceId[];
  /** Index of the parallel path this space belongs to; null for spaces every path shares. */
  lane: number | null;
  /** 0 is the opening segment (start to first checkpoint). */
  segment: number;
  distanceToFinish: number;
  /** Where a player on this space is sent after a collision. */
  checkpointBehind: SpaceId;
  collisionFree: boolean;
}

export interface Board {
  spaces: Space[];
  start: SpaceId;
  finish: SpaceId;
  paths: number;
}

export interface BoardConfig {
  openingLength: number;
  segmentLength: number;
  /** Segments after the opening; each ends at a checkpoint, the last at the finish. */
  segments: number;
  weights: Record<BoardTileType, number>;
}

export interface RuleConfig {
  startingCoins: number;
  blueCoins: number;
  redCoins: number;
  arrowDistance: number;
  bossStartFixed: number;
  bossMinFixed: number;
  bossDieSides: number;
  knockbackMin: number;
  knockbackMax: number;
  d12IntervalMin: number;
  d12IntervalMax: number;
  items: ItemRules;
}

export type ItemKind =
  | "shield"
  | "coinThief"
  | "weight"
  | "sandDie"
  | "shove"
  | "collision"
  | "booster"
  | "extraDie"
  | "sandTrap"
  | "floatie"
  | "candyMissile"
  | "holySugarDust"
  | "ghostFeet"
  | "itemTrap"
  | "deathTrap"
  | "mimic"
  | "chaosCandy"
  | "stickyCandy"
  | "bread"
  | "poisonedBread"
  | "customDiceRoll"
  | "hyperCandy"
  | "swapCandy"
  | "trainedMimic"
  | "jellyBoxingGloves"
  | "chocolateCoinBag"
  | "chocolateCoinMachine"
  | "batchPoisonedCandy"
  | "magicSugarDice"
  | "infiniteItemBag"
  | "candyGun"
  | "candySniper"
  | "candyExplosion"
  | "sugarAbsorb"
  | "powerCreep"
  | "pairOfCandy"
  | "candySpirit"
  | "candyShotgun"
  | "moonwalkRing";

export interface ItemRules {
  /** Earlier rounds are movement and a minigame only: no items, no shop. */
  firstItemRound: number;
  prices: Partial<Record<ItemKind, number>>;
  maxHeld: number;
  coinThiefMin: number;
  coinThiefMax: number;
  weightAmount: number;
  sandDieSides: number;
  shoveDistance: number;
  boosterAmount: number;
  extraDieSides: number;
  trapRange: number;
  trapCoinsMin: number;
  trapCoinsMax: number;
  /** Always for sale. */
  shopAlways: ItemKind[];
  /** Rotating slots are drawn from these, avoiding the previous round's picks where possible. */
  shopRotating: ItemKind[];
}

export interface OwnedItem {
  id: string;
  kind: ItemKind;
}

export interface Trap {
  spaceId: SpaceId;
  ownerId: PlayerId;
  kind: "sandTrap" | "itemTrap" | "deathTrap";
}

/** `target` is required for targeted items, `space` for traps, `amount` for coin-spending items. */
export interface ItemUse {
  itemId: string;
  target?: PlayerId;
  space?: SpaceId;
  amount?: number;
}

/** Everything a player chooses in the item phase. */
export interface ItemChoice {
  use?: ItemUse | null;
  buy?: ItemKind | null;
}

export type ItemTier = "defensive" | "itemSteal" | "offensive" | "self";

export interface RollMods {
  sandDie: boolean;
  /** Who used the Sand Die, when one is forcing this player's roll. */
  sandDieSource?: PlayerId;
  weights: number;
  /** One entry per Weight, naming the player who used it. */
  weightSources: PlayerId[];
  booster: boolean;
  extraDie: boolean;
  extraDice: number;
  rollBonuses: { kind: ItemKind; source?: PlayerId; amount: number }[];
  forcedSides?: number;
  customRoll: boolean;
  hyperCandy: boolean;
  moveBackwards: boolean;
  pairOfCandy: boolean;
}

/** One item use as it appeared in the item phase, in reveal order. */
export interface ItemPlay {
  playerId: PlayerId;
  kind: ItemKind;
  tier: ItemTier;
  target?: PlayerId;
  /** Players actually affected by this item use, including random and multi-target effects. */
  affectedPlayers?: PlayerId[];
  space?: SpaceId;
  status: "resolved" | "blocked" | "refunded";
  /** Extra detail for the reveal, such as coins stolen or spaces moved. */
  amount?: number;
  /** Item-specific outcome, such as Candy Gun or Candy Explosion. */
  outcome?: "success" | "failure" | "backfire";
  /** Item transferred by Mimic or Trained Mimic. */
  stolenItem?: ItemKind;
  /** The effect was overridden by the target's Custom Dice Roll. */
  cancelledByCustom?: boolean;
  /** The Custom Dice Roll user who cancelled this item; used to keep the cross-out private. */
  cancelledByCustomPlayerId?: PlayerId;
  blockedBy?: PlayerId;
}

/** Effects carried from the item phase into the move phase. */
export interface ItemEffects {
  mods: Record<PlayerId, RollMods>;
  forcedBack: PlayerId[];
  shielded: PlayerId[];
  trapImmune: PlayerId[];
  stuck: PlayerId[];
  jellyBattles: { spaceId: SpaceId; contenders: PlayerId[] }[];
  plays: ItemPlay[];
}

export type SavedDieSides = 8 | 10 | 12;
export type DefaultDieSides = 4 | 6;

export interface SavedDie {
  id: string;
  sides: SavedDieSides;
}

export interface Player {
  id: PlayerId;
  name: string;
  isBot: boolean;
  position: SpaceId;
  coins: number;
  dice: SavedDie[];
  items: OwnedItem[];
  /** d4 for the round after placing last in a minigame, otherwise d6. */
  defaultDie: DefaultDieSides;
  /** A Maroon space skips the next movement turn. */
  skipNextMove: boolean;
  /** Additional skipped turns after the next move is skipped (for doubled Maroon effects). */
  extraSkippedTurns: number;
  dead: boolean;
  /** A dead player's current minimum die result required for revival. */
  reviveRequirement: number;
}

export type Phase =
  | { kind: "items" }
  | { kind: "move" }
  | { kind: "battleInitiation" }
  | { kind: "battle"; groups: { spaceId: SpaceId; contenders: PlayerId[] }[]; groupIndex: number; beforeMove?: boolean }
  | { kind: "boss"; challengers: PlayerId[]; afterBattleInitiation?: boolean }
  | { kind: "showdown"; contenders: PlayerId[] }
  | { kind: "minigame" }
  | { kind: "gameOver"; winner: PlayerId };

export interface MatchState {
  board: Board;
  rules: RuleConfig;
  players: Player[];
  round: number;
  phase: Phase;
  /** Shared by all players: each boss loss lowers it by 1, down to rules.bossMinFixed. */
  bossFixed: number;
  nextD12Round: number;
  rng: Rng;
  nextDieId: number;
  nextItemId: number;
  /** Hidden: each player only ever sees their own. */
  traps: Trap[];
  /** The items for sale this round. Empty before items open. Public. */
  shop: ItemKind[];
  /** Last round's rotating shop items; next picks avoid these where possible. */
  lastRotating: ItemKind[];
  /** Set by the item phase and consumed by the move phase. */
  pendingItems: ItemEffects | null;
  chaosChance: number;
  lastChaosRound: number | null;
  chaosSpaces: { spaceId: SpaceId; previousType: BoardTileType }[];
}

/** `die: null` means the player's default die. Items are chosen in the item phase. */
export interface MoveChoice {
  die: string | null;
  lane: number;
  /** Optional exact distance for Custom Dice Roll. */
  customSpaces?: number;
}

export interface BattleChoice {
  die: string | null;
}

export interface BattleInitiationChoice {
  /** Null declines to initiate a battle this round. */
  target: PlayerId | null;
}

/** Minigame placements, best first. Players in the same group tied. */
export type MinigameRanking = PlayerId[][];

/** Players missing from `choices` get the timeout defaults. */
export type PhaseInput =
  | { kind: "items"; choices: Partial<Record<PlayerId, ItemChoice>> }
  | { kind: "move"; choices: Partial<Record<PlayerId, MoveChoice>> }
  | { kind: "battleInitiation"; choices: Partial<Record<PlayerId, BattleInitiationChoice>> }
  | { kind: "battle"; choices: Partial<Record<PlayerId, BattleChoice>> }
  | { kind: "boss"; choices: Partial<Record<PlayerId, BattleChoice>> }
  | { kind: "showdown"; choices: Partial<Record<PlayerId, BattleChoice>> }
  | { kind: "minigame"; ranking: MinigameRanking; played?: MinigamePlayed };

export interface MinigamePlayed {
  /** Everyone failed, rather than everyone tying for first. */
  allLast?: boolean;
  game: MinigameKind;
  /** null: no valid result (didn't play, false start, or implausible). */
  scores: Record<PlayerId, number | null>;
  /** Readable results for the log, when a bare number with a unit isn't enough. */
  labels?: Record<PlayerId, string>;
}

export interface DieOption {
  id: string | null;
  sides: number;
}

export type Decision =
  | {
      playerId: PlayerId;
      kind: "items";
      items: OwnedItem[];
      /** Other players, for items used on someone. */
      targets: PlayerId[];
      trapSpaces: SpaceId[];
      prices: Partial<Record<ItemKind, number>>;
      /** Items for sale this round, same for everyone. */
      shop: ItemKind[];
      maxHeld: number;
    }
  | { playerId: PlayerId; kind: "move"; dice: DieOption[]; lanes: number; mods: RollMods }
  | { playerId: PlayerId; kind: "battleInitiation"; targets: PlayerId[] }
  | { playerId: PlayerId; kind: "battle" | "boss" | "showdown"; dice: DieOption[] };

export interface BossAttempt {
  playerRoll: number;
  bossRoll: number;
  bossScore: number;
}

export type MatchEvent =
  | { type: "roundStarted"; round: number }
  | {
      type: "dieRolled";
      playerId: PlayerId;
      sides: number;
      saved: boolean;
      value: number;
      /** Set when a Sand Die forced this roll. */
      source?: PlayerId;
    }
  | { type: "moved"; playerId: PlayerId; path: SpaceId[]; chain?: number }
  | {
      type: "moveSkipped";
      playerId: PlayerId;
      reasons: ("maroonSpace" | "stickyCandy" | "moonwalkRing")[];
    }
  | {
      type: "playerDied";
      playerId: PlayerId;
      reason: "blackSpace" | "rainbowChaos" | "battle" | "item";
      /** Item that caused the knockout, when the cause was an item effect. */
      cause?: ItemKind;
      /** Player who used the causing item, when applicable. */
      sourcePlayerId?: PlayerId;
    }
  | { type: "candySpiritTriggered"; playerId: PlayerId; target?: PlayerId; knockedOut?: PlayerId }
  | { type: "battleFinished"; spaceId: SpaceId; winner: PlayerId; losers: PlayerId[] }
  | { type: "revivalFailed"; playerId: PlayerId; rolled: number; requirement: number; nextRequirement: number }
  | { type: "playerRevived"; playerId: PlayerId; rolled: number; requirement: number; spaces: number }
  | { type: "coinsChanged"; playerId: PlayerId; delta: number; reason: CoinReason }
  | { type: "itemBought"; playerId: PlayerId; item: OwnedItem; price: number }
  | { type: "auctionWon"; playerId: PlayerId; item: OwnedItem; bid: number }
  | { type: "itemStolen"; from: PlayerId; to: PlayerId; item: OwnedItem }
  | { type: "itemUsed"; playerId: PlayerId; kind: ItemKind; target?: PlayerId }
  | { type: "itemBlocked"; playerId: PlayerId; kind: ItemKind; target: PlayerId }
  | { type: "coinsStolen"; from: PlayerId; to: PlayerId; amount: number; reason: "coinThief" | "trap" }
  | { type: "shoved"; playerId: PlayerId; path: SpaceId[] }
  | {
      type: "rollChanged";
      playerId: PlayerId;
      kind: ItemKind;
      from: number;
      to: number;
      /** Who used the item that changed the roll. */
      source?: PlayerId;
    }
  | { type: "trapPlaced"; playerId: PlayerId; spaceId: SpaceId; kind: Trap["kind"] }
  | { type: "trapRefunded"; playerId: PlayerId; spaceId: SpaceId; kind: Trap["kind"] }
  | { type: "trapTriggered"; ownerId: PlayerId; spaceId: SpaceId; kind: Trap["kind"]; victims: PlayerId[]; blocked?: PlayerId[] }
  | { type: "itemAwarded"; playerId: PlayerId; item: OwnedItem }
  | { type: "itemAwardSkipped"; playerId: PlayerId; kind: ItemKind }
  | { type: "arrow"; playerId: PlayerId; direction: "forward" | "back"; path: SpaceId[]; chain?: number }
  | { type: "spaceEffect"; playerId: PlayerId; spaceId: SpaceId; effect: "item" | "skip" | "pinkRoll"; item?: OwnedItem }
  | { type: "pairEffect"; playerId: PlayerId; spaceId: SpaceId }
  | { type: "chaosSpacePlaced"; spaceId: SpaceId; spaceType: "monochromeChaos" | "rainbowChaos"; round: number }
  | {
      type: "chaosOutcome";
      spaceType: "monochromeChaos" | "rainbowChaos";
      playerId: PlayerId;
      targetPlayerId?: PlayerId;
      description: string;
      coinTransfers?: { giver: PlayerId; receiver: PlayerId; requested: number; given: number }[];
      itemTransfers?: { giver: PlayerId; receiver?: PlayerId; items: ItemKind[] }[];
      teleports?: { playerId: PlayerId; from: SpaceId; to: SpaceId }[];
    }
  | { type: "collision"; spaceId: SpaceId; playerIds: PlayerId[]; sentTo: SpaceId; saved?: PlayerId[] }
  | { type: "forcedBack"; playerId: PlayerId; spaceId: SpaceId; sentTo: SpaceId }
  | { type: "floatieSaved"; playerId: PlayerId; spaceId: SpaceId }
  | { type: "ghostFeetSaved"; playerId: PlayerId; spaceId: SpaceId; trapKind: Trap["kind"] }
  | {
      type: "bossFight";
      playerId: PlayerId;
      sides: number;
      saved: boolean;
      bossFixed: number;
      attempts: BossAttempt[];
      won: boolean;
    }
  | { type: "knockedBack"; playerId: PlayerId; spaces: number; path: SpaceId[] }
  | { type: "bossWeakened"; from: number; to: number }
  | { type: "showdownRoll"; battle?: boolean; rolls: Record<PlayerId, { sides: number; saved: boolean; value: number }> }
  | { type: "minigameResults"; ranking: MinigameRanking; played?: MinigamePlayed }
  | { type: "dieAwarded"; playerId: PlayerId; die: SavedDie }
  | { type: "defaultDieChanged"; playerId: PlayerId; sides: DefaultDieSides }
  | { type: "matchWon"; playerId: PlayerId; round: number };

export type CoinReason = "blueSpace" | "redSpace" | "minigame" | "shop" | "auction" | "chaos" | "item";

export interface PhaseResult {
  state: MatchState;
  events: MatchEvent[];
  /** Set by the item phase so the server can show the reveal without reading private state. */
  itemPlays?: ItemPlay[];
}
