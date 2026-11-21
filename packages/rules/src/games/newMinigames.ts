import { nextFloat, pick, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isInt, isRecord, mapPlayers, rankByKeys, type RealtimeGame, type RoundGame } from "./framework";
import { SINGLE_WORD_COMMON } from "./singleWordDictionary";
import { isValidSingleWord, SINGLE_WORD_VULGAR_WORDS } from "./singleWord";

// On The Dot ----------------------------------------------------------------

export const DOT_SHAPES = ["circle", "square", "star", "triangle", "infinity"] as const;
export type DotShape = (typeof DOT_SHAPES)[number];
export interface DotPoint { x: number; y: number }
export interface OnTheDotState {
  players: PlayerId[];
  bots: PlayerId[];
  positions: Record<PlayerId, DotPoint>;
  botOffsets: Record<PlayerId, DotPoint>;
  botRoamTargets: Record<PlayerId, DotPoint | null>;
  botRetargetAt: Record<PlayerId, number>;
  targets: Record<PlayerId, DotPoint | null>;
  nextPlayerAt: Record<PlayerId, number>;
  dotCycles: number;
  dotStartProgress: number;
  shape: DotShape;
  startAt: number;
  endAt: number;
  nextBotAt: Record<PlayerId, number>;
  endedAt: number | null;
}

export function onTheDotPoint(shape: DotShape, progress: number): DotPoint {
  const t = ((progress % 1) + 1) % 1;
  const angle = -Math.PI / 2 + t * Math.PI * 2;
  if (shape === "circle") return { x: 0.5 + Math.cos(angle) * 0.34, y: 0.5 + Math.sin(angle) * 0.34 };
  if (shape === "infinity") {
    const scale = 0.34 / (1 + Math.cos(angle) ** 2);
    return { x: 0.5 + Math.sin(angle) * scale, y: 0.5 + Math.sin(angle) * Math.cos(angle) * scale };
  }
  const sides = shape === "square" ? 4 : shape === "triangle" ? 3 : 10;
  const vertices = shape === "square"
    ? [{ x: 0.16, y: 0.16 }, { x: 0.84, y: 0.16 }, { x: 0.84, y: 0.84 }, { x: 0.16, y: 0.84 }]
    : Array.from({ length: sides }, (_, i) => {
      const a = -Math.PI / 2 + i * Math.PI * 2 / sides;
      const r = shape === "star" && i % 2 === 1 ? 0.16 : 0.34;
      return { x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r };
    });
  const scaled = t * sides;
  const from = vertices[Math.floor(scaled)]!;
  const to = vertices[(Math.floor(scaled) + 1) % sides]!;
  const mix = scaled % 1;
  return { x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix };
}

/** The path speed and starting point are randomized once per game; motion stays constant afterward. */
export function onTheDotProgress(elapsedMs: number, dotCycles: number, startProgress = 0): number {
  const elapsed = Math.max(0, Math.min(15_000, elapsedMs));
  return (startProgress + elapsed / 15_000 * dotCycles) % 1;
}

