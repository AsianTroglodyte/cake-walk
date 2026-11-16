import type {
  BattleChoice,
  Board,
  Decision,
  DefaultDieSides,
  ItemChoice,
  ItemPlay,
  MatchEvent,
  ClientMinigameKind,
  MinigamePlayed,
  MinigamePrize,
  MinigameRanking,
  MoveChoice,
  OwnedItem,
  Phase,
  PlayerId,
  SavedDie,
  ServerMinigameKind,
  SpaceId,
} from "@pbg/rules";

export const ROOM_NAME = "beach_party";
export const DEFAULT_PORT = 2567;
export const BOSS_TEST_ROOM_NAME = "boss_test";
export const BOSS_TEST_PORT = 2568;
export const MAX_NAME_LENGTH = 16;

/** Sent by the client as the payload of the "action" message. */
export type ClientAction =
  | { type: "pickCharacter"; character: string }
  | { type: "addBot" }
  | { type: "removeBot"; seatId: PlayerId }
  | { type: "start" }
  | { type: "submitItems"; choice: ItemChoice }
  | { type: "submitMove"; choice: MoveChoice }
  | { type: "submitBattle"; choice: BattleChoice }
  /** null: no result (false start, or nothing to report). */
  | { type: "submitMinigame"; score: number | null }
  /** A pick or action in a server-run minigame; the game validates it. */
  | { type: "minigameMove"; move: unknown }
  /** Done looking at the minigame results. */
  | { type: "ready" }
  | { type: "playAgain" };

export interface JoinOptions {
  name: string;
}

export interface BossTestOptions extends JoinOptions {
  mode?: "boss" | "showdown";
  contenders?: number;
  challenger: "you" | "bot" | "both";
  bossFixed: number;
  defaultDie: DefaultDieSides;
  seed: number;
}

export interface SeatView {
  seatId: PlayerId;
  name: string;
  character: string;
  kind: "human" | "bot";
  connected: boolean;
  /** A bot is playing for this human seat (they left, or were away for 2 rounds). */
  botControlled: boolean;
  isHost: boolean;
}

export interface PlayerPublicView {
  seatId: PlayerId;
  position: number;
  coins: number;
  defaultDie: DefaultDieSides;
  dead: boolean;
  /** Has to decide something in the current phase. */
  deciding: boolean;
  ready: boolean;
}

/** Only the currently visible roll is sent; later boss rolls and match outcomes remain private. */
export type BossBattleStep =
  | {
      kind: "bossBattle";
      stage: "choosing";
      contenders: PlayerId[];
      selected: Record<PlayerId, number>;
      deadline: number;
    }
  | ({
      kind: "bossBattle";
      playerId: PlayerId;
      sides: number;
      saved: boolean;
      playerRoll: number;
      attempt: number;
      encounter: number;
      encounters: number;
      until: number;
    } & (
      | { stage: "playerRoll" }
      | {
          stage: "outcome";
          bossRoll: number;
          bossFixed: number;
          bossScore: number;
          result: "won" | "lost" | "tie";
          knockback: number;
        }
    ));

export type ShowdownStep =
  | {
      kind: "showdown";
      stage: "choosing";
      contenders: PlayerId[];
      selected: Record<PlayerId, number>;
      deadline: number;
    }
  | {
      kind: "showdown";
      stage: "rolling" | "outcome";
      contenders: PlayerId[];
      active: PlayerId[];
      dice: Record<PlayerId, { sides: number; saved: boolean }>;
      /** Only rolls already revealed this round. */
      rolls: Record<PlayerId, number>;
      /** Eliminated contenders' final visible rolls, retained on their muted cards. */
      eliminated: Record<PlayerId, number>;
      round: number;
      currentPlayer: PlayerId;
      /** Empty until all active rolls are revealed. */
      leaders: PlayerId[];
      until: number;
  };

export type ChaosStep = {
  kind: "chaos";
  event: Extract<MatchEvent, { type: "chaosOutcome" }>;
  stage: "initiator" | "targetSpin" | "rainbowIntro" | "effectSpin";
  index: number;
  total: number;
  until: number;
};

