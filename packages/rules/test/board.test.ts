import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD, pathsForPlayerCount, walkBackward, walkForward, createRng } from "../src/index";
import { makeMatch } from "./helpers";

describe("pathsForPlayerCount", () => {
  it.each([
    [4, 1],
    [6, 1],
    [7, 2],
    [9, 2],
    [10, 3],
    [12, 3],
  ])("%i players get %i path(s)", (players, paths) => {
    expect(pathsForPlayerCount(players)).toBe(paths);
  });
});

describe("generateBoard", () => {
  it.each([4, 7, 12])("builds equal-length lanes for %i players", (players) => {
    const { board } = makeMatch(players);
    const expectedLength =
      DEFAULT_BOARD.openingLength + 1 + DEFAULT_BOARD.segments * (DEFAULT_BOARD.segmentLength + 1);

    expect(board.spaces[board.start]!.next).toHaveLength(board.paths);
    expect(board.spaces[board.start]!.distanceToFinish).toBe(expectedLength);
    for (const space of board.spaces) {
      for (const next of space.next) {
        expect(board.spaces[next]!.distanceToFinish).toBe(space.distanceToFinish - 1);
      }
    }
  });

  it("makes the opening, checkpoints, start, and finish collision-free, and nothing else", () => {
    const { board } = makeMatch(12);
    for (const space of board.spaces) {
      const shouldBeFree = space.segment === 0 || space.lane === null;
      expect(space.collisionFree, `space ${space.id}`).toBe(shouldBeFree);
    }
  });

  it("points every lane space at the checkpoint (or start) that begins its segment", () => {
    const { board } = makeMatch(7);
    for (const space of board.spaces.filter((s) => s.lane !== null)) {
      const behind = board.spaces[space.checkpointBehind]!;
      expect(["start", "checkpoint"]).toContain(behind.type);
      expect(behind.distanceToFinish).toBeGreaterThan(space.distanceToFinish);
      expect(behind.distanceToFinish - space.distanceToFinish).toBeLessThanOrEqual(DEFAULT_BOARD.segmentLength);
    }
  });
});

describe("movement", () => {
  it("stops at the finish when the roll overshoots", () => {
    const { board } = makeMatch(4);
    const twoAway = board.spaces.find((s) => s.distanceToFinish === 2)!;
    const path = walkForward(board, twoAway.id, 6, 0);
    expect(path).toHaveLength(2);
    expect(path[path.length - 1]).toBe(board.finish);
  });

  it("takes the chosen lane at a fork", () => {
    const { board } = makeMatch(12);
    const [first] = walkForward(board, board.start, 1, 2);
    expect(board.spaces[first!]!.lane).toBe(2);
  });

  it("clamps an out-of-range lane", () => {
    const { board } = makeMatch(7);
    const [first] = walkForward(board, board.start, 1, 99);
    expect(board.spaces[first!]!.lane).toBe(1);
  });

  it("stops arrow movement at a checkpoint", () => {
    const { board } = makeMatch(4);
    const beforeCheckpoint = board.spaces.find(
      (s) => s.lane !== null && board.spaces[s.next[0]!]!.type === "checkpoint",
    )!;
    const path = walkForward(board, beforeCheckpoint.id, 3, 0, { stopAtCheckpoint: true });
    expect(path).toHaveLength(1);
    expect(board.spaces[path[0]!]!.type).toBe("checkpoint");
  });

  it("never walks back past the start", () => {
    const { board } = makeMatch(4);
    const path = walkBackward(board, board.spaces[board.start]!.next[0]!, 10, createRng(1));
    expect(path).toEqual([board.start]);
  });
});
