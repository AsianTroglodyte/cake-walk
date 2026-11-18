import { nextFloat, pick, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, rankByKeys, type RoundGame } from "./framework";
import { SINGLE_WORD_COMMON, SINGLE_WORD_DICTIONARY } from "./singleWordDictionary";

export const LETTER_VALUES: Record<string, number> = {
  E: 1, T: 1, A: 1, O: 1, N: 1, R: 1, I: 1, S: 1, H: 1, D: 1,
  L: 2, F: 2, C: 2, M: 2, U: 2, G: 2, Y: 4, P: 4, W: 6, B: 6,
  V: 8, K: 8, J: 10, X: 10, Z: 15, Q: 15,
};
const dictionary = new Set(SINGLE_WORD_DICTIONARY.map((word) => word.toUpperCase()));
const commonWords = new Set(SINGLE_WORD_COMMON.map((word) => word.toUpperCase()));
const vulgarWords = new Set([
  "BITCH", "BOOBS", "COCKS", "CRAPS", "CUNTS", "DICKS", "FANNY", "FUCKS",
  "PENIS", "PRICK", "PUSSY", "SHITS", "SLAGS", "TWATS", "TWERK", "WANKS", "WHORE",
]);
const wordValue = (word: string) => [...word].reduce((sum, letter) => sum + LETTER_VALUES[letter]!, 0);
const scoredWords = SINGLE_WORD_DICTIONARY.map((word) => word.toUpperCase())
  .filter((word) => !vulgarWords.has(word))
  .map((word) => ({ word, value: wordValue(word) }));
const commonScoredWords = scoredWords.filter(({ word }) => commonWords.has(word));
export function isValidSingleWord(word: string): boolean {
  const normalized = word.toUpperCase();
  return /^[A-Z]{5}$/.test(normalized) && (dictionary.has(normalized) || vulgarWords.has(normalized));
}
export interface SingleWordState {
  players: PlayerId[];
  round: number;
  scores: Record<PlayerId, number>;
  words: Record<PlayerId, string[]>;
  lastScores: Record<PlayerId, number>;
  sharedThreshold: number;
}
export interface SingleWordChoice { word: string }

export const singleWord: RoundGame<SingleWordState, SingleWordChoice> = {
  mode: "round",
  setup({ players }) {
    return {
      players, round: 0,
      scores: Object.fromEntries(players.map((id) => [id, 0])),
      words: Object.fromEntries(players.map((id) => [id, []])),
      lastScores: Object.fromEntries(players.map((id) => [id, 0])),
      // One player is the minimum; each group of three lobby slots raises the threshold by one.
      sharedThreshold: Math.max(2, Math.ceil(players.length / 3)),
    };
  },
  roundMs: () => 20_000,
  revealMs: 1_500,
  deciders: (s) => s.players,
  parse(_s, _id, raw) {
    if (!isRecord(raw) || typeof raw.word !== "string") return undefined;
    const word = raw.word.trim().toUpperCase();
    return isValidSingleWord(word) ? { word } : undefined;
  },
  fallback() { return { word: "APPLE" }; },
  bot(_s, _id, rng: Rng) {
    // Mostly choose recognizable words, with a light point-value bias instead of always maximizing.
    const pool = nextFloat(rng) < 0.12 ? scoredWords : commonScoredWords;
    const totalWeight = pool.reduce((sum, entry) => sum + 1 + entry.value, 0);
    let roll = nextFloat(rng) * totalWeight;
    for (const entry of pool) {
      roll -= 1 + entry.value;
      if (roll < 0) return { word: entry.word };
    }
    return { word: pick(rng, pool).word };
  },
  resolve(s, choices) {
    const words = Object.fromEntries(s.players.map((id) => [id, choices[id]!.word]));
    const usage = new Map<string, number>();
    for (const id of s.players) {
      for (const letter of new Set(words[id]!)) usage.set(letter, (usage.get(letter) ?? 0) + 1);
    }
    for (const id of s.players) {
      const word = words[id]!;
      const points = [...word].reduce((sum, letter) =>
        sum + ((usage.get(letter) ?? 0) >= s.sharedThreshold ? 0 : LETTER_VALUES[letter]!), 0);
      s.scores[id] = s.scores[id]! + points;
      s.lastScores[id] = points;
      s.words[id]!.push(word);
    }
    s.round++;
  },
  done: (s) => s.round >= 3,
  result(s) {
    return { ranking: rankByKeys(s.players, (id) => [s.scores[id]!]), scores: s.scores, labels: Object.fromEntries(s.players.map((id) => [id, `${s.scores[id]} points`])) };
  },
  view(s) {
    return { round: s.round, scores: s.scores, words: s.words, lastScores: s.lastScores, sharedThreshold: s.sharedThreshold };
  },
};
