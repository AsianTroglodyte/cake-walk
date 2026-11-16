import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BossBattleStep } from "@pbg/protocol";
import { BossBattle } from "../src/BossBattle";
import { fixture } from "./fixtures";

const playerRoll = {
  kind: "bossBattle", stage: "playerRoll", playerId: "p1", playerRoll: 9,
  sides: 12, saved: true, attempt: 1, encounter: 1, encounters: 1, until: 2_000,
} as const;
const render = (step: BossBattleStep) => renderToStaticMarkup(<BossBattle view={fixture()} step={step} act={() => {}} />);

describe("boss encounter UI", () => {
  it("shows the battle die selection inside the encounter, with no separate Continue screen", () => {
    const view = fixture();
    view.match!.you!.decision = { kind: "boss", playerId: "p1", dice: [{ id: null, sides: 6 }, { id: "private-die", sides: 12 }] };
    const html = renderToStaticMarkup(<BossBattle view={view}
      step={{ kind: "bossBattle", stage: "choosing", contenders: ["p1"], selected: {}, deadline: 20_000 }} act={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Choose your battle die");
    expect(html).toContain("Saved · used up");
    expect(html).toContain("Roll d6");
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toContain(">Continue<");
  });

  it("shows bot encounters to spectators without giving them the bot's private inventory", () => {
    const html = render({ kind: "bossBattle", stage: "choosing", contenders: ["p2"], selected: {}, deadline: 20_000 });
    expect(html).toContain("Character 2");
    expect(html).toContain("choosing a die");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("private-die");
  });

  it("shows the player's number but no boss number or outcome during the pause", () => {
    const html = render(playerRoll);
    expect(html).toContain("Character 1 rolled 9");
    expect(html).toContain('aria-label="Boss roll pending"');
    expect(html).not.toContain("Boss defeated!");
    expect(html).not.toContain("knocked back");
    expect(html).not.toContain("d4 roll");
  });

  it("shows the boss's die, fixed modifier, total, comparison, and victory", () => {
    const html = render({
      ...playerRoll, stage: "outcome", bossRoll: 3, bossFixed: 4, bossScore: 7, result: "won", knockback: 0,
    });
    expect(html).toContain("4 + d4 roll 3 = 7");
    expect(html).toContain('aria-label="Boss total 7"');
    expect(html).toContain("&gt;");
    expect(html).toContain("Boss defeated!");
  });

  it("announces a tie before rerolling rather than a win or knockback", () => {
    const html = render({
      ...playerRoll, playerRoll: 7, stage: "outcome", bossRoll: 3, bossFixed: 4, bossScore: 7, result: "tie", knockback: 0,
    });
    expect(html).toContain("A tie!");
    expect(html).toContain("Both sides roll again");
    expect(html).not.toContain("Boss defeated!");
    expect(html).not.toContain("knocked back");
  });

  it("announces a loss and its knockback distance", () => {
    const html = render({
      ...playerRoll, playerRoll: 2, stage: "outcome", bossRoll: 3, bossFixed: 4, bossScore: 7, result: "lost", knockback: 8,
    });
    expect(html).toContain("The boss wins this fight");
    expect(html).toContain("knocked back 8 spaces");
    expect(html).toContain("The match continues");
  });
});