export const onTheDot: RealtimeGame<OnTheDotState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const shape = pick(rng, DOT_SHAPES);
    return {
      players, bots, shape, startAt, endAt: startAt + 15_000, endedAt: null,
      dotCycles: 1 + nextFloat(rng) * 1.5,
      dotStartProgress: nextFloat(rng),
      positions: mapPlayers(players, (id) => {
        return { x: nextFloat(rng) * 0.88 + 0.06, y: nextFloat(rng) * 0.88 + 0.06 };
      }),
      botOffsets: mapPlayers(bots, (id) => {
        const angle = nextFloat(rng) * Math.PI * 2;
        const radius = 0.04 + nextFloat(rng) * 0.62;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      }),
      botRoamTargets: mapPlayers(bots, () => null),
      botRetargetAt: mapPlayers(bots, () => startAt + randInt(rng, 350, 850)),
      targets: mapPlayers(players, () => null),
      nextPlayerAt: mapPlayers(players, () => Number.POSITIVE_INFINITY),
      nextBotAt: mapPlayers(bots, () => startAt + 180),
    };
  },
  input(s, id, raw, now) {
    if (s.endedAt !== null || now >= s.endAt || !s.players.includes(id) || s.bots.includes(id) || !isRecord(raw) ||
        raw.kind !== "cursor" || typeof raw.x !== "number" || !Number.isFinite(raw.x) ||
        typeof raw.y !== "number" || !Number.isFinite(raw.y)) return false;
    s.targets[id] = { x: Math.max(0, Math.min(1, raw.x)), y: Math.max(0, Math.min(1, raw.y)) };
    if (!Number.isFinite(s.nextPlayerAt[id]!)) {
      moveDotPlayer(s, id, now);
      s.nextPlayerAt[id] = s.targets[id] ? now + 50 : Number.POSITIVE_INFINITY;
    }
    return true;
  },
  nextEventAt: (s) => s.endedAt !== null ? null : Math.min(
    s.endAt, ...s.bots.map((id) => s.nextBotAt[id]!), ...s.players.map((id) => s.nextPlayerAt[id]!),
  ),
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    for (const id of s.players.filter((player) => !s.bots.includes(player))) {
      while (s.targets[id] && s.nextPlayerAt[id]! <= now && s.nextPlayerAt[id]! < s.endAt) {
        const at = s.nextPlayerAt[id]!;
        moveDotPlayer(s, id, at);
        s.nextPlayerAt[id] = s.targets[id] ? at + 50 : Number.POSITIVE_INFINITY;
      }
    }
    for (const id of s.bots) {
      while (s.nextBotAt[id]! <= now && s.nextBotAt[id]! < s.endAt) {
        const progress = onTheDotProgress(
          s.nextBotAt[id]! - s.startAt, s.dotCycles, s.dotStartProgress,
        );
        const dot = onTheDotPoint(s.shape, progress);
        const at = s.nextBotAt[id]!;
        if (at >= s.botRetargetAt[id]!) {
          if (nextFloat(rng) < 0.5) {
            // Roam to a new point anywhere on the field, independent of the dot's orbit.
            s.botRoamTargets[id] = { x: 0.04 + nextFloat(rng) * 0.92, y: 0.04 + nextFloat(rng) * 0.92 };
          } else {
            s.botRoamTargets[id] = null;
            const angle = nextFloat(rng) * Math.PI * 2;
            const closeness = nextFloat(rng);
            const radius = closeness < 0.34
              ? 0.02 + nextFloat(rng) * 0.08
              : closeness < 0.67
                ? 0.14 + nextFloat(rng) * 0.22
                : 0.36 + nextFloat(rng) * 0.52;
            s.botOffsets[id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
          }
          s.botRetargetAt[id] = at + randInt(rng, 350, 850);
        }
        const offset = s.botOffsets[id]!;
        const target = s.botRoamTargets[id] ?? {
          x: Math.max(0.04, Math.min(0.96, dot.x + offset.x)),
          y: Math.max(0.04, Math.min(0.96, dot.y + offset.y)),
        };
        const position = s.positions[id]!;
        const dx = target.x - position.x;
        const dy = target.y - position.y;
        const length = Math.hypot(dx, dy) || 1;
        const step = Math.min(0.05 + nextFloat(rng) * 0.08, length);
        const sidestep = (nextFloat(rng) - 0.5) * 0.08;
        s.positions[id] = {
          x: Math.max(0.02, Math.min(0.98, position.x + dx / length * step - dy / length * sidestep)),
          y: Math.max(0.02, Math.min(0.98, position.y + dy / length * step + dx / length * sidestep)),
        };
        s.nextBotAt[id] = at + randInt(rng, 70, 190);
      }
    }
    if (now >= s.endAt) s.endedAt = s.endAt;
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    const dot = onTheDotPoint(s.shape, onTheDotProgress(15_000, s.dotCycles, s.dotStartProgress));
    const distances = mapPlayers(s.players, (id) => Math.hypot(s.positions[id]!.x - dot.x, s.positions[id]!.y - dot.y));
    return {
      ranking: rankByKeys(s.players, (id) => [-distances[id]!]),
      scores: mapPlayers(s.players, (id) => Math.round(distances[id]! * 1000)),
      labels: mapPlayers(s.players, (id) => `${distances[id]!.toFixed(3)} from the dot`),
    };
  },
  view: (s) => ({
    shape: s.shape, startAt: s.startAt, endAt: s.endAt,
    dotCycles: s.dotCycles, dotStartProgress: s.dotStartProgress, positions: s.positions,
  }),
};

function moveDotPlayer(s: OnTheDotState, id: PlayerId, at: number): void {
  const target = s.targets[id];
  if (!target) return;
  const position = s.positions[id]!;
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const length = Math.hypot(dx, dy);
  const step = Math.min(0.025, length);
  if (length > 0) s.positions[id] = { x: position.x + dx / length * step, y: position.y + dy / length * step };
  if (length <= 0.025) {
    s.targets[id] = null;
    s.nextPlayerAt[id] = Number.POSITIVE_INFINITY;
  } else {
    s.nextPlayerAt[id] = at + 50;
  }
}

// Dot Collector -------------------------------------------------------------

