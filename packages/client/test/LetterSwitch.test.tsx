import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LetterSwitch } from "../src/games/moreMinigames";

describe("Letter Switch", () => {
  it("does not reveal word validity or points before submission", () => {
    const html = renderToStaticMarkup(<LetterSwitch
      view={{
        round: 1,
        baseWord: "BAKE",
        scores: { p1: 0 },
        words: { p1: null },
        used: { p1: [] },
      }}
      me="p1"
      players={["p1"]}
      name={() => "Player"}
      color={() => "#000"}
      canPick
      submitted={null}
      stage="choosing"
      send={() => {}}
      now={0}
      until={10_000}
    />);

    expect(html).not.toContain("is valid");
    expect(html).not.toContain("is not valid");
    expect(html).not.toContain("points</p>");
  });

  it("shows the submitted result and points from the server after a round advances", () => {
    const html = renderToStaticMarkup(<LetterSwitch
      view={{
        round: 2,
        baseWord: "SILO",
        scores: { p1: 7 },
        words: { p1: "SAGE" },
        lastScores: { p1: 7 },
        used: { p1: ["SAGE"] },
      }}
      me="p1"
      players={["p1"]}
      name={() => "Player"}
      color={() => "#000"}
      canPick
      submitted={null}
      stage="choosing"
      send={() => {}}
      now={0}
      until={10_000}
    />);

    expect(html).toContain("SAGE is valid");
    expect(html).toContain("You gained 7 points");
  });

  it("shows zero points for an invalid submitted word after a round advances", () => {
    const html = renderToStaticMarkup(<LetterSwitch
      view={{
        round: 2,
        baseWord: "SILO",
        scores: { p1: 7 },
        words: { p1: "TAZE" },
        lastScores: { p1: 0 },
        used: { p1: ["TAZE"] },
      }}
      me="p1"
      players={["p1"]}
      name={() => "Player"}
      color={() => "#000"}
      canPick
      submitted={null}
      stage="choosing"
      send={() => {}}
      now={0}
      until={10_000}
    />);

    expect(html).toContain("TAZE is not valid");
    expect(html).toContain("You gained 0 points");
  });
});
