import { pick, shuffle, type Rng } from "../rng";
import { isInt } from "./framework";

/** Cells are numbered row by row: `y * cols + x`. */
export interface Grid {
  cols: number;
  rows: number;
}

export const square = (size: number): Grid => ({ cols: size, rows: size });

export const cellCount = (g: Grid) => g.cols * g.rows;

export const cellAt = (g: Grid, x: number, y: number) => y * g.cols + x;

export const xOf = (g: Grid, cell: number) => cell % g.cols;

export const yOf = (g: Grid, cell: number) => Math.floor(cell / g.cols);

export function isCell(g: Grid, value: unknown): value is number {
  return isInt(value, 0, cellCount(g) - 1);
}

/** Steps between two cells when diagonal steps are allowed. */
export function chebyshev(g: Grid, a: number, b: number): number {
  return Math.max(Math.abs(xOf(g, a) - xOf(g, b)), Math.abs(yOf(g, a) - yOf(g, b)));
}

function offsets(g: Grid, cell: number, deltas: readonly (readonly [number, number])[]): number[] {
  const x = xOf(g, cell);
  const y = yOf(g, cell);
  const found: number[] = [];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < g.cols && ny >= 0 && ny < g.rows) found.push(cellAt(g, nx, ny));
  }
  return found;
}

const ORTHOGONAL = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const ALL_EIGHT = [...ORTHOGONAL, [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

/** North, east, south, west, whichever are on the grid. */
export const neighbors4 = (g: Grid, cell: number) => offsets(g, cell, ORTHOGONAL);

/** The up to 8 cells around this one. */
export const neighbors8 = (g: Grid, cell: number) => offsets(g, cell, ALL_EIGHT);

/** Every cell at most `range` steps away, including this one. */
export function cellsWithin(g: Grid, cell: number, range: number): number[] {
  const found: number[] = [];
  for (let c = 0; c < cellCount(g); c++) if (chebyshev(g, cell, c) <= range) found.push(c);
  return found;
}

/** Distinct cells spread as far apart as possible: each pick is the cell farthest from those already picked. */
export function spreadCells(g: Grid, count: number, rng: Rng): number[] {
  const all = shuffle(
    rng,
    Array.from({ length: cellCount(g) }, (_, c) => c),
  );
  const picked = [pick(rng, all)];
  while (picked.length < count) {
    let best = -1;
    let bestDistance = -1;
    for (const c of all) {
      if (picked.includes(c)) continue;
      const d = Math.min(...picked.map((p) => chebyshev(g, c, p)));
      if (d > bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    picked.push(best);
  }
  return picked;
}

/** 6×6 for 4 to 6 players, 7×7 for 7 to 9, 8×8 for 10 to 12. */
export function arenaSize(players: number): number {
  return players <= 6 ? 6 : players <= 9 ? 7 : 8;
}

/**
 * Disappearing Plates: larger than the blast arena because a plate crumbles every time you leave it.
 * 8×8 for 4 to 6, 9×9 for 7 to 9, 10×10 for 10 to 12.
 */
export function platesSize(players: number): number {
  return arenaSize(players) + 2;
}
