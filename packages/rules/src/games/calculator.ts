import { pick, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isInt, isRecord, mapPlayers, rankByKeys, type RoundGame } from "./framework";

const MAX_TURNS = 50;

export interface CalculatorState {
  players: PlayerId[];
  turnOrder: PlayerId[];
  values: Record<PlayerId, number[]>;
  turn: number;
  turns: number;
  current: PlayerId;
  eliminated: PlayerId[];
}
export interface CalculatorChoice { source: number; target: PlayerId; slot: number }

function active(s: CalculatorState, id: PlayerId): boolean {
  return s.values[id]!.some((value) => value > 0);
}
function nextPlayer(s: CalculatorState, from: PlayerId): PlayerId {
  const start = s.turnOrder.indexOf(from);
  for (let offset = 1; offset <= s.turnOrder.length; offset++) {
    const id = s.turnOrder[(start + offset) % s.turnOrder.length]!;
    if (active(s, id)) return id;
  }
  return from;
}
function parseChoice(s: CalculatorState, id: PlayerId, raw: unknown): CalculatorChoice | undefined {
  if (!isRecord(raw) || typeof raw.target !== "string" || raw.target === id ||
      !s.players.includes(raw.target) || !active(s, raw.target) ||
      !isInt(raw.source, 0, s.values[id]!.length - 1) ||
      !isInt(raw.slot, 0, s.values[raw.target]!.length - 1) ||
      s.values[id]![raw.source] === 0 || s.values[raw.target]![raw.slot] === 0) return undefined;
  return { source: raw.source, target: raw.target, slot: raw.slot };
}

export const calculator: RoundGame<CalculatorState, CalculatorChoice> = {
  mode: "round",
  setup({ players, rng }) {
    const count = 2;
    const turnOrder = shuffle(rng, players);
    return { players, turnOrder, values: mapPlayers(players, () => Array<number>(count).fill(1)), turn: 0, turns: 0, current: turnOrder[0]!, eliminated: [] };
  },
  roundMs: () => 10_000,
  revealMs: 900,
  deciders: (s) => active(s, s.current) ? [s.current] : [],
  parse: parseChoice,
  fallback(s, id, rng) {
    const sources = s.values[id]!.map((value, slot) => value > 0 ? slot : -1).filter((slot) => slot >= 0);
    const targets = s.players.filter((target) => target !== id && active(s, target));
    const target = pick(rng, targets);
    const slots = s.values[target]!.map((value, slot) => value > 0 ? slot : -1).filter((slot) => slot >= 0);
    return { source: pick(rng, sources), target, slot: pick(rng, slots) };
  },
  bot(s, id, rng) {
    // Occasionally play unpredictably instead of always taking the strongest move.
    if (randInt(rng, 1, 100) <= 50) return this.fallback(s, id, rng);
    const sources = s.values[id]!.flatMap((value, source) => value > 0 ? [{ source, value }] : []);
    const opponents = s.players.filter((target) => target !== id && active(s, target));
    const moves = opponents.flatMap((target) => {
      const remainingValues = s.values[target]!.filter((value) => value > 0).length;
      return s.values[target]!.flatMap((targetValue, slot) => targetValue > 0
        ? sources.map(({ source, value }) => ({
            source, target, slot, sum: targetValue + value, remainingValues,
          }))
        : []);
    });
    const best = (candidates: typeof moves, score: (move: typeof moves[number]) => number) => {
      const highScore = Math.max(...candidates.map(score));
      return pick(rng, candidates.filter((move) => score(move) === highScore));
    };

    // Take an immediate knockout whenever possible, favoring the final value of a vulnerable player.
    const eliminations = moves.filter((move) => move.sum === 5);
    if (eliminations.length > 0) {
      const choice = best(eliminations, (move) => (move.remainingValues === 1 ? 1_000 : 0) - s.values[id]![move.source]!);
      return { source: choice.source, target: choice.target, slot: choice.slot };
    }

    // Otherwise move a vulnerable opponent's value as close to five as possible without wrapping.
    const safeMoves = moves.filter((move) => move.sum < 5);
    if (safeMoves.length > 0) {
      const choice = best(safeMoves, (move) => -move.remainingValues * 10 + move.sum);
      return { source: choice.source, target: choice.target, slot: choice.slot };
    }

    // If every move wraps, choose a weak opponent and leave a high value that is easier to finish off.
    const choice = best(moves, (move) => -move.remainingValues * 10 + (move.sum - 5));
    return { source: choice.source, target: choice.target, slot: choice.slot };
  },
  resolve(s, choices) {
    const id = s.current;
    const choice = choices[id]!;
    const amount = s.values[id]![choice.source]!;
    const sum = s.values[choice.target]![choice.slot]! + amount;
    s.values[choice.target]![choice.slot] = sum === 5 ? 0 : sum > 5 ? sum - 5 : sum;
    if (!active(s, choice.target) && !s.eliminated.includes(choice.target)) s.eliminated.push(choice.target);
    s.turns++;
    s.current = nextPlayer(s, id);
  },
  // The turn cap is a safety net for games that cycle indefinitely; remaining players tie for the win.
  done: (s) => s.players.filter((id) => active(s, id)).length <= 1 || s.turns >= MAX_TURNS,
  result(s) {
    const ranking = rankByKeys(s.players, (id) => {
      if (active(s, id)) {
        const remainingCount = s.values[id]!.filter((value) => value > 0).length;
        const remainingTotal = s.values[id]!.reduce((sum, value) => sum + value, 0);
        return [1, remainingCount, -remainingTotal];
      }
      return [0, 0, s.eliminated.indexOf(id) * -1];
    });
    return {
      ranking,
      scores: Object.fromEntries(s.players.map((id) => [id, s.values[id]!.filter(Boolean).length])),
      labels: Object.fromEntries(s.players.map((id) => [id, s.values[id]!.map((v) => v || "×").join(" + ")])),
    };
  },
  view(s, viewer) {
    return {
      values: s.values,
      turnOrder: s.turnOrder,
      current: s.current,
      turn: s.turns + 1,
      eliminated: s.eliminated,
      yours: viewer ? s.values[viewer] : null,
    };
  },
};
