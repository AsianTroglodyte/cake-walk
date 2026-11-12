import { rollDie } from "../rng";
import type { PlayerId } from "../types";
import { isInt, mapPlayers, rankByKeys, type RoundGame } from "./framework";

export const YAHTZEE_ROLLS = 3;

export interface YahtzeeScore {
  score: number;
  bonus: string | null;
}

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0);

/** The sum of the dice plus the best single bonus. */
export function scoreYahtzee(dice: number[]): YahtzeeScore {
  const total = sum(dice);
  const options: YahtzeeScore[] = [{ score: total, bonus: null }];
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);

  if (sizes[0] === 5) options.push({ score: total + 100, bonus: "Yahtzee" });
  for (const [value, count] of counts) {
    if (count >= 4) options.push({ score: total + value * 4, bonus: "4 of a kind" });
    if (count >= 3) options.push({ score: total + value * 3, bonus: "3 of a kind" });
  }
  if (sizes[0] === 3 && sizes[1] === 2) options.push({ score: total * 2, bonus: "full house" });

  const distinct = [...counts.keys()].sort((a, b) => a - b);
  const runs = [
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6],
  ];
  if (runs.some((run) => run.every((v) => counts.has(v)))) options.push({ score: total * 4, bonus: "large straight" });
  for (const start of [1, 2, 3]) {
    const run = [start, start + 1, start + 2, start + 3];
    if (run.every((v) => distinct.includes(v))) {
      options.push({ score: total + sum(run) * 3, bonus: "small straight" });
    }
  }
  return options.reduce((best, o) => (o.score > best.score ? o : best));
}

export interface YahtzeeState {
  players: PlayerId[];
  round: number;
  dice: Record<PlayerId, number[]>;
  rolls: Record<PlayerId, number>;
  stopped: Record<PlayerId, boolean>;
}

export type YahtzeeView = YahtzeeState;

/** Indexes of the dice to keep. Keeping all 5 ends your turn. */
export type YahtzeeKeep = number[];

const deciders = (s: YahtzeeState) => s.players.filter((id) => !s.stopped[id] && s.rolls[id]! < YAHTZEE_ROLLS);
const allDice = [0, 1, 2, 3, 4];

function botKeep(dice: number[]): YahtzeeKeep {
  const current = scoreYahtzee(dice);
  if (current.bonus === "Yahtzee" || current.bonus === "large straight" || current.bonus === "full house") return allDice;
  for (const start of [1, 2, 3]) {
    const run = [start, start + 1, start + 2, start + 3];
    if (run.every((v) => dice.includes(v))) return run.map((v) => dice.indexOf(v));
  }
  const counts = new Map<number, number>();
  for (const d of dice) counts.set(d, (counts.get(d) ?? 0) + 1);
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
  if (count >= 2) return allDice.filter((i) => dice[i] === value);
  return allDice.filter((i) => dice[i]! >= 5);
}

export const yahtzee: RoundGame<YahtzeeState, YahtzeeKeep> = {
  mode: "round",
  setup: ({ players, rng }) => ({
    players,
    round: 0,
    dice: mapPlayers(players, () => allDice.map(() => rollDie(rng, 6))),
    rolls: mapPlayers(players, () => 1),
    stopped: mapPlayers(players, () => false),
  }),
  roundMs: () => 12_000,
  revealMs: 1_500,
  deciders,
  parse(_s, _id, raw) {
    if (!Array.isArray(raw) || !raw.every((i) => isInt(i, 0, 4))) return undefined;
    const keep = [...new Set(raw as number[])];
    return keep.length === raw.length ? keep : undefined;
  },
  fallback: () => allDice,
  bot: (s, id) => botKeep(s.dice[id]!),
  resolve(s, keeps, rng) {
    s.round++;
    for (const [id, keep] of Object.entries(keeps)) {
      if (keep.length === 5) {
        s.stopped[id] = true;
        continue;
      }
      s.dice[id] = s.dice[id]!.map((d, i) => (keep.includes(i) ? d : rollDie(rng, 6)));
      s.rolls[id]!++;
    }
  },
  done: (s) => deciders(s).length === 0,
  result(s) {
    const score = (id: PlayerId) => scoreYahtzee(s.dice[id]!);
    return {
      ranking: rankByKeys(s.players, (id) => [score(id).score]),
      scores: mapPlayers(s.players, (id) => score(id).score),
      labels: mapPlayers(s.players, (id) => {
        const { score: points, bonus } = score(id);
        return `${points} pts: ${s.dice[id]!.join(" ")}${bonus ? `, ${bonus}` : ""}`;
      }),
    };
  },
  view: (s) => s,
};
