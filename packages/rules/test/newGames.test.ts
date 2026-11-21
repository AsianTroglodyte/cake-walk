import { describe, expect, it } from "vitest";
import {
  brawldle, calculator, COLOR_CODE_COLORS, colorCode, colorPlatforms, conquest, countTheDots,
  createRng, diceFleet, dotCollector, gridQuiz, hangman, hideAndSeek, isValidSingleWord,
  LETTER_VALUES, isValidLetterSwitchWord, letterSwitch, onTheDot, onTheDotPoint,
  onTheDotProgress, painter, singleWord,
  redLightGreenLight, snake, unstableMath,
} from "../src/index";
import { SINGLE_WORD_COMMON } from "../src/games/singleWordDictionary";
import { LETTER_SWITCH_COMMON_WORDS, LETTER_SWITCH_WORDS } from "../src/games/letterSwitchWords";

describe("new round minigames", () => {
  it("Calculator gives every player two starting values at every match size", () => {
    expect(calculator.setup({ players: ["a", "b", "c", "d"], bots: [], rng: createRng(1) }).values.a).toEqual([1, 1]);
    expect(calculator.setup({ players: Array.from({ length: 7 }, (_, i) => `p${i}`), bots: [], rng: createRng(1) }).values.p0).toEqual([1, 1]);
    expect(calculator.setup({ players: Array.from({ length: 12 }, (_, i) => `p${i}`), bots: [], rng: createRng(1) }).values.p11).toEqual([1, 1]);
  });

  it("Calculator randomizes the turn order", () => {
    const state = calculator.setup({ players: ["a", "b", "c", "d"], bots: [], rng: createRng(42) });
    expect([...state.turnOrder].sort()).toEqual(["a", "b", "c", "d"]);
    expect(state.current).toBe(state.turnOrder[0]);
  });

  it("Calculator eliminates a value at exactly five and wraps totals over five", () => {
    const state = calculator.setup({ players: ["a", "b"], bots: [], rng: createRng(2) });
    state.values.a = [4, 1];
    state.values.b = [1, 1];
    state.current = "a";
    calculator.resolve(state, { a: { source: 0, target: "b", slot: 0 } }, createRng(3));
    expect(state.values.b[0]).toBe(0);
    expect(state.current).toBe("b");
    state.values.b[0] = 3;
    state.values.a = [3, 1];
    calculator.resolve(state, { b: { source: 0, target: "a", slot: 0 } }, createRng(4));
    expect(state.values.a[0]).toBe(1);
  });

  it("Calculator bots choose an immediate knockout", () => {
    let picked: { state: ReturnType<typeof calculator.setup>; rng: ReturnType<typeof createRng>; choice: ReturnType<NonNullable<typeof calculator.bot>> } | undefined;
    for (let seed = 1; seed <= 50 && !picked; seed++) {
      const rng = createRng(seed);
      const state = calculator.setup({ players: ["bot", "victim", "other"], bots: ["bot"], rng });
      state.current = "bot";
      state.values.bot = [4, 1];
      state.values.victim = [1, 0];
      state.values.other = [1, 1];
      const choice = calculator.bot!(state, "bot", rng);
      if (choice.target === "victim" && choice.source === 0 && choice.slot === 0) picked = { state, rng, choice };
    }
    expect(picked).toBeDefined();
    const { state, rng, choice } = picked!;
    expect(choice).toMatchObject({ source: 0, target: "victim", slot: 0 });

    calculator.resolve(state, { bot: choice }, rng);
    expect(state.values.victim).toEqual([0, 0]);
    expect(state.eliminated).toContain("victim");
  });

  it("Calculator bots sometimes deviate with a random legal move", () => {
    let deviated = false;
    for (let seed = 1; seed <= 50; seed++) {
      const rng = createRng(seed);
      const state = calculator.setup({ players: ["bot", "victim", "other"], bots: ["bot"], rng });
      state.current = "bot";
      state.values.bot = [4, 1];
      state.values.victim = [1, 0];
      state.values.other = [1, 1];
      const choice = calculator.bot!(state, "bot", rng);
      if (choice.target !== "victim" || choice.source !== 0) deviated = true;
      expect(calculator.parse(state, "bot", choice)).toBeDefined();
    }
    expect(deviated).toBe(true);
  });

  it("Calculator ends when one player remains, and the turn cap awards the win to all survivors", () => {
    const state = calculator.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(13) });
    state.values.a = [1, 0];
    state.values.b = [0, 0];
    state.values.c = [0, 0];
    expect(calculator.done(state)).toBe(true);
    expect(calculator.result(state).ranking).toEqual([["a"], ["b", "c"]]);

    state.values.a = [1, 1];
    state.values.b = [1, 1];
    state.values.c = [1, 1];
    state.turns = 49;
    state.current = "a";
    calculator.resolve(state, { a: { source: 0, target: "b", slot: 0 } }, createRng(14));
    state.values.a = [1, 1];
    state.values.b = [2, 2];
    state.values.c = [1, 0];
    expect(calculator.done(state)).toBe(true);
    expect(calculator.result(state).ranking).toEqual([["a"], ["b"], ["c"]]);
  });

  it("Calculator ranks eliminated players by how long they lasted", () => {
    const state = calculator.setup({ players: ["winner", "firstOut", "lastOut"], bots: [], rng: createRng(15) });
    state.values = { winner: [1, 1], firstOut: [0, 0], lastOut: [0, 0] };
    state.eliminated = ["firstOut", "lastOut"];

    expect(calculator.result(state).ranking).toEqual([["winner"], ["lastOut"], ["firstOut"]]);
  });

  it("Single Word uses the lobby-size thresholds and scores shared letters as zero", () => {
    for (const [count, threshold] of [[4, 2], [6, 2], [7, 3], [9, 3], [10, 4], [12, 4]]) {
      const lobby = singleWord.setup({
        players: Array.from({ length: count }, (_, index) => `p${index}`),
        bots: [],
        rng: createRng(count),
      });
      expect(lobby.sharedThreshold).toBe(threshold);
    }
    const four = singleWord.setup({ players: ["a", "b", "c", "d"], bots: [], rng: createRng(1) });
    singleWord.resolve(four, Object.fromEntries(four.players.map((id) => [id, { word: "APPLE" }])), createRng(2));
    expect(four.lastScores.a).toBe(0);
  });

  it("Single Word accepts dictionary and vulgar words while rejecting made-up words", () => {
    expect(isValidSingleWord("APPLE")).toBe(true);
    expect(isValidSingleWord("ZZZZZ")).toBe(false);
    expect(isValidSingleWord("BITCH")).toBe(true);
    expect(isValidSingleWord("fucks")).toBe(true);
    expect(isValidSingleWord("penis")).toBe(true);
    const state = singleWord.setup({ players: ["a"], bots: [], rng: createRng(4) });
    expect(singleWord.parse(state, "a", { word: "QWERT" })).toBeUndefined();
    expect(singleWord.parse(state, "a", { word: "BITCH" })).toEqual({ word: "BITCH" });
    expect(singleWord.parse(state, "a", { word: "penis" })).toEqual({ word: "PENIS" });
  });

  it("Single Word bots favor familiar words, vary their choices, and don't always maximize points", () => {
    const state = singleWord.setup({ players: ["bot"], bots: ["bot"], rng: createRng(1) });
    const choices = Array.from({ length: 40 }, (_, seed) => singleWord.bot!(state, "bot", createRng(seed + 1)).word);
    const commonChoices = choices.filter((word) => SINGLE_WORD_COMMON.includes(word.toLowerCase()));
    const values = choices.map((word) => [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] ?? 0), 0));
    expect(choices.every(isValidSingleWord)).toBe(true);
    expect(choices).not.toContain("BITCH");
    expect(choices.every((word) => !["BITCH", "BOOBS", "COCKS", "CRAPS", "CUNTS", "DICKS", "FANNY", "FUCKS", "PENIS", "PRICK", "PUSSY", "SHITS", "SLAGS", "TWATS", "TWERK", "WANKS", "WHORE"].includes(word))).toBe(true);
    expect(new Set(choices).size).toBeGreaterThan(10);
    expect(commonChoices.length).toBeGreaterThan(30);
    expect(new Set(values).size).toBeGreaterThan(3);
  });
});

