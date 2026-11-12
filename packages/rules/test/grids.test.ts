import { describe, expect, it } from "vitest";
import {
  BLAST_ZONE,
  battleship,
  battleshipSize,
  blastDamage,
  blastZone,
  cellAt,
  createRng,
  fleetCells,
  MINEFIELD,
  minefield,
  minefieldCols,
  neighbors4,
  plates,
  platesSize,
  shotsPerRound,
  square,
  type BattleshipChoice,
  type BattleshipView,
  type MinefieldState,
  type MinefieldView,
  type PlayerId,
  type RoundGame,
} from "../src/index";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function setupGame<S>(game: RoundGame<S>, players: PlayerId[], seed = 1) {
  const rng = createRng(seed);
  return { s: game.setup({ players, bots: players, rng }), rng };
}

describe("Blast Zone", () => {
  const g6 = square(6);
  const at = (x: number, y: number) => cellAt(g6, x, y);

  function arena() {
    const { s, rng } = setupGame(blastZone, ["a", "b", "c", "d"]);
    s.positions = { a: at(0, 0), b: at(5, 5), c: at(5, 0), d: at(0, 5) };
    return { s, rng };
  }

  it("lands on the target half the time, otherwise on one of the 4 cells beside it", () => {
    const { s, rng } = arena();
    const target = at(2, 2);
    const beside = new Set(neighbors4(g6, target));
    let onTarget = 0;
    for (let i = 0; i < 2_000; i++) {
      s.lives = { a: 5, b: 5, c: 5, d: 5 };
      s.round = 0;
      blastZone.resolve(s, { a: { to: s.positions.a!, target }, b: { to: s.positions.b!, target: at(5, 2) } }, rng);
      const landed = s.last!.landed.a!;
      if (landed === target) onTarget++;
      else expect(beside.has(landed)).toBe(true);
    }
    expect(onTarget / 2_000).toBeGreaterThan(0.45);
    expect(onTarget / 2_000).toBeLessThan(0.55);
  });

  it("re-picks a scatter that would leave the grid", () => {
    const { s, rng } = arena();
    for (let i = 0; i < 200; i++) {
      s.lives = { a: 5, b: 5, c: 5, d: 5 };
      s.round = 0;
      blastZone.resolve(s, { b: { to: s.positions.b!, target: at(0, 0) } }, rng);
      expect([at(0, 0), at(1, 0), at(0, 1)]).toContain(s.last!.landed.b);
    }
  });

  it("costs 2 lives for a direct hit and 1 for each bomb in the 8 cells around you, stacking", () => {
    const { s } = arena();
    expect(BLAST_ZONE.direct).toBe(2);
    expect(blastDamage(s, [at(2, 2)], at(2, 2))).toBe(2);
    expect(blastDamage(s, [at(3, 3)], at(2, 2))).toBe(1);
    expect(blastDamage(s, [at(3, 3), at(2, 1), at(2, 2)], at(2, 2))).toBe(4);
    expect(blastDamage(s, [at(4, 2)], at(2, 2))).toBe(0);
  });

  it("moves everyone first, then bombs hit where players ended up, including the thrower", () => {
    const { s, rng } = arena();
    for (let i = 0; i < 50; i++) {
      s.round = 0;
      s.lives = { a: 5, b: 5, c: 5, d: 5 };
      s.outRound = { a: null, b: null, c: null, d: null };
      const before = structuredClone(s.positions);
      const choices = {
        a: { to: at(1, 1), target: at(2, 2) },
        b: { to: before.b!, target: at(4, 4) },
        c: { to: at(4, 1), target: before.a! },
        d: { to: at(1, 4), target: at(1, 3) },
      };
      blastZone.resolve(s, choices, rng);
      const landed = Object.values(s.last!.landed);
      for (const id of ["a", "b", "c", "d"]) {
        expect(s.positions[id]).toBe(choices[id as "a"].to);
        expect(s.last!.lost[id]).toBe(Math.min(5, blastDamage(s, landed, s.positions[id]!)));
      }
      s.positions = before;
    }
  });

  it("only allows a step to the 8 cells around you (or staying), and a target within 3 of where you end up", () => {
    const { s } = arena();
    expect(blastZone.parse(s, "a", { to: at(1, 1), target: at(4, 4) })).toEqual({ to: at(1, 1), target: at(4, 4) });
    expect(blastZone.parse(s, "a", { to: at(0, 0), target: at(3, 3) })).toBeDefined();
    expect(blastZone.parse(s, "a", { to: at(2, 0), target: at(2, 2) })).toBeUndefined();
    expect(blastZone.parse(s, "a", { to: at(0, 0), target: at(4, 0) })).toBeUndefined();
  });

  it("ranks by lives left, and players blown up in the same round tie", () => {
    const { s } = arena();
    s.round = 8;
    s.lives = { a: 3, b: 0, c: 0, d: 1 };
    s.outRound = { a: null, b: 5, c: 5, d: null };
    expect(blastZone.result(s).ranking).toEqual([["a"], ["d"], ["b", "c"]]);
  });
});

