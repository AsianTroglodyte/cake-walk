import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionPanel } from "../src/DecisionPanel";
import { RollSummary } from "../src/RollSummary";
import { fixture } from "./fixtures";

describe("movement roll feedback", () => {
  it("previews the items and players affecting the pending move", () => {
    const view = fixture();
    view.match!.you!.decision = {
      playerId: "p1",
      kind: "move",
      dice: [{ id: null, sides: 6 }],
      lanes: 1,
      mods: {
        sandDie: true,
        sandDieSource: "p2",
        weights: 1,
        weightSources: ["p3"],
        booster: true,
        extraDie: true,
        extraDice: 0,
        rollBonuses: [],
        customRoll: false,
        hyperCandy: false,
        moveBackwards: false,
        pairOfCandy: false,
      },
    };
    const html = renderToStaticMarkup(<DecisionPanel view={view} act={() => {}} />);
    expect(html).toContain("Items affecting your roll");
    expect(html).toContain("Foul Sugar Cube from Character 2");
    expect(html).toContain("Poisoned Candy from Character 3");
    expect(html).toContain("Your Refreshing Candy: +3");
    expect(html).toContain("Your Sugar Cube: roll an extra d6");
  });

  it("shows the roll total, modifier sources, spaces moved, and final destination", () => {
    const view = fixture(12);
    const branch = view.match!.board.spaces.find((space) => space.segment === 0 && space.lane === 0)!;
    const next = view.match!.board.spaces[branch.id]!.next[0]!;
    const html = renderToStaticMarkup(<RollSummary view={view} events={[
      { type: "dieRolled", playerId: "p1", sides: 6, saved: false, value: 4 },
      { type: "dieRolled", playerId: "p2", sides: 12, saved: true, value: 11 },
      { type: "rollChanged", playerId: "p1", kind: "weight", from: 4, to: 1, source: "p2" },
      { type: "rollChanged", playerId: "p1", kind: "booster", from: 1, to: 4 },
      { type: "moved", playerId: "p1", path: [branch.id] },
      { type: "arrow", playerId: "p1", direction: "forward", path: [next] },
    ]} />);
    expect(html).toContain("d6:");
    expect(html).toContain("Character 1&#x27;s roll: 4 to 1 (Poisoned Candy from Character 2)");
    expect(html).toContain("Character 1&#x27;s roll: 1 to 4 (Refreshing Candy)");
    expect(html).toContain('class="roll-summary-total" aria-label="Total movement roll: 4">4</strong>');
    expect(html).toContain("Moved 1 space (Space A1)");
    expect(html).toContain("rode an Orange arrow forward");
    expect(html).not.toContain("Character 2</h3>");
    expect(html).not.toContain("d12:");
  });

  it("explains why movement was skipped", () => {
    const html = renderToStaticMarkup(<RollSummary view={fixture()} events={[
      { type: "moveSkipped", playerId: "p1", reasons: ["stickyCandy", "moonwalkRing"] },
    ]} />);
    expect(html).toContain("You couldn’t move this round because Sticky Candy stopped you from moving; Moonwalk Ring made you skip your move.");
  });
});