describe("new real-time minigames", () => {
  it("Color Code shares one hidden code and continues after a player cracks it", () => {
    const game = colorCode;
    const state = game.setup({ players: ["a", "b"], bots: [], rng: createRng(1) }, 1_000);
    expect(state.code).toHaveLength(4);
    expect(new Set(state.code).size).toBe(4);
    expect(game.view(state, "a")).not.toHaveProperty("yours.code");
    expect(game.view(state, "b")).not.toHaveProperty("yours.code");
    expect(game.input(state, "a", { kind: "guess", colors: state.code }, 2_000, createRng(2))).toBe(true);
    expect(game.done(state)).toBe(false);
    expect(state.solvedAt.a).toBe(2_000);
    expect(game.input(state, "b", { kind: "guess", colors: state.code }, 3_000, createRng(3))).toBe(true);
    expect(game.done(state)).toBe(true);
    expect(game.result(state).ranking).toEqual([["a"], ["b"]]);
    expect(game.result(state).labels?.a).toBe("solved in 1.00s");
  });

  it("Color Code bots use previous feedback to narrow candidates to the secret", () => {
    const state = colorCode.setup({ players: ["bot", "human"], bots: ["bot"], rng: createRng(8) }, 0);
    const codes = COLOR_CODE_COLORS.flatMap((first) =>
      COLOR_CODE_COLORS.filter((second) => second !== first).flatMap((second) =>
        COLOR_CODE_COLORS.filter((third) => third !== first && third !== second).flatMap((third) =>
          COLOR_CODE_COLORS.filter((fourth) => fourth !== first && fourth !== second && fourth !== third)
            .map((fourth) => [first, second, third, fourth]),
        ),
      ),
    );
    state.guesses.bot = codes.map((colors) => ({
      colors,
      correct: colors.reduce((count, color, index) => count + (color === state.code[index] ? 1 : 0), 0),
      at: 0,
    }));
    state.nextBotAt.bot = 100;

    colorCode.advance(state, 100, createRng(9));

    expect(state.guesses.bot.at(-1)?.colors).toEqual(state.code);
    expect(state.solvedAt.bot).toBe(100);
    expect(colorCode.done(state)).toBe(false);
  });

  it("Color Code bots wait several seconds between logical guesses", () => {
    const startAt = 5_000;
    const state = colorCode.setup({ players: ["bot", "human"], bots: ["bot"], rng: createRng(81) }, startAt);
    expect(state.endAt - startAt).toBe(60_000);
    const firstGuessAt = state.nextBotAt.bot!;
    expect(firstGuessAt - startAt).toBeGreaterThanOrEqual(5_000);
    expect(firstGuessAt - startAt).toBeLessThanOrEqual(15_000);

    colorCode.advance(state, firstGuessAt, createRng(82));

    expect(state.guesses.bot).toHaveLength(1);
    expect(state.nextBotAt.bot! - firstGuessAt).toBeGreaterThanOrEqual(2_000);
    expect(state.nextBotAt.bot! - firstGuessAt).toBeLessThanOrEqual(13_000);
  });

  it("Color Code bots make a random valid first guess", () => {
    const firstGuesses = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const state = colorCode.setup({ players: ["bot", "human"], bots: ["bot"], rng }, 0);
      colorCode.advance(state, state.nextBotAt.bot!, rng);
      const first = state.guesses.bot[0]!.colors;
      expect(new Set(first).size).toBe(4);
      firstGuesses.add(first.join(","));
    }
    expect(firstGuesses.size).toBeGreaterThan(1);
  });

  it("Color Code bot solve times usually land between 20 and 60 seconds", () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const state = colorCode.setup({ players: ["bot", "human"], bots: ["bot"], rng }, 0);
      while (!colorCode.done(state)) {
        colorCode.advance(state, colorCode.nextEventAt(state)!, rng);
      }
      if (state.solvedAt.bot !== null) times.push(state.solvedAt.bot / 1000);
    }

    const inTargetWindow = times.filter((seconds) => seconds >= 20 && seconds <= 60);
    const average = times.reduce((sum, seconds) => sum + seconds, 0) / times.length;
    expect(times.length).toBeGreaterThanOrEqual(90);
    expect(inTargetWindow.length).toBeGreaterThanOrEqual(85);
    expect(average).toBeGreaterThanOrEqual(35);
    expect(average).toBeLessThanOrEqual(50);
  });

  it("Color Platforms uses a 10x10 grid with one fewer target platform than players", () => {
    const state = colorPlatforms.setup({ players: ["a", "b"], bots: [], rng: createRng(1) }, 0);
    expect(state.colors).toHaveLength(100);
    expect(state.colors.filter((color) => color === state.target)).toHaveLength(1);
    state.positions.a = state.colors.findIndex((color) => color !== state.target);
    state.positions.b = state.colors.findIndex((color) => color === state.target);
    colorPlatforms.advance(state, state.deadline, createRng(2));
    expect(state.alive).toEqual(["b"]);
    expect(state.phase).toBe("done");
  });

  it("gives every Color Platforms round a full ten seconds", () => {
    const state = colorPlatforms.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(12) }, 1_000);
    expect(state.deadline).toBe(11_000);
    const targetCells = state.colors.flatMap((cell, index) => cell === state.target ? [index] : []);
    state.positions.a = targetCells[0]!;
    state.positions.b = targetCells[1]!;
    state.positions.c = state.colors.findIndex((cell) => cell !== state.target);
    colorPlatforms.advance(state, state.deadline, createRng(13));
    expect(state.phase).toBe("buffer");
    colorPlatforms.advance(state, state.deadline, createRng(14));
    expect(state.deadline - 13_000).toBe(10_000);
  });

  it("ends the round as soon as all target platforms are occupied and reports who was eliminated", () => {
    const state = colorPlatforms.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(15) }, 1_000);
    const targetCells = state.colors.flatMap((color, index) => color === state.target ? [index] : []);
    expect(targetCells).toHaveLength(2);
    state.positions.a = targetCells[0]!;
    state.positions.b = targetCells[1]!;
    state.positions.c = state.colors.findIndex((color) => color !== state.target);

    colorPlatforms.advance(state, state.deadline - 1, createRng(16));

    expect(state.phase).toBe("buffer");
    expect(state.alive).toEqual(["a", "b"]);
    expect(state.eliminatedThisRound).toEqual(["c"]);
    expect(colorPlatforms.view(state, "a")).toMatchObject({ eliminatedThisRound: ["c"] });
  });

  it("Color Platforms starts players apart and rejects moves onto occupied cells", () => {
    const state = colorPlatforms.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(6) }, 0);
    expect(new Set(Object.values(state.positions)).size).toBe(3);

    state.positions.a = 20;
    state.positions.b = 21;
    state.positions.c = 99;
    expect(colorPlatforms.input(state, "a", { kind: "move", direction: "right" }, 0, createRng(7))).toBe(false);
    expect(state.positions.a).toBe(20);
    expect(colorPlatforms.input(state, "a", { kind: "move", direction: "up" }, 200, createRng(8))).toBe(true);
    expect(state.positions.a).toBe(10);
  });

  it("Color Platforms bots follow shortest routes to the nearest open target platforms", () => {
    const state = colorPlatforms.setup({ players: ["direct", "random", "third", "human"], bots: ["direct", "random", "third"], rng: createRng(5) }, 0);
    expect(new Set(Object.values(state.botMoveInterval)).size).toBeGreaterThan(1);
    expect(Object.values(state.botMoveInterval).every((interval) => interval >= 315 && interval <= 675)).toBe(true);
    state.target = "purple";
    state.colors.fill("red");
    state.colors[20] = "purple";
    state.colors[24] = "purple";
    state.positions.direct = 0;
    state.positions.random = 2;
    state.positions.third = 50;
    state.positions.human = 99;

    const firstMoveAt = Math.min(...Object.values(state.nextBotAt));
    colorPlatforms.advance(state, firstMoveAt - 1, createRng(9));
    expect(state.positions.direct).toBe(0);
    expect(state.positions.random).toBe(2);
    colorPlatforms.advance(state, firstMoveAt, createRng(9));
    expect(Object.entries(state.positions).some(([id, position]) =>
      id !== "human" && position !== (id === "direct" ? 0 : id === "random" ? 2 : 50))).toBe(true);
    colorPlatforms.advance(state, 3_500, createRng(10));

    expect(state.colors[state.positions.direct]).toBe("purple");
    expect(state.colors[state.positions.random]).toBe("purple");
    expect(state.positions.direct).not.toBe(state.positions.random);
  });

  it("reduces the next round's target platform count when players are eliminated", () => {
    const state = colorPlatforms.setup({ players: ["a", "b", "c", "d"], bots: [], rng: createRng(8) }, 0);
    expect(state.colors.filter((color) => color === state.target)).toHaveLength(3);
    const targetCell = state.colors.findIndex((color) => color === state.target);
    state.positions.a = targetCell;
    state.positions.b = targetCell;
    state.positions.c = targetCell;
    state.positions.d = state.colors.findIndex((color) => color !== state.target);
    colorPlatforms.advance(state, state.deadline, createRng(9));
    expect(state.alive).toHaveLength(3);
    colorPlatforms.advance(state, state.deadline, createRng(10));
    expect(state.colors.filter((color) => color === state.target)).toHaveLength(2);
  });

  it("continues beyond ten rounds while more than one player survives", () => {
    const state = colorPlatforms.setup({ players: ["a", "b"], bots: [], rng: createRng(11) }, 0);
    for (let round = 1; round <= 11; round++) {
      if (state.phase === "buffer") colorPlatforms.advance(state, state.deadline, createRng(round + 20));
      expect(state.colors.filter((color) => color === state.target)).toHaveLength(1);
      const targetCell = state.colors.findIndex((color) => color === state.target);
      state.positions.a = targetCell;
      state.positions.b = targetCell;
      colorPlatforms.advance(state, state.deadline, createRng(round + 40));
      expect(state.phase).toBe("buffer");
    }
    expect(state.round).toBe(11);
    expect(colorPlatforms.done(state)).toBe(false);
  });

  it("Painter claims empty grid cells and ends after its 20-second timer", () => {
    const game = painter;
    const state = game.setup({ players: ["a", "b"], bots: [], rng: createRng(3) }, 0);
    const startScore = state.scores.a;
    expect(game.input(state, "a", { kind: "move", direction: "right" }, 200, createRng(4))).toBe(true);
    expect(state.scores.a).toBeGreaterThanOrEqual(startScore);
    game.advance(state, state.endAt, createRng(5));
    expect(game.done(state)).toBe(true);
  });

  it("Painter can paint over another player's cells and updates both scores", () => {
    const state = painter.setup({ players: ["a", "b"], bots: [], rng: createRng(6) }, 0);
    state.positions.a = { x: 0.65, y: 0.5 };
    state.positions.b = { x: 2.5, y: 0.5 };
    state.grid[0] = "a";
    state.grid[1] = "b";
    state.grid[2] = "b";
    state.scores.a = 1;
    state.scores.b = 2;

    expect(painter.input(state, "a", { kind: "move", direction: "right" }, 115, createRng(7))).toBe(true);

    expect(state.grid[1]).toBe("a");
    expect(state.scores).toMatchObject({ a: 2, b: 1 });
  });

  it("Painter blocks movement onto another player's occupied space", () => {
    const state = painter.setup({ players: ["a", "b"], bots: [], rng: createRng(7) }, 0);
    state.positions.a = { x: 0.5, y: 0.5 };
    state.positions.b = { x: 1.2, y: 0.5 };
    state.grid[0] = "a";
    state.grid[1] = "b";

    expect(painter.input(state, "a", { kind: "move", direction: "right" }, 115, createRng(8))).toBe(true);

    expect(state.positions.a).toEqual({ x: 0.5, y: 0.5 });
    expect(state.positions.b).toEqual({ x: 1.2, y: 0.5 });
    expect(state.grid[1]).toBe("b");
  });

  it("Painter moves diagonally and switches direction without waiting for the movement interval", () => {
    const state = painter.setup({ players: ["a", "b"], bots: [], rng: createRng(8) }, 0);
    state.positions.a = { x: 5.5, y: 5.5 };
    state.positions.b = { x: 20.5, y: 10.5 };

    expect(painter.input(state, "a", { kind: "move", direction: "upRight" }, 1, createRng(9))).toBe(true);
    expect(state.positions.a!.x).toBeCloseTo(5.5 + Math.SQRT1_2 * 0.75);
    expect(state.positions.a!.y).toBeCloseTo(5.5 - Math.SQRT1_2 * 0.75);

    expect(painter.input(state, "a", { kind: "move", direction: "downLeft" }, 2, createRng(10))).toBe(true);
    expect(state.positions.a!.x).toBeCloseTo(5.5);
    expect(state.positions.a!.y).toBeCloseTo(5.5);
  });

  it("Painter follows cursor targets continuously and paints cells along the way", () => {
    const state = painter.setup({ players: ["a", "b"], bots: [], rng: createRng(9) }, 0);
    state.positions.a = { x: 1.5, y: 1.5 };
    state.positions.b = { x: 20.5, y: 10.5 };
    state.grid.fill(null);
    state.grid[25] = "a";
    state.grid[260] = "b";
    state.scores.a = 1;
    state.scores.b = 1;

    expect(painter.input(state, "a", { kind: "cursor", x: 5.5, y: 1.5 }, 10, createRng(10))).toBe(true);
    expect(state.positions.a!.x).toBeCloseTo(2.25);
    expect(painter.nextEventAt(state)).toBe(65);

    painter.advance(state, 65, createRng(11));
    expect(state.positions.a!.x).toBeCloseTo(3);
    expect(state.grid[27]).toBe("a");
  });

  it("Painter bots fill nearby white cells before repainting the leader", () => {
    const state = painter.setup({ players: ["bot", "leader"], bots: ["bot"], rng: createRng(9) }, 0);
    state.grid.fill("leader");
    state.grid[0] = "bot";
    state.grid[2] = null;
    state.positions.bot = { x: 0.5, y: 0.5 };
    state.positions.leader = { x: 23.5, y: 13.5 };
    state.scores.bot = 1;
    state.scores.leader = 334;
    state.nextBotAt.bot = 85;

    painter.advance(state, 85, createRng(10));
    expect(state.positions.bot!.x).toBeCloseTo(1.25);
    painter.advance(state, 170, createRng(11));
    expect(state.positions.bot!.x).toBeCloseTo(2);
    expect(state.grid[1]).toBe("bot");
  });

  it("Painter bots target opponents instead of wandering, favoring the leading player's area", () => {
    let leaderwardSteps = 0;
    let rivalwardSteps = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = painter.setup({ players: ["bot", "leader", "rival"], bots: ["bot"], rng: createRng(seed) }, 0);
      for (let y = 0; y < 14; y++) {
        for (let x = 0; x < 24; x++) state.grid[y * 24 + x] = x < 12 ? "rival" : x > 12 ? "leader" : "bot";
      }
      state.positions.bot = { x: 12.5, y: 7.5 };
      state.positions.leader = { x: 23.5, y: 13.5 };
      state.positions.rival = { x: 0.5, y: 0.5 };
      state.scores.bot = 14;
      // Scores are set independently to isolate target preference from area size.
      state.scores.leader = 200;
      state.scores.rival = 100;
      state.nextBotAt.bot = 85;

      painter.advance(state, 85, createRng(seed + 100));
      if (state.positions.bot!.x > 12.5) leaderwardSteps++;
      else if (state.positions.bot!.x < 12.5) rivalwardSteps++;
      else throw new Error("Full-board bot should pursue an opponent rather than wander");
    }
    expect(rivalwardSteps).toBeGreaterThan(0);
    expect(leaderwardSteps).toBeGreaterThan(rivalwardSteps);
  });

  it("Painter bots move slightly slower than players", () => {
    const state = painter.setup({ players: ["bot", "human"], bots: ["bot"], rng: createRng(14) }, 100);
    expect(state.nextBotAt.bot).toBe(185);

    painter.advance(state, 185, createRng(15));

    expect(state.nextBotAt.bot).toBe(270);
  });
});

