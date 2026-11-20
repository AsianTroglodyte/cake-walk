import { nextFloat, pick, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { LETTER_VALUES } from "./singleWord";
import { LETTER_SWITCH_COMMON_WORDS, LETTER_SWITCH_WORDS } from "./letterSwitchWords";
import {
  isInt, isRecord, mapPlayers, rankByKeys, type RealtimeGame, type RoundGame,
} from "./framework";

// Unstable Math --------------------------------------------------------------

type MathOperator = "+" | "-" | "*" | "/";
type MathSabotage =
  | { kind: "none" }
  | { kind: "number"; side: "left" | "right"; value: number }
  | { kind: "operator"; value: MathOperator };
type MathChoice = MathSabotage | { kind: "guess"; value: number };
interface Equation { left: number; operator: MathOperator; right: number }
interface UnstableMathState {
  players: PlayerId[];
  round: number;
  phase: "play";
  revealKind: "none" | "answers";
  saboteur: PlayerId;
  equation: Equation;
  originalEquation: Equation;
  scores: Record<PlayerId, number>;
  guesses: Record<PlayerId, number | null>;
  last: {
    round: number;
    originalEquation: Equation;
    equation: Equation;
    answer: number;
    saboteur: PlayerId;
    guesses: Record<PlayerId, number | null>;
    points: Record<PlayerId, number>;
  } | null;
}
const MATH_OPERATORS: MathOperator[] = ["+", "-", "*", "/"];
function mathAnswer(equation: Equation): number {
  const { left, operator, right } = equation;
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  return Math.round(left / right);
}
function makeEquation(round: number, rng: Rng): Equation {
  const min = round <= 2 ? 1 : 10;
  const max = round <= 2 ? 9 : 99;
  const operator = pick(rng, MATH_OPERATORS);
  const left = randInt(rng, min, max);
  let right = randInt(rng, min, max);
  if (operator === "/" && right === 0) right = 1;
  return { left, operator, right };
}
function mathSabotage(raw: unknown, state: UnstableMathState): MathSabotage | undefined {
  if (!isRecord(raw) || typeof raw.kind !== "string") return undefined;
  if (raw.kind === "none") return { kind: "none" };
  if (raw.kind === "number") {
    const side = raw.side;
    const value = raw.value;
    const minimum = state.round <= 2 ? 1 : 10;
    const maximum = state.round <= 2 ? 9 : 99;
    if ((side !== "left" && side !== "right") || !isInt(value, minimum, maximum)) return undefined;
    if (value === state.equation[side] ||
        (state.round >= 3 &&
          [...String(value)].filter((digit, index) => digit !== String(state.equation[side])[index]).length !== 1) ||
        (side === "right" && state.equation.operator === "/" && value === 0)) return undefined;
    return { kind: "number", side, value };
  }
  if (raw.kind === "operator" && MATH_OPERATORS.includes(raw.value as MathOperator) &&
      raw.value !== state.equation.operator) return { kind: "operator", value: raw.value as MathOperator };
  return undefined;
}
export const unstableMath: RoundGame<UnstableMathState, MathChoice> = {
  mode: "round",
  setup({ players, rng }) {
    const state: UnstableMathState = {
      players, round: 1, phase: "play", revealKind: "none", saboteur: pick(rng, players),
      equation: makeEquation(1, rng), originalEquation: { left: 0, operator: "+", right: 0 },
      scores: mapPlayers(players, () => 0),
      guesses: mapPlayers(players, () => null), last: null,
    };
    state.originalEquation = { ...state.equation };
    return state;
  },
  roundMs: () => 30_000,
  revealMs: (s) => s.revealKind === "answers" ? 6_000 : 0,
  deciders: (s) => s.players,
  parse(s, id, raw) {
    if (id === s.saboteur) return mathSabotage(raw, s);
    if (!isRecord(raw) || !isInt(raw.value, -20_000, 20_000)) return undefined;
    return { kind: "guess", value: raw.value };
  },
  fallback(s, id, rng) {
    if (id === s.saboteur) return { kind: "none" };
    return { kind: "guess", value: mathAnswer(s.equation) + randInt(rng, -10, 10) };
  },
  bot(s, id, rng) {
    if (id === s.saboteur) {
      if (nextFloat(rng) < 0.2) return { kind: "none" };
      if (nextFloat(rng) < 0.5) {
        const side = pick(rng, ["left", "right"] as const);
        const oldValue = s.equation[side];
        let value: number;
        if (s.round <= 2) {
          value = randInt(rng, 1, 9);
          if (value === oldValue) value = value === 9 ? 1 : value + 1;
        } else {
          const digits = String(oldValue).split("");
          const index = randInt(rng, 0, 1);
          let replacement = randInt(rng, index === 0 ? 1 : 0, 9);
          if (replacement === Number(digits[index])) replacement = replacement === 9 ? (index === 0 ? 1 : 0) : replacement + 1;
          digits[index] = String(replacement);
          value = Number(digits.join(""));
        }
        return { kind: "number", side, value };
      }
      const options = MATH_OPERATORS.filter((operator) => operator !== s.equation.operator);
      return { kind: "operator", value: pick(rng, options) };
    }
    const answer = mathAnswer(s.equation);
    if (nextFloat(rng) >= 0.85) return { kind: "guess", value: answer };
    const magnitude = s.equation.operator === "*" ? 100 : 10;
    return { kind: "guess", value: answer + randInt(rng, 1, magnitude) * (nextFloat(rng) < 0.5 ? -1 : 1) };
  },
  resolve(s, choices, rng) {
    s.originalEquation = { ...s.equation };
    const sabotage = choices[s.saboteur]!;
    if (sabotage.kind === "number") s.equation[sabotage.side] = sabotage.value;
    if (sabotage.kind === "operator") s.equation.operator = sabotage.value;
    const answer = mathAnswer(s.equation);
    for (const id of s.players) {
      if (id !== s.saboteur && choices[id]?.kind === "guess") s.guesses[id] = choices[id]!.value;
    }
    const guessers = s.players.filter((id) => id !== s.saboteur && s.guesses[id] !== null);
    const errors = guessers.map((id) => Math.abs(s.guesses[id]! - answer));
    const exactExists = errors.includes(0);
    const closest = errors.length ? Math.min(...errors) : Infinity;
    const farthest = errors.length ? Math.max(...errors) : Infinity;
    const points = mapPlayers(s.players, (id) => {
      if (id === s.saboteur || s.guesses[id] === null) return 0;
      const error = Math.abs(s.guesses[id]! - answer);
      if (error === 0) return 20;
      if (exactExists) return 0;
      if (error === closest) return 15;
      if (farthest === closest) return 15;
      return Math.max(0, Math.min(14, Math.round(15 * (farthest - error) / (farthest - closest))));
    });
    for (const id of guessers) s.scores[id] += points[id]!;
    const saboteurPoints = guessers.length
      ? Math.round(guessers.reduce((total, id) => total + points[id]!, 0) / guessers.length)
      : 0;
    points[s.saboteur] = saboteurPoints;
    s.scores[s.saboteur] += saboteurPoints;
    s.last = {
      round: s.round,
      originalEquation: { ...s.originalEquation },
      equation: { ...s.equation },
      answer, saboteur: s.saboteur, guesses: { ...s.guesses }, points,
    };
    s.round++;
    s.revealKind = "answers";
    if (s.round > 5) return;
    s.saboteur = pick(rng, s.players.filter((id) => id !== s.saboteur));
    s.equation = makeEquation(s.round, rng);
    s.originalEquation = { ...s.equation };
  },
  done: (s) => s.round > 5,
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.scores[id]!]),
    scores: s.scores,
    labels: mapPlayers(s.players, (id) => `${Math.round(s.scores[id]!)} points`),
  }),
  view: (s) => ({ round: Math.min(s.round, 5), phase: s.phase, saboteur: s.saboteur,
    equation: s.equation, scores: s.scores, guesses: s.guesses,
    last: s.last }),
};

// Letter Switch --------------------------------------------------------------

