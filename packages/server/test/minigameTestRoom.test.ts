import { describe, expect, it } from "vitest";
import { parseMinigameTestOptions } from "../src/minigameTestRoom";

describe("minigame test room options", () => {
  it("accepts any registered game and zero through eleven bots", () => {
    expect(parseMinigameTestOptions({ game: "colorPlatforms", bots: 0, name: "Tester" })).toMatchObject({
      game: "colorPlatforms",
      bots: 0,
      name: "Tester",
    });
    expect(parseMinigameTestOptions({ game: "reaction", bots: 11 })).toMatchObject({
      game: "reaction",
      bots: 11,
    });
  });

  it("rejects unknown games and bot counts outside the room capacity", () => {
    expect(() => parseMinigameTestOptions({ game: "not-a-game", bots: 0 })).toThrow(/minigame/);
    expect(() => parseMinigameTestOptions({ game: "reaction", bots: -1 })).toThrow(/bots/);
    expect(() => parseMinigameTestOptions({ game: "reaction", bots: 12 })).toThrow(/bots/);
  });
});
