import { pick } from "../rng";
import type { PlayerId } from "../types";
import { isInt, mapPlayers, rankByKeys, type RoundGame } from "./framework";

export interface FourCornersState {
  players: PlayerId[];
  round: number;
  rounds: number;
  /** Corners still standing, numbered 0 to 3. */
  corners: number[];
  /** The round a player went out in; null while they're still in. */
  outRound: Record<PlayerId, number | null>;
  last: { picks: Record<PlayerId, number>; chosen: number } | null;
}

export type FourCornersView = FourCornersState;

const alive = (s: FourCornersState) => s.players.filter((id) => s.outRound[id] === null);

export const fourCorners: RoundGame<FourCornersState, number> = {
  mode: "round",
  setup: ({ players }) => ({
    players,
    round: 0,
    rounds: 3,
    corners: [0, 1, 2, 3],
    outRound: mapPlayers(players, () => null),
    last: null,
  }),
  roundMs: () => 8_000,
  revealMs: 3_000,
  deciders: alive,
  parse: (s, _id, raw) => (isInt(raw, 0, 3) && s.corners.includes(raw) ? raw : undefined),
  fallback: (s, _id, rng) => pick(rng, s.corners),
  bot: (s, _id, rng) => pick(rng, s.corners),
  resolve(s, picks, rng) {
    s.round++;
    const chosen = pick(rng, s.corners);
    for (const [id, corner] of Object.entries(picks)) if (corner === chosen) s.outRound[id] = s.round;
    s.corners = s.corners.filter((c) => c !== chosen);
    s.last = { picks, chosen };
  },
  done: (s) => s.round >= s.rounds || alive(s).length === 0,
  result(s) {
    const survived = (id: PlayerId) => (s.outRound[id] ?? s.rounds + 1) - 1;
    return {
      ranking: rankByKeys(s.players, (id) => [survived(id)]),
      scores: mapPlayers(s.players, survived),
      labels: mapPlayers(s.players, (id) => (s.outRound[id] === null ? "survived" : `out in round ${s.outRound[id]}`)),
    };
  },
  view: (s) => s,
};
