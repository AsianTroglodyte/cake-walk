import { pick, randInt, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, mapPlayers, rankByKeys, type RealtimeGame } from "./framework";

const COLS = 24;
const ROWS = 14;
const PLAYER_STEP_MS = 55;
const BOT_STEP_MS = 85;
const MOVE_STEP = 0.75;
const MIN_PLAYER_DISTANCE = 0.75;
export type PainterDirection = "up" | "down" | "left" | "right" | "upLeft" | "upRight" | "downLeft" | "downRight";
const DIAGONAL = Math.SQRT1_2;
const DELTAS: Record<PainterDirection, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  upLeft: [-DIAGONAL, -DIAGONAL], upRight: [DIAGONAL, -DIAGONAL],
  downLeft: [-DIAGONAL, DIAGONAL], downRight: [DIAGONAL, DIAGONAL],
};
export interface PainterPosition { x: number; y: number }
export interface PainterState {
  players: PlayerId[];
  bots: PlayerId[];
  grid: (PlayerId | null)[];
  positions: Record<PlayerId, PainterPosition>;
  targets: Record<PlayerId, PainterPosition | null>;
  nextPlayerAt: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  directions: Record<PlayerId, PainterDirection>;
  lastStepAt: Record<PlayerId, number>;
  nextBotAt: Record<PlayerId, number>;
  endAt: number;
  endedAt: number | null;
}
function advancePlayer(s: PainterState, id: PlayerId, direction: PainterDirection, at: number): void {
  const { x, y } = s.positions[id]!;
  const [dx, dy] = DELTAS[direction];
  const nx = Math.max(0.5, Math.min(COLS - 0.5, x + dx * MOVE_STEP));
  const ny = Math.max(0.5, Math.min(ROWS - 0.5, y + dy * MOVE_STEP));
  if (s.players.some((player) => {
    if (player === id) return false;
    const other = s.positions[player]!;
    return Math.hypot(nx - other.x, ny - other.y) < MIN_PLAYER_DISTANCE;
  })) {
    s.lastStepAt[id] = at;
    return;
  }
  s.positions[id] = { x: nx, y: ny };
  const cell = Math.floor(ny) * COLS + Math.floor(nx);
  const previousOwner = s.grid[cell];
  if (previousOwner !== id) {
    if (previousOwner !== null) s.scores[previousOwner] = Math.max(0, s.scores[previousOwner]! - 1);
    s.grid[cell] = id;
    s.scores[id] = s.scores[id]! + 1;
  }
  s.lastStepAt[id] = at;
}

function paintPosition(s: PainterState, id: PlayerId, nx: number, ny: number, at: number): boolean {
  if (s.players.some((player) => {
    if (player === id) return false;
    const other = s.positions[player]!;
    return Math.hypot(nx - other.x, ny - other.y) < MIN_PLAYER_DISTANCE;
  })) return false;
  s.positions[id] = { x: nx, y: ny };
  const cell = Math.floor(ny) * COLS + Math.floor(nx);
  const previousOwner = s.grid[cell];
  if (previousOwner !== id) {
    if (previousOwner !== null) s.scores[previousOwner] = Math.max(0, s.scores[previousOwner]! - 1);
    s.grid[cell] = id;
    s.scores[id] = s.scores[id]! + 1;
  }
  s.lastStepAt[id] = at;
  return true;
}

function advanceTowardCursor(s: PainterState, id: PlayerId, at: number): void {
  const target = s.targets[id];
  if (!target) return;
  const position = s.positions[id]!;
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001) {
    s.targets[id] = null;
    return;
  }
  const step = Math.min(MOVE_STEP, distance);
  const moved = paintPosition(s, id, position.x + dx / distance * step, position.y + dy / distance * step, at);
  if (moved && distance <= MOVE_STEP) s.targets[id] = null;
}