describe("Disappearing Plates", () => {
  const g9 = square(9);
  const at = (x: number, y: number) => cellAt(g9, x, y);

  function arena() {
    const { s, rng } = setupGame(plates, ["a", "b", "c", "d"]);
    expect(s.size).toBe(platesSize(4));
    expect(s.size).toBe(9);
    s.positions = { a: at(0, 0), b: at(2, 0), c: at(5, 5), d: at(5, 3) };
    return { s, rng };
  }

  it("makes you move to a neighboring plate: no staying, sharing is allowed", () => {
    const { s } = arena();
    expect(plates.parse(s, "a", { to: at(1, 0), remove: at(3, 3) })).toBeDefined();
    expect(plates.parse(s, "a", { to: at(0, 0), remove: at(3, 3) })).toBeUndefined();
    s.positions.b = at(1, 1);
    expect(plates.parse(s, "a", { to: at(1, 1), remove: at(3, 3) })).toBeDefined();
    s.plates[at(1, 0)] = false;
    expect(plates.parse(s, "a", { to: at(1, 0), remove: at(3, 3) })).toBeUndefined();
  });

  it("lets two players step onto the same plate", () => {
    const { s, rng } = arena();
    plates.resolve(
      s,
      {
        a: { to: at(1, 0), remove: at(3, 3) },
        b: { to: at(1, 0), remove: at(3, 4) },
        c: { to: at(4, 5), remove: at(3, 5) },
        d: { to: at(5, 2), remove: at(2, 5) },
      },
      rng,
    );
    expect(s.positions).toMatchObject({ a: at(1, 0), b: at(1, 0), c: at(4, 5), d: at(5, 2) });
  });

  it("sends a removal aimed at a plate someone ends up on to a random empty plate", () => {
    const { s, rng } = arena();
    plates.resolve(
      s,
      {
        a: { to: at(1, 0), remove: at(4, 5) },
        b: { to: at(3, 0), remove: at(3, 3) },
        c: { to: at(4, 5), remove: at(2, 2) },
        d: { to: at(5, 2), remove: at(2, 3) },
      },
      rng,
    );
    expect(s.plates[at(4, 5)]).toBe(true);
    const redirected = s.last!.removed.a!;
    expect(redirected).not.toBe(at(4, 5));
    expect(s.plates[redirected]).toBe(false);
    // 4 left-behind crumples + 4 removals, minus a's redirect replacing the protected landing.
    expect(s.plates.filter((p) => !p).length).toBeGreaterThanOrEqual(7);
  });

  it("removes the plate you step off every round, unless someone else steps onto it", () => {
    const { s, rng } = arena();
    plates.resolve(
      s,
      {
        a: { to: at(1, 0), remove: at(3, 3) },
        b: { to: at(3, 0), remove: at(3, 4) },
        c: { to: at(4, 5), remove: at(0, 5) },
        d: { to: at(5, 2), remove: at(1, 5) },
      },
      rng,
    );
    expect(s.plates[at(0, 0)]).toBe(false);
    expect(s.last!.crumbled.sort((x, y) => x - y)).toEqual([at(0, 0), at(2, 0), at(5, 3), at(5, 5)].sort((x, y) => x - y));

    // a leaves (1,0) and b steps onto it → (1,0) is saved from crumbling.
    s.positions = { a: at(1, 0), b: at(3, 0), c: at(4, 5), d: at(5, 2) };
    s.round = 1;
    plates.resolve(
      s,
      {
        a: { to: at(2, 0), remove: at(6, 6) },
        b: { to: at(1, 0), remove: at(6, 5) },
        c: { to: at(4, 4), remove: at(6, 4) },
        d: { to: at(5, 1), remove: at(6, 3) },
      },
      rng,
    );
    expect(s.plates[at(1, 0)]).toBe(true);
    expect(s.last!.crumbled).not.toContain(at(1, 0));
    expect(s.last!.crumbled).toContain(at(3, 0));
  });

  it("knocks out a player left with no neighboring plate, and ends when one is left", () => {
    const { s, rng } = arena();
    // a is on a 2-plate island; everyone else has a small cluster that stays connected after one move.
    s.positions = { a: at(0, 0), b: at(5, 5), c: at(5, 0), d: at(0, 5) };
    s.plates = s.plates.map(() => false);
    const keep = [
      [0, 0], [1, 0],
      [5, 5], [4, 5], [5, 4], [4, 4], [3, 5],
      [5, 0], [4, 0], [4, 1], [5, 1], [3, 0],
      [0, 5], [1, 5], [0, 4], [1, 4], [0, 3],
    ] as const;
    for (const [x, y] of keep) s.plates[at(x, y)] = true;
    plates.resolve(
      s,
      {
        a: { to: at(1, 0), remove: at(3, 5) },
        b: { to: at(4, 5), remove: at(3, 0) },
        c: { to: at(4, 0), remove: at(0, 3) },
        d: { to: at(1, 5), remove: at(4, 4) },
      },
      rng,
    );
    // a left (0,0) which crumbled; (1,0) has no neighbors left → out. Others still have paths.
    expect(s.outRound.a).toBe(1);
    expect(s.outRound.b).toBeNull();
    expect(s.outRound.c).toBeNull();
    expect(s.outRound.d).toBeNull();
    expect(plates.done(s)).toBe(false);
    s.outRound = { a: 1, b: 2, c: 2, d: null };
    s.freeWhenOut = { a: 0, b: 1, c: 1, d: 0 };
    expect(plates.done(s)).toBe(true);
    expect(plates.result(s).ranking).toEqual([["d"], ["b", "c"], ["a"]]);
  });
});

