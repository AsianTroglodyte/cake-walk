import { describe, expect, it } from "vitest";
import { resolvePhase, type MatchState } from "../src/index";
import { makeMatch, singletonRanking } from "./helpers";

function atMinigame(playerCount: number): MatchState {
  const state = makeMatch(playerCount);
  state.phase = { kind: "minigame" };
  state.nextD12Round = 99;
  return state;
}

const coins = (state: MatchState) => state.players.map((p) => p.coins - state.rules.startingCoins);
const dice = (state: MatchState) => state.players.map((p) => p.dice.map((d) => d.sides));

describe("minigame rewards", () => {
  it("gives one d10 and quartile coins in a 4-player match", () => {
    const state = atMinigame(4);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(dice(after)).toEqual([[10], [], [], []]);
    expect(coins(after)).toEqual([10, 6, 3, 0]);
  });

  it("gives three dice (d10, d8, d8) in a 12-player match", () => {
    const state = atMinigame(12);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(dice(after).slice(0, 4)).toEqual([[10], [8], [8], []]);
    expect(dice(after).slice(4).flat()).toEqual([]);
    expect(coins(after)).toEqual([10, 10, 10, 6, 6, 6, 3, 3, 3, 0, 0, 0]);
  });

  it("gives two dice in a 5-player match", () => {
    const state = atMinigame(5);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });
    expect(dice(after).flat()).toEqual([10, 8]);
  });

  it("swaps the d10 for a d12 on d12 rounds and schedules the next one 3 to 5 rounds out", () => {
    const state = atMinigame(4);
    state.nextD12Round = state.round;
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(dice(after)[0]).toEqual([12]);
    expect(after.nextD12Round - state.round).toBeGreaterThanOrEqual(3);
    expect(after.nextD12Round - state.round).toBeLessThanOrEqual(5);
  });

  it("gives tied first-place players the same coins and the d10 to one of them", () => {
    const state = atMinigame(4);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: [["p1", "p2"], ["p3"], ["p4"]] });

    expect(coins(after)).toEqual([10, 10, 3, 0]);
    expect(dice(after).slice(0, 2).flat()).toEqual([10]);
  });

  it("makes last place roll a d4 by default next round, and only next round", () => {
    const state = atMinigame(4);
    const first = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });
    expect(first.state.players.map((p) => p.defaultDie)).toEqual([6, 6, 6, 4]);

    const move = resolvePhase(first.state, { kind: "move", choices: {} });
    const p4Roll = move.events.find((e) => e.type === "dieRolled" && e.playerId === "p4");
    expect(p4Roll).toMatchObject({ sides: 4, saved: false });

    const next = { ...move.state, phase: { kind: "minigame" as const } };
    const reversed = singletonRanking(next).reverse();
    const second = resolvePhase(next, { kind: "minigame", ranking: reversed });
    expect(second.state.players.map((p) => p.defaultDie)).toEqual([4, 6, 6, 6]);
  });

  it("rejects a ranking that doesn't list every player exactly once", () => {
    const state = atMinigame(4);
    expect(() => resolvePhase(state, { kind: "minigame", ranking: [["p1"], ["p2"], ["p3"]] })).toThrow();
    expect(() => resolvePhase(state, { kind: "minigame", ranking: [["p1"], ["p1"], ["p2"], ["p3"]] })).toThrow();
  });
});
