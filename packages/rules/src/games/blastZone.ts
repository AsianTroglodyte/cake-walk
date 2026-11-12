import { nextFloat, pick } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, mapPlayers, rankByKeys, type RoundGame } from "./framework";
import { arenaSize, cellsWithin, chebyshev, isCell, neighbors4, neighbors8, spreadCells, square, type Grid } from "./grid";

export const BLAST_ZONE = {
  lives: 5,
  rounds: 8,
  /** How far from where you end up you can aim. */
  range: 3,
  direct: 2,
  splash: 1,
  /** Otherwise the bomb lands on one of the 4 cells beside the target. */
  onTargetChance: 0.5,
} as const;

export interface BlastChoice {
  /** Where you step: your cell or one of the 8 around it. */
  to: number;
  target: number;
}

export interface BlastZoneState {
  players: PlayerId[];
  size: number;
  round: number;
  rounds: number;
  positions: Record<PlayerId, number>;
  lives: Record<PlayerId, number>;
  outRound: Record<PlayerId, number | null>;
  last: {
    choices: Record<PlayerId, BlastChoice>;
    landed: Record<PlayerId, number>;
    lost: Record<PlayerId, number>;
  } | null;
}

export type BlastZoneView = BlastZoneState;

const grid = (s: BlastZoneState): Grid => square(s.size);
const alive = (s: BlastZoneState) => s.players.filter((id) => s.lives[id]! > 0);

export function blastSteps(s: BlastZoneState, id: PlayerId): number[] {
  const at = s.positions[id]!;
  return [at, ...neighbors8(grid(s), at)];
}

export function blastTargets(s: BlastZoneState, to: number): number[] {
  return cellsWithin(grid(s), to, BLAST_ZONE.range);
}

/** Cells in range that won't splash yourself even if the bomb scatters toward you. */
function safeTargets(s: BlastZoneState, to: number): number[] {
  const safe = blastTargets(s, to).filter((c) => chebyshev(grid(s), c, to) >= 3);
  return safe.length > 0 ? safe : blastTargets(s, to);
}

export function blastDamage(s: BlastZoneState, landed: readonly number[], at: number): number {
  let lost = 0;
  for (const cell of landed) {
    const d = chebyshev(grid(s), cell, at);
    if (d === 0) lost += BLAST_ZONE.direct;
    else if (d === 1) lost += BLAST_ZONE.splash;
  }
  return lost;
}

export const blastZone: RoundGame<BlastZoneState, BlastChoice> = {
  mode: "round",
  setup({ players, rng }) {
    const size = arenaSize(players.length);
    const starts = spreadCells(square(size), players.length, rng);
    return {
      players,
      size,
      round: 0,
      rounds: BLAST_ZONE.rounds,
      positions: mapPlayers(players, (id) => starts[players.indexOf(id)]!),
      lives: mapPlayers(players, () => BLAST_ZONE.lives),
      outRound: mapPlayers(players, () => null),
      last: null,
    };
  },
  roundMs: () => 9_000,
  revealMs: 3_000,
  deciders: alive,
  parse(s, id, raw) {
    if (!isRecord(raw) || !isCell(grid(s), raw.to) || !isCell(grid(s), raw.target)) return undefined;
    if (!blastSteps(s, id).includes(raw.to)) return undefined;
    if (chebyshev(grid(s), raw.to, raw.target) > BLAST_ZONE.range) return undefined;
    return { to: raw.to, target: raw.target };
  },
  fallback(s, id, rng) {
    const to = s.positions[id]!;
    return { to, target: pick(rng, safeTargets(s, to)) };
  },
  /** Moves away from the crowd half the time, and throws at where an opponent stands now. */
  bot(s, id, rng) {
    const g = grid(s);
    const others = alive(s).filter((p) => p !== id);
    const steps = blastSteps(s, id);
    const crowd = (c: number) => Math.min(...others.map((p) => chebyshev(g, c, s.positions[p]!)));
    const to =
      nextFloat(rng) < 0.5
        ? pick(
            rng,
            steps.filter((c) => crowd(c) === Math.max(...steps.map(crowd))),
          )
        : pick(rng, steps);
    const reachable = others
      .map((p) => s.positions[p]!)
      .filter((c) => {
        const d = chebyshev(g, c, to);
        return d >= 2 && d <= BLAST_ZONE.range;
      });
    return { to, target: reachable.length > 0 ? pick(rng, reachable) : pick(rng, safeTargets(s, to)) };
  },
  resolve(s, choices, rng) {
    s.round++;
    const g = grid(s);
    const throwers = s.players.filter((id) => choices[id]);
    for (const id of throwers) s.positions[id] = choices[id]!.to;

    const landed: Record<PlayerId, number> = {};
    for (const id of throwers) {
      const target = choices[id]!.target;
      landed[id] = nextFloat(rng) < BLAST_ZONE.onTargetChance ? target : pick(rng, neighbors4(g, target));
    }
    const cells = Object.values(landed);
    const lost: Record<PlayerId, number> = {};
    for (const id of alive(s)) {
      lost[id] = Math.min(s.lives[id]!, blastDamage(s, cells, s.positions[id]!));
      s.lives[id]! -= lost[id];
      if (s.lives[id] === 0) s.outRound[id] = s.round;
    }
    s.last = { choices, landed, lost };
  },
  done: (s) => s.round >= s.rounds || alive(s).length <= 1,
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.lives[id]!, s.outRound[id] ?? s.rounds + 1]),
    scores: { ...s.lives },
    labels: mapPlayers(s.players, (id) =>
      s.outRound[id] === null ? `${s.lives[id]} ${s.lives[id] === 1 ? "life" : "lives"} left` : `blown up in round ${s.outRound[id]}`,
    ),
  }),
  view: (s) => s,
};