describe("Battleship", () => {
  const g10 = square(10);
  const at = (x: number, y: number) => cellAt(g10, x, y);
  const place = (ships: [number, "h" | "v"][]): BattleshipChoice => ({
    kind: "place",
    ships: ships.map(([cell, dir]) => ({ cell, dir })),
  });

  function placed() {
    const { s, rng } = setupGame(battleship, ["a", "b", "c", "d"]);
    battleship.resolve(
      s,
      {
        a: place([[at(0, 0), "h"], [at(0, 2), "h"], [at(0, 4), "h"]]),
        b: place([[at(0, 0), "v"], [at(5, 5), "h"], [at(9, 8), "v"]]),
        c: place([[at(0, 9), "h"], [at(9, 0), "v"], [at(7, 7), "h"]]),
        d: place([[at(5, 0), "h"], [at(5, 2), "v"], [at(3, 6), "h"]]),
      },
      rng,
    );
    return { s, rng };
  }

  it("sizes the shared sea at about 2.5 cells per ship tile", () => {
    expect(battleshipSize(4)).toBe(10);
    expect(battleshipSize(12)).toBe(17);
  });

  it("needs your 3 ships on the sea without overlapping each other", () => {
    expect(fleetCells(g10, [{ cell: at(6, 0), dir: "h" }, { cell: at(0, 2), dir: "h" }, { cell: at(0, 4), dir: "h" }])).toBeNull();
    expect(fleetCells(g10, [{ cell: at(0, 0), dir: "h" }, { cell: at(2, 0), dir: "v" }, { cell: at(0, 4), dir: "h" }])).toBeNull();
    expect(fleetCells(g10, [{ cell: at(0, 0), dir: "h" }, { cell: at(0, 1), dir: "h" }, { cell: at(0, 2), dir: "h" }])).toHaveLength(3);
  });

  it("lets different players' ships overlap, and one shot hits every ship on that cell", () => {
    const { s, rng } = placed();
    // a's 5-ship and b's 5-ship share (0,0).
    battleship.resolve(s, { c: { kind: "fire", cells: [at(0, 0), at(1, 1)] } }, rng);
    expect(s.shots[at(0, 0)]).toBe("hit");
    expect(s.shots[at(1, 1)]).toBe("miss");
  });

  it("won't let you fire at your own ships, and fires 2 shots, 3 from round 8", () => {
    const { s } = placed();
    expect(shotsPerRound(s)).toBe(2);
    expect(battleship.parse(s, "a", { kind: "fire", cells: [at(0, 0), at(9, 9)] })).toBeUndefined();
    expect(battleship.parse(s, "a", { kind: "fire", cells: [at(9, 9)] })).toBeUndefined();
    expect(battleship.parse(s, "a", { kind: "fire", cells: [at(9, 9), at(9, 9)] })).toBeUndefined();
    expect(battleship.parse(s, "a", { kind: "fire", cells: [at(9, 9), at(8, 8)] })).toBeDefined();
    s.round = 8;
    expect(shotsPerRound(s)).toBe(3);
  });

  it("shows hits to everyone but other players' ships only once they sink", () => {
    const { s, rng } = placed();
    const view = (id: string) => battleship.view(s, id) as BattleshipView;
    expect(view("a").yours!.map((ship) => ship.cells.length)).toEqual([5, 3, 2]);
    expect(JSON.stringify(view("a"))).not.toContain(JSON.stringify(s.ships.d![2]!.cells));

    battleship.resolve(s, { a: { kind: "fire", cells: [at(3, 6), at(4, 6)] } }, rng);
    expect(view("b").sunk).toEqual([{ owner: "d", cells: [at(3, 6), at(4, 6)] }]);
    expect(view("b").shipsLeft.d).toBe(2);
    expect(battleship.view(s, null)).toMatchObject({ yours: null });
  });

  it("knocks out a player once all three ships are sunk", () => {
    const { s, rng } = placed();
    let guard = 0;
    while (s.outRound.d === null) {
      expect(guard++).toBeLessThan(40);
      const need = s.ships.d!.flatMap((ship) => ship.cells).filter((c) => s.shots[c] === null);
      const pad = s.shots.flatMap((shot, c) => (shot === null && !need.includes(c) && !s.ships.a!.some((ship) => ship.cells.includes(c)) ? [c] : []));
      const cells = [...need, ...pad].slice(0, shotsPerRound(s));
      battleship.resolve(s, { a: { kind: "fire", cells } }, rng);
    }
    expect(battleship.deciders(s)).not.toContain("d");
  });
});

