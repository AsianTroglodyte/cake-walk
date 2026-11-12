import { describe, expect, it } from "vitest";
import {
  countThe,
  createRng,
  fourCorners,
  groupDice,
  headsTails,
  higherLower,
  insertCoins,
  laserFight,
  REALTIME_GAMES,
  ROUND_GAMES,
  rps,
  scoreYahtzee,
  shutBox,
  stairway,
  stairwayMaxStep,
  THE_PARAGRAPHS,
  theCount,
  threeCells,
  tileSets,
  timebomb,
  TIMEBOMB_AUTO_PASS_MS,
  type HigherLowerView,
  type PlayerId,
  type RoundGame,
  type TheCountView,
} from "../src/index";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function setupGame<S>(game: RoundGame<S>, players: PlayerId[], seed = 1) {
  const rng = createRng(seed);
  return { s: game.setup({ players, bots: players, rng }), rng };
}

/** Plays one round: given choices for some deciders, bots for the rest. */
function playRound<S, C>(game: RoundGame<S, C>, s: S, rng: ReturnType<typeof createRng>, given: Record<PlayerId, C> = {}) {
  game.beginRound?.(s);
  const choices: Record<PlayerId, C> = {};
  for (const id of game.deciders(s)) choices[id] = id in given ? given[id]! : game.bot(s, id, rng);
  game.resolve(s, choices, rng);
}

describe("every server minigame", () => {
  for (const [kind, game] of Object.entries(ROUND_GAMES)) {
    it(`${kind}: bots and timeouts always make valid choices, and the game ends with everyone ranked`, () => {
      for (const n of [4, 7, 12]) {
        for (let seed = 1; seed <= 40; seed++) {
          const players = ids(n);
          const { s, rng } = setupGame(game, players, seed);
          let rounds = 0;
          while (!game.done(s)) {
            expect(rounds++).toBeLessThan(60);
            game.beginRound?.(s);
            const choices: Record<PlayerId, unknown> = {};
            for (const id of game.deciders(s)) {
              const timeout = game.fallback(s, id, rng);
              expect(game.parse(s, id, timeout)).toEqual(timeout);
              const bot = game.bot(s, id, rng);
              expect(game.parse(s, id, bot)).toEqual(bot);
              choices[id] = seed % 2 ? bot : timeout;
            }
            game.resolve(s, choices, rng);
          }
          const { ranking, scores, labels } = game.result(s);
          expect(ranking.flat().sort()).toEqual([...players].sort());
          expect(Object.keys(scores).sort()).toEqual([...players].sort());
          expect(Object.keys(labels).sort()).toEqual([...players].sort());
          JSON.stringify(game.view(s, players[0]!));
        }
      }
    });
  }

  it("rejects junk input in every game", () => {
    for (const game of Object.values(ROUND_GAMES)) {
      const { s } = setupGame(game, ids(4));
      const id = game.deciders(s)[0]!;
      for (const junk of [undefined, "x", -1, 1e9, { a: 1 }, [99]]) {
        const parsed = game.parse(s, id, junk);
        if (parsed !== undefined) expect(game === ROUND_GAMES.theCount).toBe(true);
      }
    }
  });
});

describe("Rock Paper Scissors", () => {
  it("scores 1 point for every player you beat", () => {
    const { s, rng } = setupGame(rps, ["a", "b", "c", "d"]);
    playRound(rps, s, rng, { a: "rock", b: "scissors", c: "scissors", d: "paper" });
    expect(s.points).toEqual({ a: 2, b: 1, c: 1, d: 1 });
  });
});

describe("Stairway to Heaven", () => {
  it("scales the choices so spread-out picks always leave someone alone", () => {
    expect(stairwayMaxStep(4)).toBe(3);
    expect(stairwayMaxStep(5)).toBe(3);
    expect(stairwayMaxStep(12)).toBe(7);
    const { s } = setupGame(stairway, ids(12));
    expect(s.top).toBe(22);
  });

  it("only moves players whose number nobody else picked", () => {
    const { s, rng } = setupGame(stairway, ["a", "b", "c", "d"]);
    playRound(stairway, s, rng, { a: 3, b: 3, c: 2, d: 1 });
    expect(s.heights).toEqual({ a: 0, b: 0, c: 2, d: 1 });
    expect(stairway.parse(s, "a", 4)).toBeUndefined();
  });
});

