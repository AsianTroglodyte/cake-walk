import { pick, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, mapPlayers, rankByKeys, type RealtimeGame } from "./framework";

export const PLATFORM_COLORS = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "teal", "white", "lime"] as const;
export type PlatformColor = typeof PLATFORM_COLORS[number];
export type PlatformDirection = "up" | "down" | "left" | "right";
const DELTAS: Record<PlatformDirection, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const COLS = 10;
const ROWS = 10;
const BOT_START_DELAY_RANGE = [150, 500] as const;
const BOT_MOVE_INTERVAL_RANGE = [315, 675] as const;
export interface ColorPlatformsState {
  players: PlayerId[];
  bots: PlayerId[];
  colors: PlatformColor[];
  positions: Record<PlayerId, number>;
  alive: PlayerId[];
  eliminatedThisRound: PlayerId[];
  survived: Record<PlayerId, number>;
  round: number;
  target: PlatformColor;
  phase: "live" | "buffer" | "done";
  deadline: number;
  nextBotAt: Record<PlayerId, number>;
  botMoveInterval: Record<PlayerId, number>;
  lastMoveAt: Record<PlayerId, number>;
}

function beginRound(s: ColorPlatformsState, at: number, rng: Rng): void {
  s.round++;
  s.eliminatedThisRound = [];
  s.target = pick(rng, PLATFORM_COLORS);
  const targetSpots = Math.max(0, s.alive.length - 1);
  const otherColors = PLATFORM_COLORS.filter((color) => color !== s.target);
  s.colors = shuffle(rng, [
    ...Array<PlatformColor>(targetSpots).fill(s.target),
    ...Array.from({ length: COLS * ROWS - targetSpots }, (_, index) => otherColors[index % otherColors.length]!),
  ]);
  s.phase = "live";
  s.deadline = at + 10_000;
  for (const id of s.bots) {
    s.botMoveInterval[id] = randInt(rng, ...BOT_MOVE_INTERVAL_RANGE);
    s.nextBotAt[id] = at + randInt(rng, ...BOT_START_DELAY_RANGE);
  }
}
function allTargetSpotsTaken(s: ColorPlatformsState): boolean {
  const targetSpots = s.colors.flatMap((color, cell) => color === s.target ? [cell] : []);
  return targetSpots.length > 0 &&
    targetSpots.every((cell) => s.alive.some((id) => s.positions[id] === cell));
}
function move(s: ColorPlatformsState, id: PlayerId, direction: PlatformDirection): boolean {
  const current = s.positions[id]!;
  const x = current % COLS;
  const y = Math.floor(current / COLS);
  const [dx, dy] = DELTAS[direction];
  const nx = Math.max(0, Math.min(COLS - 1, x + dx));
  const ny = Math.max(0, Math.min(ROWS - 1, y + dy));
  const destination = ny * COLS + nx;
  if (s.alive.some((other) => other !== id && s.positions[other] === destination)) return false;
  s.positions[id] = destination;
  return true;
}

function openNeighbors(s: ColorPlatformsState, id: PlayerId, cell: number): Array<{ direction: PlatformDirection; cell: number }> {
  const x = cell % COLS;
  const y = Math.floor(cell / COLS);
  return (Object.keys(DELTAS) as PlatformDirection[]).flatMap((direction) => {
    const [dx, dy] = DELTAS[direction];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return [];
    const next = ny * COLS + nx;
    if (s.alive.some((other) => other !== id && s.positions[other] === next)) return [];
    return [{ direction, cell: next }];
  });
}

function distancesFrom(s: ColorPlatformsState, id: PlayerId, start: number): number[] {
  const distances = Array<number>(COLS * ROWS).fill(Number.POSITIVE_INFINITY);
  distances[start] = 0;
  const queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const cell = queue[cursor]!;
    for (const { cell: next } of openNeighbors(s, id, cell)) {
      if (distances[next] !== Number.POSITIVE_INFINITY) continue;
      distances[next] = distances[cell]! + 1;
      queue.push(next);
    }
  }
  return distances;
}

