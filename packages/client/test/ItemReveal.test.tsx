import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FloatieResults, ItemReveal } from "../src/ItemReveal";
import { TrapTriggered } from "../src/TrapTriggered";
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

  it("says Foul Sugar Cube forces a d3 roll", () => {
    const html = renderToStaticMarkup(<ItemReveal view={fixture()} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [{ playerId: "p1", kind: "sandDie", tier: "offensive", status: "resolved" }],
    }} />);
    expect(html).toContain("forces a d3 movement roll");
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

  it("shows the affected player for single- and multi-target sabotage items", () => {
    const view = fixture(4);
    const html = renderToStaticMarkup(<ItemReveal view={view} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [
        {
          playerId: "p1", kind: "weight", tier: "offensive", status: "resolved",
          target: "p2", affectedPlayers: ["p2"],
        },
        {
          playerId: "p3", kind: "candyExplosion", tier: "offensive", status: "resolved",
          target: "p4", affectedPlayers: ["p1", "p4"],
        },
      ],
    }} />);

    expect(html).toContain("Affects: Character 2");
    expect(html).toContain("Affects: Character 1, Character 4");
    expect(html).toContain("reduces a movement roll by 3");
  });

  it("highlights an item result that directly affects you", () => {
    const view = fixture(4);
    view.youSeatId = "p2";
    const html = renderToStaticMarkup(<ItemReveal view={view} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [{
        playerId: "p1", kind: "weight", tier: "offensive", status: "resolved",
        target: "p2", affectedPlayers: ["p2"],
      }],
    }} />);

    expect(html).toContain('class="item-play tier-offensive  affects-you"');
  });

  it("shows the amount gained from a Chocolate Coin Bag", () => {
    const html = renderToStaticMarkup(<ItemReveal view={fixture()} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [{ playerId: "p1", kind: "chocolateCoinBag", tier: "self", status: "resolved", amount: 17 }],
    }} />);
    expect(html).toContain("gained 17 coins");
  });

  it("reports Candy Gun success or failure and marks item knockouts with a skull", () => {
    const view = fixture(4);
    const html = renderToStaticMarkup(<ItemReveal view={view} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [
        {
          playerId: "p1", kind: "candyGun", tier: "offensive", status: "resolved",
          target: "p2", outcome: "success", affectedPlayers: ["p2"],
        },
        { playerId: "p3", kind: "candyGun", tier: "offensive", status: "resolved", target: "p4", outcome: "failure" },
      ],
      knockoutEvents: [{
        type: "playerDied", playerId: "p2", reason: "item", cause: "candyGun", sourcePlayerId: "p1",
      }],
    }} />);
    expect(html).toContain("success — hit the target");
    expect(html).toContain("failed — the target was not knocked out");
    expect(html).toContain("💀");
  });

  it("shows the movement gained from Power Creep in item results", () => {
    const html = renderToStaticMarkup(<ItemReveal view={fixture()} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [{ playerId: "p1", kind: "powerCreep", tier: "self", status: "resolved", amount: 6 }],
    }} />);
    expect(html).toContain("gains 1 movement for every 3 spaces behind first place; gained 6 movement");
  });

  it("shows Candy Explosion's named target and failed Mimic steals", () => {
    const html = renderToStaticMarkup(<ItemReveal view={fixture()} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [
        { playerId: "p1", kind: "candyExplosion", tier: "offensive", status: "resolved", target: "p2", outcome: "success" },
        { playerId: "p3", kind: "mimic", tier: "offensive", status: "resolved" },
      ],
    }} />);
    expect(html).toContain("targeted Character 2 — success");
    expect(html).toContain("failed to steal an item");
  });

  it("shows Custom Dice Roll cancellations to its user and the item user, but not spectators", () => {
    const step = {
      kind: "itemReveal" as const,
      until: 10_000,
      plays: [{
        playerId: "p2", kind: "weight" as const, tier: "offensive" as const, status: "resolved" as const,
        cancelledByCustom: true, cancelledByCustomPlayerId: "p1",
      }],
    };
    const itemUserView = fixture();
    itemUserView.youSeatId = "p2";
    const itemUserHtml = renderToStaticMarkup(<ItemReveal view={itemUserView} step={step} />);
    expect(itemUserHtml).toContain("cancelled by Custom Dice Roll");
    expect(itemUserHtml).toContain("item-play tier-offensive cancelled");

    const spectatorView = fixture();
    spectatorView.youSeatId = "p3";
    const spectatorHtml = renderToStaticMarkup(<ItemReveal view={spectatorView} step={step} />);
    expect(spectatorHtml).not.toContain("cancelled by Custom Dice Roll");
    expect(spectatorHtml).not.toContain("item-play tier-offensive cancelled");
    const userView = fixture();
    const userHtml = renderToStaticMarkup(<ItemReveal view={userView} step={step} />);
    expect(userHtml).toContain("cancelled by Custom Dice Roll");
    expect(userHtml).toContain("item-play tier-offensive cancelled");
  });

  it("reports Candy Explosion success or backfire and the stolen Mimic item", () => {
    const view = fixture(4);
    const html = renderToStaticMarkup(<ItemReveal view={view} step={{
      kind: "itemReveal",
      until: 10_000,
      plays: [
        { playerId: "p1", kind: "candyExplosion", tier: "offensive", status: "resolved", outcome: "backfire" },
        { playerId: "p2", kind: "mimic", tier: "offensive", status: "resolved", stolenItem: "booster" },
      ],
      spiritEvents: [{ type: "candySpiritTriggered", playerId: "p3", target: "p4", knockedOut: "p4" }],
    }} />);
    expect(html).toContain("backfire");
    expect(html).toContain("stole Refreshing Candy");
    expect(html).toContain("Candy Spirit saved them");
    expect(html).toContain("knocked out");
    expect(html).toContain("instead");
  });

  it("reports Candy Spirit saves, its knockout, and Hooked Gobstopper knockback", () => {
    const view = fixture(4);
    const checkpoint = view.match!.board.spaces.find((space) => space.type === "checkpoint")!.id;
    const html = renderToStaticMarkup(<FloatieResults view={view} events={[
      { type: "candySpiritTriggered", playerId: "p1", target: "p2", knockedOut: "p2" },
      { type: "forcedBack", playerId: "p3", spaceId: checkpoint, sentTo: checkpoint },
    ]} />);
    expect(html).toContain("Candy Spirit saved them");
    expect(html).toContain("knocked out");
    expect(html).toContain("Hooked Gobstopper sent");
  });

  it("shows Floaties that triggered during movement results", () => {
    const view = fixture(12);
    const spaceId = view.match!.board.spaces.find((space) => space.lane !== null && space.segment === 0)!.id;
    const html = renderToStaticMarkup(<FloatieResults view={view} events={[
      { type: "floatieSaved", playerId: "p1", spaceId },
    ]} />);
    expect(html).toContain("Movement item results");
    expect(html).toContain("Character 1");
    expect(html).toContain("Life Ring saved them from a collision");
    expect(html).toContain("<strong>A1</strong>");
  });

  it("shows the Ghost Feet save in the triggered-trap dialog", () => {
    const view = fixture();
    const html = renderToStaticMarkup(<TrapTriggered view={view} step={{
      kind: "trap",
      event: { type: "trapTriggered", ownerId: "p2", spaceId: 2, kind: "deathTrap", victims: [], blocked: ["p1"] },
      steals: [],
      stolenItems: [],
      knockouts: [],
      ghostFeetSaves: [{ type: "ghostFeetSaved", playerId: "p1", spaceId: 2, trapKind: "deathTrap" }],
      index: 1,
      total: 1,
      until: 10_000,
    }} />);
    expect(html).toContain("Ghost Feet saved you!");
    expect(html.replace(/<[^>]+>/g, "")).toContain("blocked the Death Trap");
  });

  it("does not show a Floatie result when no Floatie was triggered", () => {
    const html = renderToStaticMarkup(<FloatieResults view={fixture()} events={[]} />);
    expect(html).toBe("");
  });
});
