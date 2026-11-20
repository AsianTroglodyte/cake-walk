import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Game } from "../src/Game";
import { fixture } from "./fixtures";

describe("item-phase and shop UI", () => {
  it("keeps item decisions in the existing layout and exposes a separate shop opener", () => {
    const view = fixture(4);
    view.match!.phase = { kind: "items" };
    view.match!.step = { kind: "deciding", deadline: 60_000 };
    view.match!.you!.decision = {
      playerId: "p1",
      kind: "items",
      items: view.match!.you!.items,
      targets: ["p2"],
      trapSpaces: [1],
      prices: { booster: 5 },
      shop: ["booster"],
      maxHeld: 3,
    };
    view.match!.auction = {
      item: "trainedMimic",
      deadline: 20_000,
      participants: [],
      currentBid: 0,
      bidderId: null,
      status: "open",
      winnerId: null,
      winningBid: null,
      me: { lock: null, participating: false },
    };

    const html = renderToStaticMarkup(
      <Game received={{ view, clockOffset: 0 }} act={() => {}} onLeave={() => {}} />,
    );

    expect(html).not.toContain("item-phase-intro");
    expect(html).not.toContain("item-phase-content");
    expect(html).toContain("Items</h2>");
    expect(html).toContain("Use an item (one per round)");
    expect(html).toContain("Shop · 10 coins");
    expect(html).toContain("Open auction");
    expect(html).not.toContain('aria-modal="true"');
  });

  it("shows the trap dialog to a player whose trap was blocked by Ghost Feet", () => {
    const view = fixture(4);
    view.match!.step = {
      kind: "trap",
      event: { type: "trapTriggered", ownerId: "p2", spaceId: 2, kind: "deathTrap", victims: [], blocked: ["p1"] },
      steals: [],
      stolenItems: [],
      knockouts: [],
      ghostFeetSaves: [{ type: "ghostFeetSaved", playerId: "p1", spaceId: 2, trapKind: "deathTrap" }],
      index: 1,
      total: 1,
      until: 10_000,
    };
    const html = renderToStaticMarkup(
      <Game received={{ view, clockOffset: 0 }} act={() => {}} onLeave={() => {}} />,
    );
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Ghost Feet blocked the trap!");
    expect(html).toContain("blocked the Death Trap you landed on");
  });
});
