import { describe, expect, it } from "vitest";
import { minigameCoinPayouts, minigamePrizes, pendingDecisions, resolvePhase, type Decision, type MatchState } from "../src/index";
import { makeMatch, singletonRanking } from "./helpers";

function atMinigame(playerCount: number): MatchState {
  const state = makeMatch(playerCount);
  state.phase = { kind: "minigame" };
  state.nextD12Round = 99;
  return state;
}

const coins = (state: MatchState) => state.players.map((p) => p.coins - state.rules.startingCoins);
const dice = (state: MatchState) => state.players.map((p) => p.dice.map((d) => d.sides));
const diceOf = (decision: Decision) => ("dice" in decision ? decision.dice : []);

/** Skips the item phase that opens in round 2. */
function toMove(state: MatchState): MatchState {
  return state.phase.kind === "items" ? resolvePhase(state, { kind: "items", choices: {} }).state : state;
}

describe("minigame rewards", () => {
  it("gives one d10 and decreasing coins in a 4-player match", () => {
    const state = atMinigame(4);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(dice(after)).toEqual([[10], [], [], []]);
    expect(coins(after)).toEqual([10, 5, 3, 0]);
  });

  it("gives three dice (d10, d8, d8) in a 12-player match", () => {
    const state = atMinigame(12);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });

    expect(dice(after).slice(0, 4)).toEqual([[10], [8], [8], []]);
    expect(dice(after).slice(4).flat()).toEqual([]);
    expect(coins(after)).toEqual([15, 11, 8, 6, 5, 4, 3, 2, 1, 0, 0, 0]);
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

  it("gives every tied first-place player the d10", () => {
    const state = atMinigame(4);
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: [["p1", "p2"], ["p3"], ["p4"]] });

    expect(coins(after)).toEqual([10, 10, 3, 0]);
    expect(dice(after).slice(0, 2)).toEqual([[10], [10]]);
  });

  it("gives every tied first-place player the top die when several players tie", () => {
    const state = atMinigame(8);
    const result = resolvePhase(state, {
      kind: "minigame",
      ranking: [["p1", "p2", "p3"], ["p4"], ["p5"], ["p6"], ["p7"], ["p8"]],
    });
    const topDieOwners = result.state.players
      .filter((player) => player.dice.some((die) => die.sides === 10))
      .map((player) => player.id);
    expect(topDieOwners.sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("gives every tied first-place player a d12 on a d12 round", () => {
    const state = atMinigame(4);
    state.nextD12Round = state.round;
    const { state: after } = resolvePhase(state, {
      kind: "minigame",
      ranking: [["p1", "p2"], ["p3"], ["p4"]],
    });
    expect(dice(after).slice(0, 2)).toEqual([[12], [12]]);
  });

  it("gives every player tied for second or third a d8", () => {
    const state = atMinigame(8);
    const result = resolvePhase(state, {
      kind: "minigame",
      ranking: [["p1"], ["p2", "p3"], ["p4"], ["p5"], ["p6"], ["p7", "p8"]],
    });
    for (const id of ["p2", "p3"]) {
      expect(result.state.players.find((player) => player.id === id)!.dice.map((die) => die.sides)).toEqual([8]);
    }
    expect(result.state.players.find((player) => player.id === "p1")!.dice.map((die) => die.sides)).toEqual([10]);
  });

  it("makes last place roll a d4 by default next round, and only next round", () => {
    const state = atMinigame(4);
    const first = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });
    expect(first.state.players.map((p) => p.defaultDie)).toEqual([6, 6, 6, 4]);

    const move = resolvePhase(toMove(first.state), { kind: "move", choices: {} });
    const p4Roll = move.events.find((e) => e.type === "dieRolled" && e.playerId === "p4");
    expect(p4Roll).toMatchObject({ sides: 4, saved: false });

    const next = { ...move.state, phase: { kind: "minigame" as const } };
    const reversed = singletonRanking(next).reverse();
    const second = resolvePhase(next, { kind: "minigame", ranking: reversed });
    expect(second.state.players.map((p) => p.defaultDie)).toEqual([4, 6, 6, 6]);
  });

  it("forces last place to roll the d4 next round, even if they pick a saved die", () => {
    const state = atMinigame(4);
    state.players[3]!.dice.push({ id: "die9", sides: 12 });
    const { state: after } = resolvePhase(state, { kind: "minigame", ranking: singletonRanking(state) });
    const p4 = (s: MatchState) => s.players.find((p) => p.id === "p4")!;
    expect(diceOf(pendingDecisions(toMove(after)).find((d) => d.playerId === "p4")!)).toEqual([{ id: null, sides: 4 }]);
    expect(diceOf(pendingDecisions(toMove(after)).find((d) => d.playerId === "p1")!).length).toBeGreaterThan(1);

    const move = resolvePhase(toMove(after), { kind: "move", choices: { p4: { die: "die9", lane: 0 } } });
    const roll = move.events.find((e) => e.type === "dieRolled" && e.playerId === "p4");
    expect(roll).toMatchObject({ sides: 4, saved: false });
    expect(p4(move.state).dice).toEqual([{ id: "die9", sides: 12 }]);
  });

  it("forces the d4 for a boss fight in that round too", () => {
    const state = makeMatch(4);
    const p1 = state.players[0]!;
    p1.defaultDie = 4;
    p1.dice.push({ id: "die9", sides: 12 });
    p1.position = state.board.finish;
    state.phase = { kind: "boss", challengers: ["p1"] };
    expect(diceOf(pendingDecisions(state)[0]!)).toEqual([{ id: null, sides: 4 }]);
    const { events } = resolvePhase(state, { kind: "boss", choices: { p1: { die: "die9" } } });
    expect(events.find((e) => e.type === "bossFight")).toMatchObject({ sides: 4, saved: false });
  });

  it("rejects a ranking that doesn't list every player exactly once", () => {
    const state = atMinigame(4);
    expect(() => resolvePhase(state, { kind: "minigame", ranking: [["p1"], ["p2"], ["p3"]] })).toThrow();
    expect(() => resolvePhase(state, { kind: "minigame", ranking: [["p1"], ["p1"], ["p2"], ["p3"]] })).toThrow();
  });

  it.each([4, 5, 6, 7, 8, 9, 10, 11, 12])("strictly decreases paid places with %i players", (count) => {
    const payouts = minigameCoinPayouts(count);
    const paid = count - Math.ceil(count / 4);
    expect(payouts).toHaveLength(count);
    expect(payouts.slice(paid)).toEqual(Array(count - paid).fill(0));
    expect(payouts[0]).toBe(count <= 6 ? 10 : count <= 9 ? 12 : 15);
    for (let i = 1; i < paid; i++) expect(payouts[i]!).toBeLessThan(payouts[i - 1]!);
    expect(payouts[paid - 1]!).toBeGreaterThan(0);
  });

  it("keeps the 12-player untied payout pool at 55 coins", () => {
    expect(minigameCoinPayouts(12).reduce((sum, coins) => sum + coins, 0)).toBe(55);
  });

  it("gives the entire last-place group zero coins and a d4, even when it starts in a paid place", () => {
    const state = atMinigame(4);
    const ranking = [["p1"], ["p2", "p3", "p4"]];
    const result = resolvePhase(state, { kind: "minigame", ranking });
    expect(coins(result.state)).toEqual([10, 0, 0, 0]);
    expect(result.state.players.map((p) => p.defaultDie)).toEqual([6, 4, 4, 4]);
    expect(minigamePrizes(ranking, result.events).p2!.d4).toBe(true);
  });

  it("awards every tied first-place player an item", () => {
    const result = resolvePhase(atMinigame(4), { kind: "minigame", ranking: [["p1", "p2"], ["p3"], ["p4"]] });
    const awards = result.events.filter((e) => e.type === "itemAwarded");
    expect(awards.map((e) => e.playerId)).toEqual(["p1", "p2"]);
    expect(awards[0]!.type === "itemAwarded" && awards[1]!.type === "itemAwarded"
      ? awards[0].item.kind === awards[1].item.kind
      : false).toBe(true);
  });

  it("gives all-first everyone first-place coins and an item, but no bonus dice", () => {
    const result = resolvePhase(atMinigame(4), { kind: "minigame", ranking: [["p1", "p2", "p3", "p4"]] });
    expect(coins(result.state)).toEqual([10, 10, 10, 10]);
    expect(dice(result.state).flat()).toEqual([]);
    expect(result.state.players.map((p) => p.defaultDie)).toEqual([6, 6, 6, 6]);
    expect(result.state.players.map((p) => p.items.length)).toEqual([1, 1, 1, 1]);
  });

  it.each([true, false])("gives all-last no coins or bonus prizes and everyone a d4 (explicit=%s)", (explicit) => {
    const ranking = [["p1", "p2", "p3", "p4"]];
    const played = {
      game: "mash" as const,
      scores: { p1: explicit ? 0 : null, p2: explicit ? 0 : null, p3: explicit ? 0 : null, p4: explicit ? 0 : null },
      ...(explicit ? { allLast: true } : {}),
    };
    const result = resolvePhase(atMinigame(4), { kind: "minigame", ranking, played });
    expect(coins(result.state)).toEqual([0, 0, 0, 0]);
    expect(dice(result.state).flat()).toEqual([]);
    expect(result.state.players.map((p) => p.defaultDie)).toEqual([4, 4, 4, 4]);
    expect(result.state.players.every((p) => p.items.length === 0)).toBe(true);
    expect(Object.values(minigamePrizes(ranking, result.events)).every((prize) => prize.d4)).toBe(true);
  });
});
