import { nextFloat, pick } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, mapPlayers, rankByKeys, type RoundGame } from "./framework";

export type LaserAction = { kind: "attack"; target: PlayerId } | { kind: "defend" } | { kind: "refrain" };

export interface LaserFightState {
  players: PlayerId[];
  round: number;
  rounds: number;
  lives: Record<PlayerId, number>;
  defends: Record<PlayerId, number>;
  refrainedLast: Record<PlayerId, boolean>;
  outRound: Record<PlayerId, number | null>;
  last: { actions: Record<PlayerId, LaserAction>; lost: Record<PlayerId, number> } | null;
}

export type LaserFightView = LaserFightState;

const alive = (s: LaserFightState) => s.players.filter((id) => s.lives[id]! > 0);

export const laserFight: RoundGame<LaserFightState, LaserAction> = {
  mode: "round",
  setup: ({ players }) => ({
    players,
    round: 0,
    rounds: 10,
    lives: mapPlayers(players, () => 3),
    defends: mapPlayers(players, () => 3),
    refrainedLast: mapPlayers(players, () => false),
    outRound: mapPlayers(players, () => null),
    last: null,
  }),
  roundMs: () => 7_000,
  revealMs: 2_000,
  deciders: alive,
  parse(s, id, raw) {
    if (!isRecord(raw)) return undefined;
    if (raw.kind === "defend") return s.defends[id]! > 0 ? { kind: "defend" } : undefined;
    if (raw.kind === "refrain") return s.refrainedLast[id] ? undefined : { kind: "refrain" };
    if (raw.kind === "attack" && typeof raw.target === "string" && raw.target !== id && s.lives[raw.target]! > 0) {
      return { kind: "attack", target: raw.target };
    }
    return undefined;
  },
  fallback(s, id, rng) {
    if (!s.refrainedLast[id]) return { kind: "refrain" };
    return { kind: "attack", target: pick(rng, alive(s).filter((p) => p !== id)) };
  },
  bot(s, id, rng) {
    if (s.defends[id]! > 0 && nextFloat(rng) < 0.2) return { kind: "defend" };
    if (!s.refrainedLast[id] && nextFloat(rng) < 0.1) return { kind: "refrain" };
    const others = alive(s).filter((p) => p !== id);
    const most = Math.max(...others.map((p) => s.lives[p]!));
    const pool = nextFloat(rng) < 0.5 ? others.filter((p) => s.lives[p] === most) : others;
    return { kind: "attack", target: pick(rng, pool) };
  },
  resolve(s, actions) {
    s.round++;
    const lost = mapPlayers(Object.keys(actions), () => 0);
    for (const [id, action] of Object.entries(actions)) {
      if (action.kind === "defend") s.defends[id]!--;
      s.refrainedLast[id] = action.kind === "refrain";
      if (action.kind !== "attack") continue;
      const hit = actions[action.target]?.kind === "defend" ? id : action.target;
      lost[hit]!++;
    }
    for (const [id, n] of Object.entries(lost)) {
      if (n === 0) continue;
      s.lives[id] = Math.max(0, s.lives[id]! - n);
      if (s.lives[id] === 0) s.outRound[id] = s.round;
    }
    s.last = { actions, lost };
  },
  done: (s) => s.round >= s.rounds || alive(s).length <= 1,
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.lives[id]!, s.outRound[id] ?? s.rounds + 1]),
    scores: { ...s.lives },
    labels: mapPlayers(s.players, (id) =>
      s.outRound[id] === null ? `${s.lives[id]} ${s.lives[id] === 1 ? "life" : "lives"} left` : `out in round ${s.outRound[id]}`,
    ),
  }),
  view: (s) => s,
};
