import { pick, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { isInt, isRecord, mapPlayers, oneOf, rankByKeys, type RoundGame } from "./framework";
import { cellAt, cellCount, isCell, neighbors4, square, xOf, yOf, type Grid } from "./grid";

export const SHIP_LENGTHS = [5, 3, 2] as const;
export const BATTLESHIP_SHOTS = 2;
/** From this firing round on, everyone fires one extra shot. */
export const BATTLESHIP_EXTRA_SHOT_ROUND = 8;

export type ShipDirection = "h" | "v";

export interface ShipPlacement {
  /** The ship's top or left end. */
  cell: number;
  dir: ShipDirection;
}

/** Round 1 places ships; every round after that fires. */
export type BattleshipChoice = { kind: "place"; ships: ShipPlacement[] } | { kind: "fire"; cells: number[] };

export interface Ship {
  cells: number[];
  sunk: boolean;
}

export interface BattleshipState {
  players: PlayerId[];
  size: number;
  round: number;
  placed: boolean;
  /** Secret: each player only sees their own until a ship sinks. */
  ships: Record<PlayerId, Ship[]>;
  /** Per cell: null if nobody fired there yet. A hit doesn't say whose ship it was. */
  shots: ("hit" | "miss" | null)[];
  outRound: Record<PlayerId, number | null>;
  last: { fired: Record<PlayerId, number[]>; sunk: { owner: PlayerId; cells: number[] }[] } | null;
}

export interface BattleshipView {
  size: number;
  round: number;
  placed: boolean;
  shots: ("hit" | "miss" | null)[];
  /** Every sunk ship, with its owner. */
  sunk: { owner: PlayerId; cells: number[] }[];
  shipsLeft: Record<PlayerId, number>;
  outRound: Record<PlayerId, number | null>;
  /** Shots each player fires this round. */
  shotsPerRound: number;
  /** The viewer's own ships. */
  yours: Ship[] | null;
  last: BattleshipState["last"];
}

/** About 2.5 cells per ship tile: 10×10 for 4 players, 17×17 for 12. */
export const battleshipSize = (players: number) => Math.round(5 * Math.sqrt(players));

const grid = (s: BattleshipState): Grid => square(s.size);
const alive = (s: BattleshipState) => s.players.filter((id) => s.outRound[id] === null);

export function shipCells(g: Grid, length: number, { cell, dir }: ShipPlacement): number[] | null {
  const x = xOf(g, cell);
  const y = yOf(g, cell);
  if (dir === "h" ? x + length > g.cols : y + length > g.rows) return null;
  return Array.from({ length }, (_, i) => (dir === "h" ? cellAt(g, x + i, y) : cellAt(g, x, y + i)));
}

/** Your own ships can't overlap each other; other players' ships can overlap yours. */
export function fleetCells(g: Grid, ships: readonly ShipPlacement[]): number[][] | null {
  if (ships.length !== SHIP_LENGTHS.length) return null;
  const used = new Set<number>();
  const fleet: number[][] = [];
  for (let i = 0; i < ships.length; i++) {
    const cells = shipCells(g, SHIP_LENGTHS[i]!, ships[i]!);
    if (!cells || cells.some((c) => used.has(c))) return null;
    for (const c of cells) used.add(c);
    fleet.push(cells);
  }
  return fleet;
}

export function shotsPerRound(s: BattleshipState): number {
  return s.round >= BATTLESHIP_EXTRA_SHOT_ROUND ? BATTLESHIP_SHOTS + 1 : BATTLESHIP_SHOTS;
}

/** Cells you may fire at: not fired at yet, and not under one of your own ships. */
export function fireTargets(s: BattleshipState, id: PlayerId): number[] {
  const own = new Set(s.ships[id]!.flatMap((ship) => ship.cells));
  return s.shots.flatMap((shot, c) => (shot === null && !own.has(c) ? [c] : []));
}

function randomFleet(g: Grid, rng: Rng): ShipPlacement[] {
  for (;;) {
    const ships = SHIP_LENGTHS.map(() => ({
      cell: randInt(rng, 0, cellCount(g) - 1),
      dir: pick(rng, ["h", "v"] as const),
    }));
    if (fleetCells(g, ships)) return ships;
  }
}

const firingCount = (s: BattleshipState, id: PlayerId) => Math.min(shotsPerRound(s), fireTargets(s, id).length);

function randomShots(s: BattleshipState, id: PlayerId, rng: Rng): BattleshipChoice {
  return { kind: "fire", cells: shuffle(rng, fireTargets(s, id)).slice(0, firingCount(s, id)) };
}

/** Everyone places; then every player still afloat who has somewhere left to fire. */
function deciders(s: BattleshipState): PlayerId[] {
  return s.placed ? alive(s).filter((id) => fireTargets(s, id).length > 0) : s.players;
}

function sunkShips(s: BattleshipState): { owner: PlayerId; cells: number[] }[] {
  return s.players.flatMap((owner) => s.ships[owner]!.filter((ship) => ship.sunk).map((ship) => ({ owner, cells: ship.cells })));
}

export const battleship: RoundGame<BattleshipState, BattleshipChoice> = {
  mode: "round",
  setup({ players }) {
    const size = battleshipSize(players.length);
    return {
      players,
      size,
      round: 0,
      placed: false,
      ships: mapPlayers(players, () => []),
      shots: Array.from({ length: cellCount(square(size)) }, () => null),
      outRound: mapPlayers(players, () => null),
      last: null,
    };
  },
  roundMs: (s) => (s.placed ? 8_000 : 15_000),
  revealMs: 2_500,
  deciders,
  parse(s, id, raw) {
    if (!isRecord(raw)) return undefined;
    const g = grid(s);
    if (!s.placed) {
      if (raw.kind !== "place" || !Array.isArray(raw.ships)) return undefined;
      const ships: ShipPlacement[] = [];
      for (const ship of raw.ships) {
        if (!isRecord(ship) || !isCell(g, ship.cell)) return undefined;
        const dir = oneOf(ship.dir, ["h", "v"] as const);
        if (!dir) return undefined;
        ships.push({ cell: ship.cell, dir });
      }
      return fleetCells(g, ships) ? { kind: "place", ships } : undefined;
    }
    if (raw.kind !== "fire" || !Array.isArray(raw.cells) || raw.cells.length !== firingCount(s, id)) return undefined;
    const allowed = new Set(fireTargets(s, id));
    const cells = raw.cells as unknown[];
    if (!cells.every((c) => isInt(c, 0, cellCount(g) - 1) && allowed.has(c)) || new Set(cells).size !== cells.length) {
      return undefined;
    }
    return { kind: "fire", cells: cells as number[] };
  },
  fallback: (s, id, rng) => (s.placed ? randomShots(s, id, rng) : { kind: "place", ships: randomFleet(grid(s), rng) }),
  /** Finishes off ships it has hit, otherwise searches on a checkerboard. */
  bot(s, id, rng) {
    const g = grid(s);
    if (!s.placed) return { kind: "place", ships: randomFleet(g, rng) };
    const allowed = new Set(fireTargets(s, id));
    const sunk = new Set(sunkShips(s).flatMap((ship) => ship.cells));
    const openHits = s.shots.flatMap((shot, c) => (shot === "hit" && !sunk.has(c) ? [c] : []));
    const follow = shuffle(rng, [...new Set(openHits.flatMap((c) => neighbors4(g, c)))].filter((c) => allowed.has(c)));
    const parity = shuffle(
      rng,
      [...allowed].filter((c) => (xOf(g, c) + yOf(g, c)) % 2 === 0 && !follow.includes(c)),
    );
    const rest = shuffle(
      rng,
      [...allowed].filter((c) => !follow.includes(c) && !parity.includes(c)),
    );
    return { kind: "fire", cells: [...follow, ...parity, ...rest].slice(0, firingCount(s, id)) };
  },
  resolve(s, choices) {
    s.round++;
    const g = grid(s);
    if (!s.placed) {
      for (const id of s.players) {
        const choice = choices[id];
        const fleet = choice?.kind === "place" ? fleetCells(g, choice.ships) : null;
        s.ships[id] = (fleet ?? []).map((cells) => ({ cells, sunk: false }));
      }
      s.placed = true;
      s.last = null;
      return;
    }

    const covered = new Set(s.players.flatMap((id) => s.ships[id]!.flatMap((ship) => ship.cells)));
    const fired: Record<PlayerId, number[]> = {};
    for (const [id, choice] of Object.entries(choices)) {
      if (choice.kind !== "fire") continue;
      fired[id] = choice.cells;
      for (const c of choice.cells) s.shots[c] = covered.has(c) ? "hit" : "miss";
    }
    const sunk: { owner: PlayerId; cells: number[] }[] = [];
    for (const owner of s.players) {
      for (const ship of s.ships[owner]!) {
        if (ship.sunk || !ship.cells.every((c) => s.shots[c] === "hit")) continue;
        ship.sunk = true;
        sunk.push({ owner, cells: ship.cells });
      }
    }
    // Firing rounds are numbered from 1, after the placement round.
    for (const id of alive(s)) if (s.ships[id]!.every((ship) => ship.sunk)) s.outRound[id] = s.round - 1;
    s.last = { fired, sunk };
  },
  done: (s) => s.placed && (alive(s).length <= 1 || deciders(s).length === 0),
  result: (s) => ({
    ranking: rankByKeys(s.players, (id) => [s.outRound[id] ?? Number.MAX_SAFE_INTEGER]),
    scores: mapPlayers(s.players, (id) => s.ships[id]!.filter((ship) => !ship.sunk).length),
    labels: mapPlayers(s.players, (id) => (s.outRound[id] === null ? "fleet afloat" : `sunk in round ${s.outRound[id]}`)),
  }),
  view: (s, viewer) =>
    ({
      size: s.size,
      round: s.round,
      placed: s.placed,
      shots: s.shots,
      sunk: sunkShips(s),
      shipsLeft: mapPlayers(s.players, (id) => s.ships[id]!.filter((ship) => !ship.sunk).length),
      outRound: s.outRound,
      shotsPerRound: shotsPerRound(s),
      yours: viewer && s.ships[viewer] ? s.ships[viewer] : null,
      last: s.last,
    }) satisfies BattleshipView,
};
