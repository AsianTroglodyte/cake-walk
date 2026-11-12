import { pick, randInt, rollDie, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isInt, isRecord, mapPlayers, rankUnderTarget, type RoundGame } from "./framework";

export const GROUP_DICE_SIDES = [4, 6, 8, 10, 12, 20] as const;
export const GROUP_DICE_MAX = 6;

/** How many of each die, keyed by sides. */
export type DicePick = Record<number, number>;

export interface GroupDiceState {
  players: PlayerId[];
  target: number;
  rolls: Record<PlayerId, { sides: number; value: number }[]> | null;
}

export type GroupDiceView = GroupDiceState;

const average = (sides: number) => (sides + 1) / 2;

export function dicePickAverage(dice: DicePick): number {
  return Object.entries(dice).reduce((sum, [sides, count]) => sum + count * average(Number(sides)), 0);
}

export function rollTotal(rolls: { value: number }[]): number {
  return rolls.reduce((sum, r) => sum + r.value, 0);
}

/** The single kind and number of dice whose average total is closest to the target without going over. */
function safestPick(target: number): DicePick {
  let best: DicePick = { 4: 1 };
  let bestAverage = 0;
  for (const sides of GROUP_DICE_SIDES) {
    for (let count = 1; count <= GROUP_DICE_MAX; count++) {
      const avg = count * average(sides);
      if (avg <= target && avg > bestAverage) {
        best = { [sides]: count };
        bestAverage = avg;
      }
    }
  }
  return best;
}

function botPick(target: number, rng: Rng): DicePick {
  const aim = target * (randInt(rng, 65, 95) / 100);
  const dice: DicePick = {};
  let total = 0;
  for (let n = 0; n < GROUP_DICE_MAX; n++) {
    const fits = GROUP_DICE_SIDES.filter((sides) => total + average(sides) <= aim);
    if (fits.length === 0) break;
    const sides = pick(rng, fits);
    dice[sides] = (dice[sides] ?? 0) + 1;
    total += average(sides);
  }
  return total === 0 ? { 4: 1 } : dice;
}

export const groupDice: RoundGame<GroupDiceState, DicePick> = {
  mode: "round",
  setup: ({ players, rng }) => ({ players, target: randInt(rng, 20, 60), rolls: null }),
  roundMs: () => 15_000,
  revealMs: 4_000,
  deciders: (s) => (s.rolls ? [] : s.players),
  parse(_s, _id, raw) {
    if (!isRecord(raw)) return undefined;
    const dice: DicePick = {};
    let count = 0;
    for (const [key, value] of Object.entries(raw)) {
      const sides = Number(key);
      if (!GROUP_DICE_SIDES.includes(sides as never) || !isInt(value, 0, GROUP_DICE_MAX)) return undefined;
      if (value > 0) dice[sides] = value;
      count += value;
    }
    return count >= 1 && count <= GROUP_DICE_MAX ? dice : undefined;
  },
  fallback: (s) => safestPick(s.target),
  bot: (s, _id, rng) => botPick(s.target, rng),
  resolve(s, picks, rng) {
    s.rolls = mapPlayers(s.players, (id) =>
      Object.entries(picks[id]!)
        .sort(([a], [b]) => Number(a) - Number(b))
        .flatMap(([sides, count]) =>
          Array.from({ length: count }, () => ({ sides: Number(sides), value: rollDie(rng, Number(sides)) })),
        ),
    );
  },
  done: (s) => s.rolls !== null,
  result(s) {
    const total = (id: PlayerId) => rollTotal(s.rolls![id]!);
    return {
      ranking: rankUnderTarget(s.players, total, s.target),
      scores: mapPlayers(s.players, total),
      labels: mapPlayers(s.players, (id) => `rolled ${total(id)}${total(id) > s.target ? ", bust" : ""}`),
    };
  },
  view: (s) => s,
};
