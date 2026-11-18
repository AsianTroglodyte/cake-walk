import { pick, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, rankByKeys, type RealtimeGame } from "./framework";

export const COLOR_CODE_COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;
export type ColorCodeColor = typeof COLOR_CODE_COLORS[number];
export interface ColorCodeState {
  players: PlayerId[];
  bots: PlayerId[];
  code: ColorCodeColor[];
  guesses: Record<PlayerId, { colors: ColorCodeColor[]; correct: number; at: number }[]>;
  solvedAt: Record<PlayerId, number | null>;
  nextBotAt: Record<PlayerId, number>;
  startAt: number;
  endAt: number;
  endedAt: number | null;
}

function permutations(colors: ColorCodeColor[], length: number): ColorCodeColor[][] {
  if (length === 0) return [[]];
  return colors.flatMap((color, index) =>
    permutations([...colors.slice(0, index), ...colors.slice(index + 1)], length - 1)
      .map((tail) => [color, ...tail]),
  );
}

const POSSIBLE_CODES = permutations([...COLOR_CODE_COLORS], 4);
const BOT_FIRST_GUESS_DELAY = [5_000, 15_000] as const;
// The wide interval adds varied solving paces while keeping its average near 7.5 seconds.
const BOT_GUESS_INTERVAL = [2_000, 13_000] as const;

function exactMatches(a: readonly ColorCodeColor[], b: readonly ColorCodeColor[]): number {
  return a.reduce((total, color, index) => total + (color === b[index] ? 1 : 0), 0);
}

/** Choose a remaining possible code that most evenly divides the surviving solutions. */
function botGuess(s: ColorCodeState, id: PlayerId, rng: Rng): ColorCodeColor[] {
  const history = s.guesses[id]!;
  if (history.length === 0) return pick(rng, POSSIBLE_CODES);
  const candidates = POSSIBLE_CODES.filter((candidate) =>
    history.every((guess) => exactMatches(candidate, guess.colors) === guess.correct),
  );
  if (candidates.length === 0) return POSSIBLE_CODES[0]!;

  let bestWorstCase = Number.POSITIVE_INFINITY;
  let bestGuesses: ColorCodeColor[][] = [];
  for (const guess of candidates) {
    const outcomes = Array<number>(5).fill(0);
    for (const candidate of candidates) {
      const result = exactMatches(guess, candidate);
      outcomes[result] = outcomes[result]! + 1;
    }
    const worstCase = Math.max(...outcomes);
    if (worstCase < bestWorstCase) {
      bestWorstCase = worstCase;
      bestGuesses = [guess];
    } else if (worstCase === bestWorstCase) {
      bestGuesses.push(guess);
    }
  }
  return pick(rng, bestGuesses);
}

export const colorCode: RealtimeGame<ColorCodeState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    return {
      players, bots,
      code: shuffle(rng, [...COLOR_CODE_COLORS]).slice(0, 4),
      guesses: Object.fromEntries(players.map((id) => [id, []])),
      solvedAt: Object.fromEntries(players.map((id) => [id, null])),
      nextBotAt: Object.fromEntries(bots.map((id) => [id, startAt + randInt(rng, ...BOT_FIRST_GUESS_DELAY)])),
      startAt,
      endAt: startAt + 60_000,
      endedAt: null,
    };
  },
  input(s, id, raw, now, rng) {
    if (s.endedAt !== null || now >= s.endAt || !s.players.includes(id) || s.solvedAt[id] !== null ||
        !isRecord(raw) || raw.kind !== "guess" || !Array.isArray(raw.colors) ||
        raw.colors.length !== 4 || raw.colors.some((color) => !COLOR_CODE_COLORS.includes(color as ColorCodeColor))) return false;
    const colors = raw.colors as ColorCodeColor[];
    const correct = colors.reduce((sum, color, i) => sum + (s.code[i] === color ? 1 : 0), 0);
    s.guesses[id]!.push({ colors, correct, at: now });
    if (correct === 4) {
      s.solvedAt[id] = now;
      if (s.players.every((player) => s.solvedAt[player] !== null)) s.endedAt = now;
    }
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.endAt, ...s.bots.filter((id) => s.solvedAt[id] === null).map((id) => s.nextBotAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    for (const id of s.bots) {
      while (s.solvedAt[id] === null && s.nextBotAt[id]! <= now) {
        const colors = botGuess(s, id, rng);
        colorCode.input(s, id, { kind: "guess", colors }, s.nextBotAt[id]!, rng);
        s.nextBotAt[id] = s.nextBotAt[id]! + randInt(rng, ...BOT_GUESS_INTERVAL);
        if (s.endedAt !== null) return;
      }
    }
    if (now >= s.endAt) s.endedAt = s.endAt;
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    const solved = s.players.filter((id) => s.solvedAt[id] !== null);
    const rank = [...solved].sort((a, b) => s.solvedAt[a]! - s.solvedAt[b]!);
    const ranking: PlayerId[][] = [];
    for (const id of rank) {
      const previous = ranking.at(-1);
      if (previous && s.solvedAt[previous[0]!] === s.solvedAt[id]) previous.push(id);
      else ranking.push([id]);
    }
    const unsolved = s.players.filter((id) => !solved.includes(id));
    if (unsolved.length > 0) ranking.push(unsolved);
    if (ranking.length === 0) ranking.push(s.players);
    return {
      ranking,
      scores: Object.fromEntries(s.players.map((id) => [id, s.solvedAt[id] === null ? null : s.solvedAt[id]! - s.startAt])),
      labels: Object.fromEntries(s.players.map((id) => [
        id,
        s.solvedAt[id] === null ? "not solved" : `solved in ${((s.solvedAt[id]! - s.startAt) / 1000).toFixed(2)}s`,
      ])),
    };
  },
  view(s, viewer) {
    return {
      colors: COLOR_CODE_COLORS,
      guesses: s.guesses,
      solved: Object.fromEntries(s.players.map((id) => [id, s.solvedAt[id] !== null])),
      solvedAt: s.solvedAt,
      yours: viewer ? { guesses: s.guesses[viewer] } : null,
      startAt: s.startAt,
      endAt: s.endAt,
    };
  },
};