const LETTER_VOWELS = "AEIOU";
const LETTER_CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";
const CVCV_WORDS = LETTER_SWITCH_WORDS;
const CVCV_SET = new Set<string>(CVCV_WORDS);
const COMMON_CVCV_WORD_SET = new Set<string>(LETTER_SWITCH_COMMON_WORDS);
function isCvcv(word: string): boolean {
  return word.length === 4 &&
    LETTER_CONSONANTS.includes(word[0]!) && LETTER_VOWELS.includes(word[1]!) &&
    LETTER_CONSONANTS.includes(word[2]!) && LETTER_VOWELS.includes(word[3]!);
}
function oneLetterApart(a: string, b: string): boolean {
  return [...a].filter((letter, index) => letter !== b[index]).length === 1;
}
export function isValidLetterSwitchWord(word: string, baseWord: string, used: readonly string[] = []): boolean {
  const normalized = word.trim().toUpperCase();
  return CVCV_SET.has(normalized) &&
    !used.includes(normalized) &&
    isCvcv(normalized) &&
    oneLetterApart(normalized, baseWord);
}
function switchScore(word: string): number {
  return [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] ?? 1), 0);
}
function randomCvcvMutation(word: string, rng: Rng): string {
  const index = randInt(rng, 0, 3);
  const alphabet = index % 2 === 0 ? LETTER_CONSONANTS : LETTER_VOWELS;
  const letter = pick(rng, [...alphabet].filter((candidate) => candidate !== word[index]));
  return word.slice(0, index) + letter + word.slice(index + 1);
}
function randomInvalidCvcvMutation(word: string, rng: Rng): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = randomCvcvMutation(word, rng);
    if (!CVCV_SET.has(candidate)) return candidate;
  }
  return randomCvcvMutation(word, rng);
}
interface LetterSwitchState {
  players: PlayerId[];
  round: number;
  baseWords: Record<PlayerId, string>;
  scores: Record<PlayerId, number>;
  used: Record<PlayerId, string[]>;
  words: Record<PlayerId, string | null>;
  lastScores: Record<PlayerId, number>;
}
export const letterSwitch: RoundGame<LetterSwitchState, { word: string }> = {
  mode: "round",
  setup({ players, rng }) {
    const baseWord = pick(rng, LETTER_SWITCH_COMMON_WORDS);
    return { players, round: 1, baseWords: mapPlayers(players, () => baseWord), scores: mapPlayers(players, () => 0),
      used: mapPlayers(players, () => []), words: mapPlayers(players, () => null), lastScores: mapPlayers(players, () => 0) };
  },
  roundMs: () => 20_000,
  revealMs: 1_500,
  deciders: (s) => s.players,
  parse(s, id, raw) {
    if (!isRecord(raw) || typeof raw.word !== "string") return undefined;
    const word = raw.word.trim().toUpperCase();
    return /^[A-Z]{4}$/.test(word) && isCvcv(word) && oneLetterApart(word, s.baseWords[id]!) ? { word } : undefined;
  },
  fallback(s, id, rng) { return { word: randomCvcvMutation(s.baseWords[id]!, rng) }; },
  bot(s, id, rng) {
    const baseWord = s.baseWords[id]!;
    const options = CVCV_WORDS.filter((word) => oneLetterApart(word, baseWord) && !s.used[id]!.includes(word));
    if (nextFloat(rng) < 0.05) return { word: randomInvalidCvcvMutation(baseWord, rng) };
    if (options.length === 0) return { word: randomInvalidCvcvMutation(baseWord, rng) };
    const commonOptions = options.filter((word) => COMMON_CVCV_WORD_SET.has(word));
    const pool = commonOptions.length > 0 && nextFloat(rng) < 0.8 ? commonOptions : options;
    return { word: pick(rng, pool) };
  },
  resolve(s, choices, rng) {
    const freshValid = mapPlayers(s.players, (id) => {
      const word = choices[id]!.word;
      return isValidLetterSwitchWord(word, s.baseWords[id]!, s.used[id]!) ? word : "";
    });
    for (const id of s.players) {
      const word = choices[id]!.word;
      const eligible = freshValid[id]!;
      const points = eligible ? switchScore(eligible) : 0;
      s.scores[id] += points;
      s.lastScores[id] = points;
      s.words[id] = word;
      // Keep the player's attempted word as their next-round base even if it
      // wasn't in the dictionary; invalid attempts still become their word.
      s.baseWords[id] = word;
      s.used[id]!.push(word);
    }
    s.round++;
  },
  done: (s) => s.round > 5,
  result: (s) => ({ ranking: rankByKeys(s.players, (id) => [s.scores[id]!]), scores: s.scores,
    labels: mapPlayers(s.players, (id) => `${s.scores[id]} points`) }),
  view: (s, viewer) => ({ round: Math.min(s.round, 5), baseWord: viewer ? s.baseWords[viewer] : null, scores: s.scores,
    words: s.words, lastScores: s.lastScores, used: s.used }),
};

// Count The Dots -------------------------------------------------------------

interface CountDot { id: number; x: number; y: number }
interface CountDotsState {
  players: PlayerId[];
  bots: PlayerId[];
  dots: CountDot[];
  nextDotId: number;
  phase: "count" | "guess";
  guesses: Record<PlayerId, number | null>;
  guessAt: Record<PlayerId, number | null>;
  cooldownAt: Record<PlayerId, number>;
  botStyle: Record<PlayerId, number>;
  nextBotAt: Record<PlayerId, number>;
  startAt: number;
  countEndsAt: number;
  endAt: number;
  endedAt: number | null;
}
function dotPoint(rng: Rng): { x: number; y: number } {
  return { x: nextFloat(rng) * 0.94 + 0.03, y: nextFloat(rng) * 0.9 + 0.05 };
}
function makeDot(s: CountDotsState, rng: Rng): void {
  const point = dotPoint(rng);
  s.dots.push({ id: s.nextDotId++, ...point });
}
export const countTheDots: RealtimeGame<CountDotsState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const state: CountDotsState = {
      players, bots, dots: [], nextDotId: 0, phase: "count", guesses: mapPlayers(players, () => null),
      guessAt: mapPlayers(players, () => null),
      cooldownAt: mapPlayers(players, () => Number.NEGATIVE_INFINITY),
      botStyle: mapPlayers(bots, () => {
        const roll = nextFloat(rng);
        return roll < 0.5 ? 0 : roll < 0.85 ? 1 : roll < 0.95 ? 2 : 3;
      }),
      nextBotAt: mapPlayers(bots, () => Number.POSITIVE_INFINITY),
      startAt, countEndsAt: startAt + 30_000, endAt: startAt + 40_000, endedAt: null,
    };
    // Keep the selected bot sabotage profile and its first action schedule in sync.
    for (const id of bots) {
      const style = state.botStyle[id]!;
      state.nextBotAt[id] = style === 0 ? Number.POSITIVE_INFINITY :
        startAt + randInt(rng, style === 1 ? 5_000 : style === 2 ? 2_000 : 500,
          style === 1 ? 20_000 : style === 2 ? 5_000 : 1_000);
    }
    for (let i = randInt(rng, 10, 20); i > 0; i--) makeDot(state, rng);
    return state;
  },
  input(s, id, raw, now, rng) {
    if (s.endedAt !== null || !s.players.includes(id) || s.bots.includes(id) || !isRecord(raw)) return false;
    if (s.phase === "count") {
      if (now >= s.countEndsAt || now - s.cooldownAt[id]! < 500) return false;
      if (raw.kind === "add") makeDot(s, rng);
      else if (raw.kind === "remove" && isInt(raw.dotId, 0, Number.MAX_SAFE_INTEGER)) {
        const index = s.dots.findIndex((dot) => dot.id === raw.dotId);
        if (index < 0) return false;
        s.dots.splice(index, 1);
      } else return false;
      s.cooldownAt[id] = now;
      return true;
    }
    if (now >= s.endAt || s.guesses[id] !== null || raw.kind !== "guess" || !isInt(raw.count, 0, 999)) return false;
    s.guesses[id] = raw.count;
    s.guessAt[id] = now;
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.phase === "count" ? s.countEndsAt : s.endAt,
      ...(s.phase === "count" ? s.bots.map((id) => s.nextBotAt[id]!) : []));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    if (s.phase === "count") {
      for (const id of s.bots) {
        while (s.nextBotAt[id]! <= now && s.nextBotAt[id]! < s.countEndsAt) {
          const addChance = s.dots.length <= 10 ? 0.8 : s.dots.length > 30 ? 0.2 : 0.5;
          if (s.dots.length < 100 && nextFloat(rng) < addChance) makeDot(s, rng);
          else if (s.dots.length > 0) s.dots.splice(randInt(rng, 0, s.dots.length - 1), 1);
          const style = s.botStyle[id]!;
          const min = style === 1 ? 5_000 : style === 2 ? 2_000 : 500;
          const max = style === 1 ? 20_000 : style === 2 ? 5_000 : 1_000;
          s.nextBotAt[id] = s.nextBotAt[id]! + randInt(rng, min, max);
        }
      }
      if (now >= s.countEndsAt) {
        s.phase = "guess";
        for (const id of s.bots) {
          // A mix of near misses and deliberately rough estimates makes bots less predictable.
          const roll = nextFloat(rng);
          const error = roll < 0.35 ? randInt(rng, -1, 1)
            : roll < 0.75 ? randInt(rng, -4, 4)
              : randInt(rng, -10, 10);
          s.guesses[id] = Math.max(0, s.dots.length + error);
          s.guessAt[id] = s.countEndsAt + randInt(rng, 500, 8_000);
        }
      }
    }
    if (s.phase === "guess" && (now >= s.endAt || s.players.every((id) => s.guesses[id] !== null))) s.endedAt = now;
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    const actual = s.dots.length;
    return {
      ranking: rankByKeys(s.players, (id) => [s.guesses[id] === null ? 0 : 1,
        s.guesses[id] === null ? -Infinity : -Math.abs(s.guesses[id]! - actual),
        s.guessAt[id] === null ? -Infinity : -s.guessAt[id]!]),
      scores: mapPlayers(s.players, (id) => s.guesses[id] === null ? null : Math.abs(s.guesses[id]! - actual)),
      labels: mapPlayers(s.players, (id) => s.guesses[id] === null ? "no guess" :
        `guessed ${s.guesses[id]} (off by ${Math.abs(s.guesses[id]! - actual)})`),
    };
  },
  view: (s, viewer) => ({
    phase: s.phase, dots: s.phase === "count" ? s.dots : [], countEndsAt: s.countEndsAt,
    endAt: s.endAt, yourGuess: viewer ? s.guesses[viewer] : null,
    actualCount: s.endedAt !== null ? s.dots.length : null,
  }),
};

