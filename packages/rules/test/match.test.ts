import { describe, expect, it } from "vitest";
import { createMatch, pendingDecisions, resolvePhase, runBotMatch } from "../src/index";
import { makeMatch } from "./helpers";

describe("createMatch", () => {
  it.each([3, 13])("rejects %i players", (count) => {
    expect(() => makeMatch(count)).toThrow();
  });

  it("rejects duplicate player ids", () => {
    const players = Array.from({ length: 4 }, () => ({ id: "same", name: "X", isBot: true }));
    expect(() => createMatch({ players, seed: 1 })).toThrow();
  });

  it("starts everyone on the start space with a d6", () => {
    const state = makeMatch(8);
    for (const player of state.players) {
      expect(player.position).toBe(state.board.start);
      expect(player.defaultDie).toBe(6);
    }
    expect(state.phase).toEqual({ kind: "move" });
  });
});

describe("move phase", () => {
  it("asks every player for a die and a path", () => {
    const state = makeMatch(7);
    const decisions = pendingDecisions(state);
    expect(decisions).toHaveLength(7);
    expect(decisions[0]).toMatchObject({
      playerId: "p1",
      kind: "move",
      dice: [{ id: null, sides: 6 }],
      lanes: 2,
      itemsAllowed: false,
      items: [],
      targets: ["p2", "p3", "p4", "p5", "p6", "p7"],
      maxHeld: 3,
    });
    expect(decisions[0]!.kind === "move" && decisions[0]!.trapSpaces.length).toBeGreaterThan(0);
  });

  it("uses up a saved die and rolls it", () => {
    const state = makeMatch(4);
    state.players[0]!.dice.push({ id: "die7", sides: 10 });
    const { state: after, events } = resolvePhase(state, { kind: "move", choices: { p1: { die: "die7", lane: 0 } } });

    expect(after.players[0]!.dice).toEqual([]);
    expect(events.find((e) => e.type === "dieRolled" && e.playerId === "p1")).toMatchObject({ sides: 10, saved: true });
  });

  it("falls back to the default die for an unknown die id", () => {
    const state = makeMatch(4);
    const { events } = resolvePhase(state, { kind: "move", choices: { p1: { die: "nope", lane: 0 } } });
    expect(events.find((e) => e.type === "dieRolled" && e.playerId === "p1")).toMatchObject({ sides: 6, saved: false });
  });

  it("does not mutate the state passed in", () => {
    const state = makeMatch(6);
    const before = structuredClone(state);
    resolvePhase(state, { kind: "move", choices: {} });
    expect(state).toEqual(before);
  });

  it("rejects input for the wrong phase", () => {
    const state = makeMatch(4);
    expect(() => resolvePhase(state, { kind: "minigame", ranking: [] })).toThrow(/move/);
  });
});

describe("full bot matches", () => {
  it.each([1, 2, 3, 4, 5])("a 6-bot match reaches a winner (seed %i)", (seed) => {
    const result = runBotMatch({ playerCount: 6, seed });
    expect(result.stalled).toBe(false);
    expect(result.winner).not.toBeNull();
    expect(result.events.at(-1)).toMatchObject({ type: "matchWon" });
  });

  it("replays identically from the same seed", () => {
    const a = runBotMatch({ playerCount: 12, seed: 42 });
    const b = runBotMatch({ playerCount: 12, seed: 42 });
    expect(a.events).toEqual(b.events);
  });
});
