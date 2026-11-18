import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MinefieldView } from "@pbg/rules";
import { Minefield } from "../src/games/grids";

describe("Minefield Trek placement", () => {
  it("highlights cells where mines cannot be placed", () => {
    const view: MinefieldView = {
      cols: 4,
      rows: 3,
      phase: "placing",
      placeEndAt: 10_000,
      raceStartAt: 12_000,
      raceEndAt: 30_000,
      minesPerPlayer: 3,
      stepMs: 500,
      locked: { p1: false },
      positions: { p1: 8 },
      frozenUntil: { p1: 0 },
      hits: { p1: 0 },
      finishedAt: { p1: null },
      yourMines: [],
      known: [],
      allMines: null,
    };
    const html = renderToStaticMarkup(<Minefield
      view={view}
      me="p1"
      players={["p1"]}
      name={(id) => id}
      color={() => "#fff"}
      canPick={false}
      submitted={null}
      stage="live"
      send={() => {}}
      now={0}
    />);

    expect(html).toContain("Red-hatched cells are unavailable for mine placement.");
    expect(html).toContain("blocked-placement");
    expect(html).toContain("Mines cannot be placed on the start row");
  });
});