// Hangman --------------------------------------------------------------------

const HANGMAN_WORDS = [
  "able", "about", "above", "across", "after", "again", "agree", "alarm", "album", "alive",
  "along", "angel", "apple", "apron", "artist", "avoid", "baker", "beach", "begin", "below",
  "berry", "bible", "black", "blanket", "blossom", "branch", "bridge", "bright", "broken", "camera",
  "candle", "candy", "castle", "center", "chance", "change", "charge", "charm", "cheese", "cherry",
  "chicken", "circle", "city", "clever", "cloud", "coffee", "cold", "color", "comet", "cookie",
  "corner", "cotton", "cradle", "dance", "danger", "daughter", "decide", "dinner", "doctor", "dragon",
  "dream", "eagle", "early", "earth", "easy", "engine", "enough", "family", "famous", "feather",
  "field", "finish", "flower", "forest", "friend", "gentle", "glance", "golden", "grape", "ground",
  "guitar", "hammer", "handle", "happy", "harbor", "health", "heart", "honey", "honest", "horse",
  "island", "jacket", "jungle", "kitten", "ladder", "letter", "little", "lizard", "market", "memory",
  "middle", "minute", "monkey", "morning", "mother", "mountain", "music", "nature", "number", "orange",
  "paddle", "paper", "parent", "people", "pepper", "picture", "planet", "pocket", "poetry", "purple",
  "rabbit", "reason", "rocket", "school", "shadow", "silver", "simple", "sister", "smooth", "soccer",
  "spring", "station", "street", "summer", "teacher", "thunder", "tomato", "travel", "turtle", "window",
  "adventure", "afternoon", "apartment", "basketball", "beautiful", "blueberry", "breakfast", "butterfly",
  "celebrate", "chocolate", "important", "knowledge", "lighthouse", "newspaper", "pineapple", "spaceship",
  "strawberry", "television", "wonderful", "yesterday",
].map((word) => word.toUpperCase());
interface HangmanState {
  players: PlayerId[];
  bots: PlayerId[];
  secret: string;
  guesses: Record<PlayerId, string[]>;
  wrong: Record<PlayerId, string[]>;
  revealed: Record<PlayerId, (string | null)[]>;
  solvedAt: Record<PlayerId, number | null>;
  failedAt: Record<PlayerId, number | null>;
  nextBotAt: Record<PlayerId, number>;
  botMistakeChance: Record<PlayerId, number>;
  lastGuessAt: Record<PlayerId, number>;
  startAt: number;
  endAt: number;
  endedAt: number | null;
}
function hangmanSolved(s: HangmanState, id: PlayerId): boolean {
  return [...new Set(s.secret)].every((letter) => s.guesses[id]!.includes(letter));
}
function applyHangmanGuess(s: HangmanState, id: PlayerId, letter: string, at: number): void {
  if (s.solvedAt[id] !== null || s.failedAt[id] !== null || s.guesses[id]!.includes(letter) || s.wrong[id]!.includes(letter)) return;
  if (s.secret.includes(letter)) {
    s.guesses[id]!.push(letter);
    s.revealed[id] = [...s.secret].map((secretLetter) => s.guesses[id]!.includes(secretLetter) ? secretLetter : null);
  }
  else {
    s.wrong[id]!.push(letter);
    if (s.wrong[id]!.length >= 6) s.failedAt[id] = at;
  }
  if (hangmanSolved(s, id)) s.solvedAt[id] = at;
}
export const hangman: RealtimeGame<HangmanState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const secret = pick(rng, HANGMAN_WORDS);
    return {
      players, bots, secret,
      guesses: mapPlayers(players, () => []), wrong: mapPlayers(players, () => []),
      revealed: mapPlayers(players, () => Array.from({ length: secret.length }, () => null)),
      solvedAt: mapPlayers(players, () => null), failedAt: mapPlayers(players, () => null),
      nextBotAt: mapPlayers(bots, () => startAt + randInt(rng, 3_000, 8_000)),
      botMistakeChance: mapPlayers(bots, () => 0.15 + nextFloat(rng) * 0.35),
      lastGuessAt: mapPlayers(players, () => Number.NEGATIVE_INFINITY),
      startAt, endAt: startAt + 75_000, endedAt: null,
    };
  },
  input(s, id, raw, now, rng) {
    if (s.endedAt !== null || now >= s.endAt || !s.players.includes(id) || s.bots.includes(id) ||
        s.solvedAt[id] !== null || s.failedAt[id] !== null || now - s.lastGuessAt[id]! < 3_000 ||
        !isRecord(raw) || typeof raw.letter !== "string" || !/^[A-Za-z]$/.test(raw.letter)) return false;
    applyHangmanGuess(s, id, raw.letter.toUpperCase(), now);
    s.lastGuessAt[id] = now;
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.endAt, ...s.bots
      .filter((id) => s.solvedAt[id] === null && s.failedAt[id] === null)
      .map((id) => s.nextBotAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    for (const id of s.bots) {
      while (s.nextBotAt[id]! <= now && s.nextBotAt[id]! < s.endAt &&
          s.solvedAt[id] === null && s.failedAt[id] === null) {
        const options = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((letter) =>
          !s.guesses[id]!.includes(letter) && !s.wrong[id]!.includes(letter));
        // Favor letters common among words compatible with the bot's visible pattern.
        const candidates = HANGMAN_WORDS.filter((word) =>
          word.length === s.revealed[id]!.length &&
          [...word].every((letter, index) =>
            s.revealed[id]![index] === null || s.revealed[id]![index] === letter) &&
          [...word].every((letter) => !s.wrong[id]!.includes(letter)));
        const frequency = new Map<string, number>();
        for (const word of candidates) for (const letter of new Set(word)) {
          if (options.includes(letter)) frequency.set(letter, (frequency.get(letter) ?? 0) + 1);
        }
        const absentLetters = options.filter((letter) => !s.secret.includes(letter));
        const best = options.filter((letter) => (frequency.get(letter) ?? 0) === Math.max(0, ...options.map((candidate) => frequency.get(candidate) ?? 0)));
        // Bots usually make a sensible frequency guess, but sometimes risk a bad letter.
        const letter = absentLetters.length > 0 && nextFloat(rng) < s.botMistakeChance[id]!
          ? pick(rng, absentLetters)
          : pick(rng, best.length ? best : options);
        applyHangmanGuess(s, id, letter, s.nextBotAt[id]!);
        s.nextBotAt[id] = s.solvedAt[id] !== null || s.failedAt[id] !== null
          ? Number.POSITIVE_INFINITY
          : s.nextBotAt[id]! + randInt(rng, 2_500, 7_500);
      }
    }
    if (now >= s.endAt || s.players.every((id) => s.solvedAt[id] !== null || s.failedAt[id] !== null)) s.endedAt = now;
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    return {
      ranking: rankByKeys(s.players, (id) => [s.solvedAt[id] === null ? 0 : 1,
        s.solvedAt[id] === null ? 0 : -s.solvedAt[id]!]),
      scores: mapPlayers(s.players, (id) => s.solvedAt[id] === null ? null : s.solvedAt[id]! - s.startAt),
      labels: mapPlayers(s.players, (id) => s.solvedAt[id] === null ? "did not solve" :
        `solved in ${((s.solvedAt[id]! - s.startAt) / 1000).toFixed(1)}s`),
    };
  },
  view: (s, viewer) => ({
    wordLength: s.secret.length,
    pattern: viewer ? s.revealed[viewer] : [],
    guessed: viewer ? s.guesses[viewer] : [],
    wrong: viewer ? s.wrong[viewer] : [],
    lives: viewer ? Math.max(0, 6 - s.wrong[viewer]!.length) : 6,
    nextGuessAt: viewer ? s.lastGuessAt[viewer]! + 3_000 : 0,
    revealedWord: viewer && s.failedAt[viewer] !== null || s.endedAt !== null ? s.secret : null,
    solvedAt: s.solvedAt, failedAt: s.failedAt, endAt: s.endAt,
  }),
};

// Hide and Seek --------------------------------------------------------------

