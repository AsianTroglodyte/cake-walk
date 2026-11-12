import type { MinigameKind } from "./minigames";
import type { Rng } from "./rng";

export type PlayerId = string;
export type SpaceId = number;

export type ChangeableSpaceType = "blue" | "red" | "greenArrow" | "purpleArrow";
export type SpaceType = "start" | "checkpoint" | "finish" | ChangeableSpaceType;

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
  weights: Record<ChangeableSpaceType, number>;
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
  /** Coins for the top, second, third, and bottom quarter of minigame placements. */
  coinsByQuartile: [number, number, number, number];
  items: ItemRules;
}

export type ItemKind =
  | "shield"
  | "coinThief"
  | "weight"
  | "sandDie"
  | "shove"
  | "booster"
  | "extraDie"
  | "sandTrap";

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
}

export type Phase =
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
}

/** `die: null` means the player's default die. Items are used and bought in the same window as the move. */
export interface MoveChoice {
  die: string | null;
  lane: number;
  use?: ItemUse | null;
  buy?: ItemKind | null;
}

export interface BattleChoice {
  die: string | null;
}

/** Minigame placements, best first. Players in the same group tied. */
export type MinigameRanking = PlayerId[][];

/** Players missing from `choices` get the timeout defaults. */
export type PhaseInput =
  | { kind: "move"; choices: Partial<Record<PlayerId, MoveChoice>> }
  | { kind: "boss"; choices: Partial<Record<PlayerId, BattleChoice>> }
  | { kind: "showdown"; choices: Partial<Record<PlayerId, BattleChoice>> }
  | { kind: "minigame"; ranking: MinigameRanking; played?: MinigamePlayed };

export interface MinigamePlayed {
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
      kind: "move";
      dice: DieOption[];
      lanes: number;
      /** False in the opening round(s): no item use and no shop. */
      itemsAllowed: boolean;
      items: OwnedItem[];
      /** Other players, for items used on someone. */
      targets: PlayerId[];
      trapSpaces: SpaceId[];
      prices: Record<ItemKind, number>;
      maxHeld: number;
    }
  | { playerId: PlayerId; kind: "boss" | "showdown"; dice: DieOption[] };

export interface BossAttempt {
  playerRoll: number;
  bossRoll: number;
  bossScore: number;
}

export type MatchEvent =
  | { type: "roundStarted"; round: number }
  | { type: "dieRolled"; playerId: PlayerId; sides: number; saved: boolean; value: number }
  | { type: "moved"; playerId: PlayerId; path: SpaceId[] }
  | { type: "coinsChanged"; playerId: PlayerId; delta: number; reason: CoinReason }
  | { type: "itemBought"; playerId: PlayerId; item: OwnedItem; price: number }
  | { type: "itemUsed"; playerId: PlayerId; kind: ItemKind; target?: PlayerId }
  | { type: "itemBlocked"; playerId: PlayerId; kind: ItemKind; target: PlayerId }
  | { type: "coinsStolen"; from: PlayerId; to: PlayerId; amount: number; reason: "coinThief" | "trap" }
  | { type: "shoved"; playerId: PlayerId; path: SpaceId[] }
  | { type: "rollChanged"; playerId: PlayerId; kind: "weight" | "booster" | "extraDie"; from: number; to: number }
  | { type: "trapPlaced"; playerId: PlayerId; spaceId: SpaceId }
  | { type: "trapRefunded"; playerId: PlayerId; spaceId: SpaceId }
  | { type: "trapTriggered"; ownerId: PlayerId; spaceId: SpaceId; victims: PlayerId[] }
  | { type: "itemAwarded"; playerId: PlayerId; item: OwnedItem }
  | { type: "itemAwardSkipped"; playerId: PlayerId; kind: ItemKind }
  | { type: "arrow"; playerId: PlayerId; direction: "forward" | "back"; path: SpaceId[] }
  | { type: "collision"; spaceId: SpaceId; playerIds: PlayerId[]; sentTo: SpaceId }
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

export type CoinReason = "blueSpace" | "redSpace" | "minigame" | "shop";

export interface PhaseResult {
  state: MatchState;
  events: MatchEvent[];
}
