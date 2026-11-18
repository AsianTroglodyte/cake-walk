import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ColorPlatforms, SingleWord } from "../src/games/new";

describe("Single Word presentation", () => {
  it("places entry above the scoreboard and highlights shared zero-point letters", () => {
    const html = renderToStaticMarkup(<SingleWord
      view={{
        round: 1,
        sharedThreshold: 2,
        scores: { a: 5, b: 3 },
        words: { a: ["APPLE"], b: ["BERRY"] },
        lastScores: { a: 1, b: 0 },
      }}
      me="a"
      players={["a", "b"]}
      name={(id) => id}
      color={() => "#000"}
      canPick
      submitted={null}
      stage="choosing"
      send={() => {}}
      now={0}
    />);

    expect(html.indexOf('class="new-game-form"')).toBeLessThan(html.indexOf('class="word-scoreboard-scroll"'));
    expect(html.match(/class="word-score-letter word-invalid-letter">E<\/span>/g)).toHaveLength(2);
  });

  it("visually marks the viewer's character in Color Platforms", () => {
    const html = renderToStaticMarkup(<ColorPlatforms
      view={{
        phase: "live",
        deadline: 10_000,
        round: 1,
        target: "green",
        targetSpots: 1,
        cols: 10,
        colors: Array(100).fill("red"),
        positions: { a: 0, b: 1 },
        alive: ["a", "b"],
      }}
      me="a"
      players={["a", "b"]}
      name={(id) => id}
      color={(id) => id === "a" ? "#f00" : "#00f"}
      canPick={false}
      submitted={null}
      stage="live"
      send={() => {}}
      now={0}
    />);

    expect(html).toContain("platform-tile-you");
    expect(html).toContain("platform-player-you");
    expect(html).toContain("Your character");
  });
});
