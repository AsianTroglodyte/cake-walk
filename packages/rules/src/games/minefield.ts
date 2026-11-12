import { nextFloat, pick, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, mapPlayers, oneOf, rankByKeys, type RealtimeGame } from "./framework";
import { cellAt, cellCount, isCell, xOf, yOf, type Grid } from "./grid";

export const MINEFIELD = {
  rows: 10,
  minesPerPlayer: 4,
  placeMs: 10_000,
  /** Between the end of placement and GO. */
  getReadyMs: 3_000,
  raceMs: 40_000,
  /** Shortest time between two steps, enforced by the server. */
  stepMs: 250,
  /** After stepping on a mine and going back to the start. */
  frozenMs: 1_000,
  botTickMs: 400,
} as const;

export type MinefieldDirection = "up" | "down" | "left" | "right";
export const MINEFIELD_DIRECTIONS = ["up", "down", "left", "right"] as const;

export type MinefieldInput = { kind: "mines"; cells: number[] } | { kind: "step"; dir: MinefieldDirection };

export interface MinefieldState {
  players: PlayerId[];
  bots: PlayerId[];
  cols: number;
  rows: number;
  phase: "placing" | "racing" | "over";
  placeEndAt: number;
  raceStartAt: number;
  raceEndAt: number;
  /** Secret: each player only ever sees their own. */
  mines: Record<PlayerId, number[]>;
  locked: Record<PlayerId, boolean>;
  starts: Record<PlayerId, number>;
  positions: Record<PlayerId, number>;
  lastStepAt: Record<PlayerId, number>;
  frozenUntil: Record<PlayerId, number>;
  hits: Record<PlayerId, number>;
  /** Other players' mines each player has stepped on. Only that player sees them. */
  known: Record<PlayerId, number[]>;
  finishedAt: Record<PlayerId, number | null>;
  nextBotTick: number;
}

export interface MinefieldView {
  cols: number;
  rows: number;
  phase: MinefieldState["phase"];
  placeEndAt: number;
  raceStartAt: number;
  raceEndAt: number;
  minesPerPlayer: number;
  stepMs: number;
  locked: Record<PlayerId, boolean>;
  positions: Record<PlayerId, number>;
  frozenUntil: Record<PlayerId, number>;
  hits: Record<PlayerId, number>;
  finishedAt: Record<PlayerId, number | null>;
  yourMines: number[];
  /** Mines you stepped on. */
  known: number[];
  /** Everyone's mines, once the race is over. */
  allMines: Record<PlayerId, number[]> | null;
}

/** 8 columns for 4 players, up to 16 for 12. */
export const minefieldCols = (players: number) => players + 4;

const grid = (s: MinefieldState): Grid => ({ cols: s.cols, rows: s.rows });
const startRow = (s: MinefieldState) => s.rows - 1;

/** Rows climbed from the start row; the top row is `rows - 1`. */
export const minefieldProgress = (s: MinefieldState, id: PlayerId) => startRow(s) - yOf(grid(s), s.positions[id]!);

export function mineCells(s: MinefieldState): number[] {
  return Array.from({ length: cellCount(grid(s)) - s.cols }, (_, c) => c);
}

function randomMines(s: MinefieldState, rng: Rng): number[] {
  return shuffle(rng, mineCells(s)).slice(0, MINEFIELD.minesPerPlayer);
}

/** Someone else's mine is on this cell. */
function enemyMine(s: MinefieldState, id: PlayerId, cell: number): boolean {
  return s.players.some((p) => p !== id && s.mines[p]!.includes(cell));
}

function stepTo(s: MinefieldState, id: PlayerId, dir: MinefieldDirection): number | null {
  const g = grid(s);
  const at = s.positions[id]!;
  const x = xOf(g, at) + (dir === "left" ? -1 : dir === "right" ? 1 : 0);
  const y = yOf(g, at) + (dir === "up" ? -1 : dir === "down" ? 1 : 0);
  return x >= 0 && x < s.cols && y >= 0 && y < s.rows ? cellAt(g, x, y) : null;
}

const racing = (s: MinefieldState, id: PlayerId, now: number) =>
  s.phase === "racing" && now >= s.raceStartAt && now < s.raceEndAt && s.finishedAt[id] === null && now >= s.frozenUntil[id]!;

function step(s: MinefieldState, id: PlayerId, to: number, now: number): void {
  s.lastStepAt[id] = now;
  if (enemyMine(s, id, to)) {
    if (!s.known[id]!.includes(to)) s.known[id]!.push(to);
    s.hits[id]!++;
    s.positions[id] = s.starts[id]!;
    s.frozenUntil[id] = now + MINEFIELD.frozenMs;
    return;
  }
  s.positions[id] = to;
  if (yOf(grid(s), to) === 0) s.finishedAt[id] = now;
  if (s.players.every((p) => s.finishedAt[p] !== null)) s.phase = "over";
}

function endPlacement(s: MinefieldState, rng: Rng): void {
  for (const id of s.players) if (!s.locked[id]) s.mines[id] = randomMines(s, rng);
  s.phase = "racing";
  s.nextBotTick = s.raceStartAt;
}