interface HideSpot { id: number; x: number; y: number }
interface HideSeekState {
  players: PlayerId[];
  bots: PlayerId[];
  seeker: PlayerId;
  hiders: PlayerId[];
  activeHiders: PlayerId[];
  spots: HideSpot[];
  hiddenSpots: Record<PlayerId, number | null>;
  botLastSpot: Record<PlayerId, number | null>;
  phase: "hide" | "seek";
  round: number;
  phaseEndsAt: number;
  foundHiders: PlayerId[];
  roundsSurvived: Record<PlayerId, number>;
  lastFound: PlayerId[];
  lastGuess: number | null;
  endedAt: number | null;
  finishAt: number | null;
}
function startHideSeekPhase(s: HideSeekState, at: number): void {
  s.hiddenSpots = Object.fromEntries(s.activeHiders.map((id) => [id, null]));
  s.phase = "hide";
  s.phaseEndsAt = at + 10_000;
}
function resolveHideChoices(s: HideSeekState, at: number): void {
  s.phase = "seek";
  s.phaseEndsAt = at + 7_000;
}
function resolveSeekChoice(s: HideSeekState, spotId: number, at: number): void {
  s.lastGuess = spotId;
  const found = s.activeHiders.filter((id) => s.hiddenSpots[id] === spotId);
  s.lastFound = found;
  s.spots = s.spots.filter((spot) => spot.id !== spotId);
  s.foundHiders.push(...found);
  s.activeHiders = s.activeHiders.filter((id) => !found.includes(id));
  for (const id of s.activeHiders) s.roundsSurvived[id] = (s.roundsSurvived[id] ?? 0) + 1;
  if (s.activeHiders.length === 0) {
    s.finishAt = at + 2_000;
    s.phaseEndsAt = s.finishAt;
    return;
  }
  if (s.spots.length <= 1) {
    s.endedAt = at;
    return;
  }
  s.round++;
  startHideSeekPhase(s, at);
}
export const hideAndSeek: RealtimeGame<HideSeekState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const shuffled = shuffle(rng, players);
    const seeker = pick(rng, shuffled);
    const hiders = shuffled.filter((id) => id !== seeker);
    const spots = Array.from({ length: Math.max(1, players.length - 1) }, (_, id) => {
      const angle = -Math.PI / 2 + id * 2 * Math.PI / Math.max(1, players.length - 1);
      return { id, x: 0.5 + Math.cos(angle) * 0.36, y: 0.5 + Math.sin(angle) * 0.36 };
    });
    const state: HideSeekState = {
      players, bots, seeker, hiders, activeHiders: [...hiders],
      spots, hiddenSpots: Object.fromEntries(hiders.map((id) => [id, null])),
      botLastSpot: Object.fromEntries(bots.map((id) => [id, null])),
      phase: "hide", round: 1, phaseEndsAt: startAt + 10_000,
      foundHiders: [], roundsSurvived: Object.fromEntries(hiders.map((id) => [id, 0])),
      lastFound: [], lastGuess: null, endedAt: null, finishAt: null,
    };
    if (hiders.length === 0) state.endedAt = startAt;
    return state;
  },
  input(s, id, raw, now, rng) {
    if (s.endedAt !== null || s.finishAt !== null || now >= s.phaseEndsAt || !isRecord(raw) ||
        !isInt(raw.spotId, 0, s.players.length + 1) || !s.spots.some((spot) => spot.id === raw.spotId)) return false;
    if (s.phase === "hide" && s.activeHiders.includes(id) &&
        !s.bots.includes(id) && s.hiddenSpots[id] === null) {
      s.hiddenSpots[id] = raw.spotId;
      // Bots choose as soon as the human hiders have finished so they don't
      // hold the phase open until its timeout.
      for (const bot of s.bots) {
        if (s.activeHiders.includes(bot) && s.hiddenSpots[bot] === null) {
          const previous = s.botLastSpot[bot];
          const shouldSwitch = previous !== null && nextFloat(rng) < 0.8;
          const options = shouldSwitch
            ? s.spots.filter((spot) => spot.id !== previous)
            : s.spots.filter((spot) => spot.id === previous);
          const choice = pick(rng, options.length ? options : s.spots).id;
          s.hiddenSpots[bot] = choice;
          s.botLastSpot[bot] = choice;
        }
      }
      if (s.activeHiders.every((hider) => s.hiddenSpots[hider] !== null)) resolveHideChoices(s, now);
      return true;
    }
    if (s.phase === "seek" && id === s.seeker) {
      resolveSeekChoice(s, raw.spotId, now);
      return true;
    }
    return false;
  },
  nextEventAt(s) {
    return s.endedAt === null ? s.finishAt ?? s.phaseEndsAt : null;
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    if (s.finishAt !== null) {
      if (now >= s.finishAt) s.endedAt = s.finishAt;
      return;
    }
    if (s.phase === "hide") {
      for (const id of s.activeHiders) {
        if (s.hiddenSpots[id] !== null) continue;
        const available = s.spots.filter((spot) => !Object.values(s.hiddenSpots).includes(spot.id));
        if (s.bots.includes(id) || now >= s.phaseEndsAt) {
          if (s.bots.includes(id)) {
            const previous = s.botLastSpot[id];
            const shouldSwitch = previous !== null && nextFloat(rng) < 0.8;
            const candidates = shouldSwitch
              ? s.spots.filter((spot) => spot.id !== previous)
              : s.spots.filter((spot) => spot.id === previous);
            const options = candidates.filter((spot) => available.some((open) => open.id === spot.id));
            const choice = pick(rng, options.length ? options : available.length ? available : s.spots).id;
            s.hiddenSpots[id] = choice;
            s.botLastSpot[id] = choice;
          } else {
            s.hiddenSpots[id] = pick(rng, available.length ? available : s.spots).id;
          }
        }
      }
      if (s.activeHiders.every((id) => s.hiddenSpots[id] !== null)) resolveHideChoices(s, now);
    }
    if (s.phase === "seek" && (now >= s.phaseEndsAt || s.bots.includes(s.seeker))) {
      resolveSeekChoice(s, pick(rng, s.spots).id, now);
    }
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    return {
      ranking: rankByKeys(s.players, (id) => [
        id === s.seeker ? (s.activeHiders.length === 0 ? 2 : 0) : 1,
        id === s.seeker ? (s.activeHiders.length === 0 ? 1 : 0) : s.roundsSurvived[id] ?? 0,
      ]),
      scores: mapPlayers(s.players, (id) => id === s.seeker ? (s.activeHiders.length === 0 ? 1_000 : 0) :
        s.roundsSurvived[id] ?? 0),
      labels: mapPlayers(s.players, (id) => id === s.seeker ? (s.activeHiders.length === 0 ? "found all hiders" : "missed the hiders") :
        s.foundHiders.includes(id) ? `found after ${s.roundsSurvived[id] ?? 0} rounds` :
          `hid for ${s.roundsSurvived[id] ?? 0} round${s.roundsSurvived[id] === 1 ? "" : "s"}`),
    };
  },
  view: (s, viewer) => ({
    seeker: s.seeker, hiders: s.activeHiders, foundHiders: s.foundHiders,
    phase: s.phase, round: s.round, spots: s.spots, ending: s.finishAt !== null,
    yourHiddenSpot: viewer ? s.hiddenSpots[viewer] : null,
    hiddenSpots: s.endedAt !== null ? s.hiddenSpots : undefined,
    lastFound: s.lastFound, lastGuess: s.lastGuess, phaseEndsAt: s.phaseEndsAt,
  }),
};

// Red Fight, Green Light ------------------------------------------------------

