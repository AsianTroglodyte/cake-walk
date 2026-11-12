import { pick, type Rng } from "./rng";
import type { Board, SpaceId } from "./types";

export interface WalkOptions {
  /** Arrow spaces never carry a player past a checkpoint. */
  stopAtCheckpoint?: boolean;
}

/** Returns the spaces entered, in order. Movement always stops at the finish. */
export function walkForward(
  board: Board,
  from: SpaceId,
  steps: number,
  lane: number,
  options: WalkOptions = {},
): SpaceId[] {
  const path: SpaceId[] = [];
  let current = from;
  for (let i = 0; i < steps; i++) {
    const space = board.spaces[current]!;
    if (space.type === "finish") break;
    current = space.next.length === 1 ? space.next[0]! : space.next[clampLane(lane, space.next.length)]!;
    path.push(current);
    if (options.stopAtCheckpoint && board.spaces[current]!.type === "checkpoint") break;
  }
  return path;
}

/** Returns the spaces entered, in order. Picks a random lane when going back through a fork. */
export function walkBackward(
  board: Board,
  from: SpaceId,
  steps: number,
  rng: Rng,
  options: WalkOptions = {},
): SpaceId[] {
  const path: SpaceId[] = [];
  let current = from;
  for (let i = 0; i < steps; i++) {
    const space = board.spaces[current]!;
    if (space.prev.length === 0) break;
    current = space.prev.length === 1 ? space.prev[0]! : pick(rng, space.prev);
    path.push(current);
    if (options.stopAtCheckpoint && board.spaces[current]!.type === "checkpoint") break;
  }
  return path;
}

export function clampLane(lane: number, lanes: number): number {
  if (!Number.isFinite(lane)) return 0;
  return Math.min(lanes - 1, Math.max(0, Math.trunc(lane)));
}
