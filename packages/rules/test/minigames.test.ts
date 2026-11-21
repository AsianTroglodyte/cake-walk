import { describe, expect, it } from "vitest";
import { createRng, isPlausibleScore, CLIENT_MINIGAME_KINDS, botMinigameScore, rankScores, reactionGoDelay, stopwatchTarget } from "../src/index";
import { MINIGAMES } from "../src/minigames";

describe("minigame ranking", () => {
  it("ranks Quick Draw by fastest reaction", () => {
    expect(rankScores("reaction", { a: 320, b: 210, c: 450 })).toEqual([["b"], ["a"], ["c"]]);
  });

  it("ranks Mash Race by most taps", () => {
    expect(rankScores("mash", { a: 30, b: 52, c: 41 })).toEqual([["b"], ["c"], ["a"]]);
  });

  it("ranks Stopwatch by closeness to the hidden target", () => {
    expect(rankScores("stopwatch", { close: 120, far: 1_500, tie: 120 })).toEqual([["close", "tie"], ["far"]]);
  });

  it("groups equal scores as a tie", () => {
    expect(rankScores("mash", { a: 40, b: 40, c: 12 })).toEqual([["a", "b"], ["c"]]);
  });

  it("puts everyone without a result together in last place", () => {
    expect(rankScores("reaction", { a: null, b: 250, c: null })).toEqual([["b"], ["a", "c"]]);
  });
});

describe("plausibility", () => {
  it("rejects reactions faster than a human can manage", () => {
    expect(isPlausibleScore("reaction", 40)).toBe(false);
    expect(isPlausibleScore("reaction", 240)).toBe(true);
  });

  it("rejects impossible tap counts and junk", () => {
    expect(isPlausibleScore("mash", 500)).toBe(false);
    expect(isPlausibleScore("mash", -1)).toBe(false);
    expect(isPlausibleScore("mash", Number.NaN)).toBe(false);
    expect(isPlausibleScore("mash", 45)).toBe(true);
  });

  it("only gives bots plausible scores", () => {
    const rng = createRng(3);
    for (const kind of CLIENT_MINIGAME_KINDS) {
      for (let i = 0; i < 200; i++) expect(isPlausibleScore(kind, botMinigameScore(kind, rng))).toBe(true);
    }
  });
});

describe("Quick Draw timing", () => {
  it("gives every browser the same GO moment for a seed", () => {
    expect(reactionGoDelay(1234)).toBe(reactionGoDelay(1234));
    expect(reactionGoDelay(1234)).toBeGreaterThanOrEqual(1_500);
    expect(reactionGoDelay(1234)).toBeLessThanOrEqual(4_000);
  });
});

describe("Stopwatch target", () => {
  it("is the same seeded random time for every player and stays between 10 and 20 seconds", () => {
    expect(stopwatchTarget(99)).toBe(stopwatchTarget(99));
    expect(stopwatchTarget(99)).toBeGreaterThanOrEqual(10_000);
    expect(stopwatchTarget(99)).toBeLessThanOrEqual(20_000);
  });

  it("gives bots tighter Stopwatch timing than before", () => {
    const rng = createRng(100);
    for (let i = 0; i < 200; i++) {
      const error = botMinigameScore("stopwatch", rng);
      expect(error).toBeGreaterThanOrEqual(50);
      expect(error).toBeLessThanOrEqual(500);
    }
  });
});

describe("Painter instructions", () => {
  it("explains that players paint by moving the mouse", () => {
    expect(MINIGAMES.painter.instructions).toContain("mouse");
    expect(MINIGAMES.painter.instructions).not.toContain("WASD");
  });
});
