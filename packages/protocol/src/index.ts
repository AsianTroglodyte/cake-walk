import type {
  BattleChoice,
  Board,
  Decision,
  DefaultDieSides,
  MatchEvent,
  ClientMinigameKind,
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
export const MAX_NAME_LENGTH = 16;

/** Sent by the client as the payload of the "action" message. */
export type ClientAction =
  | { type: "pickCharacter"; character: string }
  | { type: "addBot" }
  | { type: "removeBot"; seatId: PlayerId }
  | { type: "start" }
  | { type: "submitMove"; choice: MoveChoice }
  | { type: "submitBattle"; choice: BattleChoice }
  /** null: no result (false start, or nothing to report). */
  | { type: "submitMinigame"; score: number | null }
  /** A pick or action in a server-run minigame; the game validates it. */
  | { type: "minigameMove"; move: unknown }
  | { type: "playAgain" };

export interface JoinOptions {
  name: string;
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
  /** Has to decide something in the current phase. */
  deciding: boolean;
  ready: boolean;
}

export type Step =
  | { kind: "deciding"; deadline: number }
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
  | { kind: "revealing"; until: number }
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
    submitted: MoveChoice | BattleChoice | null;
    minigameSubmitted: boolean;
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
