import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Board } from "../src/Board";
import { boardSpaceLabel } from "../src/spaceLabels";
import { fixture } from "./fixtures";

describe("board coordinates", () => {
  it("numbers shared spaces and gives parallel routes distinct letter-number labels", () => {
    const board = fixture(12).match!.board;
    expect(boardSpaceLabel(board, board.start)).toBe("0");

    const firstSpaces = board.spaces.filter((space) => space.segment === 0 && space.lane !== null);
    for (let lane = 0; lane < 3; lane++) {
      const first = firstSpaces.find((space) => space.lane === lane)!;
      expect(boardSpaceLabel(board, first.id)).toBe(`${String.fromCharCode(65 + lane)}1`);
    }

    const checkpoint = board.spaces.find((space) => space.type === "checkpoint")!;
    expect(boardSpaceLabel(board, checkpoint.id)).toMatch(/^\d+$/);
  });

  it("renders larger numbered spaces on the board", () => {
    const html = renderToStaticMarkup(<Board view={fixture(12)} />);
    expect(html).toContain("112px");
    expect(html).toContain('class="space-number">A1</span>');
    expect(html).toContain('class="space-number">B1</span>');
    expect(html).toContain('class="space-number">C1</span>');
  });

  it("highlights teleport destinations during Chaos Time", () => {
    const view = fixture(4);
    const destination = view.match!.board.spaces.find((space) => space.lane !== null)!.id;
    view.match!.step = {
      kind: "chaos",
      stage: "effectSpin",
      index: 1,
      total: 1,
      until: 10_000,
      event: {
        type: "chaosOutcome",
        spaceType: "monochromeChaos",
        playerId: "p1",
        description: "Character 1 teleports to Character 2's space.",
        teleports: [{ playerId: "p1", from: view.match!.board.start, to: destination }],
      },
    };

    const html = renderToStaticMarkup(<Board view={view} />);
    expect(html).toContain("chaos-teleport-highlight");
  });
});