describe("new minigames from mechanics document", () => {
  it("On The Dot starts bots across the whole field rather than in a dot-centered formation", () => {
    const bots = ["b1", "b2", "b3", "b4", "b5"];
    const state = onTheDot.setup({ players: ["human", ...bots], bots, rng: createRng(76) }, 0);
    const xs = bots.map((id) => state.positions[id]!.x);
    const ys = bots.map((id) => state.positions[id]!.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.4);
  });

  it("On The Dot bots retarget and move with irregular timing", () => {
    const state = onTheDot.setup({ players: ["bot", "human"], bots: ["bot"], rng: createRng(75) }, 0);
    const before = { ...state.positions.bot! };
    const oldPlan = { offset: { ...state.botOffsets.bot! }, roam: state.botRoamTargets.bot };
    state.nextBotAt.bot = 100;
    state.botRetargetAt.bot = 100;

    onTheDot.advance(state, 100, createRng(76));

    expect(state.positions.bot).not.toEqual(before);
    const offsetChanged = state.botOffsets.bot!.x !== oldPlan.offset.x || state.botOffsets.bot!.y !== oldPlan.offset.y;
    expect(state.botRoamTargets.bot !== oldPlan.roam || offsetChanged).toBe(true);
    expect(state.nextBotAt.bot).toBeGreaterThan(100);
    expect(state.nextBotAt.bot).toBeLessThanOrEqual(290);
  });

  it("On The Dot bots can roam independently to distant points", () => {
    const state = onTheDot.setup({ players: ["bot", "human"], bots: ["bot"], rng: createRng(74) }, 0);
    state.positions.bot = { x: 0.5, y: 0.5 };
    state.positions.human = { x: 0.25, y: 0.25 };
    state.botRoamTargets.bot = { x: 0.95, y: 0.95 };
    state.botRetargetAt.bot = 10_000;
    state.nextBotAt.bot = 100;

    onTheDot.advance(state, 100, createRng(77));

    expect(state.positions.bot!.x).toBeGreaterThan(0.5);
    expect(state.positions.bot!.y).toBeGreaterThan(0.5);
  });

  it("On The Dot randomizes a steady speed at setup and moves around the full path", () => {
    const a = onTheDot.setup({ players: ["a"], bots: [], rng: createRng(75) }, 0);
    const b = onTheDot.setup({ players: ["a"], bots: [], rng: createRng(76) }, 0);
    expect(a.dotCycles).toBeGreaterThanOrEqual(1);
    expect(a.dotCycles).toBeLessThan(2.5);
    expect(a.dotCycles).not.toBe(b.dotCycles);

    const start = onTheDotProgress(0, 1.5, 0.2);
    const afterFiveSeconds = onTheDotProgress(5_000, 1.5, 0.2);
    const afterTenSeconds = onTheDotProgress(10_000, 1.5, 0.2);
    expect(start).toBeCloseTo(0.2);
    expect(afterFiveSeconds).toBeCloseTo(0.7);
    expect(afterTenSeconds).toBeCloseTo(0.2);
    expect(onTheDotProgress(15_000, 1.5, 0.2)).toBeCloseTo(0.7);
  });

  it("On The Dot follows its selected shape and ranks by final cursor distance", () => {
    const state = onTheDot.setup({ players: ["a", "b"], bots: [], rng: createRng(77) }, 100);
    state.shape = "circle";
    state.positions.a = onTheDotPoint("circle", onTheDotProgress(15_000, state.dotCycles, state.dotStartProgress));
    state.positions.b = { x: 0, y: 0 };
    expect(onTheDot.input(state, "b", { kind: "cursor", x: 0, y: 0 }, 101, createRng(1))).toBe(true);
    onTheDot.advance(state, state.endAt, createRng(2));
    expect(onTheDot.result(state).ranking[0]).toEqual(["a"]);
    expect(onTheDot.result(state).scores.a).toBe(0);
  });

  it("Star Collector lets players carry one star and bank it at home", () => {
    const state = dotCollector.setup({ players: ["a", "b"], bots: [], rng: createRng(78) }, 0);
    expect(state.stars).toHaveLength(2);
    const first = state.stars[0]!;
    expect(dotCollector.input(state, "a", { kind: "cursor", x: first.x, y: first.y }, 100, createRng(1))).toBe(true);
    for (let tick = 0; state.targets.a && tick < 100; tick++) {
      dotCollector.advance(state, dotCollector.nextEventAt(state)!, createRng(tick + 2));
    }
    expect(state.carrying.a).toBe(1);
    const second = state.stars[0]!;
    dotCollector.input(state, "a", { kind: "cursor", x: second.x, y: second.y }, 200, createRng(4));
    for (let tick = 0; state.targets.a && tick < 100; tick++) {
      dotCollector.advance(state, dotCollector.nextEventAt(state)!, createRng(tick + 52));
    }
    expect(state.carrying.a).toBe(1);
    expect(state.stars.some((star) => star.id === second.id)).toBe(true);

    const home = state.homes.a!;
    dotCollector.input(state, "a", { kind: "cursor", x: home.x, y: home.y }, 300, createRng(2));
    for (let tick = 0; state.targets.a && tick < 100; tick++) {
      dotCollector.advance(state, dotCollector.nextEventAt(state)!, createRng(tick + 102));
    }
    expect(state.banked.a).toBe(1);
    expect(state.carrying.a).toBe(0);
    dotCollector.advance(state, 8_000, createRng(3));
    expect(state.stars).toHaveLength(3);
  });

  it("Star Collector randomizes player areas around the same circle", () => {
    const players = ["a", "b", "c", "d"];
    const first = dotCollector.setup({ players, bots: [], rng: createRng(81) }, 0);
    const second = dotCollector.setup({ players, bots: [], rng: createRng(82) }, 0);
    const firstPoints = players.map((id) => first.homes[id]!);
    const radii = firstPoints.map((point) => Math.hypot(point.x - 10, point.y - 10));

    expect(first.homes).not.toEqual(second.homes);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.001);
    for (const point of firstPoints) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(20);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(20);
    }
  });

  it("Star Collector bots prioritize center stars when more than ten are available", () => {
    const state = dotCollector.setup({ players: ["bot", "human"], bots: ["bot"], rng: createRng(85) }, 0);
    state.positions.bot = { x: 0, y: 0 };
    state.stars = Array.from({ length: 11 }, (_, id) => ({ id, x: 10, y: 10 }));

    dotCollector.advance(state, 100, createRng(86));

    expect(state.goals.bot).toEqual({ kind: "center", starId: 0 });
  });

  it("Star Collector keeps player cursor targets inside the circular arena", () => {
    const state = dotCollector.setup({ players: ["a", "b"], bots: [], rng: createRng(87) }, 0);

    dotCollector.input(state, "a", { kind: "cursor", x: 20, y: 10 }, 100, createRng(1));

    expect(Math.hypot(state.targets.a!.x - 10, state.targets.a!.y - 10)).toBeCloseTo(9.75);
  });

  it("Star Collector continues after the first player finishes and ends with one unfinished", () => {
    const state = dotCollector.setup({ players: ["a", "b", "c", "d"], bots: [], rng: createRng(83) }, 0);
    state.banked.a = 6;
    state.finishedAt.a = 1_000;
    expect(dotCollector.done(state)).toBe(false);
    state.banked.b = 6;
    state.finishedAt.b = 2_000;
    state.banked.c = 6;
    state.finishedAt.c = 3_000;
    expect(dotCollector.done(state)).toBe(true);
    expect(dotCollector.result(state).ranking).toEqual([["a"], ["b"], ["c"], ["d"]]);
    expect(dotCollector.result(state).labels.a).toBe("finished 1st in 1.0s");
    expect(dotCollector.result(state).labels.b).toBe("finished 2nd in 2.0s");
  });

  it("Star Collector does not allow stealing from a finished player's area", () => {
    const state = dotCollector.setup({ players: ["a", "b"], bots: [], rng: createRng(84) }, 0);
    state.banked.a = 6;
    state.finishedAt.a = 1_000;
    state.positions.b = { ...state.homes.a! };

    dotCollector.input(state, "b", {
      kind: "cursor", x: state.homes.a!.x, y: state.homes.a!.y,
    }, 100, createRng(1));

    expect(state.banked.a).toBe(6);
    expect(state.carrying.b).toBe(0);
  });

  it("Brawldle rotates guesses one player at a time and eliminates exact matches", () => {
    const state = brawldle.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(79) });
    const secrets: Record<string, { word: string }> = { a: { word: "APPLE" }, b: { word: "BERRY" }, c: { word: "CHILI" } };
    brawldle.resolve(state, secrets, createRng(1));
    expect(state.phase).toBe("guess");
    expect(state.turnOrder).toHaveLength(3);
    expect(new Set(state.turnOrder)).toEqual(new Set(["a", "b", "c"]));
    const firstGuesser = state.currentTurn!;
    expect(brawldle.deciders(state)).toEqual([firstGuesser]);
    expect(brawldle.roundMs(state)).toBe(30_000);
    const firstTarget = state.players.find((id) => id !== firstGuesser)!;
    brawldle.resolve(state, { [firstGuesser]: { word: secrets[firstTarget]!.word } }, createRng(2));
    expect(state.alive).not.toContain(firstTarget);
    expect(state.outRound[firstTarget]).toBe(1);
    expect(state.currentTurn).not.toBe(firstTarget);
    const secondGuesser = state.currentTurn!;
    const secondTarget = state.alive.find((id) => id !== secondGuesser)!;
    brawldle.resolve(state, { [secondGuesser]: { word: secrets[secondTarget]!.word } }, createRng(3));
    expect(state.alive).toEqual([state.players.find((id) => id !== firstTarget && id !== secondTarget)]);
    expect(state.outRound[secondTarget]).toBe(2);
    expect(brawldle.done(state)).toBe(true);
    expect(brawldle.view(state, firstTarget) && (brawldle.view(state, firstTarget) as any).revealedSecrets[firstTarget]).toBe(secrets[firstTarget]!.word);
  });

  it("Brawldle publishes each player's last four feedback rows", () => {
    const state = brawldle.setup({ players: ["a", "b"], bots: [], rng: createRng(88) });
    brawldle.resolve(state, { a: { word: "APPLE" }, b: { word: "BERRY" } }, createRng(1));
    for (let i = 0; i < 5; i++) {
      const id = state.currentTurn!;
      brawldle.resolve(state, { [id]: { word: "CIVIC" } }, createRng(i + 2));
    }
    const view = brawldle.view(state, "a") as any;
    expect(view.boards.a).toHaveLength(4);
    expect(view.boards.b).toHaveLength(4);
    expect(view.boards.a.at(-1).word).toBe("CIVIC");
    expect(brawldle.botDelayMs?.(state, "a")).toBe(1_000);
  });

  it("Brawldle rejects vulgar words in both secret and guess submissions", () => {
    const state = brawldle.setup({ players: ["a", "b"], bots: [], rng: createRng(90) });
    expect(brawldle.parse(state, "a", { word: "BITCH" })).toBeUndefined();
    brawldle.resolve(state, { a: { word: "APPLE" }, b: { word: "BERRY" } }, createRng(1));
    const guesser = state.currentTurn!;
    expect(brawldle.parse(state, guesser, { word: "BITCH" })).toBeUndefined();
  });

  it("Dice Fleet deals each player's d4 damage simultaneously and tracks eliminations", () => {
    const state = diceFleet.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(80) });
    state.roll.a = 4;
    state.roll.b = 3;
    state.roll.c = 2;
    state.hp.b = 4;
    diceFleet.resolve(state, { a: { target: "b" }, b: { target: "a" }, c: { target: "b" } }, createRng(3));
    expect(Object.keys(state.last!.attacks)).toEqual(state.turnOrder);
    expect(state.hp.b).toBe(0);
    expect(state.last!.eliminated).toEqual(["b"]);
    expect(state.outRound.b).toBe(1);
    expect(state.hp.a).toBe(7);
  });

  it("Grid Quiz exposes only the viewer's submitted answer", () => {
    const state = gridQuiz.setup({ players: ["a", "b"], bots: [], rng: createRng(89) }, 0);
    gridQuiz.advance(state, 8_000, createRng(1));
    gridQuiz.input(state, "a", { count: 42 }, 8_001, createRng(2));
    gridQuiz.input(state, "b", { count: 37 }, 8_001, createRng(3));
    const aView = gridQuiz.view(state, "a") as any;
    expect(aView.yourGuess).toBe(42);
    expect(aView.guesses).toBeUndefined();
    expect(aView.last?.guesses).toBeUndefined();

    gridQuiz.advance(state, 8_002, createRng(4));
    expect(state.phase).toBe("reveal");
    expect(state.phaseEndsAt).toBe(13_002);

    expect((gridQuiz.view(state, "a") as any).last.guesses).toEqual({ a: 42, b: 37 });
    gridQuiz.advance(state, 13_002, createRng(5));
    expect((gridQuiz.view(state, "a") as any).last.guesses).toBeUndefined();
  });

  it("Grid Quiz fast-forwards once human answers are in, rather than waiting on bot timers", () => {
    const state = gridQuiz.setup({ players: ["human", "bot"], bots: ["bot"], rng: createRng(91) }, 0);
    gridQuiz.advance(state, 8_000, createRng(1));
    gridQuiz.input(state, "human", { count: 10 }, 8_001, createRng(2));
    gridQuiz.advance(state, 8_002, createRng(3));

    expect(state.phase).toBe("reveal");
    expect(state.guesses.bot).not.toBeNull();
    expect(state.phaseEndsAt).toBe(13_002);
  });

  it("Grid Quiz reveals the board, then awards 15 points for an exact count", () => {
    const state = gridQuiz.setup({ players: ["a", "b"], bots: [], rng: createRng(81) }, 100);
    expect(state.grid).toHaveLength(25);
    gridQuiz.advance(state, 8_100, createRng(2));
    expect(state.phase).toBe("guess");
    const actual = state.counts[state.target!]!;
    expect(gridQuiz.input(state, "a", { count: actual }, 8_101, createRng(3))).toBe(true);
    gridQuiz.advance(state, 18_100, createRng(4));
    expect(state.scores.a).toBe(15);
    expect(state.phase).toBe("reveal");
    gridQuiz.advance(state, 23_100, createRng(5));
    expect(state.round).toBe(2);
    expect(state.grid).toHaveLength(64);
  });

  it("Grid Quiz completes three timed rounds and ranks all players", () => {
    const state = gridQuiz.setup({ players: ["a", "b"], bots: [], rng: createRng(82) }, 0);
    for (let guard = 0; guard < 10 && !gridQuiz.done(state); guard++) {
      const next = gridQuiz.nextEventAt(state)!;
      gridQuiz.advance(state, next, createRng(guard + 1));
    }
    expect(gridQuiz.done(state)).toBe(true);
    expect(gridQuiz.result(state).ranking.flat().sort()).toEqual(["a", "b"]);
    expect(state.round).toBe(3);
  });

  it("Count The Dots starts with 10–20 dots, enforces cooldowns, and accepts final guesses", () => {
    const state = countTheDots.setup({ players: ["a", "b"], bots: [], rng: createRng(101) }, 0);
    expect(state.dots.length).toBeGreaterThanOrEqual(10);
    expect(state.dots.length).toBeLessThanOrEqual(20);
    expect(countTheDots.input(state, "a", { kind: "add" }, 100, createRng(1))).toBe(true);
    expect(countTheDots.input(state, "a", { kind: "add" }, 200, createRng(2))).toBe(false);
    countTheDots.advance(state, 30_000, createRng(3));
    expect(state.phase).toBe("guess");
    expect(countTheDots.input(state, "a", { kind: "guess", count: state.dots.length }, 30_100, createRng(4))).toBe(true);
    expect(countTheDots.input(state, "b", { kind: "guess", count: 0 }, 30_100, createRng(5))).toBe(true);
    countTheDots.advance(state, 30_200, createRng(6));
    expect(countTheDots.done(state)).toBe(true);
    expect(countTheDots.result(state).ranking[0]).toEqual(["a"]);
  });

  it("Hide and Seek has one seeker, allows shared hiding spots, and advances after hiders choose", () => {
    const state = hideAndSeek.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(102) }, 0);
    expect(state.spots).toHaveLength(2);
    expect(state.hiders).toHaveLength(2);
    expect(state.seeker).not.toBe(state.hiders[0]);
    expect(hideAndSeek.input(state, state.seeker, { spotId: state.spots[0]!.id }, 100, createRng(1))).toBe(false);
    expect(hideAndSeek.input(state, state.hiders[0]!, { spotId: state.spots[0]!.id }, 100, createRng(1))).toBe(true);
    expect(state.phase).toBe("hide");
    expect(hideAndSeek.input(state, state.hiders[1]!, { spotId: state.spots[0]!.id }, 150, createRng(2))).toBe(true);
    expect(state.phase).toBe("seek");
    expect((hideAndSeek.view(state, state.seeker) as { hiddenSpots?: unknown }).hiddenSpots).toBeUndefined();
    const foundSpot = state.hiddenSpots[state.hiders[0]!]!;
    expect(hideAndSeek.input(state, state.seeker, { spotId: foundSpot }, 200, createRng(3))).toBe(true);
    expect(state.foundHiders).toEqual(expect.arrayContaining(state.hiders));
    expect(state.lastFound).toEqual(expect.arrayContaining(state.hiders));
    expect(state.spots.some((spot) => spot.id === foundSpot)).toBe(false);
    expect(state.activeHiders).toHaveLength(0);
    expect(state.phaseEndsAt).toBe(2_200);
    expect((hideAndSeek.view(state, state.seeker) as { ending: boolean }).ending).toBe(true);
    expect(hideAndSeek.done(state)).toBe(false);
    hideAndSeek.advance(state, 2_200, createRng(4));
    expect(hideAndSeek.done(state)).toBe(true);
  });

  it("lets bot hiders choose the same spot", () => {
    let botsSharedSpot = false;
    for (let seed = 1; seed <= 100 && !botsSharedSpot; seed++) {
      const state = hideAndSeek.setup({
        players: ["seeker", "bot1", "bot2"],
        bots: ["bot1", "bot2"],
        rng: createRng(seed),
      }, 0);
      state.seeker = "seeker";
      state.hiders = ["bot1", "bot2"];
      state.activeHiders = [...state.hiders];
      state.hiddenSpots = { bot1: null, bot2: null };

      hideAndSeek.advance(state, 0, createRng(seed));
      botsSharedSpot = state.hiddenSpots.bot1 === state.hiddenSpots.bot2;
    }

    expect(botsSharedSpot).toBe(true);
  });

  it("uses two-second hide and seek timers when every player is a bot", () => {
    const players = ["bot1", "bot2", "bot3"];
    const state = hideAndSeek.setup({ players, bots: players, rng: createRng(112) }, 5_000);

    expect(state.phaseEndsAt).toBe(7_000);
  });

  it("Hide and Seek fast-forwards to a two-second ending after finding the last hider", () => {
    const state = hideAndSeek.setup({ players: ["a", "b"], bots: [], rng: createRng(109) }, 0);
    const hider = state.hiders[0]!;
    const spotId = state.spots[0]!.id;
    expect(hideAndSeek.input(state, hider, { spotId }, 100, createRng(1))).toBe(true);
    expect(state.phase).toBe("seek");
    expect(hideAndSeek.input(state, state.seeker, { spotId }, 200, createRng(2))).toBe(true);
    expect(state.activeHiders).toHaveLength(0);
    expect(state.phaseEndsAt).toBe(2_200);
    expect(hideAndSeek.nextEventAt(state)).toBe(2_200);
    expect(hideAndSeek.done(state)).toBe(false);
    hideAndSeek.advance(state, 2_200, createRng(3));
    expect(hideAndSeek.done(state)).toBe(true);
  });

  it("Hide and Seek ranks hiders by full rounds survived", () => {
    const state = hideAndSeek.setup({ players: ["a", "b", "c", "d"], bots: [], rng: createRng(111) }, 0);
    const [first, second, longest] = state.hiders;
    const [sharedSpot, survivorSpot, nextSpot] = state.spots;
    state.phase = "seek";
    state.hiddenSpots[first!] = sharedSpot!.id;
    state.hiddenSpots[second!] = sharedSpot!.id;
    state.hiddenSpots[longest!] = survivorSpot!.id;

    hideAndSeek.input(state, state.seeker, { spotId: sharedSpot!.id }, 100, createRng(1));
    expect(state.roundsSurvived[longest!]).toBe(1);
    hideAndSeek.input(state, longest!, { spotId: nextSpot!.id }, 200, createRng(2));
    hideAndSeek.input(state, state.seeker, { spotId: nextSpot!.id }, 300, createRng(3));
    expect(hideAndSeek.result(state).ranking).toEqual([[state.seeker], [longest], [first, second]]);
  });

  it("Red Fight, Green Light gives red-light movement a one-second grace period", () => {
    const state = redLightGreenLight.setup({ players: ["a", "b"], bots: [], rng: createRng(103) }, 0);
    redLightGreenLight.advance(state, state.phaseEndsAt, createRng(1));
    expect(state.phase).toBe("red");
    expect(redLightGreenLight.input(state, "a", { kind: "move", x: 0.2, y: 0.2 }, state.redStartedAt + 500, createRng(2))).toBe(true);
    expect(state.alive).toContain("a");
    expect(redLightGreenLight.input(state, "a", { kind: "move", x: 0.3, y: 0.2 }, state.redStartedAt + 1_001, createRng(3))).toBe(true);
    redLightGreenLight.advance(state, state.redStartedAt + 1_100, createRng(4));
    expect(state.alive).not.toContain("a");
  });

  it("Red Fight, Green Light bots find a route around the selected wall layout", () => {
    const state = redLightGreenLight.setup({ players: ["bot"], bots: ["bot"], rng: createRng(110) }, 0);
    expect(state.walls.length).toBeGreaterThanOrEqual(3);
    state.phaseEndsAt = 100_000;
    state.endAt = 100_000;
    redLightGreenLight.advance(state, 20_000, createRng(111));
    expect(state.positions.bot!.x).toBeGreaterThan(0.85);
  });

  it("Red Fight, Green Light bullets stop at walls and finish ties use finish time", () => {
    const state = redLightGreenLight.setup({ players: ["a", "b"], bots: [], rng: createRng(112) }, 0);
    const wall = state.walls[0]!;
    const y = wall.y + wall.height / 2;
    state.phase = "red";
    state.redStartedAt = -10_000;
    state.phaseEndsAt = 10_000;
    state.positions.a = { x: wall.x + 0.1, y };
    state.targets.a = { ...state.positions.a };
    state.positions.b = { x: wall.x - 0.1, y };
    state.targets.b = { ...state.positions.b };
    state.bullets = [{ id: 0, owner: "b", x: wall.x - 0.05, y, dx: 1, dy: 0 }];
    redLightGreenLight.advance(state, state.nextTickAt, createRng(1));
    expect(state.bullets).toHaveLength(0);
    state.finishedAt.a = 5_000;
    state.finishedAt.b = 4_000;
    state.alive = [];
    expect(redLightGreenLight.result(state).ranking[0]).toEqual(["b"]);
  });

  it("Red Fight, Green Light eliminates unfinished players at 60 seconds and ranks them by distance", () => {
    const state = redLightGreenLight.setup({ players: ["a", "b"], bots: [], rng: createRng(113) }, 0);
    state.endAt = 1_000;
    state.positions.a = { x: 0.8, y: 0.1 };
    state.positions.b = { x: 0.4, y: 0.9 };
    redLightGreenLight.advance(state, 1_000, createRng(1));
    expect(state.alive).toHaveLength(0);
    expect(state.outAt.a).toBe(1_000);
    expect(state.outAt.b).toBe(1_000);
    expect(redLightGreenLight.result(state).ranking[0]).toEqual(["a"]);
  });

  it("Red Fight, Green Light starts players in a vertical line and locks finished players", () => {
    const state = redLightGreenLight.setup({ players: ["a", "b"], bots: [], rng: createRng(114) }, 0);
    expect(state.positions.a!.x).toBe(state.positions.b!.x);
    state.phase = "red";
    state.finishedAt.a = 2_000;
    expect(redLightGreenLight.input(state, "a", { kind: "move", x: 0.2, y: 0.2 }, 3_000, createRng(1))).toBe(false);
    expect(redLightGreenLight.input(state, "a", { kind: "shoot", direction: "up" }, 3_000, createRng(2))).toBe(false);
  });

  it("Unstable Math prevents division by zero and awards exact answers", () => {
    const state = unstableMath.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(104) });
    state.equation = { left: 8, operator: "/", right: 4 };
    state.originalEquation = { ...state.equation };
    expect(unstableMath.parse(state, state.saboteur, { kind: "number", side: "right", value: 0 })).toBeUndefined();
    expect(unstableMath.deciders(state)).toHaveLength(3);
    const answer = 2;
    const choices: Record<string, any> = Object.fromEntries(state.players.map((id) => [id, id === state.saboteur
      ? { kind: "none" }
      : { kind: "guess", value: answer }]));
    unstableMath.resolve(state, choices, createRng(2));
    expect(Math.max(...Object.values(state.scores))).toBeGreaterThanOrEqual(20);
    expect(state.last?.equation).toEqual(state.last?.originalEquation);
    expect(state.last?.guesses).toBeDefined();
    expect(state.last?.points[state.last.saboteur]).toBe(20);
  });

  it("Unstable Math digit changes modify exactly one digit in rounds 3–5", () => {
    const state = unstableMath.setup({ players: ["a", "b"], bots: [], rng: createRng(207) });
    state.round = 3;
    state.equation = { left: 47, operator: "+", right: 52 };
    expect(unstableMath.parse(state, state.saboteur, { kind: "number", side: "left", value: 57 }))
      .toEqual({ kind: "number", side: "left", value: 57 });
    expect(unstableMath.parse(state, state.saboteur, { kind: "number", side: "left", value: 88 })).toBeUndefined();
    let botDigitChoice: { side: "left" | "right"; value: number } | undefined;
    for (let seed = 1; seed < 100 && !botDigitChoice; seed++) {
      const choice = unstableMath.bot(state, state.saboteur, createRng(seed));
      if (choice.kind === "number") botDigitChoice = choice;
    }
    expect(botDigitChoice).toBeDefined();
    const digitChoice = botDigitChoice!;
    expect([...String(digitChoice.value)].filter((digit, index) =>
      digit !== String(state.equation[digitChoice.side])[index])).toHaveLength(1);
  });

  it("Letter Switch accepts CVCV one-letter changes and gives invalid words zero", () => {
    expect(letterSwitch.revealMs).toBe(5_000);
    const state = letterSwitch.setup({ players: ["a", "b"], bots: [], rng: createRng(105) });
    const initialBase = state.baseWords.a!;
    const invalidWord = `${initialBase[0] === "B" ? "Z" : "B"}${initialBase.slice(1)}`;
    expect(letterSwitch.parse(state, "a", { word: invalidWord })).toEqual({ word: invalidWord });
    let validWord = "";
    for (let seed = 1; seed < 100 && !validWord; seed++) {
      const choice = letterSwitch.bot(state, "a", createRng(seed));
      if (letterSwitch.parse(state, "a", choice)) validWord = choice.word;
    }
    expect(validWord).not.toBe("");
    state.used.b!.push(invalidWord);
    letterSwitch.resolve(state, { a: { word: validWord }, b: { word: invalidWord } }, createRng(1));
    expect(state.lastScores.b).toBe(0);
    expect(state.round).toBe(2);
    expect(state.baseWords.a).toBe(validWord);
    expect(state.baseWords.b).toBe(invalidWord);
    expect(letterSwitch.parse(state, "a", { word: validWord })).toBeUndefined();
  });

  it("Letter Switch validity helper matches dictionary, mutation, and repeat rules", () => {
    const state = letterSwitch.setup({ players: ["a"], bots: [], rng: createRng(206) });
    let validWord = "";
    for (let seed = 1; seed < 100 && !validWord; seed++) {
      const choice = letterSwitch.bot(state, "a", createRng(seed));
      if (letterSwitch.parse(state, "a", choice)) validWord = choice.word;
    }
    expect(isValidLetterSwitchWord(validWord, state.baseWords.a!)).toBe(true);
    expect(isValidLetterSwitchWord(validWord, state.baseWords.a!, [validWord])).toBe(false);
    expect(isValidLetterSwitchWord(state.baseWords.a!, state.baseWords.a!)).toBe(false);
    expect(isValidLetterSwitchWord("ZZZZ", state.baseWords.a!)).toBe(false);
    expect(isValidLetterSwitchWord("DAZE", "DARE")).toBe(true);
    expect(isValidLetterSwitchWord("POPE", "POKE")).toBe(true);
    expect(isValidLetterSwitchWord("SORE", "SORA")).toBe(true);
    expect(LETTER_SWITCH_WORDS).toHaveLength(1365);
    expect(LETTER_SWITCH_COMMON_WORDS.every((word) => LETTER_SWITCH_WORDS.includes(word))).toBe(true);
    expect(LETTER_SWITCH_WORDS.every((word) =>
      /^[BCDFGHJKLMNPQRSTVWXYZ][AEIOU][BCDFGHJKLMNPQRSTVWXYZ][AEIOU]$/.test(word),
    )).toBe(true);
  });

  it("Letter Switch scores letters normally even when players use the same letters", () => {
    const state = letterSwitch.setup({ players: ["a", "b"], bots: [], rng: createRng(205) });
    const pickValid = (id: "a" | "b", excluded = "") => {
      for (let seed = 1; seed < 100; seed++) {
        const choice = letterSwitch.bot(state, id, createRng(seed));
        if (choice.word !== excluded && letterSwitch.parse(state, id, choice)) return choice.word;
      }
      throw new Error("Could not find a valid Letter Switch word");
    };
    const wordA = pickValid("a");
    const wordB = pickValid("b", wordA);
    letterSwitch.resolve(state, { a: { word: wordA }, b: { word: wordB } }, createRng(2));

    expect(state.lastScores.a).toBe([...wordA].reduce((sum, letter) => sum + LETTER_VALUES[letter]!, 0));
    expect(state.lastScores.b).toBe([...wordB].reduce((sum, letter) => sum + LETTER_VALUES[letter]!, 0));
  });

  it("Letter Switch starts with a common word", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const state = letterSwitch.setup({ players: ["a"], bots: [], rng: createRng(seed) });
      expect(LETTER_SWITCH_COMMON_WORDS).toContain(state.baseWords.a);
    }
  });

  it("Letter Switch bots mainly favor common valid adjacent words but retain other choices", () => {
    const state = letterSwitch.setup({ players: ["a"], bots: [], rng: createRng(207) });
    state.baseWords.a = "SAME";
    const expected = new Set<string>(LETTER_SWITCH_WORDS.filter((word) =>
      [...word].filter((letter, index) => letter !== state.baseWords.a![index]).length === 1,
    ));
    const commonWords = new Set<string>(LETTER_SWITCH_COMMON_WORDS);
    let common = 0;
    let uncommon = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const choice = letterSwitch.bot(state, "a", createRng(seed));
      if (!expected.has(choice.word)) continue;
      if (commonWords.has(choice.word)) common++;
      else uncommon++;
    }
    expect(common / (common + uncommon)).toBeGreaterThan(0.7);
    expect(uncommon).toBeGreaterThan(0);
  });

  it("Hangman reveals the shared word per-player and enforces its cooldown", () => {
    const state = hangman.setup({ players: ["a", "b"], bots: [], rng: createRng(106) }, 1_000);
    expect(state.secret.length).toBeGreaterThanOrEqual(4);
    expect(state.secret.length).toBeLessThanOrEqual(10);
    const letter = state.secret[0]!;
    expect(hangman.input(state, "a", { letter }, 1_000, createRng(1))).toBe(true);
    expect(hangman.input(state, "a", { letter: "Z" }, 2_000, createRng(2))).toBe(false);
    expect((hangman.view(state, "a") as { pattern: (string | null)[] }).pattern).toContain(letter);
    expect((hangman.view(state, "b") as { pattern: (string | null)[] }).pattern).not.toContain(letter);
  });

  it("Hangman reveals the answer to a player who runs out of lives", () => {
    const state = hangman.setup({ players: ["a", "b"], bots: [], rng: createRng(206) }, 1_000);
    const wrongLetters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((letter) => !state.secret.includes(letter)).slice(0, 6);
    wrongLetters.forEach((letter, index) => {
      expect(hangman.input(state, "a", { letter }, 1_000 + index * 3_000, createRng(index))).toBe(true);
    });
    expect(state.failedAt.a).not.toBeNull();
    expect((hangman.view(state, "a") as { revealedWord: string | null }).revealedWord).toBe(state.secret);
    expect((hangman.view(state, "b") as { revealedWord: string | null }).revealedWord).toBeNull();
  });

  it("Conquest creates 17 areas and awards area points after a three-second claim", () => {
    const state = conquest.setup({ players: ["a"], bots: [], rng: createRng(107) }, 0);
    expect(state.areas).toHaveLength(17);
    const area = state.areas[0]!;
    state.positions.a = { x: area.x, y: area.y };
    state.targets.a = { ...state.positions.a };
    conquest.advance(state, 100, createRng(1));
    conquest.advance(state, 3_200, createRng(2));
    expect(state.areas[0]!.owner).toBe("a");
    conquest.advance(state, 4_200, createRng(3));
    expect(state.scores.a).toBeGreaterThan(0);
  });

  it("Conquest protects an area while its owner is present, but two challengers contest it", () => {
    const state = conquest.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(208) }, 0);
    const area = state.areas[0]!;
    state.positions.a = { x: area.x, y: area.y };
    state.positions.b = { x: 0.02, y: 0.98 };
    state.positions.c = { x: 0.02, y: 0.02 };
    state.targets.a = { ...state.positions.a };
    state.targets.b = { ...state.positions.b };
    state.targets.c = { ...state.positions.c };
    conquest.advance(state, 100, createRng(1));
    conquest.advance(state, 3_100, createRng(2));
    expect(state.areas[0]!.owner).toBe("a");

    state.positions.b = { x: area.x, y: area.y };
    state.targets.b = { ...state.positions.b };
    conquest.advance(state, 3_200, createRng(3));
    expect(state.areas[0]!.contested).toBe(false);
    expect(state.areas[0]!.owner).toBe("a");

    state.positions.c = { x: area.x, y: area.y };
    state.targets.c = { ...state.positions.c };
    conquest.advance(state, 3_300, createRng(4));
    expect(state.areas[0]!.contested).toBe(true);
    expect(state.areas[0]!.owner).toBeNull();

    state.positions.a = { x: 0.02, y: 0.98 };
    state.targets.a = { ...state.positions.a };
    state.positions.c = { x: 0.02, y: 0.02 };
    state.targets.c = { ...state.positions.c };
    conquest.advance(state, 3_400, createRng(5));
    expect(state.areas[0]!.contested).toBe(false);
    expect((conquest.view(state, "b") as { claimProgress: Record<number, number> }).claimProgress[area.id]).toBeGreaterThan(0);
    conquest.advance(state, 6_400, createRng(6));
    expect(state.areas[0]!.owner).toBe("b");
  });

  it("Conquest bots keep claiming a target after other players leave a contested area", () => {
    const state = conquest.setup({ players: ["bot", "p"], bots: ["bot"], rng: createRng(209) }, 0);
    const area = state.areas[0]!;
    state.positions.bot = { x: area.x, y: area.y };
    state.positions.p = { x: area.x, y: area.y };
    state.targets.p = { ...state.positions.p };
    state.botTarget.bot = area.id;
    state.botGiveUpAt.bot = 0;
    conquest.advance(state, 100, createRng(1));
    expect(state.areas[area.id]!.contested).toBe(true);
    expect(state.botTarget.bot).toBe(area.id);

    state.positions.p = { x: 0.02, y: 0.98 };
    state.targets.p = { ...state.positions.p };
    conquest.advance(state, 200, createRng(2));
    expect(state.areas[area.id]!.contested).toBe(false);
    expect(state.botTarget.bot).toBe(area.id);
    conquest.advance(state, 3_200, createRng(3));
    expect(state.areas[area.id]!.owner).toBe("bot");
  });

  it("Conquest bots abandon an area that remains contested past their timeout", () => {
    const state = conquest.setup({ players: ["bot", "p"], bots: ["bot"], rng: createRng(210) }, 0);
    const area = state.areas[0]!;
    state.positions.bot = { x: area.x, y: area.y };
    state.positions.p = { x: area.x, y: area.y };
    state.targets.p = { ...state.positions.p };
    state.insideArea.bot = area.id;
    state.insideArea.p = area.id;
    state.enteredAt.bot = 0;
    state.enteredAt.p = 0;
    area.contested = true;
    state.botTarget.bot = area.id;
    state.botGiveUpAt.bot = 0;
    conquest.advance(state, 100, createRng(1));
    expect(state.botTarget.bot).not.toBe(area.id);
  });

  it("Conquest players and bots move at the same capped speed", () => {
    const state = conquest.setup({ players: ["human", "bot"], bots: ["bot"], rng: createRng(211) }, 0);
    state.positions.human = { x: 0.25, y: 0.25 };
    state.targets.human = { ...state.positions.human };
    state.positions.bot = { x: 0.75, y: 0.75 };
    state.targets.bot = { ...state.positions.bot };
    state.botTarget.bot = 0;
    state.botGiveUpAt.bot = Number.POSITIVE_INFINITY;
    expect(conquest.input(state, "human", { kind: "cursor", x: 0.49, y: 0.49 }, 0, createRng(1))).toBe(true);
    expect(state.positions.human).toEqual({ x: 0.25, y: 0.25 });
    const humanStart = { ...state.positions.human };
    const botStart = { ...state.positions.bot };
    conquest.advance(state, 100, createRng(2));
    expect(Math.hypot(state.positions.human!.x - humanStart.x, state.positions.human!.y - humanStart.y))
      .toBeCloseTo(0.018);
    expect(Math.hypot(state.positions.bot!.x - botStart.x, state.positions.bot!.y - botStart.y))
      .toBeCloseTo(0.018);
  });

  it("Conquest keeps player movement inside the board", () => {
    const state = conquest.setup({ players: ["a"], bots: [], rng: createRng(212) }, 0);
    expect(conquest.input(state, "a", { kind: "cursor", x: 5, y: -5 }, 0, createRng(1))).toBe(true);
    conquest.advance(state, 10_000, createRng(2));
    expect(state.positions.a!.x).toBeLessThanOrEqual(0.98);
    expect(state.positions.a!.x).toBeGreaterThanOrEqual(0.02);
    expect(state.positions.a!.y).toBeLessThanOrEqual(0.98);
    expect(state.positions.a!.y).toBeGreaterThanOrEqual(0.02);
    expect(Math.hypot(state.positions.a!.x - 0.5, state.positions.a!.y - 0.5)).toBeLessThanOrEqual(0.46);
  });

  it("Snake rejects a reversal and initializes a multi-player arena", () => {
    const state = snake.setup({ players: ["a", "b", "c"], bots: [], rng: createRng(108) }, 0);
    expect(state.apples).toHaveLength(1);
    for (const id of state.players) {
      const head = state.snakes[id]![0]!;
      expect(state.directions[id]).toBe(head.x < state.width / 2 ? "right" : "left");
      expect(state.snakes[id]!.every((part) => part.y === head.y)).toBe(true);
    }
    const reverse = state.directions.a === "up" ? "down" : state.directions.a === "down" ? "up" :
      state.directions.a === "left" ? "right" : "left";
    expect(snake.input(state, "a", { direction: reverse }, 100, createRng(1))).toBe(false);
    expect(snake.input(state, "a", { direction: state.directions.a }, 100, createRng(2))).toBe(true);
  });

  it("Snake randomizes player starting positions", () => {
    const players = ["a", "b", "c", "d"];
    const first = snake.setup({ players, bots: [], rng: createRng(111) }, 0);
    const second = snake.setup({ players, bots: [], rng: createRng(112) }, 0);
    expect(players.some((id) =>
      first.snakes[id]![0]!.x !== second.snakes[id]![0]!.x ||
      first.snakes[id]![0]!.y !== second.snakes[id]![0]!.y)).toBe(true);
  });

  it("Snake allows at most one turn per movement tick to prevent rapid u-turns", () => {
    const state = snake.setup({ players: ["a", "b"], bots: [], rng: createRng(113) }, 0);
    const initial = state.directions.a!;
    const turn = initial === "left" || initial === "right" ? "up" : "left";
    const secondTurn = initial === "right" ? "left" : initial === "left" ? "right" :
      initial === "up" ? "down" : "up";
    expect(snake.input(state, "a", { direction: turn }, 0, createRng(1))).toBe(true);
    expect(snake.input(state, "a", { direction: secondTurn }, 1, createRng(2))).toBe(false);
    snake.advance(state, 180, createRng(3));
    expect(snake.input(state, "a", { direction: secondTurn }, 181, createRng(4))).toBe(true);
  });

  it("Snake removes an eliminated player's snake from the board", () => {
    const state = snake.setup({ players: ["a", "b"], bots: [], rng: createRng(109) }, 0);
    state.snakes.a = [{ x: 1, y: 8 }, { x: 2, y: 8 }, { x: 3, y: 8 }];
    state.directions.a = "left";
    snake.advance(state, 180, createRng(1));
    expect(state.alive).not.toContain("a");
    expect(state.snakes.a).toEqual([]);
    expect((snake.view(state, "b") as { snakes: Record<string, unknown[]> }).snakes.a).toEqual([]);
  });

  it("Snake ranks players who survived longer above players eliminated earlier", () => {
    const state = snake.setup({ players: ["early", "late", "alive"], bots: [], rng: createRng(110) }, 0);
    state.alive = ["alive"];
    state.outRound.early = 2;
    state.outRound.late = 8;
    expect(snake.result(state).ranking).toEqual([["alive"], ["late"], ["early"]]);
  });
});