/** Climbs whenever the cell above isn't a mine it knows about; otherwise sidesteps. Sometimes hesitates. */
function botTick(s: MinefieldState, now: number, rng: Rng): void {
  for (const id of s.bots) {
    if (!racing(s, id, now) || nextFloat(rng) < 0.2) continue;
    const safe = (dir: MinefieldDirection) => {
      const to = stepTo(s, id, dir);
      return to !== null && !s.known[id]!.includes(to) ? to : null;
    };
    const up = safe("up");
    const sideways = (["left", "right"] as const).map(safe).filter((c): c is number => c !== null);
    const to = up !== null && nextFloat(rng) < 0.85 ? up : sideways.length > 0 ? pick(rng, sideways) : (up ?? safe("down"));
    if (to !== null) step(s, id, to, now);
    if (s.phase === "over") return;
  }
}

export const minefield: RealtimeGame<MinefieldState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const cols = minefieldCols(players.length);
    const rows = MINEFIELD.rows;
    const g = { cols, rows };
    const starts = mapPlayers(players, (id) =>
      cellAt(g, Math.floor(((players.indexOf(id) + 0.5) * cols) / players.length), rows - 1),
    );
    const placeEndAt = startAt + MINEFIELD.placeMs;
    const s: MinefieldState = {
      players,
      bots,
      cols,
      rows,
      phase: "placing",
      placeEndAt,
      raceStartAt: placeEndAt + MINEFIELD.getReadyMs,
      raceEndAt: placeEndAt + MINEFIELD.getReadyMs + MINEFIELD.raceMs,
      mines: mapPlayers(players, () => []),
      locked: mapPlayers(players, (id) => bots.includes(id)),
      starts,
      positions: { ...starts },
      lastStepAt: mapPlayers(players, () => -Infinity),
      frozenUntil: mapPlayers(players, () => 0),
      hits: mapPlayers(players, () => 0),
      known: mapPlayers(players, () => []),
      finishedAt: mapPlayers(players, () => null),
      nextBotTick: Infinity,
    };
    for (const id of bots) s.mines[id] = randomMines(s, rng);
    return s;
  },
  input(s, id, raw, now) {
    if (!isRecord(raw) || !s.players.includes(id)) return false;
    if (raw.kind === "mines") {
      if (s.phase !== "placing" || s.locked[id] || !Array.isArray(raw.cells)) return false;
      const cells = raw.cells as unknown[];
      const allowed = new Set(mineCells(s));
      if (cells.length !== MINEFIELD.minesPerPlayer || new Set(cells).size !== cells.length) return false;
      if (!cells.every((c) => isCell(grid(s), c) && allowed.has(c))) return false;
      s.mines[id] = cells as number[];
      s.locked[id] = true;
      if (s.players.every((p) => s.locked[p])) {
        s.placeEndAt = now;
        s.raceStartAt = now + MINEFIELD.getReadyMs;
        s.raceEndAt = s.raceStartAt + MINEFIELD.raceMs;
      }
      return true;
    }
    if (raw.kind === "step") {
      const dir = oneOf(raw.dir, MINEFIELD_DIRECTIONS);
      if (!dir || !racing(s, id, now) || now - s.lastStepAt[id]! < MINEFIELD.stepMs) return false;
      const to = stepTo(s, id, dir);
      if (to === null) return false;
      step(s, id, to, now);
      return true;
    }
    return false;
  },
  nextEventAt(s) {
    if (s.phase === "placing") return s.placeEndAt;
    if (s.phase === "over") return null;
    return Math.min(s.raceEndAt, s.nextBotTick);
  },
  advance(s, now, rng) {
    for (;;) {
      if (s.phase === "placing") {
        if (now < s.placeEndAt) return;
        endPlacement(s, rng);
        continue;
      }
      if (s.phase === "over") return;
      const next = Math.min(s.raceEndAt, s.nextBotTick);
      if (next > now) return;
      if (s.raceEndAt <= s.nextBotTick) {
        s.phase = "over";
        return;
      }
      botTick(s, s.nextBotTick, rng);
      s.nextBotTick += MINEFIELD.botTickMs;
      if (!s.bots.some((id) => s.finishedAt[id] === null)) s.nextBotTick = Infinity;
    }
  },
  done: (s) => s.phase === "over",
  result(s) {
    const progress = (id: PlayerId) => minefieldProgress(s, id);
    return {
      ranking: rankByKeys(s.players, (id) => (s.finishedAt[id] !== null ? [1, -s.finishedAt[id]!] : [0, progress(id)])),
      scores: mapPlayers(s.players, progress),
      labels: mapPlayers(s.players, (id) => {
        const hits = s.hits[id] ? `, ${s.hits[id]} mine${s.hits[id] === 1 ? "" : "s"}` : "";
        return s.finishedAt[id] !== null
          ? `crossed in ${((s.finishedAt[id]! - s.raceStartAt) / 1000).toFixed(1)}s${hits}`
          : `${progress(id)} of ${s.rows - 1} rows${hits}`;
      }),
    };
  },
  view: (s, viewer) =>
    ({
      cols: s.cols,
      rows: s.rows,
      phase: s.phase,
      placeEndAt: s.placeEndAt,
      raceStartAt: s.raceStartAt,
      raceEndAt: s.raceEndAt,
      minesPerPlayer: MINEFIELD.minesPerPlayer,
      stepMs: MINEFIELD.stepMs,
      locked: s.locked,
      positions: s.positions,
      frozenUntil: s.frozenUntil,
      hits: s.hits,
      finishedAt: s.finishedAt,
      yourMines: viewer ? (s.mines[viewer] ?? []) : [],
      known: viewer ? (s.known[viewer] ?? []) : [],
      allMines: s.phase === "over" ? s.mines : null,
    }) satisfies MinefieldView,
};
