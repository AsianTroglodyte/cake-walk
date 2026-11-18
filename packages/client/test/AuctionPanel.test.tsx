import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuctionPanel } from "../src/AuctionPanel";
import { fixture } from "./fixtures";

describe("auction panel", () => {
  it("provides an auction opener without taking over the board layout", () => {
    const view = fixture(4);
    const html = renderToStaticMarkup(
      <AuctionPanel
        view={view}
        clockOffset={0}
        act={() => {}}
        auction={{
          item: "trainedMimic",
          deadline: 20_000,
          participants: [],
          currentBid: 0,
          bidderId: null,
          status: "open",
          winnerId: null,
          winningBid: null,
          me: { lock: null, participating: false },
        }}
      />,
    );

    expect(html).toContain("Open auction");
    expect(html).toContain("Item for sale");
    expect(html).not.toContain("Join auction");
    expect(html).not.toContain("auction-panel");
  });

  it("keeps the results accessible through the same auction opener", () => {
    const view = fixture(4);
    const html = renderToStaticMarkup(
      <AuctionPanel
        view={view}
        clockOffset={0}
        act={() => {}}
        auction={{
          item: "trainedMimic",
          deadline: 0,
          participants: ["p1"],
          currentBid: 17,
          bidderId: "p1",
          status: "closed",
          winnerId: "p1",
          winningBid: 17,
          me: { lock: "bid", participating: true },
        }}
      />,
    );

    expect(html).toContain("Auction results");
    expect(html).toContain("Sold!");
    expect(html).not.toContain("Sold to Character 1 (Player 1) for 17 coins!");
  });
});
