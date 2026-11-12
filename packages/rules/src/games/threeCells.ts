import { pick } from "../rng";
import type { PlayerId } from "../types";
import { mapPlayers, oneOf, rankByKeys, type RoundGame } from "./framework";

export type Cell = "A" | "B" | "C";
export const CELLS: readonly Cell[] = ["A", "B", "C"];

export interface ThreeCellsState {
  players: PlayerId[];
  round: number;
  rounds: number;
  points: Record<PlayerId, number>;
  last: { picks: Record<PlayerId, Cell>; fallen: Cell[]; gained: Record<PlayerId, number> } | null;
}

export type ThreeCellsView = ThreeCellsState;

export const threeCells: RoundGame<ThreeCellsState, Cell> = {
  mode: "round",
  setup: ({ players }) => ({ players, round: 0, rounds: 5, points: mapPlayers(players, () => 0), last: null }),
  roundMs: () => 8_000,
  revealMs: 3_000,
  deciders: (s) => s.players,
  parse: (_s, _id, raw) => oneOf(raw, CELLS),
  fallback: (_s, _id, rng) => pick(rng, CELLS),
  bot: (_s, _id, rng) => pick(rng, CELLS),
  resolve(s, picks) {
    const counts = mapPlayers(CELLS, (c) => s.players.filter((id) => picks[id] === c).length);
    const most = Math.max(...CELLS.map((c) => counts[c]!));
    const fallen = CELLS.filter((c) => counts[c] === most);
    const gained = mapPlayers(s.players, (id) => (fallen.includes(picks[id]!) ? 0 : most - counts[picks[id]!]!));
    for (const id of s.players) s.points[id]! += gained[id]!;
    s.last = { picks, fallen, gained };
    s.round++;
  },
  done: (s) => s.round >= s.rounds,
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.points[id]!]),
    scores: { ...s.points },
    labels: mapPlayers(s.players, (id) => `${s.points[id]} pts`),
  }),
  view: (s) => s,
};