const DCOLS = 20;
const DROWS = 20;
const DOT_SPEED = 0.55;
const DOT_GOAL = 6;
export interface CollectorStar extends DotPoint { id: number }
interface BotGoal { kind: "center" | "home" | "steal"; player?: PlayerId; starId?: number }
export interface DotCollectorState {
  players: PlayerId[];
  bots: PlayerId[];
  positions: Record<PlayerId, DotPoint>;
  targets: Record<PlayerId, DotPoint | null>;
  nextPlayerAt: Record<PlayerId, number>;
  homes: Record<PlayerId, DotPoint>;
  banked: Record<PlayerId, number>;
  carrying: Record<PlayerId, number>;
  finishedAt: Record<PlayerId, number | null>;
  goals: Record<PlayerId, BotGoal | null>;
  stars: CollectorStar[];
  nextStarId: number;
  nextBotAt: Record<PlayerId, number>;
  nextSpawnAt: number;
  startAt: number;
  endAt: number;
  endedAt: number | null;
}

function collectorHome(index: number, count: number, rotation: number): DotPoint {
  const angle = rotation + index * Math.PI * 2 / count;
  const radius = DROWS * 0.46;
  return { x: DCOLS / 2 + Math.cos(angle) * radius, y: DROWS / 2 + Math.sin(angle) * radius };
}
function collectorClampToCircle(point: DotPoint): DotPoint {
  const center = { x: DCOLS / 2, y: DROWS / 2 };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distanceFromCenter = Math.hypot(dx, dy);
  const radius = DROWS / 2 - 0.25;
  if (distanceFromCenter <= radius) return point;
  const scale = radius / distanceFromCenter;
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}
function distance(a: DotPoint, b: DotPoint): number { return Math.hypot(a.x - b.x, a.y - b.y); }
function isCollectorCenterStar(star: CollectorStar): boolean {
  return Math.abs(star.x - DCOLS / 2) <= 3 && Math.abs(star.y - DROWS / 2) <= 2;
}
function spawnStars(s: DotCollectorState, rng: Rng): void {
  for (let i = 0; i < s.players.length; i++) {
    s.stars.push({ id: s.nextStarId++, x: DCOLS / 2 + (nextFloat(rng) - 0.5) * 6, y: DROWS / 2 + (nextFloat(rng) - 0.5) * 4 });
  }
}
function collectorFinish(s: DotCollectorState, id: PlayerId, at: number): void {
  if (s.finishedAt[id] !== null) return;
  const position = s.positions[id]!;
  if (distance(position, s.homes[id]!) <= 1.35 && s.carrying[id]! > 0) {
    s.banked[id] = Math.min(DOT_GOAL, s.banked[id]! + s.carrying[id]!);
    s.carrying[id] = 0;
    s.goals[id] = null;
    if (s.banked[id]! >= DOT_GOAL) {
      s.finishedAt[id] = at;
      s.targets[id] = null;
      s.nextPlayerAt[id] = Number.POSITIVE_INFINITY;
    }
  }
}
function collectAt(s: DotCollectorState, id: PlayerId, at: number): void {
  if (s.finishedAt[id] !== null) return;
  collectorFinish(s, id, at);
  if (s.finishedAt[id] !== null) return;
  if (s.carrying[id] === 0) {
    const position = s.positions[id]!;
    const starIndex = s.stars.findIndex((star) => distance(position, star) <= 0.72);
    if (starIndex >= 0) {
      s.stars.splice(starIndex, 1);
      s.carrying[id] = s.carrying[id]! + 1;
      s.goals[id] = null;
      return;
    }
    const victim = s.players.find((other) => other !== id && s.finishedAt[other] === null &&
      s.banked[other]! > 0 &&
      distance(position, s.homes[other]!) <= 1.35);
    if (victim) {
      s.banked[victim] = s.banked[victim]! - 1;
      s.carrying[id] = s.carrying[id]! + 1;
      s.goals[id] = null;
    }
  }
}
function moveCollectorPlayer(s: DotCollectorState, id: PlayerId, at: number): void {
  const target = s.targets[id];
  if (!target) return;
  const position = s.positions[id]!;
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const d = Math.hypot(dx, dy);
  const step = Math.min(DOT_SPEED, d);
  if (d > 0) s.positions[id] = { x: position.x + dx / d * step, y: position.y + dy / d * step };
  collectAt(s, id, at);
  if (d <= DOT_SPEED) {
    s.targets[id] = null;
    s.nextPlayerAt[id] = Number.POSITIVE_INFINITY;
  } else {
    s.nextPlayerAt[id] = at + 100;
  }
}
function nextCollectorGoal(s: DotCollectorState, id: PlayerId, rng: Rng): BotGoal {
  if (s.carrying[id]! > 0) return { kind: "home" };
  const centerStars = s.stars.filter(isCollectorCenterStar);
  if (centerStars.length > 10) return { kind: "center", starId: centerStars[0]?.id };
  const others = s.players.filter((player) => player !== id && s.finishedAt[player] === null &&
    s.banked[player]! > 0);
  switch (randInt(rng, 1, 4)) {
    case 1:
      return { kind: "center", starId: s.stars[0]?.id };
    case 2: {
      if (others.length === 0) return { kind: "center", starId: s.stars[0]?.id };
      const leaderScore = Math.max(...others.map((player) => s.banked[player]!));
      const leaders = others.filter((player) => s.banked[player] === leaderScore);
      return { kind: "steal", player: pick(rng, leaders) };
    }
    case 3: {
      if (others.length === 0) return { kind: "center", starId: s.stars[0]?.id };
      const closest = others.reduce((best, player) =>
        distance(s.positions[id]!, s.homes[player]!) < distance(s.positions[id]!, s.homes[best]!)
          ? player
          : best,
      others[0]!);
      return { kind: "steal", player: closest };
    }
    default:
      return others.length > 0
        ? { kind: "steal", player: pick(rng, others) }
        : { kind: "center", starId: s.stars[0]?.id };
  }
}
function collectorGoalPoint(s: DotCollectorState, id: PlayerId, goal: BotGoal): DotPoint | null {
  if (goal.kind === "home") return s.homes[id]!;
  if (goal.kind === "steal") return goal.player ? s.homes[goal.player]! : null;
  const star = s.stars.find((entry) => entry.id === goal.starId) ?? s.stars[0];
  return star ?? { x: DCOLS / 2, y: DROWS / 2 };
}

