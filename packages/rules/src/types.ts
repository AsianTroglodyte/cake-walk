import type { MinigameKind } from "./minigames";
import type { Rng } from "./rng";

export type PlayerId = string;
export type SpaceId = number;

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
  | "floatie";

export interface ItemRules {
  /** Earlier rounds are movement and a minigame only: no items, no shop. */
  firstItemRound: number;
  prices: Record<ItemKind, number>;
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
  /** The 5th shop slot is drawn from these, never repeating the previous round's pick. */
  shopRotating: ItemKind[];
}

export interface OwnedItem {
  id: string;
  kind: ItemKind;
}

export interface Trap {
  spaceId: SpaceId;
  ownerId: PlayerId;
}

/** `target` is required for items used on another player, `space` for the Sand Trap. */
export interface ItemUse {
  itemId: string;
  target?: PlayerId;
  space?: SpaceId;
}

/** Everything a player chooses in the item phase. */
export interface ItemChoice {
  use?: ItemUse | null;
  buy?: ItemKind | null;
}

export type ItemTier = "defensive" | "offensive" | "self";

export interface RollMods {
  sandDie: boolean;
  /** Who used the Sand Die, when one is forcing this player's roll. */
  sandDieSource?: PlayerId;
  weights: number;
  /** One entry per Weight, naming the player who used it. */
  weightSources: PlayerId[];
  booster: boolean;
  extraDie: boolean;
}

/** One item use as it appeared in the item phase, in reveal order. */
export interface ItemPlay {
  playerId: PlayerId;
  kind: ItemKind;
  tier: ItemTier;
  target?: PlayerId;
  space?: SpaceId;
  status: "resolved" | "blocked" | "refunded";
  /** Extra detail for the reveal, such as coins stolen or spaces moved. */
  amount?: number;
  blockedBy?: PlayerId;
}

/** Effects carried from the item phase into the move phase. */
export interface ItemEffects {
  mods: Record<PlayerId, RollMods>;
  forcedBack: PlayerId[];
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
  dead: boolean;
  /** A dead player's current minimum die result required for revival. */
  reviveRequirement: number;
}

export type Phase =
  | { kind: "items" }
  | { kind: "move" }
  | { kind: "boss"; challengers: PlayerId[] }
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
  /** The 5 items for sale this round. Empty before items open. Public. */
  shop: ItemKind[];
  /** Last round's rotating shop item; the next pick can't repeat it. */
  lastRotating: ItemKind | null;
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
}

export interface BattleChoice {
  die: string | null;
}

/** Minigame placements, best first. Players in the same group tied. */
export type MinigameRanking = PlayerId[][];

/** Players missing from `choices` get the timeout defaults. */
export type PhaseInput =
  | { kind: "items"; choices: Partial<Record<PlayerId, ItemChoice>> }
  | { kind: "move"; choices: Partial<Record<PlayerId, MoveChoice>> }
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
      prices: Record<ItemKind, number>;
      /** The 5 items for sale this round, same for everyone. */
      shop: ItemKind[];
      maxHeld: number;
    }
  | { playerId: PlayerId; kind: "move"; dice: DieOption[]; lanes: number; mods: RollMods }
  | { playerId: PlayerId; kind: "boss" | "showdown"; dice: DieOption[] };

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
  | { type: "moveSkipped"; playerId: PlayerId }
  | { type: "playerDied"; playerId: PlayerId; reason: "blackSpace" | "rainbowChaos" }
  | { type: "revivalFailed"; playerId: PlayerId; rolled: number; requirement: number; nextRequirement: number }
  | { type: "playerRevived"; playerId: PlayerId; rolled: number; requirement: number; spaces: number }
  | { type: "coinsChanged"; playerId: PlayerId; delta: number; reason: CoinReason }
  | { type: "itemBought"; playerId: PlayerId; item: OwnedItem; price: number }
  | { type: "itemUsed"; playerId: PlayerId; kind: ItemKind; target?: PlayerId }
  | { type: "itemBlocked"; playerId: PlayerId; kind: ItemKind; target: PlayerId }
  | { type: "coinsStolen"; from: PlayerId; to: PlayerId; amount: number; reason: "coinThief" | "trap" }
  | { type: "shoved"; playerId: PlayerId; path: SpaceId[] }
  | {
      type: "rollChanged";
      playerId: PlayerId;
      kind: "weight" | "booster" | "extraDie";
      from: number;
      to: number;
      /** Who used the item that changed the roll. */
      source?: PlayerId;
    }
  | { type: "trapPlaced"; playerId: PlayerId; spaceId: SpaceId }
  | { type: "trapRefunded"; playerId: PlayerId; spaceId: SpaceId }
  | { type: "trapTriggered"; ownerId: PlayerId; spaceId: SpaceId; victims: PlayerId[] }
  | { type: "itemAwarded"; playerId: PlayerId; item: OwnedItem }
  | { type: "itemAwardSkipped"; playerId: PlayerId; kind: ItemKind }
  | { type: "arrow"; playerId: PlayerId; direction: "forward" | "back"; path: SpaceId[]; chain?: number }
  | { type: "spaceEffect"; playerId: PlayerId; spaceId: SpaceId; effect: "item" | "skip" | "pinkRoll"; item?: OwnedItem }
  | { type: "chaosSpacePlaced"; spaceId: SpaceId; spaceType: "monochromeChaos" | "rainbowChaos"; round: number }
  | {
      type: "chaosOutcome";
      spaceType: "monochromeChaos" | "rainbowChaos";
      playerId: PlayerId;
      targetPlayerId?: PlayerId;
      description: string;
    }
  | { type: "collision"; spaceId: SpaceId; playerIds: PlayerId[]; sentTo: SpaceId; saved?: PlayerId[] }
  | { type: "forcedBack"; playerId: PlayerId; sentTo: SpaceId }
  | { type: "floatieSaved"; playerId: PlayerId; spaceId: SpaceId }
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
  | { type: "showdownRoll"; rolls: Record<PlayerId, { sides: number; saved: boolean; value: number }> }
  | { type: "minigameResults"; ranking: MinigameRanking; played?: MinigamePlayed }
  | { type: "dieAwarded"; playerId: PlayerId; die: SavedDie }
  | { type: "defaultDieChanged"; playerId: PlayerId; sides: DefaultDieSides }
  | { type: "matchWon"; playerId: PlayerId; round: number };

export type CoinReason = "blueSpace" | "redSpace" | "minigame" | "shop" | "chaos";

export interface PhaseResult {
  state: MatchState;
  events: MatchEvent[];
  /** Set by the item phase so the server can show the reveal without reading private state. */
  itemPlays?: ItemPlay[];
}
