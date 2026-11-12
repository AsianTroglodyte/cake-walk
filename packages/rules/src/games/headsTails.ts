import { nextFloat } from "../rng";
import type { PlayerId } from "../types";
import { mapPlayers, oneOf, rankByKeys, type RoundGame } from "./framework";

export type HeadsTailsCall = "stop" | "heads" | "tails";
const CALLS: readonly HeadsTailsCall[] = ["stop", "heads", "tails"];

export interface HeadsTailsState {
  players: PlayerId[];
  round: number;
  rounds: number;
  points: Record<PlayerId, number>;
  status: Record<PlayerId, "betting" | "stopped" | "out">;
  last: { flip: "heads" | "tails"; calls: Record<PlayerId, HeadsTailsCall> } | null;
}

export type HeadsTailsView = HeadsTailsState;

export const headsTails: RoundGame<HeadsTailsState, HeadsTailsCall> = {
  mode: "round",
  setup: ({ players }) => ({
    players,
    round: 0,
    rounds: 5,
    points: mapPlayers(players, () => 10),
    status: mapPlayers(players, () => "betting" as const),
    last: null,
  }),
  roundMs: () => 8_000,
  revealMs: 2_500,
  deciders: (s) => s.players.filter((id) => s.status[id] === "betting"),
  parse: (_s, _id, raw) => oneOf(raw, CALLS),
  fallback: () => "stop",
  bot(s, id, rng) {
    const stopChance = Math.min(0.85, 0.1 + s.points[id]! / 100);
    if (nextFloat(rng) < stopChance) return "stop";
    return nextFloat(rng) < 0.5 ? "heads" : "tails";
  },
  resolve(s, calls, rng) {
    const flip = nextFloat(rng) < 0.5 ? "heads" : "tails";
    for (const [id, call] of Object.entries(calls)) {
      if (call === "stop") s.status[id] = "stopped";
      else if (call === flip) s.points[id]! *= 2;
      else {
        s.points[id] = 0;
        s.status[id] = "out";
      }
    }
    s.last = { flip, calls };
    s.round++;
  },
  done: (s) => s.round >= s.rounds || !s.players.some((id) => s.status[id] === "betting"),
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.points[id]!]),
    scores: { ...s.points },
    labels: mapPlayers(s.players, (id) => `${s.points[id]} pts`),
  }),
  view: (s) => s,
};