type LightPhase = "green" | "red";
type LightDirection = "up" | "down" | "left" | "right" | "up-left" | "up-right" | "down-left" | "down-right";
interface ArenaPoint { x: number; y: number }
interface LightBullet extends ArenaPoint { id: number; owner: PlayerId; dx: number; dy: number }
interface LightWall { x: number; y: number; width: number; height: number }
interface RedLightState {
  players: PlayerId[];
  bots: PlayerId[];
  positions: Record<PlayerId, ArenaPoint>;
  targets: Record<PlayerId, ArenaPoint>;
  botGoalY: Record<PlayerId, number>;
  walls: LightWall[];
  alive: PlayerId[];
  finishedAt: Record<PlayerId, number | null>;
  outAt: Record<PlayerId, number | null>;
  phase: LightPhase;
  phaseEndsAt: number;
  redStartedAt: number;
  bullets: LightBullet[];
  nextBulletId: number;
  nextTickAt: number;
  nextBotAt: Record<PlayerId, number>;
  nextBotShotAt: Record<PlayerId, number>;
  lastShotAt: Record<PlayerId, number>;
  shotThisRed: Record<PlayerId, boolean>;
  botFailRed: Record<PlayerId, boolean>;
  startAt: number;
  endAt: number;
  endedAt: number | null;
}
const LIGHT_VECTORS: Record<LightDirection, ArenaPoint> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  "up-left": { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }, "up-right": { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  "down-left": { x: -Math.SQRT1_2, y: Math.SQRT1_2 }, "down-right": { x: Math.SQRT1_2, y: Math.SQRT1_2 },
};
const LIGHT_KEYS: Record<string, LightDirection> = {
  w: "up", a: "left", s: "down", d: "right", q: "up-left", e: "up-right", z: "down-left", c: "down-right",
};
const LIGHT_LAYOUT_BASES: LightWall[][] = [
  [{ x: 0.24, y: 0.02, width: 0.025, height: 0.55 }, { x: 0.48, y: 0.43, width: 0.025, height: 0.55 }, { x: 0.72, y: 0.02, width: 0.025, height: 0.55 }],
  [{ x: 0.22, y: 0.42, width: 0.025, height: 0.56 }, { x: 0.46, y: 0.02, width: 0.025, height: 0.55 }, { x: 0.70, y: 0.42, width: 0.025, height: 0.56 }],
  [{ x: 0.25, y: 0.02, width: 0.025, height: 0.44 }, { x: 0.25, y: 0.62, width: 0.025, height: 0.36 }, { x: 0.51, y: 0.38, width: 0.025, height: 0.6 }, { x: 0.76, y: 0.02, width: 0.025, height: 0.48 }],
  [{ x: 0.23, y: 0.48, width: 0.025, height: 0.5 }, { x: 0.49, y: 0.02, width: 0.025, height: 0.46 }, { x: 0.49, y: 0.68, width: 0.025, height: 0.3 }, { x: 0.74, y: 0.44, width: 0.025, height: 0.54 }],
  [{ x: 0.27, y: 0.02, width: 0.025, height: 0.58 }, { x: 0.52, y: 0.4, width: 0.025, height: 0.58 }, { x: 0.77, y: 0.02, width: 0.025, height: 0.58 }],
  [{ x: 0.21, y: 0.02, width: 0.025, height: 0.48 }, { x: 0.44, y: 0.5, width: 0.025, height: 0.48 }, { x: 0.67, y: 0.02, width: 0.025, height: 0.48 }],
  [{ x: 0.24, y: 0.4, width: 0.025, height: 0.58 }, { x: 0.48, y: 0.02, width: 0.025, height: 0.54 }, { x: 0.73, y: 0.4, width: 0.025, height: 0.58 }],
  [{ x: 0.25, y: 0.02, width: 0.025, height: 0.48 }, { x: 0.25, y: 0.68, width: 0.025, height: 0.3 }, { x: 0.5, y: 0.34, width: 0.025, height: 0.64 }, { x: 0.75, y: 0.02, width: 0.025, height: 0.48 }],
  [{ x: 0.22, y: 0.46, width: 0.025, height: 0.52 }, { x: 0.47, y: 0.02, width: 0.025, height: 0.5 }, { x: 0.72, y: 0.46, width: 0.025, height: 0.52 }],
  [{ x: 0.26, y: 0.02, width: 0.025, height: 0.5 }, { x: 0.5, y: 0.48, width: 0.025, height: 0.5 }, { x: 0.74, y: 0.02, width: 0.025, height: 0.5 }],
  [{ x: 0.18, y: 0.02, width: 0.025, height: 0.4 }, { x: 0.38, y: 0.58, width: 0.025, height: 0.4 }, { x: 0.58, y: 0.02, width: 0.025, height: 0.4 }, { x: 0.78, y: 0.58, width: 0.025, height: 0.4 }],
  [{ x: 0.2, y: 0.55, width: 0.025, height: 0.43 }, { x: 0.4, y: 0.02, width: 0.025, height: 0.4 }, { x: 0.6, y: 0.55, width: 0.025, height: 0.43 }, { x: 0.8, y: 0.02, width: 0.025, height: 0.4 }],
  [{ x: 0.24, y: 0.02, width: 0.025, height: 0.34 }, { x: 0.24, y: 0.72, width: 0.025, height: 0.26 }, { x: 0.48, y: 0.32, width: 0.025, height: 0.66 }, { x: 0.72, y: 0.02, width: 0.025, height: 0.36 }],
  [{ x: 0.22, y: 0.58, width: 0.025, height: 0.4 }, { x: 0.44, y: 0.02, width: 0.025, height: 0.38 }, { x: 0.66, y: 0.58, width: 0.025, height: 0.4 }, { x: 0.84, y: 0.02, width: 0.025, height: 0.38 }],
  [{ x: 0.2, y: 0.02, width: 0.025, height: 0.62 }, { x: 0.43, y: 0.42, width: 0.025, height: 0.56 }, { x: 0.66, y: 0.02, width: 0.025, height: 0.62 }],
  [{ x: 0.25, y: 0.52, width: 0.025, height: 0.46 }, { x: 0.5, y: 0.02, width: 0.025, height: 0.42 }, { x: 0.75, y: 0.52, width: 0.025, height: 0.46 }],
  [{ x: 0.2, y: 0.02, width: 0.025, height: 0.48 }, { x: 0.4, y: 0.6, width: 0.025, height: 0.38 }, { x: 0.6, y: 0.02, width: 0.025, height: 0.48 }, { x: 0.8, y: 0.6, width: 0.025, height: 0.38 }],
  [{ x: 0.22, y: 0.48, width: 0.025, height: 0.5 }, { x: 0.46, y: 0.02, width: 0.025, height: 0.44 }, { x: 0.7, y: 0.48, width: 0.025, height: 0.5 }],
  [{ x: 0.24, y: 0.02, width: 0.025, height: 0.42 }, { x: 0.48, y: 0.58, width: 0.025, height: 0.4 }, { x: 0.72, y: 0.02, width: 0.025, height: 0.42 }],
];
const LIGHT_LAYOUTS: LightWall[][] = [
  ...LIGHT_LAYOUT_BASES,
  ...LIGHT_LAYOUT_BASES.map((layout) => layout.map((wall) => ({
    ...wall, x: 1 - wall.x - wall.width,
  }))),
  ...LIGHT_LAYOUT_BASES.map((layout) => layout.map((wall) => ({
    ...wall, y: 1 - wall.y - wall.height,
  }))),
];
const LIGHT_SPEED_PER_SECOND = 0.1;
function lightBlocked(point: ArenaPoint, walls: LightWall[], padding = 0): boolean {
  return walls.some((wall) => point.x >= wall.x - padding && point.x <= wall.x + wall.width + padding &&
    point.y >= wall.y - padding && point.y <= wall.y + wall.height + padding);
}
function lightSegmentHitsWall(from: ArenaPoint, to: ArenaPoint, walls: LightWall[]): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Math.max(1, Math.ceil(distance / 0.004));
  for (let index = 1; index <= samples; index++) {
    const ratio = index / samples;
    if (lightBlocked({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }, walls)) return true;
  }
  return false;
}
function lightStep(s: RedLightState, id: PlayerId): void {
  const current = s.positions[id]!;
  const target = s.targets[id]!;
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.001) return;
  const step = Math.min(LIGHT_SPEED_PER_SECOND * 0.1, distance);
  const candidates = [
    { x: current.x + dx / distance * step, y: current.y + dy / distance * step },
    { x: current.x + dx / distance * step, y: current.y },
    { x: current.x, y: current.y + dy / distance * step },
  ].filter((point) => Math.hypot(point.x - current.x, point.y - current.y) > 0.0001);
  for (const wall of s.walls) {
    const nextX = current.x + dx / distance * step;
    const nextY = current.y + dy / distance * step;
    if (nextX >= wall.x && nextX <= wall.x + wall.width &&
        nextY >= wall.y && nextY <= wall.y + wall.height) {
      const detourY = Math.abs(current.y - wall.y) < Math.abs(current.y - (wall.y + wall.height))
        ? wall.y - 0.025 : wall.y + wall.height + 0.025;
      candidates.push({ x: current.x, y: Math.max(0.02, Math.min(0.98,
        current.y + Math.sign(detourY - current.y) * step)) });
    }
  }
  const next = candidates.find((point) => !lightBlocked(point, s.walls));
  if (next) s.positions[id] = next;
}
function botLightTarget(s: RedLightState, id: PlayerId): ArenaPoint {
  const position = s.positions[id]!;
  const size = 50;
  const coord = (cell: number) => 0.02 + cell * 0.96 / (size - 1);
  const cellAt = (point: ArenaPoint) => ({
    x: Math.max(0, Math.min(size - 1, Math.round((point.x - 0.02) / 0.96 * (size - 1)))),
    y: Math.max(0, Math.min(size - 1, Math.round((point.y - 0.02) / 0.96 * (size - 1)))),
  });
  const start = cellAt(position);
  const startIndex = start.y * size + start.x;
  const goalX = size - 2;
  const goalY = Math.max(1, Math.min(size - 2, Math.round((s.botGoalY[id]! - 0.02) / 0.96 * (size - 1))));
  const goalIndex = goalY * size + goalX;
  const previous = new Int32Array(size * size).fill(-1);
  const queue = new Int32Array(size * size);
  let readIndex = 0;
  let writeIndex = 0;
  queue[writeIndex++] = startIndex;
  previous[startIndex] = startIndex;
  while (readIndex < writeIndex && previous[goalIndex] === -1) {
    const currentIndex = queue[readIndex++]!;
    const x = currentIndex % size;
    const y = Math.floor(currentIndex / size);
    for (const [nextX, nextY] of [[x + 1, y], [x, y - 1], [x, y + 1], [x - 1, y]]) {
      if (nextX < 0 || nextX >= size || nextY < 0 || nextY >= size) continue;
      const nextIndex = nextY * size + nextX;
      const nextPoint = { x: coord(nextX), y: coord(nextY) };
      if (previous[nextIndex] !== -1 ||
          // Give bots room to maneuver instead of scraping along the obstacle edges.
          lightBlocked(nextPoint, s.walls, 0.06)) continue;
      const crowdingBot = s.bots.find((other) => other !== id && s.alive.includes(other) &&
        Math.hypot(s.positions[other]!.x - position.x, s.positions[other]!.y - position.y) < 0.09);
      if (crowdingBot &&
          Math.hypot(s.positions[crowdingBot]!.x - nextPoint.x, s.positions[crowdingBot]!.y - nextPoint.y) <=
            Math.hypot(s.positions[crowdingBot]!.x - position.x, s.positions[crowdingBot]!.y - position.y)) continue;
      previous[nextIndex] = currentIndex;
      queue[writeIndex++] = nextIndex;
    }
  }
  if (previous[goalIndex] === -1 || startIndex === goalIndex) return { x: 0.97, y: position.y };
  let nextIndex = goalIndex;
  while (previous[nextIndex] !== startIndex && previous[nextIndex] !== nextIndex) nextIndex = previous[nextIndex]!;
  return { x: coord(nextIndex % size), y: coord(Math.floor(nextIndex / size)) };
}
function startLightPhase(s: RedLightState, phase: LightPhase, at: number, rng: Rng): void {
  s.phase = phase;
  s.phaseEndsAt = at + randInt(rng, phase === "red" ? 5_000 : 500, phase === "red" ? 10_000 : 10_000);
  if (phase === "red") {
    s.redStartedAt = at;
    s.shotThisRed = mapPlayers(s.players, () => false);
    s.botFailRed = mapPlayers(s.bots, () => nextFloat(rng) < 0.2);
    s.nextBotShotAt = mapPlayers(s.bots, () => at + randInt(rng, 1_000, 8_000));
    for (const id of s.players) s.targets[id] = { ...s.positions[id]! };
  }
}
function lightEliminate(s: RedLightState, id: PlayerId, at: number): void {
  s.alive = s.alive.filter((other) => other !== id);
  s.outAt[id] = at;
}
export const redLightGreenLight: RealtimeGame<RedLightState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const startOrder = shuffle(rng, players);
    const positions = mapPlayers(players, (id) => {
      return { x: 0.04, y: (startOrder.indexOf(id) + 0.5) / players.length };
    });
    const walls = pick(rng, LIGHT_LAYOUTS);
    const state: RedLightState = {
      players, bots, positions, targets: mapPlayers(players, (id) => positions[id]!), walls,
      botGoalY: Object.fromEntries(shuffle(rng, bots).map((id, index) => [
        // Dedicated finish lanes keep bots from bunching up at the goal.
        id, (index + 1) / (bots.length + 1),
      ])),
      alive: [...players],
      finishedAt: mapPlayers(players, () => null), outAt: mapPlayers(players, () => null),
      phase: "green", phaseEndsAt: startAt, redStartedAt: startAt,
      bullets: [], nextBulletId: 0, nextTickAt: startAt + 100,
      nextBotAt: mapPlayers(bots, () => startAt + 150),
      nextBotShotAt: mapPlayers(bots, () => Number.POSITIVE_INFINITY),
      lastShotAt: mapPlayers(players, () => Number.NEGATIVE_INFINITY),
      shotThisRed: mapPlayers(players, () => false),
      botFailRed: mapPlayers(bots, () => false),
      startAt, endAt: startAt + 60_000, endedAt: null,
    };
    startLightPhase(state, "green", startAt, rng);
    state.phaseEndsAt = startAt + randInt(rng, 3_000, 5_000);
    return state;
  },
  input(s, id, raw, now) {
    if (s.endedAt !== null || !s.alive.includes(id) || s.finishedAt[id] !== null ||
        s.bots.includes(id) || !isRecord(raw)) return false;
    if (raw.kind === "move" && typeof raw.x === "number" && Number.isFinite(raw.x) &&
        typeof raw.y === "number" && Number.isFinite(raw.y)) {
      const point = { x: Math.max(0.02, Math.min(0.98, raw.x)), y: Math.max(0.02, Math.min(0.98, raw.y)) };
      s.targets[id] = point;
      return true;
    }
    if (raw.kind === "shoot" && s.phase === "red" && typeof raw.direction === "string" &&
        raw.direction in LIGHT_VECTORS && !s.shotThisRed[id]!) {
      const vector = LIGHT_VECTORS[raw.direction as LightDirection];
      s.bullets.push({ id: s.nextBulletId++, owner: id, ...s.positions[id]!, dx: vector.x, dy: vector.y });
      s.lastShotAt[id] = now;
      s.shotThisRed[id] = true;
      return true;
    }
    return false;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.endAt, s.phaseEndsAt, s.nextTickAt,
      ...s.bots.filter((id) => s.alive.includes(id)).map((id) => s.nextBotAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    if (now >= s.phaseEndsAt) startLightPhase(s, s.phase === "green" ? "red" : "green", s.phaseEndsAt, rng);
    while (s.nextTickAt <= Math.min(now, s.endAt)) {
      const delta = 0.1;
      for (const id of s.bots) {
        while (s.nextBotAt[id]! <= s.nextTickAt && s.alive.includes(id)) {
          if (s.finishedAt[id] !== null) {
            s.nextBotAt[id] = s.nextTickAt + 150;
            continue;
          } else if (s.phase === "green") {
            s.targets[id] = botLightTarget(s, id);
          } else if (!s.shotThisRed[id]! && s.nextTickAt >= s.nextBotShotAt[id]!) {
            const behavior = nextFloat(rng);
            if (behavior < 0.25) {
              const target = s.alive.filter((other) => other !== id && s.finishedAt[other] === null)
                .sort((a, b) => Math.hypot(s.positions[a]!.x - s.positions[id]!.x, s.positions[a]!.y - s.positions[id]!.y) -
                  Math.hypot(s.positions[b]!.x - s.positions[id]!.x, s.positions[b]!.y - s.positions[id]!.y))[0];
              if (target) {
                const angle = Math.atan2(s.positions[target]!.y - s.positions[id]!.y, s.positions[target]!.x - s.positions[id]!.x);
                const directions = Object.keys(LIGHT_VECTORS) as LightDirection[];
                directions.sort((a, b) => Math.abs(Math.atan2(LIGHT_VECTORS[a].y, LIGHT_VECTORS[a].x) - angle) -
                  Math.abs(Math.atan2(LIGHT_VECTORS[b].y, LIGHT_VECTORS[b].x) - angle));
                const direction = directions[0]!;
                const vector = LIGHT_VECTORS[direction];
                s.bullets.push({ id: s.nextBulletId++, owner: id, ...s.positions[id]!, dx: vector.x, dy: vector.y });
                s.shotThisRed[id] = true;
              }
            } else if (behavior < 0.5) {
              const direction = pick(rng, Object.keys(LIGHT_VECTORS) as LightDirection[]);
              const vector = LIGHT_VECTORS[direction];
              s.bullets.push({ id: s.nextBulletId++, owner: id, ...s.positions[id]!, dx: vector.x, dy: vector.y });
              s.shotThisRed[id] = true;
            } else {
              s.shotThisRed[id] = true;
            }
          }
          s.nextBotAt[id] = s.nextTickAt + 150;
        }
      }
      if (s.phase === "red") {
        for (const id of s.alive) {
          if (s.finishedAt[id] !== null) continue;
          if (s.bots.includes(id)) {
            if (s.botFailRed[id] && s.nextTickAt >= s.redStartedAt + 1_000) lightEliminate(s, id, s.nextTickAt);
          } else if (s.finishedAt[id] !== null) continue;
          else if (s.nextTickAt < s.redStartedAt + 1_000) {
            lightStep(s, id);
            if (s.positions[id]!.x >= 0.96) s.finishedAt[id] = s.nextTickAt;
          } else if (Math.hypot(s.targets[id]!.x - s.positions[id]!.x, s.targets[id]!.y - s.positions[id]!.y) > 0.01) {
            lightEliminate(s, id, s.nextTickAt);
          }
        }
      } else {
        for (const id of s.alive) {
          if (s.finishedAt[id] !== null) continue;
          lightStep(s, id);
          if (s.positions[id]!.x >= 0.96) s.finishedAt[id] = s.nextTickAt;
        }
      }
      s.bullets = s.bullets.filter((bullet) => {
        const previous = { x: bullet.x, y: bullet.y };
        bullet.x += bullet.dx * delta * 0.7;
        bullet.y += bullet.dy * delta * 0.7;
        if (bullet.x < 0 || bullet.x > 1 || bullet.y < 0 || bullet.y > 1) return false;
        if (lightSegmentHitsWall(previous, bullet, s.walls)) return false;
        const target = s.alive.find((id) => id !== bullet.owner && s.finishedAt[id] === null &&
          Math.hypot(s.positions[id]!.x - bullet.x, s.positions[id]!.y - bullet.y) < 0.035);
        if (!target) return true;
        lightEliminate(s, target, s.nextTickAt);
        return false;
      });
      s.nextTickAt += 100;
    }
    if (now >= s.endAt) {
      for (const id of [...s.alive]) if (s.finishedAt[id] === null) lightEliminate(s, id, s.endAt);
      s.endedAt = s.endAt;
    } else if (s.alive.every((id) => s.finishedAt[id] !== null)) {
      s.endedAt = now;
    }
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    return {
      ranking: rankByKeys(s.players, (id) => [
        s.finishedAt[id] !== null ? 2 : s.alive.includes(id) ? 1 : 0,
        s.finishedAt[id] !== null ? -s.finishedAt[id]! : s.positions[id]!.x,
      ]),
      scores: mapPlayers(s.players, (id) => s.finishedAt[id] === null ? Math.round(s.positions[id]!.x * 100) :
        Math.round(1_000 - (s.finishedAt[id]! - s.startAt))),
      labels: mapPlayers(s.players, (id) => s.finishedAt[id] !== null ? "reached the finish" :
        s.endedAt !== null ? `eliminated · ${Math.round(s.positions[id]!.x * 100)}% to the finish` :
          s.alive.includes(id) ? `${Math.round(s.positions[id]!.x * 100)}% to the finish` : "hit or moved on red"),
    };
  },
  view: (s) => ({
    positions: s.positions, alive: s.alive, finishedAt: s.finishedAt, walls: s.walls,
    phase: s.phase,
    bullets: s.bullets, endAt: s.endAt,
  }),
};