export const dotCollector: RealtimeGame<DotCollectorState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const homeRotation = nextFloat(rng) * Math.PI * 2;
    const homes = mapPlayers(players, (id) => collectorHome(players.indexOf(id), players.length, homeRotation));
    const state: DotCollectorState = {
      players, bots, homes, positions: { ...homes }, banked: mapPlayers(players, () => 0),
      targets: mapPlayers(players, () => null), nextPlayerAt: mapPlayers(players, () => Number.POSITIVE_INFINITY),
      carrying: mapPlayers(players, () => 0), finishedAt: mapPlayers(players, () => null),
      goals: mapPlayers(players, () => null),
      stars: [], nextStarId: 0, nextBotAt: mapPlayers(bots, () => startAt + 100),
      nextSpawnAt: startAt + 8_000,
      startAt, endAt: startAt + 60_000, endedAt: null,
    };
    spawnStars(state, rng);
    return state;
  },
  input(s, id, raw, now) {
    if (s.endedAt !== null || now >= s.endAt || !s.players.includes(id) || s.bots.includes(id) ||
        s.finishedAt[id] !== null || !isRecord(raw) || raw.kind !== "cursor" ||
        typeof raw.x !== "number" || !Number.isFinite(raw.x) || typeof raw.y !== "number" || !Number.isFinite(raw.y)) return false;
    s.targets[id] = collectorClampToCircle({
      x: Math.max(0, Math.min(DCOLS, raw.x)),
      y: Math.max(0, Math.min(DROWS, raw.y)),
    });
    if (!Number.isFinite(s.nextPlayerAt[id]!)) {
      moveCollectorPlayer(s, id, now);
      s.nextPlayerAt[id] = s.targets[id] ? now + 100 : Number.POSITIVE_INFINITY;
    }
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.endAt, s.nextSpawnAt, ...s.bots.map((id) => s.nextBotAt[id]!), ...s.players.map((id) => s.nextPlayerAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    // Spawn one star per player on each 8-second mark.
    while (s.nextSpawnAt <= now && s.nextSpawnAt < s.endAt) {
      spawnStars(s, rng);
      s.nextSpawnAt += 8_000;
    }
    for (const id of s.players.filter((player) => !s.bots.includes(player))) {
      if (s.finishedAt[id] !== null) continue;
      while (s.targets[id] && s.nextPlayerAt[id]! <= now && s.nextPlayerAt[id]! < s.endAt) {
        const at = s.nextPlayerAt[id]!;
        moveCollectorPlayer(s, id, at);
        s.nextPlayerAt[id] = s.targets[id] ? at + 100 : Number.POSITIVE_INFINITY;
      }
    }
    for (const id of s.bots) {
      while (s.finishedAt[id] === null && s.nextBotAt[id]! <= now && s.nextBotAt[id]! < s.endAt) {
        const at = s.nextBotAt[id]!;
        let goal = s.goals[id];
        if (!goal || (goal.kind === "center" && !s.stars.some((star) => star.id === goal!.starId)) ||
            (goal.kind === "steal" && (s.finishedAt[goal.player!] !== null ||
              s.banked[goal.player!]! <= 0))) {
          goal = nextCollectorGoal(s, id, rng);
          s.goals[id] = goal;
        }
        const target = collectorGoalPoint(s, id, goal);
        if (target) {
          const position = s.positions[id]!;
          const dx = target.x - position.x;
          const dy = target.y - position.y;
          const d = Math.hypot(dx, dy);
          if (d > 0) s.positions[id] = { x: position.x + dx / d * Math.min(DOT_SPEED, d), y: position.y + dy / d * Math.min(DOT_SPEED, d) };
          collectAt(s, id, at);
        }
        s.nextBotAt[id] = at + 100;
      }
      if (s.finishedAt[id] !== null) s.nextBotAt[id] = Number.POSITIVE_INFINITY;
    }
    if (now >= s.endAt || s.players.filter((id) => s.finishedAt[id] === null).length <= 1) s.endedAt = now;
  },
  done: (s) => s.endedAt !== null || s.players.filter((id) => s.finishedAt[id] === null).length <= 1,
  result(s) {
    const finishers = s.players.filter((id) => s.finishedAt[id] !== null);
    return {
      ranking: rankByKeys(s.players, (id) => [
        s.finishedAt[id] === null ? 0 : 1,
        s.finishedAt[id] === null ? s.banked[id]! + s.carrying[id]! : -s.finishedAt[id]!,
        s.banked[id]! + s.carrying[id]!,
      ]),
      scores: mapPlayers(s.players, (id) => s.banked[id]! + s.carrying[id]!),
      labels: mapPlayers(s.players, (id) => {
        if (s.finishedAt[id] === null) return `${s.banked[id]} banked, ${s.carrying[id]} carrying`;
        const place = 1 + finishers.filter((other) => s.finishedAt[other]! < s.finishedAt[id]!).length;
        const elapsedSeconds = ((s.finishedAt[id] ?? s.endAt) - s.startAt) / 1_000;
        return `finished ${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"} in ${elapsedSeconds.toFixed(1)}s`;
      }),
    };
  },
  view: (s) => ({
      cols: DCOLS, rows: DROWS, positions: s.positions, homes: s.homes, stars: s.stars,
    banked: s.banked, carrying: s.carrying, finishedAt: s.finishedAt,
    startAt: s.startAt, endAt: s.endAt,
  }),
};

