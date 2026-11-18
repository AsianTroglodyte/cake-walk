import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChaosSpace } from "../src/ChaosSpace";
import { fixture } from "./fixtures";

describe("Chaos Time results", () => {
  it("shows the effect on one line, item transfers, and only coin shortfalls", () => {
    const view = fixture(4);
    const html = renderToStaticMarkup(<ChaosSpace view={view} step={{
      kind: "chaos",
      stage: "effectSpin",
      index: 1,
      total: 1,
      until: 10_000,
      event: {
        type: "chaosOutcome",
        spaceType: "rainbowChaos",
        playerId: "p1",
        description: "Everyone passed items to neighboring ranks.",
        coinTransfers: [
          { giver: "p1", receiver: "p2", requested: 20, given: 8 },
          { giver: "p2", receiver: "p3", requested: 5, given: 5 },
        ],
        itemTransfers: [{ giver: "p1", receiver: "p2", items: ["ghostFeet", "booster"] }],
      },
    }} />);

    expect(html).toContain('<p class="chaos-effect-line" role="status">Everyone passed items to neighboring ranks.</p>');
    expect(html).toContain("8 coins were given.");
    expect(html).not.toContain("5 of 5 coins");
    expect(html).toContain("Ghost Feet, Refreshing Candy");
    expect(html).toContain("gave to Player 2");
  });
});
