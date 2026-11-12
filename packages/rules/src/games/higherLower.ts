import { randInt } from "../rng";
import type { PlayerId } from "../types";
import { isInt, mapPlayers, rankByKeys, type RoundGame } from "./framework";

export const HIGHER_LOWER_MAX = 100;
export type Hint = "higher" | "lower" | "correct";

export interface HigherLowerState {
  players: PlayerId[];
  secret: number;
  round: number;
  rounds: number;
  guesses: Record<PlayerId, number[]>;
  /** The round a player found the number. */
  found: Record<PlayerId, number | null>;
}

export interface HigherLowerView {
  round: number;
  rounds: number;
  /** Only once the game is over. */
  secret: number | null;
  you: { guesses: number[]; hints: Hint[] } | null;
  found: Record<PlayerId, number | null>;
  /** Everyone's guesses, only once the game is over. */
  guesses: Record<PlayerId, number[]> | null;
}

const hint = (guess: number, secret: number): Hint => (guess === secret ? "correct" : guess < secret ? "higher" : "lower");
const done = (s: HigherLowerState) => s.round >= s.rounds || s.players.every((id) => s.found[id] !== null);
const lastGuess = (s: HigherLowerState, id: PlayerId) => s.guesses[id]!.at(-1);

export const higherLower: RoundGame<HigherLowerState, number> = {
  mode: "round",
  setup: ({ players, rng }) => ({
    players,
    secret: randInt(rng, 1, HIGHER_LOWER_MAX),
    round: 0,
    rounds: 8,
    guesses: mapPlayers(players, () => []),
    found: mapPlayers(players, () => null),
  }),
  roundMs: () => 6_000,
  revealMs: 1_500,
  deciders: (s) => s.players.filter((id) => s.found[id] === null),
  parse: (_s, _id, raw) => (isInt(raw, 1, HIGHER_LOWER_MAX) ? raw : undefined),
  fallback: (s, id) => lastGuess(s, id) ?? 50,
  bot(s, id, rng) {
    let low = 1;
    let high = HIGHER_LOWER_MAX;
    for (const g of s.guesses[id]!) {
      if (g < s.secret) low = Math.max(low, g + 1);
      else high = Math.min(high, g - 1);
    }
    const mid = (low + high) / 2;
    const spread = Math.floor((high - low) / 4);
    return Math.min(high, Math.max(low, Math.round(mid) + randInt(rng, -spread, spread)));
  },
  resolve(s, guesses) {
    s.round++;
    for (const [id, guess] of Object.entries(guesses)) {
      s.guesses[id]!.push(guess);
      if (guess === s.secret) s.found[id] = s.round;
    }
  },
  done,
  result(s) {
    const distance = (id: PlayerId) => Math.abs((lastGuess(s, id) ?? 0) - s.secret);
    return {
      ranking: rankByKeys(s.players, (id) => (s.found[id] !== null ? [1, -s.found[id]!] : [0, -distance(id)])),
      scores: mapPlayers(s.players, distance),
      labels: mapPlayers(s.players, (id) =>
        s.found[id] !== null ? `found it in round ${s.found[id]}` : `missed by ${distance(id)}`,
      ),
    };
  },
  view(s, viewer) {
    const over = done(s);
    return {
      round: s.round,
      rounds: s.rounds,
      secret: over ? s.secret : null,
      you:
        viewer && s.guesses[viewer]
          ? { guesses: s.guesses[viewer]!, hints: s.guesses[viewer]!.map((g) => hint(g, s.secret)) }
          : null,
      found: s.found,
      guesses: over ? s.guesses : null,
    } satisfies HigherLowerView;
  },
};