function botMove(s: ColorPlatformsState, id: PlayerId, rng: Rng): PlatformDirection | undefined {
  const current = s.positions[id]!;
  const fromCurrent = distancesFrom(s, id, current);
  const freeTargets = s.colors.flatMap((color, cell) =>
    color === s.target && !s.alive.some((other) => other !== id && s.positions[other] === cell) ? [cell] : []);
  if (freeTargets.length === 0) return undefined;

  const nearestDistance = Math.min(...freeTargets.map((cell) => fromCurrent[cell]!));
  if (!Number.isFinite(nearestDistance)) return undefined;
  const nearestTargets = freeTargets.filter((cell) => fromCurrent[cell] === nearestDistance);
  const target = pick(rng, nearestTargets);
  const toTarget = distancesFrom(s, id, target);
  const shortestSteps = openNeighbors(s, id, current)
    .filter(({ cell }) => toTarget[cell] === nearestDistance - 1);
  if (shortestSteps.length === 0) return undefined;

  // Half the bots take a direct axis-first route; the rest vary their turns while staying on a shortest route.
  if (s.bots.indexOf(id) % 2 === 0) {
    const targetX = target % COLS;
    const targetY = Math.floor(target / COLS);
    const currentX = current % COLS;
    const currentY = Math.floor(current / COLS);
    const directDirection: PlatformDirection | undefined = currentX !== targetX
      ? (targetX > currentX ? "right" : "left")
      : currentY !== targetY
        ? (targetY > currentY ? "down" : "up")
        : undefined;
    const directStep = shortestSteps.find(({ direction }) => direction === directDirection);
    if (directStep) return directStep.direction;
  }
  return pick(rng, shortestSteps).direction;
}

export const colorPlatforms: RealtimeGame<ColorPlatformsState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const colors = Array<PlatformColor>(COLS * ROWS).fill("red");
    const startCells = shuffle(rng, Array.from({ length: COLS * ROWS }, (_, index) => index));
    const positions = Object.fromEntries(players.map((id, index) => [id, startCells[index]!]));
    const s: ColorPlatformsState = {
      players, bots, colors, positions, alive: [...players], eliminatedThisRound: [], survived: mapPlayers(players, () => 0),
      round: 0, target: "red", phase: "live", deadline: startAt,
      nextBotAt: mapPlayers(bots, () => startAt), botMoveInterval: mapPlayers(bots, () => BOT_MOVE_INTERVAL_RANGE[0]),
      lastMoveAt: mapPlayers(players, () => startAt - 200),
    };
    beginRound(s, startAt, rng);
    return s;
  },
  input(s, id, raw, now) {
    if (s.phase !== "live" || now >= s.deadline || !s.alive.includes(id) || now - s.lastMoveAt[id]! < 100 ||
        !isRecord(raw) || raw.kind !== "move" || typeof raw.direction !== "string" || !(raw.direction in DELTAS)) return false;
    if (!move(s, id, raw.direction as PlatformDirection)) return false;
    s.lastMoveAt[id] = now;
    return true;
  },
  nextEventAt(s) {
    if (s.phase === "done") return null;
    return s.phase === "live" ? Math.min(s.deadline, ...s.bots.filter((id) => s.alive.includes(id)).map((id) => s.nextBotAt[id]!)) : s.deadline;
  },
  advance(s, now, rng) {
    if (s.phase === "done") return;
    if (s.phase === "buffer") {
      if (now >= s.deadline) beginRound(s, s.deadline, rng);
      return;
    }
    for (const id of s.bots.filter((bot) => s.alive.includes(bot))) {
      while (s.nextBotAt[id]! <= now && s.nextBotAt[id]! < s.deadline) {
        if (allTargetSpotsTaken(s)) break;
        const current = s.positions[id]!;
        if (s.colors[current] === s.target) {
          s.nextBotAt[id] = s.nextBotAt[id]! + s.botMoveInterval[id]!;
          continue;
        }
        const direction = botMove(s, id, rng);
        if (direction) move(s, id, direction);
        s.nextBotAt[id] = s.nextBotAt[id]! + s.botMoveInterval[id]!;
      }
      if (allTargetSpotsTaken(s)) break;
    }
    if (now < s.deadline && !allTargetSpotsTaken(s)) return;
    const survivors = s.alive.filter((id) => s.colors[s.positions[id]!] === s.target);
    for (const id of s.alive) if (survivors.includes(id)) s.survived[id] = s.round;
    s.eliminatedThisRound = s.alive.filter((id) => !survivors.includes(id));
    s.alive = survivors;
    if (survivors.length <= 1) s.phase = "done";
    else {
      s.phase = "buffer";
      s.deadline = now + 2_000;
    }
  },
  done: (s) => s.phase === "done",
  result(s) {
    return { ranking: rankByKeys(s.players, (id) => [s.alive.includes(id) ? 1 : 0, s.survived[id]!]), scores: s.survived, labels: Object.fromEntries(s.players.map((id) => [id, `survived ${s.survived[id]} rounds`])) };
  },
  view(s) {
    return {
      cols: COLS,
      rows: ROWS,
      colors: s.colors,
      positions: s.positions,
      alive: s.alive,
      eliminatedThisRound: s.eliminatedThisRound,
      round: s.round,
      target: s.target,
      targetSpots: Math.max(0, s.alive.length - 1),
      phase: s.phase,
      deadline: s.deadline,
      survived: s.survived,
    };
  },
};