// Brawldle ------------------------------------------------------------------

export interface BrawldleGuess { word: string; feedback: ("correct" | "present" | "absent")[] }
interface BrawldleState {
  players: PlayerId[];
  bots: PlayerId[];
  turnOrder: PlayerId[];
  phase: "secrets" | "guess";
  round: number;
  currentTurn: PlayerId | null;
  alive: PlayerId[];
  secrets: Record<PlayerId, string | null>;
  histories: Record<PlayerId, BrawldleGuess[]>;
  outRound: Record<PlayerId, number | null>;
  last: { guesser: PlayerId; guess: string; eliminated: PlayerId[] } | null;
}
function wordFeedback(answer: string, guess: string): BrawldleGuess["feedback"] {
  const result: BrawldleGuess["feedback"] = Array(5).fill("absent");
  const remaining = new Map<string, number>();
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) result[i] = "correct";
    else remaining.set(answer[i]!, (remaining.get(answer[i]!) ?? 0) + 1);
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === "correct") continue;
    const count = remaining.get(guess[i]!) ?? 0;
    if (count > 0) {
      result[i] = "present";
      remaining.set(guess[i]!, count - 1);
    }
  }
  return result;
}
const BRAWLDLE_VULGAR_WORDS = new Set(SINGLE_WORD_VULGAR_WORDS);
const BRAWLDLE_WORDS = SINGLE_WORD_COMMON
  .map((word) => word.toUpperCase())
  .filter((word) => !BRAWLDLE_VULGAR_WORDS.has(word));
