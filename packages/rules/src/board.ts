import { weightedPick, type Rng } from "./rng";
import type { Board, BoardConfig, Space, SpaceId, SpaceType } from "./types";

export const DEFAULT_BOARD: BoardConfig = {
  openingLength: 14,
  segmentLength: 14,
  segments: 2,
  weights: { blue: 50, red: 25, greenArrow: 12.5, purpleArrow: 12.5 },
};

export function pathsForPlayerCount(playerCount: number): number {
  if (playerCount <= 6) return 1;
  if (playerCount <= 9) return 2;
  return 3;
}

/**
 * Builds Beach Party as a chain of segments. Each segment splits into `paths` parallel lanes of
 * equal length that rejoin at a checkpoint, so every space has a single distance to the finish.
 */
export function generateBoard(playerCount: number, config: BoardConfig, rng: Rng): Board {
  const paths = pathsForPlayerCount(playerCount);
  const spaces: Space[] = [];

  const addSpace = (
    type: SpaceType,
    lane: number | null,
    segment: number,
    collisionFree: boolean,
    checkpointBehind: SpaceId | null,
  ): SpaceId => {
    const id = spaces.length;
    spaces.push({
      id,
      type,
      next: [],
      prev: [],
      lane,
      segment,
      distanceToFinish: 0,
      checkpointBehind: checkpointBehind ?? id,
      collisionFree,
    });
    return id;
  };
  const link = (from: SpaceId, to: SpaceId) => {
    spaces[from]!.next.push(to);
    spaces[to]!.prev.push(from);
  };

  const start = addSpace("start", null, 0, true, null);
  let anchor = start;
  const totalSegments = config.segments + 1;

  for (let segment = 0; segment < totalSegments; segment++) {
    const length = segment === 0 ? config.openingLength : config.segmentLength;
    const isOpening = segment === 0;
    const laneEnds: SpaceId[] = [];

    for (let lane = 0; lane < paths; lane++) {
      let previous = anchor;
      for (let i = 0; i < length; i++) {
        const id = addSpace(weightedPick(rng, config.weights), lane, segment, isOpening, anchor);
        link(previous, id);
        previous = id;
      }
      laneEnds.push(previous);
    }

    const isLast = segment === totalSegments - 1;
    const end = addSpace(isLast ? "finish" : "checkpoint", null, segment, true, null);
    for (const laneEnd of laneEnds) link(laneEnd, end);
    anchor = end;
  }

  const finish = anchor;
  assignDistances(spaces, finish);
  return { spaces, start, finish, paths };
}

function assignDistances(spaces: Space[], finish: SpaceId): void {
  const queue: SpaceId[] = [finish];
  const seen = new Set<SpaceId>([finish]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const prev of spaces[id]!.prev) {
      if (seen.has(prev)) continue;
      seen.add(prev);
      spaces[prev]!.distanceToFinish = spaces[id]!.distanceToFinish + 1;
      queue.push(prev);
    }
  }
}
