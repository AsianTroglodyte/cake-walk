import { pick, shuffle } from "../rng";
import type { PlayerId } from "../types";
import { isRecord, mapPlayers, rankByKeys, type RoundGame } from "./framework";
import { cellCount, chebyshev, isCell, neighbors8, platesSize, spreadCells, square, type Grid } from "./grid";

export interface PlatesChoice {
  /** One of the plates around you. You must move. Sharing is allowed. */
  to: number;
  remove: number;
}

export interface PlatesState {
  players: PlayerId[];
  size: number;
  round: number;
  plates: boolean[];
  positions: Record<PlayerId, number>;
  outRound: Record<PlayerId, number | null>;
  /** Neighboring plates left when you fell; used to break ties within the same round. */
  freeWhenOut: Record<PlayerId, number>;
  last: {
    choices: Record<PlayerId, PlatesChoice>;
    /** Where each player's removal actually went: their pick, or a random empty plate if theirs was taken. */
    removed: Record<PlayerId, number | null>;
    crumbled: number[];
  } | null;
}

export type PlatesView = PlatesState;

const grid = (s: PlatesState): Grid => square(s.size);
const alive = (s: PlatesState) => s.players.filter((id) => s.outRound[id] === null);

function occupied(s: PlatesState): Set<number> {
  return new Set(alive(s).map((id) => s.positions[id]!));
}

/** Neighboring plates that still exist. Players may share a plate. */
export function plateSteps(s: PlatesState, id: PlayerId): number[] {
  return neighbors8(grid(s), s.positions[id]!).filter((c) => s.plates[c]);
}

function emptyPlates(s: PlatesState): number[] {
  const taken = occupied(s);
  return s.plates.flatMap((present, c) => (present && !taken.has(c) ? [c] : []));
}

const freeAround = (s: PlatesState, cell: number) => neighbors8(grid(s), cell).filter((c) => s.plates[c]).length;

