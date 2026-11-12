import { randInt } from "../rng";
import type { PlayerId } from "../types";
import { isInt, mapPlayers, rankByKeys, type RoundGame } from "./framework";

export interface StairwayState {
  players: PlayerId[];
  round: number;
  rounds: number;
  /** Choices are 1 to this. More than half the player count, so spread-out picks always leave someone alone. */
  maxStep: number;
  top: number;
  heights: Record<PlayerId, number>;
  last: { picks: Record<PlayerId, number>; moved: PlayerId[] } | null;
}

export type StairwayView = StairwayState;

export function stairwayMaxStep(playerCount: number): number {
  return Math.floor(playerCount / 2) + 1;
}

export const stairway: RoundGame<StairwayState, number> = {
  mode: "round",
  setup({ players }) {
    const maxStep = stairwayMaxStep(players.length);
    return {
      players,
      round: 0,
      rounds: 10,
      maxStep,
      top: 3 * maxStep + 1,
      heights: mapPlayers(players, () => 0),
      last: null,
    };
  },
  roundMs: () => 6_000,
  revealMs: 1_500,
  deciders: (s) => s.players,
  parse: (s, _id, raw) => (isInt(raw, 1, s.maxStep) ? raw : undefined),
  fallback: (s, _id, rng) => randInt(rng, 1, s.maxStep),
  bot: (s, _id, rng) => randInt(rng, 1, s.maxStep),
  resolve(s, picks) {
    const counts = new Map<number, number>();
    for (const id of s.players) counts.set(picks[id]!, (counts.get(picks[id]!) ?? 0) + 1);
    const moved = s.players.filter((id) => counts.get(picks[id]!) === 1);
    for (const id of moved) s.heights[id]! += picks[id]!;
    s.last = { picks, moved };
    s.round++;
  },
  done: (s) => s.round >= s.rounds || s.players.some((id) => s.heights[id]! >= s.top),
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.heights[id]!]),
    scores: { ...s.heights },
    labels: mapPlayers(s.players, (id) => `${s.heights[id]}/${s.top} stairs`),
  }),
  view: (s) => s,
};
