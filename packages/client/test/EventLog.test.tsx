import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EventLog } from "../src/EventLog";
import { fixture } from "./fixtures";

describe("event log", () => {
  it("renders player names instead of object placeholders and offers a player filter", () => {
    const view = fixture(4);
    view.match!.events = [
      { type: "roundStarted", round: 1 },
      { type: "coinsChanged", playerId: "p1", delta: -4, reason: "auction" },
      {
        type: "trapTriggered",
        ownerId: "p2",
        spaceId: 2,
        kind: "deathTrap",
        victims: ["p1"],
        blocked: ["p3"],
      },
    ];
    const html = renderToStaticMarkup(<EventLog view={view} />);
    const text = html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");
    expect(text).toContain("Character 1 paid 4 coins in the auction");
    expect(html).toContain("Filter by player");
    expect(text).toContain("Character 3");
    expect(html).not.toContain("[object Object]");
  });
});