export const plates: RoundGame<PlatesState, PlatesChoice> = {
  mode: "round",
  setup({ players, rng }) {
    const size = platesSize(players.length);
    const starts = spreadCells(square(size), players.length, rng);
    return {
      players,
      size,
      round: 0,
      plates: Array.from({ length: cellCount(square(size)) }, () => true),
      positions: mapPlayers(players, (id) => starts[players.indexOf(id)]!),
      outRound: mapPlayers(players, () => null),
      freeWhenOut: mapPlayers(players, () => 0),
      last: null,
    };
  },
  roundMs: () => 9_000,
  revealMs: 2_500,
  deciders: alive,
  parse(s, id, raw) {
    if (!isRecord(raw) || !isCell(grid(s), raw.to) || !isCell(grid(s), raw.remove)) return undefined;
    if (!plateSteps(s, id).includes(raw.to) || !s.plates[raw.remove]) return undefined;
    return { to: raw.to, remove: raw.remove };
  },
  fallback(s, id, rng) {
    const to = pick(rng, plateSteps(s, id));
    const empty = emptyPlates(s).filter((c) => c !== to);
    return { to, remove: empty.length > 0 ? pick(rng, empty) : to };
  },
  /** Steps to the plate with the most free plates around it, and removes one next to whoever is most boxed in. */
  bot(s, id, rng) {
    const g = grid(s);
    const steps = shuffle(rng, plateSteps(s, id));
    const to = steps.reduce((best, c) => (freeAround(s, c) > freeAround(s, best) ? c : best));
    const empty = emptyPlates(s).filter((c) => c !== to);
    const opponents = alive(s)
      .filter((p) => p !== id)
      .sort((a, b) => freeAround(s, s.positions[a]!) - freeAround(s, s.positions[b]!));
    for (const p of opponents) {
      const near = empty.filter((c) => chebyshev(g, c, s.positions[p]!) === 1 && chebyshev(g, c, to) > 1);
      if (near.length > 0) return { to, remove: pick(rng, near) };
    }
    const far = empty.filter((c) => chebyshev(g, c, to) > 1);
    return { to, remove: far.length > 0 ? pick(rng, far) : empty.length > 0 ? pick(rng, empty) : to };
  },
  resolve(s, choices, rng) {
    s.round++;
    const movers = s.players.filter((id) => choices[id]);
    const left: number[] = [];
    for (const id of movers) {
      left.push(s.positions[id]!);
      s.positions[id] = choices[id]!.to;
    }

    // How open your landing was before the floor starts falling — breaks same-round ties.
    const freeAfterMove = mapPlayers(s.players, (id) => (alive(s).includes(id) ? plateSteps(s, id).length : 0));

    // Every round: the plate you leave crumbles unless someone else stepped onto it.
    const crumbled: number[] = [];
    const taken = occupied(s);
    for (const cell of left) {
      if (taken.has(cell) || !s.plates[cell]) continue;
      s.plates[cell] = false;
      crumbled.push(cell);
    }

    const removed: Record<PlayerId, number | null> = {};
    const takenAfter = occupied(s);
    for (const id of movers) {
      const aim = choices[id]!.remove;
      const empty = emptyPlates(s);
      // Prefer the aimed empty plate; otherwise a random empty one. Never delete under someone's feet here.
      const cell = s.plates[aim] && !takenAfter.has(aim) ? aim : empty.length > 0 ? pick(rng, empty) : null;
      removed[id] = cell;
      if (cell !== null) s.plates[cell] = false;
    }

    // Stall break: if nothing fell this round (e.g. two players swapping onto each other's plates),
    // force one empty plate to crumble, or one occupied plate if the board is full of people.
    if (crumbled.length === 0 && Object.values(removed).every((c) => c === null)) {
      const empty = emptyPlates(s);
      const force = empty.length > 0 ? pick(rng, empty) : pick(rng, [...occupied(s)]);
      if (force !== undefined) {
        s.plates[force] = false;
        crumbled.push(force);
      }
    }

    const wouldDie = alive(s).filter((id) => !s.plates[s.positions[id]!] || plateSteps(s, id).length === 0);
    // If everyone would die together, spare one player (best landing after the move; ties broken at random)
    // so the lobby doesn't all share 1st place.
    const dying =
      wouldDie.length > 1 && wouldDie.length === alive(s).length
        ? (() => {
            const best = Math.max(...wouldDie.map((id) => freeAfterMove[id] ?? 0));
            const top = wouldDie.filter((id) => (freeAfterMove[id] ?? 0) === best);
            const keep = pick(rng, top);
            return wouldDie.filter((id) => id !== keep);
          })()
        : wouldDie;

    for (const id of dying) {
      s.outRound[id] = s.round;
      s.freeWhenOut[id] = freeAfterMove[id] ?? 0;
    }

    // Stranded survivors (no moves left, but spared from a mass wipe) end the game as winners.
    if (alive(s).length > 0 && alive(s).every((id) => plateSteps(s, id).length === 0)) {
      s.last = { choices, removed, crumbled };
      return;
    }
    s.last = { choices, removed, crumbled };
  },
  done: (s) => alive(s).length <= 1 || (alive(s).length > 0 && alive(s).every((id) => plateSteps(s, id).length === 0)),
  result: (s) => ({
    // Last longer first. Same exit round: safer landing (more free neighbors after the move) ranks higher.
    ranking: rankByKeys(s.players, (id) => [
      s.outRound[id] ?? Number.MAX_SAFE_INTEGER,
      s.outRound[id] === null ? 1 : 0,
      s.freeWhenOut[id] ?? 0,
    ]),
    scores: mapPlayers(s.players, (id) => s.outRound[id] ?? s.round + 1),
    labels: mapPlayers(s.players, (id) => (s.outRound[id] === null ? "last one standing" : `fell in round ${s.outRound[id]}`)),
  }),
  view: (s) => s,
};
