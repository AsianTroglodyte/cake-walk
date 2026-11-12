import { pick } from "../rng";
import type { PlayerId } from "../types";
import { mapPlayers, oneOf, rankByKeys, type RoundGame } from "./framework";

export type RpsPick = "rock" | "paper" | "scissors";
export const RPS_PICKS: readonly RpsPick[] = ["rock", "paper", "scissors"];
const BEATS: Record<RpsPick, RpsPick> = { rock: "scissors", paper: "rock", scissors: "paper" };

export interface RpsState {
  players: PlayerId[];
  round: number;
  rounds: number;
  points: Record<PlayerId, number>;
  last: { picks: Record<PlayerId, RpsPick>; gained: Record<PlayerId, number> } | null;
}

export type RpsView = RpsState;

export const rps: RoundGame<RpsState, RpsPick> = {
  mode: "round",
  setup: ({ players }) => ({ players, round: 0, rounds: 5, points: mapPlayers(players, () => 0), last: null }),
  roundMs: () => 8_000,
  revealMs: 2_500,
  deciders: (s) => s.players,
  parse: (_s, _id, raw) => oneOf(raw, RPS_PICKS),
  fallback: (_s, _id, rng) => pick(rng, RPS_PICKS),
  bot: (_s, _id, rng) => pick(rng, RPS_PICKS),
  resolve(s, picks) {
    const counts = mapPlayers(RPS_PICKS, (p) => s.players.filter((id) => picks[id] === p).length);
    const gained = mapPlayers(s.players, (id) => counts[BEATS[picks[id]!]]!);
    for (const id of s.players) s.points[id]! += gained[id]!;
    s.last = { picks, gained };
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
