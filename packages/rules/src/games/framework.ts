import type { Rng } from "../rng";
import type { MinigameRanking, PlayerId } from "../types";

export interface GameSetup {
  players: PlayerId[];
  /** Seats played by bots when the game starts. */
  bots: PlayerId[];
  rng: Rng;
}

export interface GameResult {
  ranking: MinigameRanking;
  scores: Record<PlayerId, number | null>;
  labels: Record<PlayerId, string>;
}

/**
 * A minigame played in rounds: everyone who decides this round picks secretly, then all choices
 * resolve together. Games mutate their own state in `resolve`; the server owns the state.
 */
export interface RoundGame<S = any, C = any> {
  mode: "round";
  setup(ctx: GameSetup): S;
  roundMs(s: S): number;
  /** Pause after each round so players can see what happened. */
  revealMs: number;
  deciders(s: S): PlayerId[];
  /** Validates untrusted input. undefined: not a valid choice. */
  parse(s: S, id: PlayerId, raw: unknown): C | undefined;
  /** What a player who didn't decide in time does. */
  fallback(s: S, id: PlayerId, rng: Rng): C;
  bot(s: S, id: PlayerId, rng: Rng): C;
  /** Every decider has a choice. */
  resolve(s: S, choices: Record<PlayerId, C>, rng: Rng): void;
  done(s: S): boolean;
  result(s: S): GameResult;
  /** Only what this viewer may see. */
  view(s: S, viewer: PlayerId | null): unknown;
}

/** A minigame played in real time. The server calls `advance` at `nextEventAt` and before every input. */
export interface RealtimeGame<S = any> {
  mode: "realtime";
  setup(ctx: GameSetup, startAt: number): S;
  /** false: the input doesn't do anything right now. */
  input(s: S, id: PlayerId, raw: unknown, now: number, rng: Rng): boolean;
  nextEventAt(s: S): number | null;
  advance(s: S, now: number, rng: Rng): void;
  done(s: S): boolean;
  result(s: S): GameResult;
  view(s: S, viewer: PlayerId | null): unknown;
}

export type ServerGame = RoundGame | RealtimeGame;

/** Ranks by comparing keys in order, higher first. Players with identical keys tie. */
export function rankByKeys(ids: readonly PlayerId[], key: (id: PlayerId) => number[]): MinigameRanking {
  const keyed = ids.map((id) => ({ id, k: key(id) }));
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (b[i] ?? 0) - (a[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  keyed.sort((a, b) => compare(a.k, b.k));
  const ranking: MinigameRanking = [];
  let previous: number[] | null = null;
  for (const { id, k } of keyed) {
    if (previous && compare(previous, k) === 0) ranking[ranking.length - 1]!.push(id);
    else ranking.push([id]);
    previous = k;
  }
  return ranking;
}

export function mapPlayers<T>(ids: readonly PlayerId[], fn: (id: PlayerId) => T): Record<PlayerId, T> {
  return Object.fromEntries(ids.map((id) => [id, fn(id)]));
}

export function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return options.includes(value as T) ? (value as T) : undefined;
}

/** "Closest without going over": under or at the target ranks by total, higher first; everyone over shares last. */
export function rankUnderTarget(ids: readonly PlayerId[], total: (id: PlayerId) => number, target: number): MinigameRanking {
  return rankByKeys(ids, (id) => (total(id) <= target ? [1, total(id)] : [0]));
}
