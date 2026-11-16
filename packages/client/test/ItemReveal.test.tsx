import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloatieResults, ItemReveal } from "../src/ItemReveal";
import { fixture } from "./fixtures";

describe("item result displays", () => {
  it("describes Booster as a +3 movement-roll bonus", () => {
    const view = fixture(12);
    const html = renderToStaticMarkup(<ItemReveal view={view} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [{ playerId: "p1", kind: "booster", tier: "self", status: "resolved" }],
    }} />);
    expect(html).toContain("adds 3 to their movement roll");
    expect(html).not.toContain("rolls twice");
  });

  it("only says a player placed a trap without revealing its location", () => {
    const view = fixture(12);
    const space = view.match!.board.spaces.find((candidate) => candidate.lane !== null)!;
    const html = renderToStaticMarkup(<ItemReveal view={view} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [{ playerId: "p2", kind: "sandTrap", tier: "self", status: "resolved", space: space.id }],
    }} />);
    expect(html).toContain("placed a trap");
    expect(html).not.toContain(`${space.distanceToFinish} to go`);
    expect(html).not.toContain("Space");
  });

  it("shows Floaties that triggered during movement results", () => {
    const view = fixture(12);
    const spaceId = view.match!.board.spaces.find((space) => space.lane !== null && space.segment === 0)!.id;
    const html = renderToStaticMarkup(<FloatieResults view={view} events={[
      { type: "floatieSaved", playerId: "p1", spaceId },
    ]} />);
    expect(html).toContain("Floaties triggered");
    expect(html).toContain("Character 1");
    expect(html).toContain("Floatie saved them from a collision");
    expect(html).toContain("<strong>A1</strong>");
  });

  it("does not show a Floatie result when no Floatie was triggered", () => {
    const html = renderToStaticMarkup(<FloatieResults view={fixture()} events={[]} />);
    expect(html).toBe("");
  });
});