// Conquest -------------------------------------------------------------------

interface ConquestArea extends ArenaPoint {
  id: number;
  value: number;
  owner: PlayerId | null;
  contested: boolean;
}
interface ConquestState {
  players: PlayerId[];
  bots: PlayerId[];
  positions: Record<PlayerId, ArenaPoint>;
  targets: Record<PlayerId, ArenaPoint>;
  areas: ConquestArea[];
  insideArea: Record<PlayerId, number | null>;
  enteredAt: Record<PlayerId, number>;
  scores: Record<PlayerId, number>;
  botTarget: Record<PlayerId, number | null>;
  botTargetAt: Record<PlayerId, number>;
  botGiveUpAt: Record<PlayerId, number>;
  nextBotAt: Record<PlayerId, number>;
  nextTickAt: number;
  lastScoreAt: number;
  endAt: number;
  endedAt: number | null;
}
const CONQUEST_RADIUS = 0.07;
const CONQUEST_PLAY_RADIUS = 0.46;
const CONQUEST_MOVE_PER_TICK = 0.018;
function conquestClampToBoard(point: ArenaPoint): ArenaPoint {
  const dx = point.x - 0.5;
  const dy = point.y - 0.5;
  const distance = Math.hypot(dx, dy);
  if (distance <= CONQUEST_PLAY_RADIUS) return point;
  const ratio = CONQUEST_PLAY_RADIUS / distance;
  return { x: 0.5 + dx * ratio, y: 0.5 + dy * ratio };
}
function conquestMoveToward(current: ArenaPoint, target: ArenaPoint): ArenaPoint {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return current;
  const step = Math.min(CONQUEST_MOVE_PER_TICK, distance);
  return conquestClampToBoard({
    x: current.x + dx / distance * step,
    y: current.y + dy / distance * step,
  });
}
function makeConquestAreas(rng: Rng): ConquestArea[] {
  const layout: ArenaPoint[] = [{ x: 0.5, y: 0.5 }];
  for (const [ringRadius, count] of [[0.18, 4], [0.32, 6], [0.45, 6]] as const) {
    const offset = nextFloat(rng) * 2 * Math.PI;
    for (let i = 0; i < count; i++) {
      const angle = offset + i * 2 * Math.PI / count;
      layout.push({ x: 0.5 + Math.cos(angle) * ringRadius, y: 0.5 + Math.sin(angle) * ringRadius });
    }
  }
  const values = shuffle(rng, [10, 5, 5, 5, 5, 3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1]);
  return layout.map((point, id) => ({ id, ...point, value: values[id]!, owner: null, contested: false }));
}
function areaAt(s: ConquestState, point: ArenaPoint): number | null {
  return s.areas.find((area) => Math.hypot(area.x - point.x, area.y - point.y) <= CONQUEST_RADIUS)?.id ?? null;
}
function conquestClaimProgress(s: ConquestState, areaId: number, now: number): number {
  const contenders = s.players.filter((id) => s.insideArea[id] === areaId);
  if (contenders.length !== 1) return 0;
  const claimant = contenders[0]!;
  if (s.areas[areaId]!.owner === claimant) return 0;
  return Math.min(1, Math.max(0, (now - s.enteredAt[claimant]!) / 3_000));
}
export const conquest: RealtimeGame<ConquestState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const positions = mapPlayers(players, (id) => {
      const angle = -Math.PI / 2 + players.indexOf(id) * 2 * Math.PI / players.length;
      return conquestClampToBoard({ x: 0.5 + Math.cos(angle) * 0.45, y: 0.5 + Math.sin(angle) * 0.45 });
    });
    return {
      players, bots, positions, targets: mapPlayers(players, (id) => positions[id]!), areas: makeConquestAreas(rng),
      insideArea: mapPlayers(players, () => null), enteredAt: mapPlayers(players, () => startAt),
      scores: mapPlayers(players, () => 0), botTarget: mapPlayers(bots, () => null),
      botTargetAt: mapPlayers(bots, () => startAt),
      botGiveUpAt: mapPlayers(bots, () => startAt),
      nextBotAt: mapPlayers(bots, () => startAt + 100), nextTickAt: startAt + 100,
      lastScoreAt: startAt, endAt: startAt + 60_000, endedAt: null,
    };
  },
  input(s, id, raw) {
    if (s.endedAt !== null || s.bots.includes(id) || !s.players.includes(id) ||
        !isRecord(raw) || raw.kind !== "cursor" || typeof raw.x !== "number" || !Number.isFinite(raw.x) ||
        typeof raw.y !== "number" || !Number.isFinite(raw.y)) return false;
    s.targets[id] = conquestClampToBoard({ x: raw.x, y: raw.y });
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return Math.min(s.endAt, s.nextTickAt, ...s.bots.map((id) => s.nextBotAt[id]!));
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    const cappedNow = Math.min(now, s.endAt);
    const elapsed = Math.max(0, cappedNow - s.lastScoreAt) / 1_000;
    for (const area of s.areas) if (area.owner !== null) s.scores[area.owner] += area.value * elapsed;
    s.lastScoreAt = cappedNow;
    while (s.nextTickAt <= now && s.nextTickAt < s.endAt) {
      for (const id of s.players) {
        if (!s.bots.includes(id)) {
          s.positions[id] = conquestMoveToward(s.positions[id]!, s.targets[id]!);
        }
        const current = areaAt(s, s.positions[id]!);
        if (current !== s.insideArea[id]) {
          s.insideArea[id] = current;
          s.enteredAt[id] = s.nextTickAt;
          if (s.bots.includes(id) && current !== null && current === s.botTarget[id]) {
            s.botGiveUpAt[id] = s.nextTickAt + randInt(rng, 4_000, 6_000);
          }
        }
      }
      for (const area of s.areas) {
        const contenders = s.players.filter((id) => s.insideArea[id] === area.id);
        const challengers = contenders.filter((id) => id !== area.owner);
        if (challengers.length >= 2) {
          if (!area.contested) {
            for (const id of challengers) s.enteredAt[id] = s.nextTickAt;
          }
          area.contested = true;
          area.owner = null;
          continue;
        }
        if (area.contested) {
          area.contested = false;
          for (const id of contenders) s.enteredAt[id] = s.nextTickAt;
        }
        if (area.owner !== null && contenders.includes(area.owner)) {
          continue;
        }
        const contender = challengers[0];
        if (contender && s.nextTickAt - s.enteredAt[contender]! >= 3_000) area.owner = contender;
      }
      for (const id of s.bots) {
        while (s.nextBotAt[id]! <= s.nextTickAt && s.nextBotAt[id]! < s.endAt) {
          let targetId = s.botTarget[id];
          if (targetId === null || s.areas[targetId]!.owner === id ||
              (s.nextTickAt >= s.botGiveUpAt[id]! &&
                (s.insideArea[id] !== targetId || s.areas[targetId]!.contested))) {
            const available = s.areas.filter((area) => area.owner !== id && area.id !== targetId);
            const options = available.length ? available : s.areas.filter((area) => area.owner !== id);
            targetId = options.length ? pick(rng, options).id : null;
            s.botTarget[id] = targetId;
            s.botTargetAt[id] = s.nextTickAt;
            s.botGiveUpAt[id] = targetId !== null && s.insideArea[id] === targetId
              ? s.nextTickAt + randInt(rng, 4_000, 6_000)
              : Number.POSITIVE_INFINITY;
          }
          if (targetId !== null) {
            const target = s.areas[targetId]!;
            const position = s.positions[id]!;
            s.positions[id] = conquestMoveToward(position, target);
          }
          s.nextBotAt[id] = s.nextTickAt + 100;
        }
      }
      s.nextTickAt += 100;
    }
    if (now >= s.endAt) s.endedAt = s.endAt;
  },
  done: (s) => s.endedAt !== null,
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.scores[id]!]),
    scores: s.scores,
    labels: mapPlayers(s.players, (id) => `${s.scores[id]!.toFixed(0)} points`),
  }),
  view: (s) => ({
    positions: s.positions, areas: s.areas.map(({ id, x, y, value, owner, contested }) =>
      ({ id, x, y, value, owner, contested })),
    scores: s.scores,
    claimProgress: Object.fromEntries(s.areas.map((area) => [area.id, conquestClaimProgress(s, area.id, s.nextTickAt)])),
    endAt: s.endAt,
  }),
};