describe("Group of Dice", () => {
  it("accepts any mix of up to 6 dice", () => {
    const { s } = setupGame(groupDice, ids(4));
    expect(groupDice.parse(s, "p0", { 20: 2, 4: 1 })).toEqual({ 20: 2, 4: 1 });
    expect(groupDice.parse(s, "p0", { 20: 4, 6: 3 })).toBeUndefined();
    expect(groupDice.parse(s, "p0", { 7: 1 })).toBeUndefined();
    expect(groupDice.parse(s, "p0", {})).toBeUndefined();
  });

  it("ranks the closest total without going over first, and busts last", () => {
    const { s } = setupGame(groupDice, ["a", "b", "c"]);
    s.target = 30;
    s.rolls = { a: [{ sides: 20, value: 20 }, { sides: 12, value: 9 }], b: [{ sides: 20, value: 31 }], c: [{ sides: 6, value: 5 }] };
    expect(groupDice.result(s).ranking).toEqual([["a"], ["c"], ["b"]]);
  });
});

describe("Heads or Tails", () => {
  it("doubles a right call, drops a wrong one to 0, and locks in a stop", () => {
    const { s, rng } = setupGame(headsTails, ["a", "b", "c", "d"]);
    playRound(headsTails, s, rng, { a: "heads", b: "tails", c: "stop", d: "stop" });
    const winner = s.last!.flip === "heads" ? "a" : "b";
    const loser = winner === "a" ? "b" : "a";
    expect(s.points[winner]).toBe(20);
    expect(s.points[loser]).toBe(0);
    expect(s.status).toMatchObject({ [loser]: "out", c: "stopped" });
    expect(headsTails.deciders(s)).toEqual([winner]);
  });
});

describe("Insert Coins", () => {
  it("needs all 10 coins across at least 2 boxes", () => {
    const { s } = setupGame(insertCoins, ["a", "b", "c", "d"]);
    expect(insertCoins.parse(s, "a", { a: 10 })).toBeUndefined();
    expect(insertCoins.parse(s, "a", { a: 5, b: 4 })).toBeUndefined();
    expect(insertCoins.parse(s, "a", { a: 5, z: 5 })).toBeUndefined();
    expect(insertCoins.parse(s, "a", { a: 5, b: 5, c: 0 })).toEqual({ a: 5, b: 5 });
  });

  it("counts every coin in your box, whoever put it there", () => {
    const { s, rng } = setupGame(insertCoins, ["a", "b", "c", "d"]);
    playRound(insertCoins, s, rng, { a: { a: 5, b: 5 }, b: { a: 8, c: 2 }, c: { c: 9, d: 1 }, d: { d: 6, b: 4 } });
    expect(s.boxes).toEqual({ a: 13, b: 9, c: 11, d: 7 });
    expect(insertCoins.result(s).ranking).toEqual([["a"], ["c"], ["b"], ["d"]]);
  });
});

describe("Three Cells", () => {
  it("drops the most crowded cell and scores the others", () => {
    const { s, rng } = setupGame(threeCells, ids(8));
    playRound(threeCells, s, rng, { p0: "A", p1: "A", p2: "A", p3: "A", p4: "A", p5: "B", p6: "B", p7: "C" });
    expect(s.last!.fallen).toEqual(["A"]);
    expect(s.points).toMatchObject({ p0: 0, p5: 3, p6: 3, p7: 4 });
  });

  it("drops every cell tied for the most", () => {
    const { s, rng } = setupGame(threeCells, ids(4));
    playRound(threeCells, s, rng, { p0: "A", p1: "A", p2: "B", p3: "B" });
    expect(s.last!.fallen).toEqual(["A", "B"]);
    expect(Object.values(s.points)).toEqual([0, 0, 0, 0]);
  });
});