export type ChaosSpawnStep = {
  kind: "chaosSpawn";
  event: Extract<MatchEvent, { type: "chaosSpacePlaced" }>;
  until: number;
};

export type ChaosBufferStep = {
  kind: "chaosBuffer";
  until: number;
};

export type TrapStep = {
  kind: "trap";
  event: Extract<MatchEvent, { type: "trapTriggered" }>;
  steals: Extract<MatchEvent, { type: "coinsStolen" }>[];
  index: number;
  total: number;
  until: number;
};

export type DeathStep = {
  kind: "death";
  events: Extract<MatchEvent, { type: "playerDied" }>[];
  until: number;
};

export type Step =
  | { kind: "deciding"; deadline: number }
  | BossBattleStep
  | ShowdownStep
  | ChaosStep
  | ChaosSpawnStep
  | ChaosBufferStep
  | TrapStep
  | DeathStep
  | {
      kind: "minigame";
      /** Played in the browser, which reports a score. */
      mode: "client";
      game: ClientMinigameKind;
      seed: number;
      /** Server clock: every browser starts the game at this moment. */
      startAt: number;
      endAt: number;
      /** Results that haven't arrived by now count as no result. */
      until: number;
    }
  | {
      kind: "minigame";
      /** Played on the server; the state is in `MatchView.minigame`. */
      mode: "server";
      game: ServerMinigameKind;
      /** countdown: reading the instructions. choosing: a round's secret picks. reveal: showing what happened. live: real time. */
      stage: "countdown" | "choosing" | "reveal" | "live";
      round: number;
      /** When the current stage ends; null while a real-time game runs. */
      until: number | null;
    }
  | { kind: "revealing"; until: number; events?: MatchEvent[] }
  /** A short roll breakdown shown before token movement begins. */
  | { kind: "rollSummary"; until: number; events: MatchEvent[] }
  /** Item uses, in priority order. Cancelled uses are included so the client can cross them out. */
  | { kind: "itemReveal"; until: number; plays: ItemPlay[] }
  /** After every minigame: placements and everyone's prizes. Ends early once every human is ready. */
  | {
      kind: "results";
      until: number;
      ranking: MinigameRanking;
      played: MinigamePlayed | null;
      prizes: Record<PlayerId, MinigamePrize>;
    }
  | { kind: "finished" };

export interface MatchView {
  board: Board;
  round: number;
  phase: Phase;
  step: Step;
  bossFixed: number;
  players: PlayerPublicView[];
  /** Recent events, already filtered for this viewer. */
  events: MatchEvent[];
  /** A server-run minigame, as this viewer may see it. */
  minigame: {
    /** The game's own view type, for example `RpsView` for "rps". */
    view: unknown;
    /** Players picking this round. */
    deciders: PlayerId[];
    /** Your pick this round, once sent. */
    submitted: unknown;
  } | null;
  you: {
    dice: SavedDie[];
    items: OwnedItem[];
    /** Spaces holding your hidden traps. Nobody else's traps are ever sent. */
    traps: SpaceId[];
    decision: Decision | null;
    submitted: ItemChoice | MoveChoice | BattleChoice | null;
    minigameSubmitted: boolean;
    /** Private authoritative status, not delayed with public death visuals. */
    dead: boolean;
    reviveRequirement: number;
  } | null;
}

export interface RoomView {
  code: string;
  stage: "lobby" | "playing" | "finished";
  /** Server clock when this view was sent, for countdowns. */
  serverNow: number;
  seats: SeatView[];
  youSeatId: PlayerId | null;
  takenCharacters: string[];
  match: MatchView | null;
}

/** Server → client message names. */
export const SERVER_MESSAGES = { view: "view", error: "error", pong: "pong" } as const;
export const CLIENT_ACTION = "action";

/** Clock sync: the client sends its clock, the server answers with both clocks. */
export const CLIENT_PING = "ping";
export interface Ping {
  clientTime: number;
}
export interface Pong {
  clientTime: number;
  serverTime: number;
}