const BRAWLDLE_FEEDBACK_ROWS = new Map<string, Uint8Array>();
function feedbackCode(feedback: BrawldleGuess["feedback"]): number {
  return feedback.reduce((code, mark) => code * 3 + (mark === "correct" ? 2 : mark === "present" ? 1 : 0), 0);
}
function feedbackRow(guess: string): Uint8Array {
  let row = BRAWLDLE_FEEDBACK_ROWS.get(guess);
  if (!row) {
    row = Uint8Array.from(BRAWLDLE_WORDS, (secret) => feedbackCode(wordFeedback(secret, guess)));
    BRAWLDLE_FEEDBACK_ROWS.set(guess, row);
  }
  return row;
}
function commonWord(rng: Rng, exclude: readonly string[] = []): string {
  const allowed = SINGLE_WORD_COMMON.map((word) => word.toUpperCase()).filter((word) => !exclude.includes(word));
  return pick(rng, allowed.length ? allowed : SINGLE_WORD_COMMON.map((word) => word.toUpperCase()));
}

export const brawldle: RoundGame<BrawldleState, { word: string }> = {
  mode: "round",
  setup: ({ players, bots, rng }) => {
    const turnOrder = shuffle(rng, players);
    return {
      players, bots, turnOrder, phase: "secrets", round: 0,
      currentTurn: turnOrder[0] ?? null, alive: [...players],
      secrets: mapPlayers(players, () => null), histories: mapPlayers(players, () => []),
      outRound: mapPlayers(players, () => null), last: null,
    };
  },
  roundMs: (s) => s.phase === "secrets" ? 15_000 : 30_000,
  revealMs: (s) => brawldle.done(s) ? 7_000 : 2_500,
  deciders: (s) => s.phase === "secrets" ? s.players : s.currentTurn ? [s.currentTurn] : [],
  parse(s, id, raw) {
    if (s.phase === "guess" && s.currentTurn !== id) return undefined;
    if (!isRecord(raw) || typeof raw.word !== "string") return undefined;
    const word = raw.word.trim().toUpperCase();
    return isValidSingleWord(word) && !BRAWLDLE_VULGAR_WORDS.has(word) ? { word } : undefined;
  },
  fallback: (_s, _id, rng) => ({ word: commonWord(rng) }),
  botDelayMs: (s) => s.phase === "guess" ? 1_000 : null,
  bot(s, id, rng) {
    if (s.phase === "secrets") return { word: commonWord(rng) };
    const ownSecret = s.secrets[id]!;
    const targets = s.alive.filter((target) => target !== id);
    if (targets.length > 0) {
      // Prefer an opponent whose visible clues contain the most information.
      const clueScore = (target: PlayerId) => s.histories[target]!.reduce(
        (total, entry) => total + entry.feedback.filter((mark) => mark !== "absent").length,
        0,
      );
      const bestScore = Math.max(...targets.map(clueScore));
      const target = pick(rng, targets.filter((candidate) => clueScore(candidate) === bestScore));
      const clues = s.histories[target]!.map((entry) => ({
        row: feedbackRow(entry.word),
        expected: feedbackCode(entry.feedback),
      }));
      const candidates = BRAWLDLE_WORDS.filter((candidate, index) =>
        candidate !== ownSecret && clues.every(({ row, expected }) => row[index] === expected),
      );
      if (candidates.length > 0) return { word: pick(rng, candidates) };
    }
    return { word: commonWord(rng, [ownSecret]) };
  },
  resolve(s, choices) {
    if (s.phase === "secrets") {
      for (const id of s.players) s.secrets[id] = choices[id]!.word;
      s.phase = "guess";
      return;
    }
    const guesser = s.currentTurn!;
    const guess = choices[guesser]!.word;
    s.round++;
    for (const target of s.players) {
      const history = s.histories[target]!;
      history.push({ word: guess, feedback: wordFeedback(s.secrets[target]!, guess) });
      if (history.length > 4) history.shift();
    }
    const eliminated = s.alive.filter((target) => guess === s.secrets[target]);
    for (const id of eliminated) s.outRound[id] = s.round;
    s.alive = s.alive.filter((id) => !eliminated.includes(id));
    s.last = { guesser, guess, eliminated };
    if (s.alive.length > 0) {
      const currentIndex = s.turnOrder.indexOf(guesser);
      for (let offset = 1; offset <= s.players.length; offset++) {
        const next = s.turnOrder[(currentIndex + offset) % s.turnOrder.length]!;
        if (s.alive.includes(next)) {
          s.currentTurn = next;
          break;
        }
      }
    } else {
      s.currentTurn = null;
    }
  },
  done: (s) => s.phase === "guess" && (s.alive.length <= 1 || s.round >= 30),
  result(s) {
    const survived = (id: PlayerId) => s.outRound[id] === null ? s.round + 1 : s.outRound[id]! - 1;
    return {
      ranking: rankByKeys(s.players, (id) => [survived(id)]),
      scores: mapPlayers(s.players, survived),
      labels: mapPlayers(s.players, (id) => s.outRound[id] === null ? `survived ${s.round} rounds` : `out in round ${s.outRound[id]}`),
    };
  },
  view(s, viewer) {
    const revealAll = brawldle.done(s);
    return {
      phase: s.phase, round: s.round, alive: s.alive, outRound: s.outRound,
      yourSecret: viewer ? s.secrets[viewer] : null,
      currentTurn: s.currentTurn,
      turnOrder: s.turnOrder,
      boards: mapPlayers(s.players, (id) => s.histories[id]),
      revealedSecrets: mapPlayers(s.players, (id) => s.outRound[id] !== null || revealAll ? s.secrets[id] : null),
      last: s.last,
    };
  },
};