describe("Four Corners", () => {
  it("knocks out everyone in the chosen corner and removes it", () => {
    const { s, rng } = setupGame(fourCorners, ["a", "b", "c", "d"]);
    playRound(fourCorners, s, rng, { a: 0, b: 1, c: 2, d: 3 });
    const chosen = s.last!.chosen;
    expect(s.corners).not.toContain(chosen);
    expect(Object.entries(s.outRound).filter(([, r]) => r === 1)).toHaveLength(1);
    expect(fourCorners.parse(s, "a", chosen)).toBeUndefined();
  });
});

describe("Higher or Lower", () => {
  it("shows each player only their own hints, and the secret only at the end", () => {
    const { s, rng } = setupGame(higherLower, ["a", "b", "c", "d"]);
    playRound(higherLower, s, rng, { a: 50, b: 50, c: 50, d: 50 });
    const view = higherLower.view(s, "a") as HigherLowerView;
    expect(view.you!.hints).toHaveLength(1);
    expect(view.secret).toBeNull();
    expect(view.guesses).toBeNull();
  });

  it("ranks by the round you found it, then by how close you got", () => {
    const { s, rng } = setupGame(higherLower, ["a", "b", "c", "d"]);
    s.secret = 40;
    playRound(higherLower, s, rng, { a: 40, b: 30, c: 60, d: 45 });
    playRound(higherLower, s, rng, { b: 40, c: 60, d: 45 });
    while (!higherLower.done(s)) playRound(higherLower, s, rng, { c: 60, d: 45 });
    expect(higherLower.result(s).ranking).toEqual([["a"], ["b"], ["d"], ["c"]]);
  });
});

describe("The", () => {
  it("only counts the standalone word", () => {
    expect(countThe("The theme: there, them, other, breathe. THE end, the.")).toBe(3);
  });

  it("has paragraphs with plenty of them", () => {
    expect(THE_PARAGRAPHS.length).toBeGreaterThanOrEqual(20);
    for (const p of THE_PARAGRAPHS) expect(countThe(p)).toBeGreaterThanOrEqual(6);
  });

  it("hides the paragraph once reading time is over", () => {
    const { s, rng } = setupGame(theCount, ["a", "b", "c", "d"]);
    expect((theCount.view(s, "a") as TheCountView).text).toBeTruthy();
    playRound(theCount, s, rng);
    expect((theCount.view(s, "a") as TheCountView).text).toBeNull();
    playRound(theCount, s, rng, { a: s.answer, b: s.answer + 3, c: null, d: s.answer - 3 });
    expect(theCount.result(s).ranking).toEqual([["a"], ["b", "d"], ["c"]]);
  });
});

describe("One Round Yahtzee", () => {
  it("scores the sum plus the best bonus", () => {
    expect(scoreYahtzee([5, 5, 5, 3, 2])).toEqual({ score: 35, bonus: "3 of a kind" });
    expect(scoreYahtzee([4, 4, 4, 4, 1])).toEqual({ score: 33, bonus: "4 of a kind" });
    expect(scoreYahtzee([3, 3, 2, 2, 2])).toEqual({ score: 24, bonus: "full house" });
    expect(scoreYahtzee([1, 2, 3, 4, 6])).toEqual({ score: 46, bonus: "small straight" });
    expect(scoreYahtzee([2, 3, 4, 5, 6])).toEqual({ score: 80, bonus: "large straight" });
    expect(scoreYahtzee([6, 6, 6, 6, 6])).toEqual({ score: 130, bonus: "Yahtzee" });
    expect(scoreYahtzee([1, 3, 5, 6, 2])).toEqual({ score: 17, bonus: null });
  });
});

