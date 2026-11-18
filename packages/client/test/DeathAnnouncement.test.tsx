import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeathAnnouncement } from "../src/DeathAnnouncement";
import { fixture } from "./fixtures";

describe("death announcement", () => {
  it("renders a full-screen modal for the knocked-out player with the cause", () => {
    const view = fixture();
    const html = renderToStaticMarkup(<DeathAnnouncement step={{
      kind: "death",
      events: [{ type: "playerDied", playerId: "p1", reason: "battle" }],
      until: 10_000,
    }} view={view} />);
    expect(html).toContain("You were knocked out!");
    expect(html).toContain('class="battle-intro death-announcement"');
    expect(html).toContain('class="battle-card death-card"');
    expect(html).toContain('class="death-title"');
    expect(html).toContain('class="death-label">Cause</span><strong class="death-value">Battle</strong>');
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).not.toContain("Character 2");
  });

  it("names the item and user responsible for a knockout", () => {
    const view = fixture();
    view.youSeatId = "p2";
    const html = renderToStaticMarkup(<DeathAnnouncement step={{
      kind: "death",
      events: [{
        type: "playerDied", playerId: "p2", reason: "item",
        cause: "candyMissile", sourcePlayerId: "p1",
      }],
      until: 10_000,
    }} view={view} />);
    expect(html).toContain("Candy Missile");
    expect(html).toContain('class="death-title">You were knocked out!');
    expect(html).toContain('class="death-details"');
    expect(html).toContain("Knock out a random living player, including yourself.");
    expect(html).toContain("Caused by");
    expect(html).toContain("Character 1");
  });

  it("shows Black Space as the cause without attributing it to a player", () => {
    const view = fixture();
    const html = renderToStaticMarkup(<DeathAnnouncement step={{
      kind: "death",
      events: [{
        type: "playerDied", playerId: "p2", reason: "blackSpace",
        sourcePlayerId: "p1",
      }],
      until: 10_000,
    }} view={view} />);

    expect(html).toContain('class="death-label">Cause</span><strong class="death-value">Black space</strong>');
    expect(html).not.toContain("Caused by");
    expect(html).not.toContain("Character 1");
  });

  it("shows Rainbow Chaos as the cause without attributing it to a player", () => {
    const view = fixture();
    const html = renderToStaticMarkup(<DeathAnnouncement step={{
      kind: "death",
      events: [{
        type: "playerDied", playerId: "p2", reason: "rainbowChaos",
        sourcePlayerId: "p1",
      }],
      until: 10_000,
    }} view={view} />);

    expect(html).toContain('class="death-label">Cause</span><strong class="death-value">Rainbow Chaos</strong>');
    expect(html).not.toContain("Caused by");
    expect(html).not.toContain("Character 1");
  });

  it("shows Battle as the cause and identifies the responsible player", () => {
    const view = fixture();
    const html = renderToStaticMarkup(<DeathAnnouncement step={{
      kind: "death",
      events: [{
        type: "playerDied", playerId: "p2", reason: "battle",
        cause: "jellyBoxingGloves", sourcePlayerId: "p1",
      }],
      until: 10_000,
    }} view={view} />);

    expect(html).toContain('class="death-label">Cause</span><strong class="death-value">Battle (Jelly Boxing Gloves)</strong>');
    expect(html).toContain("Caused by");
    expect(html).toContain("Character 1");
    expect(html).toContain("Challenge a player to a knockout battle before movement.");
  });

  it("shows Candy Spirit as the cause of a redirected knockout", () => {
    const view = fixture();
    view.youSeatId = "p2";
    const html = renderToStaticMarkup(<DeathAnnouncement step={{
      kind: "death",
      events: [{
        type: "playerDied", playerId: "p2", reason: "item",
        cause: "candySpirit", sourcePlayerId: "p1",
      }],
      until: 10_000,
    }} view={view} />);

    expect(html).toContain("Candy Spirit");
    expect(html).toContain("When knocked out, revive and knock out a random living opponent.");
    expect(html).toContain("Caused by");
    expect(html).toContain("Character 1");
  });
});