// Dice Fleet ----------------------------------------------------------------

interface DiceFleetState {
  players: PlayerId[];
  turnOrder: PlayerId[];
  round: number;
  hp: Record<PlayerId, number>;
  roll: Record<PlayerId, number>;
  outRound: Record<PlayerId, number | null>;
  last: {
    attacks: Record<PlayerId, { target: PlayerId; damage: number }>;
    lost: Record<PlayerId, number>;
    eliminated: PlayerId[];
  } | null;
}
const diceAlive = (s: DiceFleetState) => s.players.filter((id) => s.hp[id]! > 0);
export const diceFleet: RoundGame<DiceFleetState, { target: PlayerId }> = {
  mode: "round",
  setup({ players, rng }) {
    return {
      players, turnOrder: shuffle(rng, players), round: 0, hp: mapPlayers(players, () => 10),
      roll: mapPlayers(players, () => randInt(rng, 1, 4)),
      outRound: mapPlayers(players, () => null), last: null,
    };
  },
  roundMs: () => 10_000,
  revealMs: 3_000,
  deciders: diceAlive,
  parse(s, id, raw) {
    if (!isRecord(raw) || typeof raw.target !== "string" || raw.target === id || !diceAlive(s).includes(raw.target)) return undefined;
    return { target: raw.target };
  },
  fallback(s, id, rng) { return { target: pick(rng, diceAlive(s).filter((other) => other !== id)) }; },
  bot(s, id, rng) {
    const others = diceAlive(s).filter((other) => other !== id);
    if (nextFloat(rng) < 0.35) {
      const highest = Math.max(...others.map((other) => s.hp[other]!));
      return { target: pick(rng, others.filter((other) => s.hp[other] === highest)) };
    }
    return { target: pick(rng, others) };
  },
  resolve(s, choices, rng) {
    s.round++;
    const lost = mapPlayers(s.players, () => 0);
    const attacks = Object.fromEntries(s.turnOrder.filter((id) => choices[id] !== undefined).map((id) => [
      id, { target: choices[id]!.target, damage: s.roll[id]! },
    ]));
    for (const [id, choice] of Object.entries(choices)) lost[choice.target] += s.roll[id]!;
    for (const id of diceAlive(s)) {
      s.hp[id] = Math.max(0, s.hp[id]! - lost[id]!);
      if (s.hp[id] === 0) s.outRound[id] = s.round;
    }
    s.last = { attacks, lost, eliminated: s.turnOrder.filter((id) => s.outRound[id] === s.round) };
    for (const id of diceAlive(s)) s.roll[id] = randInt(rng, 1, 4);
  },
  done: (s) => diceAlive(s).length <= 1 || s.round >= 40,
  result(s) {
    return {
      ranking: rankByKeys(s.players, (id) => [s.outRound[id] === null ? s.round + 1 : s.outRound[id]! - 1, s.hp[id]!]),
      scores: mapPlayers(s.players, (id) => s.outRound[id] === null ? s.round + 1 : s.outRound[id]! - 1),
      labels: mapPlayers(s.players, (id) => s.hp[id]! > 0 ? `${s.hp[id]} HP · survived` : `sunk in round ${s.outRound[id]}`),
    };
  },
  view(s, viewer) {
    return {
      round: s.round, turnOrder: s.turnOrder, hp: s.hp, outRound: s.outRound, last: s.last,
      yourRoll: viewer ? s.roll[viewer] : null,
    };
  },
};

// Grid Quiz -----------------------------------------------------------------

