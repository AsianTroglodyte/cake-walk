import { describe, expect, it } from "vitest";
import { resolvePhase, runBossDuel, runShowdown, weakenBoss } from "../src/index";
import { makeMatch } from "./helpers";

const scripted = (...rolls: number[]) => () => {
  const next = rolls.shift();
  if (next === undefined) throw new Error("Ran out of scripted rolls");
  return next;
};

describe("runBossDuel", () => {
  it("wins by rolling higher than the fixed number plus the boss's d4", () => {
    const duel = runBossDuel(4, scripted(9), scripted(3));
    expect(duel).toEqual({ won: true, attempts: [{ playerRoll: 9, bossRoll: 3, bossScore: 7 }] });
  });

  it("rerolls both sides on a tie, then loses on a lower roll", () => {
    const duel = runBossDuel(4, scripted(5, 6), scripted(1, 4));
    expect(duel.won).toBe(false);
    expect(duel.attempts).toEqual([
      { playerRoll: 5, bossRoll: 1, bossScore: 5 },
      { playerRoll: 6, bossRoll: 4, bossScore: 8 },
    ]);
  });
});

describe("weakenBoss", () => {
  it("drops the fixed number by one per loss, never below the minimum", () => {
    expect(weakenBoss(4, 1, 1)).toBe(3);
    expect(weakenBoss(4, 2, 1)).toBe(2);
    expect(weakenBoss(2, 5, 1)).toBe(1);
  });
});

describe("boss phase", () => {
  function atBoss(challengers: string[]) {
    const state = makeMatch(6);
    for (const id of challengers) {
      const player = state.players.find((p) => p.id === id)!;
      player.position = state.board.finish;
      player.defaultDie = 4; // A d4 can never beat 4 + d4.
    }
    state.phase = { kind: "boss", challengers };
    return state;
  }

  it("knocks a loser back 6 to 10 spaces and weakens the boss", () => {
    const { state, events } = resolvePhase(atBoss(["p1"]), { kind: "boss", choices: {} });
    const p1 = state.players[0]!;

    expect(state.board.spaces[p1.position]!.distanceToFinish).toBeGreaterThanOrEqual(6);
    expect(state.board.spaces[p1.position]!.distanceToFinish).toBeLessThanOrEqual(10);
    expect(state.bossFixed).toBe(3);
    expect(events).toContainEqual({ type: "bossWeakened", from: 4, to: 3 });
    expect(state.phase).toEqual({ kind: "minigame" });
  });

  it("has simultaneous challengers fight the same boss, then shares the weakening", () => {
    const { state, events } = resolvePhase(atBoss(["p1", "p2"]), { kind: "boss", choices: {} });
    const fights = events.filter((e) => e.type === "bossFight");

    expect(fights.map((f) => f.bossFixed)).toEqual([4, 4]);
    expect(state.bossFixed).toBe(2);
  });

  it("uses up a saved die chosen for the fight", () => {
    const state = atBoss(["p1"]);
    state.players[0]!.dice.push({ id: "die99", sides: 12 });
    const { state: after, events } = resolvePhase(state, { kind: "boss", choices: { p1: { die: "die99" } } });

    expect(after.players[0]!.dice).toEqual([]);
    expect(events.find((e) => e.type === "bossFight")).toMatchObject({ sides: 12, saved: true });
  });
});

describe("runShowdown", () => {
  it("rerolls players tied for the highest roll until one wins", () => {
    const rolls: Record<string, number[]> = { a: [8, 3], b: [8, 7], c: [2] };
    const result = runShowdown(["a", "b", "c"], (id) => rolls[id]!.shift()!);

    expect(result.winner).toBe("b");
    expect(result.rounds).toEqual([{ a: 8, b: 8, c: 2 }, { a: 3, b: 7 }]);
  });
});
