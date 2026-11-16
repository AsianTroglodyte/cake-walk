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
  TIMEBOMB,
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
    expect(groupDice.parse(s, "p0", {})).toEqual({});
  });

  it("ranks the closest total without going over first, and busts last", () => {
    const { s } = setupGame(groupDice, ["a", "b", "c"]);
    s.target = 30;
    s.rolls = { a: [{ sides: 20, value: 20 }, { sides: 12, value: 9 }], b: [{ sides: 20, value: 31 }], c: [{ sides: 6, value: 5 }] };
    expect(groupDice.result(s).ranking).toEqual([["a"], ["c"], ["b"]]);
  });

  it("treats a no-dice choice as a forfeit ranked last", () => {
    const { s, rng } = setupGame(groupDice, ["a", "b", "c"]);
    s.target = 30;
    groupDice.resolve(s, { a: {}, b: { 20: 1 }, c: { 6: 1 } }, rng);
    expect(s.forfeited).toEqual(["a"]);
    expect(groupDice.result(s).ranking.at(-1)).toEqual(["a"]);
    expect(groupDice.result(s).labels.a).toBe("forfeited");
  });
});

describe("Heads or Tails", () => {
  it("adds/subtracts a wager and lets players sit out this round without stopping", () => {
    const { s, rng } = setupGame(headsTails, ["a", "b", "c", "d"]);
    playRound(headsTails, s, rng, { a: { call: "heads", wager: 3 }, b: { call: "tails", wager: 3 }, c: { call: "pass" }, d: { call: "pass" } });
    const winner = s.last!.flip === "heads" ? "a" : "b";
    const loser = winner === "a" ? "b" : "a";
    expect(s.points[winner]).toBe(13);
    expect(s.points[loser]).toBe(7);
    expect(s.status).toMatchObject({ [loser]: "betting", c: "betting", d: "betting" });
    expect(headsTails.deciders(s)).toEqual(["a", "b", "c", "d"]);
    expect(s.last!.gained).toMatchObject({ [winner]: 3, [loser]: -3, c: 0, d: 0 });
    expect(s.points).toMatchObject({ c: 10, d: 10 });
    expect(s.last!.calls.c).toEqual({ call: "pass" });
  });

  it("eliminates at exactly zero after an all-in loss", () => {
    const { s, rng } = setupGame(headsTails, ["a", "b"]);
    playRound(headsTails, s, rng, { a: { call: "heads", wager: 10 }, b: { call: "tails", wager: 10 } });
    const loser = s.last!.flip === "heads" ? "b" : "a";
    const winner = loser === "a" ? "b" : "a";
    expect(s.points).toMatchObject({ [loser]: 0, [winner]: 20 });
    expect(headsTails.deciders(s)).toEqual([winner]);
    expect(headsTails.parse(s, loser, { call: "heads", wager: 1 })).toBeUndefined();
  });

  it("validates wagers against the current balance, not the original balance", () => {
    const { s } = setupGame(headsTails, ["a", "b"]);
    s.points.a = 7;
    for (const wager of [0, -1, 8, 1.5, NaN, Infinity, "3", null, undefined]) {
      expect(headsTails.parse(s, "a", { call: "heads", wager })).toBeUndefined();
    }
    expect(headsTails.parse(s, "a", { call: "heads", wager: 1 })).toEqual({ call: "heads", wager: 1 });
    expect(headsTails.parse(s, "a", { call: "tails", wager: 7 })).toEqual({ call: "tails", wager: 7 });
    expect(headsTails.parse(s, "a", "heads")).toBeUndefined();
    expect(headsTails.parse(s, "a", { call: "pass" })).toEqual({ call: "pass" });
    expect(headsTails.parse(s, "a", { call: "stop" })).toBeUndefined();
    s.points.a = 20;
    expect(headsTails.parse(s, "a", { call: "heads", wager: 20 })).toEqual({ call: "heads", wager: 20 });
  });

  it("allows bots to pass the first round but guarantees a wager by their final round", () => {
    let passedFirstRound = false;
    let betFirstRound = false;
    for (let seed = 1; seed <= 100; seed++) {
      const { s, rng } = setupGame(headsTails, ["bot"], seed);
      const firstChoice = headsTails.bot(s, "bot", createRng(seed));
      passedFirstRound ||= firstChoice.call === "pass";
      betFirstRound ||= firstChoice.call !== "pass";
      for (let round = 0; round < s.rounds && !headsTails.done(s); round++) {
        const choice = headsTails.bot(s, "bot", rng);
        if (round === s.rounds - 1 && !s.betOnce.bot) expect(choice.call).not.toBe("pass");
        playRound(headsTails, s, rng, { bot: choice });
      }
      expect(s.betOnce.bot).toBe(true);
    }
    expect(passedFirstRound).toBe(true);
    expect(betFirstRound).toBe(true);
  });

  it("lets bots pass later rounds without leaving them out permanently", () => {
    const { s, rng } = setupGame(headsTails, ["a", "b"]);
    s.round = 1;
    playRound(headsTails, s, rng, { a: { call: "pass" }, b: { call: "heads", wager: 1 } });
    expect(headsTails.deciders(s)).toEqual(["a", "b"]);
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

  it("breaks equal results by faster answer time", () => {
    const { s, rng } = setupGame(higherLower, ["a", "b", "c", "d"]);
    s.secret = 40;
    s.round = 7;
    higherLower.onSubmit!(s, "a", 40, 2_000);
    higherLower.onSubmit!(s, "b", 40, 1_000);
    higherLower.onSubmit!(s, "c", 35, 2_500);
    higherLower.onSubmit!(s, "d", 45, 1_500);
    higherLower.resolve(s, { a: 40, b: 40, c: 35, d: 45 }, rng);
    expect(higherLower.result(s).ranking).toEqual([["b"], ["a"], ["d"], ["c"]]);
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

  it("breaks equal accuracy by server-measured guess speed, not reading speed", () => {
    const { s, rng } = setupGame(theCount, ["a", "b", "c", "d"]);
    theCount.onSubmit!(s, "a", null, 1);
    expect(s.answerMs.a).toBeNull();
    playRound(theCount, s, rng);
    theCount.onSubmit!(s, "a", s.answer, 4_000);
    theCount.onSubmit!(s, "b", s.answer, 1_000);
    theCount.onSubmit!(s, "c", s.answer + 1, 100);
    theCount.onSubmit!(s, "d", null, 10);
    expect((theCount.view(s, "a") as TheCountView).answerMs).toBeNull();
    playRound(theCount, s, rng, { a: s.answer, b: s.answer, c: s.answer + 1, d: null });
    expect(theCount.result(s).ranking).toEqual([["b"], ["a"], ["c"], ["d"]]);
    expect(theCount.result(s).labels.b).toContain("1.00s");
  });

  it("preserves genuine same-speed ties and does not let a second submission replace the first time", () => {
    const { s, rng } = setupGame(theCount, ["a", "b"]);
    playRound(theCount, s, rng);
    theCount.onSubmit!(s, "a", s.answer, 2_000);
    theCount.onSubmit!(s, "a", s.answer, 100);
    theCount.onSubmit!(s, "b", s.answer, 2_000);
    playRound(theCount, s, rng, { a: s.answer, b: s.answer });
    expect(theCount.result(s).ranking).toEqual([["a", "b"]]);
  });
});

describe("One Round Yahtzee", () => {
  it("scores the sum plus the best bonus", () => {
    expect(scoreYahtzee([5, 5, 5, 3, 2])).toEqual({ score: 35, bonus: "3 of a kind" });
    expect(scoreYahtzee([4, 4, 4, 4, 1])).toEqual({ score: 33, bonus: "4 of a kind" });
    expect(scoreYahtzee([3, 3, 2, 2, 2])).toEqual({ score: 24, bonus: "full house" });
    expect(scoreYahtzee([1, 1, 1, 6, 6])).toEqual({ score: 30, bonus: "full house" });
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

  it("eliminates the holder each explosion and ranks by survival order", () => {
    const rng = createRng(5);
    const players = ["a", "b", "c", "d"];
    const s = timebomb.setup({ players, bots: [], rng }, start);
    const first = s.order[s.holder]!;
    expect(timebomb.input(s, s.order[(s.holder + 1) % s.order.length]!, "pass", start + 100, rng)).toBe(false);
    expect(timebomb.input(s, first, "pass", start + 1_500, rng)).toBe(true);
    for (let t = start + 1_500; !timebomb.done(s); t += 500) timebomb.advance(s, t, rng);
    const { ranking } = timebomb.result(s);
    expect(ranking.at(-1)).toEqual([s.eliminated[0]]);
    expect(ranking.slice(1).flat()).toEqual([...s.eliminated].reverse());
    expect(ranking.flat().sort()).toEqual(players);
    expect(s.endedAt).toBe(s.fuseAt);
  });

  it("never auto-passes a human's bomb and enforces the 250ms catch lockout", () => {
    const rng = createRng(9);
    const s = timebomb.setup({ players: ["a", "b", "c", "d"], bots: [], rng }, start);
    const holder = s.order[s.holder]!;
    const fuse = s.fuseAt;
    expect(s.passAt).toBeNull();
    timebomb.advance(s, start + 4_000, rng);
    expect(s.order[s.holder]).toBe(holder);
    expect(timebomb.nextEventAt(s)).toBe(fuse);
    expect(timebomb.input(s, holder, "pass", start + TIMEBOMB.passLockoutMs - 1, rng)).toBe(false);
    expect(timebomb.input(s, holder, "pass", start + TIMEBOMB.passLockoutMs, rng)).toBe(true);
    const next = s.order[s.holder]!;
    expect(timebomb.input(s, next, "pass", start + 499, rng)).toBe(false);
    expect(timebomb.input(s, next, "pass", start + 500, rng)).toBe(true);
    expect(s.fuseAt).toBe(fuse);
  });

  it("hides the fuse and obsolete held-time stat, and a bots-only game finishes", () => {
    const rng = createRng(2);
    const players = ids(12);
    const s = REALTIME_GAMES.timebomb.setup({ players, bots: players, rng }, start);
    expect(s.fuseAt - start).toBeGreaterThanOrEqual(5_000);
    expect(s.fuseAt - start).toBeLessThanOrEqual(10_000);
    expect(JSON.stringify(timebomb.view(s, "p0"))).not.toContain(String(s.fuseAt));
    expect(JSON.stringify(timebomb.view(s, "p0"))).not.toContain("held");
    for (let next = timebomb.nextEventAt(s); next !== null; next = timebomb.nextEventAt(s)) timebomb.advance(s, next, rng);
    expect(s.eliminated).toHaveLength(11);
    expect(timebomb.done(s)).toBe(true);
    expect(timebomb.result(s).ranking).toHaveLength(12);
  });

  it("usually schedules bots to pass in the first second, but sometimes makes them hold longer", () => {
    const passDelays = Array.from({ length: 200 }, (_, i) => {
      const rng = createRng(i + 1);
      const players = ids(4);
      const s = timebomb.setup({ players, bots: players, rng }, start);
      return s.passAt! - start;
    });
    const early = passDelays.filter((delay) => delay >= 500 && delay <= 1_500);
    const late = passDelays.filter((delay) => delay > 1_500);
    expect(early.length).toBeGreaterThan(late.length);
    expect(late.length).toBeGreaterThan(0);
    expect(passDelays.every((delay) => delay >= 500 && delay <= 3_500)).toBe(true);
  });

  it("resets for exactly 2s, excludes eliminated players, and picks a random survivor", () => {
    const starts = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const rng = createRng(seed);
      const s = timebomb.setup({ players: ["a", "b", "c", "d"], bots: [], rng }, start);
      const victim = s.order[s.holder]!;
      const boom = s.fuseAt;
      timebomb.advance(s, boom, rng);
      expect(s.eliminated).toEqual([victim]);
      expect(timebomb.done(s)).toBe(false);
      expect(s.resetAt).toBe(boom + 2_000);
      expect(timebomb.input(s, victim, "pass", boom + 500, rng)).toBe(false);
      timebomb.advance(s, boom + 1_999, rng);
      expect(s.exploded).toBe(victim);
      timebomb.advance(s, boom + 2_000, rng);
      const holder = s.order[s.holder]!;
      expect(holder).not.toBe(victim);
      starts.add(String(s.order.filter((id) => id !== victim).indexOf(holder)));
      expect(s.exploded).toBeNull();
      expect(s.fuseAt - (boom + 2_000)).toBeGreaterThanOrEqual(5_000);
      expect(s.fuseAt - (boom + 2_000)).toBeLessThanOrEqual(10_000);
      expect(timebomb.input(s, victim, "pass", boom + 2_500, rng)).toBe(false);
      expect(timebomb.input(s, holder, "pass", s.fuseAt, rng)).toBe(false);
    }
    expect(starts.size).toBe(3);
  });
});
