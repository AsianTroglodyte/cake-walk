import { nextFloat, randInt } from "../rng";
import type { PlayerId } from "../types";
import { isInt, isRecord, mapPlayers, oneOf, rankByKeys, type RoundGame } from "./framework";

export type HeadsTailsCall = "pass" | "heads" | "tails";
export type HeadsTailsChoice = { call: "pass" } | { call: "heads" | "tails"; wager: number };

export interface HeadsTailsState {
  players: PlayerId[];
  round: number;
  rounds: number;
  points: Record<PlayerId, number>;
  status: Record<PlayerId, "betting" | "passed" | "out">;
  betOnce: Record<PlayerId, boolean>;
  last: { flip: "heads" | "tails"; calls: Record<PlayerId, HeadsTailsChoice>; gained: Record<PlayerId, number> } | null;
}

export type HeadsTailsView = HeadsTailsState;

export const headsTails: RoundGame<HeadsTailsState, HeadsTailsChoice> = {
  mode: "round",
  setup: ({ players }) => ({
    players,
    round: 0,
    rounds: 5,
    points: mapPlayers(players, () => 10),
    status: mapPlayers(players, () => "betting" as const),
    betOnce: mapPlayers(players, () => false),
    last: null,
  }),
  roundMs: () => 8_000,
  revealMs: 2_500,
  deciders: (s) => s.players.filter((id) => s.status[id] === "betting"),
  parse(s, id, raw) {
    if (!s.players.includes(id) || s.status[id] !== "betting" || !isRecord(raw)) return undefined;
    if (raw.call === "pass") return { call: "pass" };
    const call = oneOf(raw.call, ["heads", "tails"] as const);
    return call && isInt(raw.wager, 1, s.points[id]!) ? { call, wager: raw.wager } : undefined;
  },
  fallback: () => ({ call: "pass" }),
  bot(s, id, rng) {
    const passChance = Math.min(0.85, 0.1 + s.points[id]! / 100);
    const finalChanceToBet = s.round >= s.rounds - 1 && !s.betOnce[id];
    if (!finalChanceToBet && nextFloat(rng) < passChance) return { call: "pass" };
    return { call: nextFloat(rng) < 0.5 ? "heads" : "tails", wager: randInt(rng, 1, s.points[id]!) };
  },
  resolve(s, calls, rng) {
    const flip = nextFloat(rng) < 0.5 ? "heads" : "tails";
    const gained = mapPlayers(s.players, () => 0);
    for (const [id, choice] of Object.entries(calls)) {
      if (choice.call === "pass") s.status[id] = "passed";
      else {
        s.betOnce[id] = true;
        gained[id] = choice.call === flip ? choice.wager : -choice.wager;
        s.points[id]! += gained[id]!;
        if (s.points[id] === 0) s.status[id] = "out";
      }
    }
    for (const id of s.players) if (s.status[id] === "passed") s.status[id] = "betting";
    s.last = { flip, calls, gained };
    s.round++;
  },
  done: (s) => s.round >= s.rounds || !s.players.some((id) => s.status[id] === "betting"),
  result: (s) => ({
    allLast: s.players.every((id) => s.points[id] === 0),
    ranking: rankByKeys(s.players, (id) => [s.points[id]!]),
    scores: { ...s.points },
    labels: mapPlayers(s.players, (id) => `${s.points[id]} pts`),
  }),
  view: (s) => s,
};