describe("Minefield Trek", () => {
  const start = 1_000;
  const players = ["a", "b", "c", "d"];

  function field(bots: string[] = []) {
    const rng = createRng(3);
    const s = minefield.setup({ players, bots, rng }, start);
    return { s, rng };
  }
  const g = (s: MinefieldState) => ({ cols: s.cols, rows: s.rows });
  const lockAll = (s: MinefieldState, rng: ReturnType<typeof createRng>, now: number) => {
    for (const id of players) {
      if (s.locked[id]) continue;
      const x = players.indexOf(id) * 2;
      minefield.input(s, id, { kind: "mines", cells: [0, 1, 2, 3].map((y) => cellAt(g(s), x, y)) }, now, rng);
    }
  };
  /** Ends placement and moves the clock to GO. */
  function race(s: MinefieldState, rng: ReturnType<typeof createRng>) {
    lockAll(s, rng, start + 500);
    minefield.advance(s, start + 500, rng);
    return s.raceStartAt;
  }

  it("is 10 rows and 4 more columns than players", () => {
    const { s } = field();
    expect(s.rows).toBe(MINEFIELD.rows);
    expect(s.cols).toBe(minefieldCols(4));
    expect(minefieldCols(12)).toBe(16);
  });

  it("takes exactly 4 distinct mines off the start row", () => {
    const { s, rng } = field();
    const bottom = cellAt(g(s), 0, s.rows - 1);
    expect(minefield.input(s, "a", { kind: "mines", cells: [1, 2, 3] }, start, rng)).toBe(false);
    expect(minefield.input(s, "a", { kind: "mines", cells: [1, 2, 3, bottom] }, start, rng)).toBe(false);
    expect(minefield.input(s, "a", { kind: "mines", cells: [1, 1, 2, 3] }, start, rng)).toBe(false);
    expect(minefield.input(s, "a", { kind: "mines", cells: [1, 2, 3, 4] }, start, rng)).toBe(true);
    expect(minefield.input(s, "a", { kind: "mines", cells: [5, 6, 7, 8] }, start, rng)).toBe(false);
  });

  it("starts the race early once everyone has placed, and gives random mines to anyone who didn't", () => {
    const { s, rng } = field(["b", "c", "d"]);
    expect(s.mines.b).toHaveLength(4);
    lockAll(s, rng, start + 2_000);
    expect(s.placeEndAt).toBe(start + 2_000);
    const other = field();
    minefield.advance(other.s, start + MINEFIELD.placeMs, other.rng);
    expect(other.s.phase).toBe("racing");
    expect(Object.values(other.s.mines).every((m) => m.length === 4)).toBe(true);
  });

  it("limits steps to one every 250 ms, only after GO", () => {
    const { s, rng } = field();
    const go = race(s, rng);
    expect(minefield.input(s, "b", { kind: "step", dir: "up" }, go - 1, rng)).toBe(false);
    s.mines = { a: [], b: [], c: [], d: [] };
    expect(minefield.input(s, "b", { kind: "step", dir: "up" }, go, rng)).toBe(true);
    expect(minefield.input(s, "b", { kind: "step", dir: "up" }, go + 100, rng)).toBe(false);
    expect(minefield.input(s, "b", { kind: "step", dir: "up" }, go + 250, rng)).toBe(true);
    expect(minefield.input(s, "b", { kind: "step", dir: "down" }, go + 500, rng)).toBe(true);
    expect(minefield.input(s, "b", { kind: "step", dir: "down" }, go + 750, rng)).toBe(true);
    expect(minefield.input(s, "b", { kind: "step", dir: "down" }, go + 1_000, rng)).toBe(false);
  });

  it("sends you back to the start on someone else's mine, frozen for a second, and only you learn where it is", () => {
    const { s, rng } = field();
    const go = race(s, rng);
    const above = s.starts.b! - s.cols;
    s.mines = { a: [above], b: [], c: [], d: [] };
    s.positions.b = s.starts.b!;
    minefield.input(s, "b", { kind: "step", dir: "up" }, go, rng);
    expect(s.positions.b).toBe(s.starts.b);
    expect(s.hits.b).toBe(1);
    expect((minefield.view(s, "b") as MinefieldView).known).toEqual([above]);
    expect((minefield.view(s, "c") as MinefieldView).known).toEqual([]);
    expect(JSON.stringify(minefield.view(s, "c"))).not.toContain(`"yourMines":[${above}]`);
    expect(minefield.input(s, "b", { kind: "left" } as never, go + 500, rng)).toBe(false);
    expect(minefield.input(s, "b", { kind: "step", dir: "left" }, go + 500, rng)).toBe(false);
    expect(minefield.input(s, "b", { kind: "step", dir: "left" }, go + MINEFIELD.frozenMs, rng)).toBe(true);
  });

  it("keeps your own mines harmless", () => {
    const { s, rng } = field();
    const go = race(s, rng);
    const above = s.starts.b! - s.cols;
    s.mines = { a: [], b: [above], c: [], d: [] };
    minefield.input(s, "b", { kind: "step", dir: "up" }, go, rng);
    expect(s.positions.b).toBe(above);
  });

  it("ranks finishers by arrival, then everyone else by the row they're on when time runs out", () => {
    const { s, rng } = field();
    race(s, rng);
    s.finishedAt = { a: s.raceStartAt + 9_000, b: s.raceStartAt + 7_000, c: null, d: null };
    s.positions.c = cellAt(g(s), 0, 4);
    s.positions.d = cellAt(g(s), 1, 4);
    minefield.advance(s, s.raceEndAt, rng);
    expect(s.phase).toBe("over");
    expect(minefield.result(s).ranking).toEqual([["b"], ["a"], ["c", "d"]]);
  });

  it("hides mines until the race is over, and a bots-only race finishes", () => {
    const rng = createRng(4);
    const all = ids(12);
    const s = minefield.setup({ players: all, bots: all, rng }, start);
    expect((minefield.view(s, "p0") as MinefieldView).allMines).toBeNull();
    for (let next = minefield.nextEventAt(s); next !== null; next = minefield.nextEventAt(s)) minefield.advance(s, next, rng);
    expect(minefield.done(s)).toBe(true);
    expect((minefield.view(s, "p0") as MinefieldView).allMines).not.toBeNull();
    expect(minefield.result(s).ranking.flat().sort()).toEqual([...all].sort());
    expect(Object.values(s.finishedAt).some((t) => t !== null)).toBe(true);
  });
});