const GRID_COLORS = ["red", "blue", "green", "yellow", "purple", "orange"] as const;
interface GridQuizState {
  players: PlayerId[];
  bots: PlayerId[];
  round: number;
  phase: "show" | "guess" | "reveal";
  palette: string[];
  grid: string[];
  counts: Record<string, number>;
  target: string | null;
  scores: Record<PlayerId, number>;
  guesses: Record<PlayerId, number | null>;
  last: { color: string; count: number; guesses: Record<PlayerId, number | null>; points: Record<PlayerId, number> } | null;
  phaseEndsAt: number;
  botAt: Record<PlayerId, number>;
  startAt: number;
  endedAt: number | null;
}
function buildQuizGrid(s: GridQuizState, rng: Rng): void {
  const size = s.round === 1 ? 5 : s.round === 2 ? 8 : 11;
  const colors = GRID_COLORS.slice(0, s.round + 3);
  s.palette = [...colors];
  s.grid = Array.from({ length: size * size }, () => pick(rng, colors));
  s.counts = Object.fromEntries(colors.map((color) => [color, s.grid.filter((tile) => tile === color).length]));
  s.target = null;
  s.guesses = mapPlayers(s.players, () => null);
  s.phase = "show";
}
function quizPoints(guess: number, actual: number): number {
  const difference = Math.abs(guess - actual);
  return difference === 0 ? 15 : Math.max(0, 10 - difference);
}
export const gridQuiz: RealtimeGame<GridQuizState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const s: GridQuizState = {
      players, bots, round: 1, phase: "show", palette: [], grid: [], counts: {}, target: null,
      scores: mapPlayers(players, () => 0), guesses: mapPlayers(players, () => null), last: null,
      phaseEndsAt: startAt + 8_000, botAt: mapPlayers(bots, () => Number.POSITIVE_INFINITY),
      startAt, endedAt: null,
    };
    buildQuizGrid(s, rng);
    return s;
  },
  input(s, id, raw, now) {
    if (s.endedAt !== null || s.phase !== "guess" || now >= s.phaseEndsAt || s.guesses[id] !== null ||
        !s.players.includes(id) || s.bots.includes(id) || !isRecord(raw) || !isInt(raw.count, 0, 121)) return false;
    s.guesses[id] = raw.count;
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.phaseEndsAt, ...s.bots.map((id) => s.botAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    if (s.phase === "show" && now >= s.phaseEndsAt) {
      s.phase = "guess";
      s.target = pick(rng, s.palette);
      s.guesses = mapPlayers(s.players, () => null);
      s.phaseEndsAt += 10_000;
      for (const id of s.bots) s.botAt[id] = now + randInt(rng, 1_000, 8_000);
    }
    if (s.phase === "guess") {
      const humanPlayers = s.players.filter((id) => !s.bots.includes(id));
      if (humanPlayers.length > 0 && humanPlayers.every((id) => s.guesses[id] !== null)) {
        for (const id of s.bots) {
          if (s.guesses[id] !== null) continue;
          const actual = s.counts[s.target!]!;
          s.guesses[id] = Math.max(0, actual + randInt(rng, -4, 4));
          s.botAt[id] = Number.POSITIVE_INFINITY;
        }
      }
      for (const id of s.bots) {
        if (s.guesses[id] === null && s.botAt[id]! <= now && s.botAt[id]! < s.phaseEndsAt) {
          const actual = s.counts[s.target!]!;
          s.guesses[id] = Math.max(0, actual + randInt(rng, -4, 4));
          s.botAt[id] = Number.POSITIVE_INFINITY;
        }
      }
      if (now >= s.phaseEndsAt || s.players.every((id) => s.guesses[id] !== null)) {
        const color = s.target!;
        const count = s.counts[color]!;
        const points = mapPlayers(s.players, (id) => s.guesses[id] === null ? 0 : quizPoints(s.guesses[id]!, count));
        for (const id of s.players) s.scores[id] += points[id]!;
        s.last = { color, count, guesses: { ...s.guesses }, points };
        s.phase = "reveal";
        s.phaseEndsAt = now + 5_000;
      }
    } else if (s.phase === "reveal" && now >= s.phaseEndsAt) {
        if (s.round >= 3) s.endedAt = s.phaseEndsAt;
        else {
          s.round++;
          buildQuizGrid(s, rng);
          s.phaseEndsAt += 8_000;
        }
    }
  },
  done: (s) => s.endedAt !== null,
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.scores[id]!]),
    scores: s.scores,
    labels: mapPlayers(s.players, (id) => `${s.scores[id]} points`),
  }),
  view: (s, viewer) => ({
    round: s.round, phase: s.phase, palette: s.palette, grid: s.grid, target: s.target,
    scores: s.scores, yourGuess: viewer ? s.guesses[viewer] : null,
    last: s.last ? {
      color: s.last.color, count: s.last.count, points: s.last.points,
      ...(s.phase === "reveal" ? { guesses: s.last.guesses } : {}),
    } : null,
    phaseEndsAt: s.phaseEndsAt,
  }),
};
