import type { Board, SpaceId } from "@pbg/rules";

/** Stable coordinate from the start; branched spaces also include their route letter. */
export function boardSpaceLabel(board: Board, id: SpaceId): string {
  const space = board.spaces[id]!;
  const progress = board.spaces[board.start]!.distanceToFinish - space.distanceToFinish;
  if (space.lane !== null && board.paths > 1) {
    return `${String.fromCharCode(65 + space.lane)}${progress}`;
  }
  return String(progress);
}