// Snake ----------------------------------------------------------------------

type SnakeDirection = "up" | "down" | "left" | "right";
interface SnakeCell { x: number; y: number }
interface SnakeState {
  players: PlayerId[];
  bots: PlayerId[];
  width: number;
  height: number;
  snakes: Record<PlayerId, SnakeCell[]>;
  directions: Record<PlayerId, SnakeDirection>;
  turnLocked: Record<PlayerId, boolean>;
  alive: PlayerId[];
  outRound: Record<PlayerId, number | null>;
  apples: SnakeCell[];
  sectionsEaten: number;
  moveCount: number;
  moveAt: number;
  round: number;
  startAt: number;
  endAt: number;
  endedAt: number | null;
}
const SNAKE_WIDTH = 24;
const SNAKE_HEIGHT = 16;
const SNAKE_STEP_MS = 180;
const SNAKE_DELTAS: Record<SnakeDirection, SnakeCell> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
const SNAKE_OPPOSITE: Record<SnakeDirection, SnakeDirection> = {
  up: "down", down: "up", left: "right", right: "left",
};
function snakeCellAt(rng: Rng, snakes: Record<PlayerId, SnakeCell[]>, apples: SnakeCell[]): SnakeCell {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cell = { x: randInt(rng, 1, SNAKE_WIDTH - 2), y: randInt(rng, 1, SNAKE_HEIGHT - 2) };
    if (!apples.some((apple) => apple.x === cell.x && apple.y === cell.y) &&
        !Object.values(snakes).some((snake) => snake.some((part) => part.x === cell.x && part.y === cell.y))) return cell;
  }
  return { x: 1, y: 1 };
}
function chooseSnakeBotDirection(s: SnakeState, id: PlayerId, rng: Rng): SnakeDirection {
  const snake = s.snakes[id]!;
  const head = snake[0]!;
  const candidates = (["up", "down", "left", "right"] as SnakeDirection[])
    .filter((direction) => direction !== SNAKE_OPPOSITE[s.directions[id]!])
    .filter((direction) => {
      const delta = SNAKE_DELTAS[direction];
      const next = { x: head.x + delta.x, y: head.y + delta.y };
      if (next.x <= 0 || next.x >= s.width - 1 || next.y <= 0 || next.y >= s.height - 1) return false;
      return !s.alive.some((other) => s.snakes[other]!.some((part, index) =>
        part.x === next.x && part.y === next.y && !(other === id && index === snake.length - 1)));
    });
  if (candidates.length === 0) return s.directions[id]!;
  if (s.apples.length === 0) return pick(rng, candidates);
  const apple = s.apples.reduce((best, candidate) =>
    Math.abs(candidate.x - head.x) + Math.abs(candidate.y - head.y) <
      Math.abs(best.x - head.x) + Math.abs(best.y - head.y) ? candidate : best);
  return candidates.sort((a, b) => {
    const da = SNAKE_DELTAS[a]!;
    const db = SNAKE_DELTAS[b]!;
    const scoreA = Math.abs(apple.x - (head.x + da.x)) + Math.abs(apple.y - (head.y + da.y));
    const scoreB = Math.abs(apple.x - (head.x + db.x)) + Math.abs(apple.y - (head.y + db.y));
    return scoreA - scoreB;
  })[0]!;
}
export const snake: RealtimeGame<SnakeState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const startOrder = shuffle(rng, players);
    const snakes = mapPlayers(players, (id) => {
      const index = startOrder.indexOf(id);
      const leftSide = index % 2 === 0;
      const lane = Math.floor(index / 2);
      const lanesOnSide = Math.ceil((players.length - (leftSide ? 0 : 1)) / 2);
      const y = Math.round(2 + lane * (SNAKE_HEIGHT - 5) / Math.max(1, lanesOnSide - 1));
      const direction: SnakeDirection = leftSide ? "right" : "left";
      const head = { x: leftSide ? 3 : SNAKE_WIDTH - 4, y };
      const tailDelta = SNAKE_DELTAS[SNAKE_OPPOSITE[direction]]!;
      return [head,
        { x: head.x + tailDelta.x, y: head.y + tailDelta.y },
        { x: head.x + 2 * tailDelta.x, y: head.y + 2 * tailDelta.y }];
    });
    const state: SnakeState = {
      players, bots, width: SNAKE_WIDTH, height: SNAKE_HEIGHT, snakes,
      directions: mapPlayers(players, (id) => snakes[id]![0]!.x < SNAKE_WIDTH / 2 ? "right" : "left"),
      turnLocked: mapPlayers(players, () => false),
      alive: [...players], outRound: mapPlayers(players, () => null), apples: [], sectionsEaten: 0, moveCount: 0,
      moveAt: startAt + SNAKE_STEP_MS, round: 0, startAt, endAt: startAt + 120_000, endedAt: null,
    };
    state.apples.push(snakeCellAt(rng, state.snakes, state.apples));
    return state;
  },
  input(s, id, raw) {
    if (s.endedAt !== null || !s.alive.includes(id) || s.bots.includes(id) ||
        !isRecord(raw) || typeof raw.direction !== "string" ||
        !["up", "down", "left", "right"].includes(raw.direction)) return false;
    const direction = raw.direction as SnakeDirection;
    if (s.turnLocked[id] || SNAKE_OPPOSITE[s.directions[id]!] === direction) return false;
    if (direction !== s.directions[id]) s.turnLocked[id] = true;
    s.directions[id] = direction;
    return true;
  },
  nextEventAt(s) {
    return s.endedAt === null ? Math.min(s.moveAt, s.endAt) : null;
  },
  advance(s, now, rng) {
    if (s.endedAt !== null) return;
    while (s.moveAt <= now && s.moveAt <= s.endAt) {
      s.round++;
      s.moveCount++;
      for (const id of s.bots) if (s.alive.includes(id)) s.directions[id] = chooseSnakeBotDirection(s, id, rng);
      const nextHeads: Record<PlayerId, SnakeCell> = {};
      const grows = new Set<PlayerId>();
      for (const id of s.alive) {
        const head = s.snakes[id]![0]!;
        const delta = SNAKE_DELTAS[s.directions[id]!]!;
        nextHeads[id] = { x: head.x + delta.x, y: head.y + delta.y };
        if (s.apples.some((apple) => apple.x === nextHeads[id]!.x && apple.y === nextHeads[id]!.y)) grows.add(id);
      }
      const dead = new Set<PlayerId>();
      for (const id of s.alive) {
        const next = nextHeads[id]!;
        if (next.x <= 0 || next.x >= s.width - 1 || next.y <= 0 || next.y >= s.height - 1) {
          dead.add(id);
          continue;
        }
        for (const other of s.alive) {
          const snakeParts = s.snakes[other]!;
          for (let index = 0; index < snakeParts.length; index++) {
            const part = snakeParts[index]!;
            const tailMoves = !grows.has(other);
            if (other === id && tailMoves && index === snakeParts.length - 1) continue;
            if (part.x === next.x && part.y === next.y) dead.add(id);
          }
          if (other !== id && nextHeads[other]!.x === next.x && nextHeads[other]!.y === next.y) dead.add(id);
        }
      }
      for (const id of s.alive) {
        if (dead.has(id)) {
          s.outRound[id] = s.round;
          s.snakes[id] = [];
          continue;
        }
        const snake = s.snakes[id]!;
        snake.unshift(nextHeads[id]!);
        if (grows.has(id)) {
          s.apples = s.apples.filter((apple) => apple.x !== nextHeads[id]!.x || apple.y !== nextHeads[id]!.y);
          s.sectionsEaten++;
        } else snake.pop();
        s.turnLocked[id] = false;
      }
      if (dead.size > 0) {
        s.alive = s.alive.filter((id) => !dead.has(id));
        for (const id of s.alive) s.snakes[id]!.push({ ...s.snakes[id]![s.snakes[id]!.length - 1]! });
      }
      if (s.moveCount % 5 === 0 && s.apples.length < 3) s.apples.push(snakeCellAt(rng, s.snakes, s.apples));
      s.moveAt += SNAKE_STEP_MS;
      if (s.alive.length <= 1 || s.moveAt > s.endAt) {
        s.endedAt = s.moveAt;
        break;
      }
    }
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    return {
      ranking: rankByKeys(s.players, (id) => s.alive.includes(id)
        ? [1, s.snakes[id]!.length]
        : [0, s.outRound[id] ?? 0]),
      scores: mapPlayers(s.players, (id) => s.snakes[id]!.length),
      labels: mapPlayers(s.players, (id) => s.alive.includes(id)
        ? `${s.snakes[id]!.length} sections · survived` : `out in turn ${s.outRound[id]}`),
    };
  },
  view: (s) => ({
    width: s.width, height: s.height, snakes: s.snakes, alive: s.alive, apples: s.apples,
    directions: s.directions, endAt: s.endAt,
  }),
};
