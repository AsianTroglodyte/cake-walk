import { rollDie, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isInt, mapPlayers, rankByKeys, type RoundGame } from "./framework";

export const SHUT_BOX_TILES = 12;

export interface ShutBoxState {
  players: PlayerId[];
  round: number;
  maxRounds: number;
  open: Record<PlayerId, number[]>;
  /** The roll to match this round; null once a player is done. */
  roll: Record<PlayerId, [number, number] | null>;
  /** Tiles each player flipped last round. */
  last: Record<PlayerId, number[]> | null;
}

export type ShutBoxView = ShutBoxState;

/** Every set of open tiles that adds up to the target. */
export function tileSets(open: readonly number[], target: number): number[][] {
  const sets: number[][] = [];
  const walk = (start: number, left: number, chosen: number[]) => {
    if (left === 0) sets.push([...chosen]);
    for (let i = start; i < open.length; i++) {
      if (open[i]! > left) continue;
      chosen.push(open[i]!);
      walk(i + 1, left - open[i]!, chosen);
      chosen.pop();
    }
  };
  walk(0, target, []);
  return sets;
}

/** Fewest tiles, then the highest tiles: closes the big numbers while they still fit. */
function bestSet(open: number[], target: number): number[] {
  const sets = tileSets(open, target);
  sets.sort((a, b) => a.length - b.length || Math.max(...b) - Math.max(...a));
  return sets[0] ?? [];
}

const total = (roll: [number, number]) => roll[0] + roll[1];
const deciders = (s: ShutBoxState) => s.players.filter((id) => s.roll[id] !== null);

function rollFor(s: ShutBoxState, id: PlayerId, rng: Rng): void {
  const roll: [number, number] = [rollDie(rng, 6), rollDie(rng, 6)];
  s.roll[id] = s.open[id]!.length > 0 && tileSets(s.open[id]!, total(roll)).length > 0 ? roll : null;
}

export const shutBox: RoundGame<ShutBoxState, number[]> = {
  mode: "round",
  setup({ players, rng }) {
    const s: ShutBoxState = {
      players,
      round: 0,
      maxRounds: 12,
      open: mapPlayers(players, () => Array.from({ length: SHUT_BOX_TILES }, (_, i) => i + 1)),
      roll: mapPlayers(players, () => null),
      last: null,
    };
    for (const id of players) rollFor(s, id, rng);
    return s;
  },
  roundMs: () => 6_000,
  revealMs: 1_000,
  deciders,
  parse(s, id, raw) {
    const roll = s.roll[id];
    if (!roll || !Array.isArray(raw) || !raw.every((t) => isInt(t, 1, SHUT_BOX_TILES))) return undefined;
    const tiles = [...new Set(raw as number[])];
    const valid =
      tiles.length === raw.length &&
      tiles.every((t) => s.open[id]!.includes(t)) &&
      tiles.reduce((a, b) => a + b, 0) === total(roll);
    return valid ? tiles : undefined;
  },
  fallback: (s, id) => bestSet(s.open[id]!, total(s.roll[id]!)),
  bot: (s, id) => bestSet(s.open[id]!, total(s.roll[id]!)),
  resolve(s, picks, rng) {
    s.round++;
    for (const [id, tiles] of Object.entries(picks)) {
      s.open[id] = s.open[id]!.filter((t) => !tiles.includes(t));
      rollFor(s, id, rng);
    }
    s.last = picks;
  },
  done: (s) => s.round >= s.maxRounds || deciders(s).length === 0,
  result(s) {
    const left = (id: PlayerId) => s.open[id]!.reduce((a, b) => a + b, 0);
    return {
      ranking: rankByKeys(s.players, (id) => [-left(id)]),
      scores: mapPlayers(s.players, left),
      labels: mapPlayers(s.players, (id) => (left(id) === 0 ? "cleared every tile!" : `${left(id)} left open`)),
    };
  },
  view: (s) => s,
};