function botDirection(s: PainterState, id: PlayerId, rng: Rng): PainterDirection | null {
  let targets: number[] = [];
  for (let cell = 0; cell < s.grid.length; cell++) if (s.grid[cell] === null) targets.push(cell);

  if (targets.length === 0) {
    const opponents = s.players.filter((player) => player !== id);
    if (opponents.length === 0) return null;
    // Pick a fresh player on each step, with a strong preference for whoever is currently leading.
    const topScore = Math.max(...opponents.map((player) => s.scores[player]!));
    const leaders = opponents.filter((player) => s.scores[player] === topScore);
    const opponent = randInt(rng, 1, 100) <= 65
      ? pick(rng, leaders)
      : pick(rng, opponents);
    targets = s.grid.flatMap((owner, cell) => owner === opponent ? [cell] : []);
    if (targets.length === 0) {
      const position = s.positions[opponent]!;
      targets = [Math.floor(position.y) * COLS + Math.floor(position.x)];
    }
  }
  if (targets.length === 0) return null;

  const { x, y } = s.positions[id]!;
  const currentCell = Math.floor(y) * COLS + Math.floor(x);
  targets = targets.filter((cell) => cell !== currentCell);
  if (targets.length === 0) return null;
  let shortest = Number.POSITIVE_INFINITY;
  let choices: PainterDirection[] = [];
  for (const [direction, [dx, dy]] of Object.entries(DELTAS) as [PainterDirection, [number, number]][]) {
    const nx = Math.max(0.5, Math.min(COLS - 0.5, x + dx * MOVE_STEP));
    const ny = Math.max(0.5, Math.min(ROWS - 0.5, y + dy * MOVE_STEP));
    if (nx === x && ny === y) continue;
    if (s.players.some((player) => {
      if (player === id) return false;
      const other = s.positions[player]!;
      return Math.hypot(nx - other.x, ny - other.y) < MIN_PLAYER_DISTANCE;
    })) continue;
    const distance = Math.min(...targets.map((cell) =>
      Math.hypot(nx - (cell % COLS + 0.5), ny - (Math.floor(cell / COLS) + 0.5)),
    ));
    if (distance < shortest) {
      shortest = distance;
      choices = [direction];
    } else if (distance === shortest) choices.push(direction);
  }
  return choices.length > 0 ? pick(rng, choices) : null;
}

export const painter: RealtimeGame<PainterState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const positions: Record<PlayerId, PainterPosition> = {};
    const grid = Array<PlayerId | null>(COLS * ROWS).fill(null);
    const available = shuffleCells(rng);
    for (const id of players) {
      const cell = available.pop()!;
      positions[id] = { x: cell % COLS + 0.5, y: Math.floor(cell / COLS) + 0.5 };
      grid[cell] = id;
    }
    return {
      players, bots, grid, positions, scores: mapPlayers(players, () => 1),
      targets: mapPlayers(players, () => null),
      nextPlayerAt: mapPlayers(players, () => Number.POSITIVE_INFINITY),
      directions: mapPlayers(players, () => "right" as const),
      lastStepAt: mapPlayers(players, () => startAt),
      nextBotAt: mapPlayers(bots, () => startAt + BOT_STEP_MS),
      endAt: startAt + 20_000, endedAt: null,
    };
  },
  input(s, id, raw, now) {
    if (s.endedAt !== null || now >= s.endAt || !s.players.includes(id) || !isRecord(raw)) return false;
    if (raw.kind === "cursor" && typeof raw.x === "number" && Number.isFinite(raw.x) &&
        typeof raw.y === "number" && Number.isFinite(raw.y)) {
      const target = {
        x: Math.max(0.5, Math.min(COLS - 0.5, raw.x)),
        y: Math.max(0.5, Math.min(ROWS - 0.5, raw.y)),
      };
      s.targets[id] = target;
      if (!Number.isFinite(s.nextPlayerAt[id]!)) {
        advanceTowardCursor(s, id, now);
        s.nextPlayerAt[id] = now + PLAYER_STEP_MS;
      }
      return true;
    }
    if (raw.kind !== "move" || typeof raw.direction !== "string" || !(raw.direction in DELTAS)) return false;
    const direction = raw.direction as PainterDirection;
    if (now - s.lastStepAt[id]! < PLAYER_STEP_MS && s.directions[id] === direction) return false;
    s.directions[id] = direction;
    advancePlayer(s, id, direction, now);
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.endAt, ...s.bots.map((id) => s.nextBotAt[id]!), ...s.players.map((id) => s.nextPlayerAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    for (const id of s.players) {
      while (s.targets[id] && s.nextPlayerAt[id]! <= now && s.nextPlayerAt[id]! < s.endAt) {
        const at = s.nextPlayerAt[id]!;
        advanceTowardCursor(s, id, at);
        s.nextPlayerAt[id] = s.targets[id] ? at + PLAYER_STEP_MS : Number.POSITIVE_INFINITY;
      }
    }
    for (const id of s.bots) {
      while (s.nextBotAt[id]! <= now && s.nextBotAt[id]! < s.endAt) {
        const direction = botDirection(s, id, rng);
        if (direction) {
          s.directions[id] = direction;
          advancePlayer(s, id, direction, s.nextBotAt[id]!);
        }
        s.nextBotAt[id] = s.nextBotAt[id]! + BOT_STEP_MS;
      }
    }
    if (now >= s.endAt) s.endedAt = s.endAt;
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    return { ranking: rankByKeys(s.players, (id) => [s.scores[id]!]), scores: s.scores, labels: Object.fromEntries(s.players.map((id) => [id, `${s.scores[id]} cells`])) };
  },
  view(s) {
    return { cols: COLS, rows: ROWS, grid: s.grid, positions: s.positions, scores: s.scores, endAt: s.endAt };
  },
};

function shuffleCells(rng: Rng): number[] {
  const cells = Array.from({ length: COLS * ROWS }, (_, index) => index);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells;
}