describe("Clear The Numbers", () => {
  it("finds every set of open tiles that matches a roll", () => {
    expect(tileSets([1, 2, 3, 4], 5).map((t) => t.join("+"))).toEqual(["1+4", "2+3"]);
    expect(tileSets([6, 7], 5)).toEqual([]);
  });

  it("only accepts open tiles that add up to the roll", () => {
    const { s } = setupGame(shutBox, ["a", "b", "c", "d"]);
    s.roll.a = [3, 4];
    expect(shutBox.parse(s, "a", [7])).toEqual([7]);
    expect(shutBox.parse(s, "a", [3, 4])).toEqual([3, 4]);
    expect(shutBox.parse(s, "a", [6])).toBeUndefined();
    s.open.a = [1, 2, 5, 6];
    expect(shutBox.parse(s, "a", [7])).toBeUndefined();
    expect(shutBox.parse(s, "a", [1, 6])).toEqual([1, 6]);
  });
});

describe("Laser Fight", () => {
  it("bounces attacks off a defender, and both sides of a trade lose a life", () => {
    const { s, rng } = setupGame(laserFight, ["a", "b", "c", "d"]);
    playRound(laserFight, s, rng, {
      a: { kind: "attack", target: "b" },
      b: { kind: "defend" },
      c: { kind: "attack", target: "d" },
      d: { kind: "attack", target: "c" },
    });
    expect(s.lives).toEqual({ a: 2, b: 3, c: 2, d: 2 });
    expect(s.defends.b).toBe(2);
  });

  it("won't let you refrain two rounds in a row", () => {
    const { s, rng } = setupGame(laserFight, ["a", "b", "c", "d"]);
    playRound(laserFight, s, rng, { a: { kind: "refrain" }, b: { kind: "refrain" }, c: { kind: "refrain" }, d: { kind: "refrain" } });
    expect(laserFight.parse(s, "a", { kind: "refrain" })).toBeUndefined();
    expect(laserFight.parse(s, "a", { kind: "attack", target: "a" })).toBeUndefined();
  });
});

describe("Timebomb", () => {
  const start = 1_000;

  it("passes on Pass, scores time held, and ranks the holder at the explosion last", () => {
    const rng = createRng(5);
    const players = ["a", "b", "c", "d"];
    const s = timebomb.setup({ players, bots: [], rng }, start);
    const first = s.order[0]!;
    expect(timebomb.input(s, s.order[1]!, "pass", start + 100, rng)).toBe(false);
    expect(timebomb.input(s, first, "pass", start + 1_500, rng)).toBe(true);
    expect(s.held[first]).toBe(1_500);

    for (let t = start + 1_500; !timebomb.done(s); t += 500) timebomb.advance(s, t, rng);
    const { ranking } = timebomb.result(s);
    expect(ranking.at(-1)).toEqual([s.exploded]);
    expect(ranking.flat().sort()).toEqual(players);
    expect(s.endedAt).toBe(s.fuseAt);
  });

  it("passes automatically for a player who doesn't", () => {
    const rng = createRng(9);
    const s = timebomb.setup({ players: ["a", "b", "c", "d"], bots: [], rng }, start);
    s.fuseAt = start + 60_000;
    timebomb.advance(s, start + TIMEBOMB_AUTO_PASS_MS, rng);
    expect(s.holder).toBe(1);
    expect(timebomb.nextEventAt(s)).toBe(start + 2 * TIMEBOMB_AUTO_PASS_MS);
  });

  it("hides the fuse until it goes off, and a bots-only game finishes", () => {
    const rng = createRng(2);
    const players = ids(12);
    const s = REALTIME_GAMES.timebomb.setup({ players, bots: players, rng }, start);
    expect(JSON.stringify(timebomb.view(s, "p0"))).not.toContain(String(s.fuseAt));
    for (let next = timebomb.nextEventAt(s); next !== null; next = timebomb.nextEventAt(s)) timebomb.advance(s, next, rng);
    expect(s.fuseAt - start).toBeGreaterThanOrEqual(24_000);
    expect(s.fuseAt - start).toBeLessThanOrEqual(48_000);
  });
});
