import { describe, expect, it } from "vitest";
import { calculator, COLOR_CODE_COLORS, colorCode, colorPlatforms, createRng, isValidSingleWord, LETTER_VALUES, painter, singleWord } from "../src/index";
import { SINGLE_WORD_COMMON } from "../src/games/singleWordDictionary";

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
