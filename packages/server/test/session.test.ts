import { describe, expect, it } from "vitest";
import type { RoomView, Step } from "@pbg/protocol";
import { CLIENT_MINIGAME_KINDS, CLIENT_MINIGAMES, MINIGAME_KINDS, countThe, createMatch, createRng, stopwatchTarget, type MatchEvent, type TheCountView, type TimebombView, type MatchState, type ClientMinigameKind, type MinigameKind } from "@pbg/rules";
import { AUCTION_ANNOUNCEMENT_MS, AUCTION_RESET_MS, BOSS_OUTCOME_MS, BOSS_ROLL_DELAY_MS, BOT_BOSS_CHOICE_MS, COLLISION_BUFFER_MS, MOVE_ROLL_SUMMARY_MS, SHOWDOWN_OUTCOME_MS, SHOWDOWN_ROLL_GAP_MS, GameSession, SessionError, type Timing } from "../src/session";

const TIMING: Timing = {
  itemMs: 30_000,
  itemRevealMs: 10_000,
  moveMs: 30_000,
  battleMs: 15_000,
  countdownMs: 3_000,
  graceMs: 1_000,
  revealMs: 3_000,
  spaceMs: 0,
  minigameEndMs: 2_000,
  resultsMs: 10_000,
};

class FakeClock {
  now = 0;
  private timers: { at: number; fn: () => void; cancelled: boolean }[] = [];

  schedule = (ms: number, fn: () => void) => {
    const timer = { at: this.now + ms, fn, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };

  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => !t.cancelled && t.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      due.cancelled = true;
      this.now = due.at;
      due.fn();
    }
    this.now = target;
  }
}

/** Defaults to the browser-run minigames, whose timing these tests know. */
function setup(
  humans: string[],
  bots = 0,
  minigames: readonly MinigameKind[] = ["reaction", "mash"],
  chaosBoardTest = false,
) {
  const clock = new FakeClock();
  const session = new GameSession({
    code: "TEST01",
    seed: 1,
    chaosBoardTest,
    timing: TIMING,
    minigames,
    now: () => clock.now,
    schedule: clock.schedule,
    onChange: () => {},
  });
  for (const id of humans) session.addHuman(id, id.toUpperCase());
  for (let i = 0; i < bots; i++) session.handle(humans[0]!, { type: "addBot" });
  return { clock, session, view: (id: string): RoomView => session.viewFor(id) };
}

function seatOf(view: RoomView, sessionName: string) {
  return view.seats.find((s) => s.name === sessionName.toUpperCase())!;
}

function finishMovementReveal(ctx: ReturnType<typeof setup>): void {
  ctx.clock.advance(MOVE_ROLL_SUMMARY_MS);
  const step = ctx.view("a").match?.step;
  if (!step || step.kind !== "revealing") throw new Error(`Expected movement reveal, got ${step?.kind}`);
  ctx.clock.advance(step.until - ctx.clock.now);
}

describe("lobby", () => {
  it("makes the first human the host and gives everyone a different character", () => {
    const { view } = setup(["a", "b"], 2);
    const seats = view("a").seats;
    expect(seats.map((s) => s.isHost)).toEqual([true, false, false, false]);
    expect(new Set(seats.map((s) => s.character)).size).toBe(4);
  });

  it("seeds every board space with a visible player-owned trap in trap-test mode", () => {
    const clock = new FakeClock();
    const session = new GameSession({
      code: "TRAP01",
      seed: 42,
      trapBoardTest: true,
      timing: TIMING,
      now: () => clock.now,
      schedule: clock.schedule,
      onChange: () => {},
    });
    session.addHuman("a", "A");
    for (let i = 0; i < 3; i++) session.handle("a", { type: "addBot" });
    session.handle("a", { type: "start" });
    const state = (session as unknown as { match: MatchState }).match;
    const view = session.viewFor("a").match!;
    expect(state.traps).toHaveLength(state.board.spaces.length);
    expect(new Set(state.traps.map((trap) => trap.kind))).toEqual(new Set(["sandTrap", "itemTrap", "deathTrap"]));
    expect(state.traps.every((trap) => state.players.some((player) => player.id === trap.ownerId))).toBe(true);
    expect(state.players[0]!.items.some((item) => item.kind === "ghostFeet")).toBe(true);
    expect(view.testTraps).toHaveLength(state.board.spaces.length);
  });

  it("assigns bots a random free character, not always the next name in the list", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const clock = new FakeClock();
      const session = new GameSession({
        code: "TEST01",
        seed,
        timing: TIMING,
        minigames: CLIENT_MINIGAME_KINDS,
        now: () => clock.now,
        schedule: clock.schedule,
        onChange: () => {},
      });
      session.addHuman("a", "A");
      // Force the host onto the first roster name so the next sequential pick would always be Doug.
      session.handle("a", { type: "pickCharacter", character: "Coco" });
      session.handle("a", { type: "addBot" });
      const bot = session.viewFor("a").seats.find((s) => s.kind === "bot")!;
      seen.add(bot.character);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("only lets the host add bots and start", () => {
    const { session } = setup(["a", "b"], 2);
    expect(() => session.handle("b", { type: "addBot" })).toThrow(SessionError);
    expect(() => session.handle("b", { type: "start" })).toThrow(SessionError);
  });

  it("refuses to start with fewer than 4 players", () => {
    const { session } = setup(["a"], 2);
    expect(() => session.handle("a", { type: "start" })).toThrow(/at least 4/);
  });

  it("won't let two players pick the same character", () => {
    const { session, view } = setup(["a", "b"]);
    const taken = seatOf(view("a"), "a").character;
    expect(() => session.handle("b", { type: "pickCharacter", character: taken })).toThrow(/taken/);
  });

  it("hands host to the next player when the host leaves", () => {
    const { session, view } = setup(["a", "b", "c"]);
    session.removeHuman("a");
    expect(view("b").seats.find((s) => s.isHost)?.name).toBe("B");
  });

  it("replaces a bot when a human joins a full room", () => {
    const { session, view } = setup(["a"], 11);
    session.addHuman("z", "z");
    const seats = view("a").seats;
    expect(seats).toHaveLength(12);
    expect(seats.filter((s) => s.kind === "human")).toHaveLength(2);
  });
});

describe("phases", () => {
  it.each([
    ["short", 45, [15, 30]],
    ["medium", 60, [15, 30, 45]],
    ["large", 75, [15, 30, 45, 60]],
  ] as const)("starts with the selected %s board", (boardSize, length, checkpointPositions) => {
    const { session, view } = setup(["a"], 3);
    session.handle("a", { type: "start", boardSize });
    const board = view("a").match!.board;
    expect(board.spaces[board.start]!.distanceToFinish).toBe(length);
    expect(board.spaces.filter((space) => space.type === "checkpoint")
      .map((space) => length - space.distanceToFinish)
      .sort((a, b) => a - b)).toEqual(checkpointPositions);
  });

  it("marks every traversable tile as Monochrome Chaos in chaos-board test mode", () => {
    const { session, view } = setup(["a"], 3, CLIENT_MINIGAME_KINDS, true);
    session.handle("a", { type: "start" });
    const board = view("a").match!.board;
    const traversable = board.spaces.filter((space) => space.lane !== null);

    expect(traversable.length).toBeGreaterThan(0);
    expect(traversable.every((space) => space.type === "monochromeChaos")).toBe(true);
    expect(board.spaces[board.start]!.type).toBe("start");
    expect(board.spaces[board.finish]!.type).toBe("finish");
  });

  it("ends a phase as soon as every human is ready", () => {
    const { session, clock, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    expect(view("a").match?.step.kind).toBe("deciding");

    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });

    expect(view("a").match?.step.kind).toBe("rollSummary");
    clock.advance(MOVE_ROLL_SUMMARY_MS);
    expect(view("a").match?.step.kind).toBe("revealing");
  });

  it("uses the timeout defaults when a player doesn't decide in time", () => {
    const { session, clock, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });

    clock.advance(TIMING.moveMs);

    const match = view("a").match!;
    expect(match.step.kind).toBe("rollSummary");
    const roll = match.events.find((e) => e.type === "dieRolled" && e.playerId === seatOf(view("a"), "a").seatId);
    expect(roll).toMatchObject({ sides: 6, saved: false });
    clock.advance(MOVE_ROLL_SUMMARY_MS);
    expect(view("a").match!.step.kind).toBe("revealing");
  });

  it("doesn't wait for a disconnected player", () => {
    const { session, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    session.drop("b");

    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });

    expect(view("a").match?.step.kind).toBe("rollSummary");
  });

  it("rejects a die the player doesn't have", () => {
    const { session } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    expect(() => session.handle("a", { type: "submitMove", choice: { die: "die999", lane: 0 } })).toThrow(/die/);
  });

  it("plays a whole match to a winner once every human has left", () => {
    const { session, clock } = setup(["a"], 5);
    session.handle("a", { type: "start" });
    session.removeHuman("a");

    for (let i = 0; i < 1000 && session.stage === "playing"; i++) clock.advance(TIMING.moveMs);

    expect(session.stage).toBe("finished");
  });

  it("goes back to the lobby with the same seats when the host plays again", () => {
    const { session, clock, view } = setup(["a", "b"], 3);
    session.handle("a", { type: "start" });
    session.drop("b");
    for (let i = 0; i < 1000 && session.stage === "playing"; i++) clock.advance(TIMING.moveMs);
    expect(session.stage).toBe("finished");

    session.handle("a", { type: "playAgain" });

    expect(session.stage).toBe("lobby");
    expect(view("a").seats).toHaveLength(5);
    expect(view("a").match).toBeNull();
  });
});

describe("boss encounters and showdown", () => {
  function bossFixture(challengerIndexes = [0], humans = ["a", "b"], bots = 2, seed = 1) {
    const ctx = setup(humans, bots);
    ctx.session.handle(humans[0]!, { type: "start" });
    const seats = ctx.view(humans[0]!).seats;
    const state = createMatch({
      seed: 1,
      players: seats.map((s) => ({ id: s.seatId, name: s.name, isBot: s.kind === "bot" })),
      rules: { bossStartFixed: 4 },
    });
    const challengers = challengerIndexes.map((i) => seats[i]!.seatId);
    for (const p of state.players) if (challengers.includes(p.id)) p.position = state.board.finish;
    state.phase = { kind: "boss", challengers };
    state.rng = createRng(seed);
    const fixture = ctx.session as unknown as { match: MatchState; startPhase(): void };
    fixture.match = state;
    return { ...ctx, state, seats, challengers, start: () => fixture.startPhase() };
  }

  it("offers dice inside the encounter and hides the boss roll and final state for exactly 2 seconds", () => {
    const { session, clock, view, state, start } = bossFixture();
    state.players[0]!.dice.push({ id: "saved12", sides: 12 });
    start();
    expect(view("a").match!.step).toMatchObject({ kind: "bossBattle", stage: "choosing", selected: {} });
    expect(view("a").match!.you!.decision).toMatchObject({ kind: "boss", dice: [{ id: null, sides: 6 }, { id: "saved12", sides: 12 }] });
    expect(view("b").match!.you!.decision).toBeNull();
    expect(() => session.handle("b", { type: "submitBattle", choice: { die: null } })).toThrow(/aren't in this fight/);
    expect(() => session.handle("a", { type: "submitBattle", choice: { die: "fake" } })).toThrow(/die/);
    session.handle("a", { type: "submitBattle", choice: { die: "saved12" } });
    expect(view("a").match!.step).toMatchObject({ kind: "bossBattle", stage: "playerRoll", playerRoll: 8, sides: 12, saved: true });
    expect(view("b").match!.step).toEqual(view("a").match!.step);
    expect(view("a").match!.step).not.toHaveProperty("bossRoll");
    expect(view("a").match!.events.some((e) => e.type === "bossFight" || e.type === "matchWon")).toBe(false);
    expect(view("a").match!.phase.kind).toBe("boss");
    expect(session.stage).toBe("playing");
    clock.advance(BOSS_ROLL_DELAY_MS - 1);
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll" });
    clock.advance(1);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", bossRoll: 1, bossFixed: 4, bossScore: 5, result: "won" });
    expect(session.stage).toBe("playing");
    clock.advance(BOSS_OUTCOME_MS);
    expect(session.stage).toBe("finished");
    expect(view("a").match!.phase).toEqual({ kind: "gameOver", winner: state.players[0]!.id });
    expect(view("a").match!.you!.dice).toEqual([]);
    expect(view("a").match!.events.filter((e) => e.type === "bossFight")).toHaveLength(1);
  });

  it("holds the roll breakdown for three seconds before beginning the movement reveal", () => {
    const { session, clock, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });

    const summary = view("a").match!.step;
    expect(summary).toMatchObject({ kind: "rollSummary", until: MOVE_ROLL_SUMMARY_MS });
    expect(summary.kind === "rollSummary" && summary.events.some((event) => event.type === "dieRolled")).toBe(true);
    clock.advance(MOVE_ROLL_SUMMARY_MS - 1);
    expect(view("a").match!.step.kind).toBe("rollSummary");
    clock.advance(1);
    expect(view("a").match!.step.kind).toBe("revealing");
  });

  it("uses a 12-second movement reveal when players land on arrow spaces", () => {
    const { session } = setup(["a"], 3);
    const revealDuration = (session as unknown as { revealDuration(events: MatchEvent[]): number }).revealDuration.bind(session);
    const events: MatchEvent[] = [
      { type: "moved", playerId: "p1", path: [1, 2] },
      { type: "arrow", playerId: "p1", direction: "forward", path: [3] },
      { type: "arrow", playerId: "p2", direction: "forward", path: [4], chain: 0 },
      { type: "arrow", playerId: "p2", direction: "forward", path: [5], chain: 1 },
      { type: "collision", spaceId: 3, playerIds: ["p1", "p2"], sentTo: 0 },
    ];
    expect(revealDuration(events)).toBe(12_000);
  });

  it("holds a bot-only die choice on screen for 1 second and shows its rolls to humans", () => {
    const { session, clock, view, state, start } = bossFixture([1], ["a"], 3);
    state.players[1]!.defaultDie = 4;
    start();
    expect(view("a").match!.step).toMatchObject({ kind: "bossBattle", stage: "choosing" });
    clock.advance(BOT_BOSS_CHOICE_MS - 1);
    expect(view("a").match!.step).toMatchObject({ stage: "choosing" });
    clock.advance(1);
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll", playerId: state.players[1]!.id });
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", result: "lost" });
    expect(view("a").match!.players[1]!.position).toBe(state.board.finish);
    clock.advance(BOSS_OUTCOME_MS);
    expect(session.stage).toBe("playing");
    expect(view("a").match!.step).toMatchObject({ kind: "revealing" });
    expect(view("a").match!.players[1]!.position).not.toBe(state.board.finish);
    expect(view("a").match!.bossFixed).toBe(3);
    const reveal = view("a").match!.step;
    expect(reveal.kind === "revealing" && reveal.events!.every((e) => e.type !== "moved")).toBe(true);
  });

  it("resolves a bot-versus-bot battle after its brief choice display", () => {
    const { session, clock, view, start } = bossFixture([2, 3], ["a", "b"], 2);
    start();
    expect(view("a").match!.step).toMatchObject({ kind: "bossBattle", stage: "choosing" });
    clock.advance(BOT_BOSS_CHOICE_MS);
    expect(view("a").match!.step).not.toMatchObject({ kind: "bossBattle", stage: "choosing" });
  });

  it("rerolls ties with the same 2-second sequence and rejects changing dice during playback", () => {
    const { session, clock, view, start } = bossFixture([0], ["a", "b"], 2, 3);
    start();
    session.handle("a", { type: "submitBattle", choice: { die: null } });
    expect(() => session.handle("a", { type: "submitBattle", choice: { die: null } })).toThrow(/Nothing to decide/);
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", playerRoll: 5, bossScore: 5, result: "tie" });
    clock.advance(BOSS_OUTCOME_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll", attempt: 2, sides: 6 });
    expect(view("a").match!.step).not.toHaveProperty("bossRoll");
    clock.advance(BOSS_ROLL_DELAY_MS - 1);
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll" });
    clock.advance(1);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", attempt: 2 });
  });

  it("presents every simultaneous challenger against the original shared boss", () => {
    const { session, clock, view, state, start } = bossFixture([0, 1]);
    state.players[0]!.defaultDie = 4;
    state.players[1]!.defaultDie = 4;
    start();
    session.handle("a", { type: "submitBattle", choice: { die: null } });
    expect(view("a").match!.step).toMatchObject({ stage: "choosing" });
    session.handle("b", { type: "submitBattle", choice: { die: null } });
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll", encounter: 1, encounters: 2 });
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", bossFixed: 4 });
    clock.advance(BOSS_OUTCOME_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll", encounter: 2, playerId: state.players[1]!.id });
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", bossFixed: 4 });
    clock.advance(BOSS_OUTCOME_MS);
    expect(view("a").match!.bossFixed).toBe(3);
  });

  it("waits for every boss encounter to finish before starting a multiple-winner showdown", () => {
    const { session, clock, view, state, start } = bossFixture([0, 1], ["a", "b"], 2, 3);
    state.players[0]!.dice.push({ id: "a12", sides: 12 });
    state.players[1]!.dice.push({ id: "b12", sides: 12 });
    start();
    session.handle("a", { type: "submitBattle", choice: { die: "a12" } });
    session.handle("b", { type: "submitBattle", choice: { die: "b12" } });
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", result: "won", encounter: 1 });
    expect(view("a").match!.phase.kind).toBe("boss");
    clock.advance(BOSS_OUTCOME_MS + BOSS_ROLL_DELAY_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", result: "won", encounter: 2 });
    expect(view("a").match!.phase.kind).toBe("boss");
    clock.advance(BOSS_OUTCOME_MS);
    expect(view("a").match!.phase.kind).toBe("showdown");
    expect(view("a").match!.step).toMatchObject({ kind: "showdown", stage: "choosing", contenders: ["s1", "s2"] });
  });

  it("does not skip or restart the roll delay when a challenger disconnects and reconnects", () => {
    const { session, clock, view, start } = bossFixture();
    start();
    session.handle("a", { type: "submitBattle", choice: { die: null } });
    clock.advance(500);
    session.drop("a");
    clock.advance(500);
    session.reconnect("a");
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll", until: BOSS_ROLL_DELAY_MS });
    clock.advance(BOSS_ROLL_DELAY_MS - 1_001);
    expect(view("a").match!.step).toMatchObject({ stage: "playerRoll" });
    clock.advance(1);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome" });
  });

  it("uses a default die at the decision timeout, and a disconnected challenger cannot stall the encounter", () => {
    const ctx = bossFixture();
    ctx.start();
    ctx.clock.advance(TIMING.battleMs - 1);
    expect(ctx.view("a").match!.step).toMatchObject({ stage: "choosing" });
    ctx.clock.advance(1);
    expect(ctx.view("a").match!.step).toMatchObject({ stage: "playerRoll", sides: 6, saved: false });
    const other = bossFixture();
    other.start();
    other.session.drop("a");
    other.clock.advance(BOT_BOSS_CHOICE_MS);
    expect(other.view("b").match!.step).toMatchObject({ stage: "playerRoll" });
  });

  it("does not allow a saved die to bypass a d4 penalty", () => {
    const { session, view, state, start } = bossFixture();
    state.players[0]!.defaultDie = 4;
    state.players[0]!.dice.push({ id: "saved12", sides: 12 });
    start();
    expect(view("a").match!.you!.decision).toMatchObject({ dice: [{ id: null, sides: 4 }] });
    expect(() => session.handle("a", { type: "submitBattle", choice: { die: "saved12" } })).toThrow(/die/);
  });

  it("starts a tied finish in the same die-choice encounter flow", () => {
    const { session, clock, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    const seats = view("a").seats;
    const state = createMatch({
      seed: 1,
      players: seats.map((s) => ({ id: s.seatId, name: s.name, isBot: s.kind === "bot" })),
    });
    const contenders = seats.slice(0, 2).map((s) => s.seatId);
    state.phase = { kind: "showdown", contenders };
    // Install a deterministic tied-finish fixture rather than searching random whole matches.
    const fixture = session as unknown as { match: MatchState; startPhase(): void };
    fixture.match = state;
    fixture.startPhase();
    expect(view("a").match!.step).toMatchObject({ kind: "showdown", stage: "choosing", contenders, selected: {} });
    expect(view("a").match!.you?.decision?.kind).toBe("showdown");
  });

  it("reveals free-for-all rolls two seconds apart and keeps lower rolls visible as out", () => {
    const { session, clock, view, state, start } = bossFixture([0, 1, 2, 3], ["a", "b", "c", "d"], 0, 21);
    state.phase = { kind: "showdown", contenders: ["s1", "s2", "s3", "s4"] };
    state.rng = createRng(21);
    for (const p of state.players) p.dice.push({ id: `${p.id}-d12`, sides: 12 });
    start();
    for (const id of ["a", "b", "c", "d"]) {
      const seat = view(id).youSeatId!;
      session.handle(id, { type: "submitBattle", choice: { die: `${seat}-d12` } });
    }
    expect(view("a").match!.step).toMatchObject({ kind: "showdown", stage: "rolling", rolls: { s1: 6 }, round: 1 });
    clock.advance(SHOWDOWN_ROLL_GAP_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "rolling", rolls: { s1: 6, s2: 6 } });
    clock.advance(SHOWDOWN_ROLL_GAP_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "rolling", rolls: { s1: 6, s2: 6, s3: 4 } });
    clock.advance(SHOWDOWN_ROLL_GAP_MS);
    expect(view("a").match!.step).toMatchObject({ stage: "outcome", rolls: { s1: 6, s2: 6, s3: 4, s4: 5 }, leaders: ["s1", "s2"], eliminated: { s3: 4, s4: 5 } });
    clock.advance(SHOWDOWN_OUTCOME_MS);
    expect(view("a").match!.step).toMatchObject({ kind: "showdown", stage: "rolling", round: 2, active: ["s1", "s2"], rolls: { s1: 6 } });
    expect(Object.keys((view("a").match!.step as { eliminated: object }).eliminated)).toEqual(["s3", "s4"]);
  });
});

describe("auctions", () => {
  it("opens every third-round item phase, enforces bid/shop locks, and awards to the final high bidder", () => {
    const { clock, session, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    const internals = session as unknown as { match: MatchState; startPhase: () => void };
    const humanId = seatOf(view("a"), "a").seatId;
    const secondHumanId = seatOf(view("b"), "b").seatId;
    internals.match.round = 3;
    internals.match.phase = { kind: "items" };
    for (const player of internals.match.players) {
      if (player.id !== humanId && player.id !== secondHumanId) player.coins = 0;
    }
    internals.startPhase();

    expect(view("a").match!.step).toMatchObject({ kind: "auctionAnnouncement", round: 3 });
    expect(view("a").match!.auction).toBeNull();
    clock.advance(AUCTION_ANNOUNCEMENT_MS);

    const openingAuction = view("a").match!.auction!;
    expect(openingAuction.status).toBe("open");
    expect(openingAuction.deadline - clock.now).toBe(20_000);

    session.handle("a", { type: "joinAuction" });
    session.handle("b", { type: "joinAuction" });
    clock.advance(5_000);
    session.handle("a", { type: "auctionBid", amount: 1 });
    expect((view("a").match!.step as { deadline: number }).deadline)
      .toBe(clock.now + TIMING.itemMs);
    expect(view("a").match!.auction!.currentBid).toBe(1);
    expect(view("a").match!.auction!.deadline - clock.now).toBe(AUCTION_RESET_MS);
    expect(() => session.handle("b", { type: "auctionBid", amount: 1 })).toThrow(/more than 1/);
    session.handle("b", { type: "auctionBid", amount: 2 });
    expect(() => session.handle("b", { type: "leaveAuction" })).toThrow(/can't leave/);
    expect(() => session.handle("b", { type: "buyShopItem", kind: "booster" }))
      .toThrow(/bid in the auction and can't buy/);

    clock.advance(AUCTION_RESET_MS);
    const result = view("a").match!;
    expect(result.auction).toMatchObject({
      status: "closed",
      winnerId: secondHumanId,
      winningBid: 2,
    });
    expect(result.players.find((player) => player.seatId === secondHumanId)!.coins).toBe(8);
    expect(view("b").match!.you!.items).toContainEqual({
      id: expect.any(String),
      kind: openingAuction.item,
    });
  });

  it("leaves an unbid item unsold and lets a shop buyer keep watching without joining", () => {
    const { clock, session, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    const internals = session as unknown as { match: MatchState; startPhase: () => void };
    internals.match.round = 3;
    internals.match.phase = { kind: "items" };
    internals.match.shop = ["booster"];
    for (const player of internals.match.players) {
      if (player.id !== seatOf(view("a"), "a").seatId) player.coins = 0;
    }
    internals.startPhase();
    expect(view("a").match!.step).toMatchObject({ kind: "auctionAnnouncement", round: 3 });
    clock.advance(AUCTION_ANNOUNCEMENT_MS);

    const startingCoins = view("a").match!.players.find((player) => player.seatId === seatOf(view("a"), "a").seatId)!.coins;
    session.handle("a", { type: "buyShopItem", kind: "booster" });
    expect(view("a").match!.auction!.me).toMatchObject({ lock: "shop", participating: false });
    expect(view("a").match!.you!.items).toContainEqual(expect.objectContaining({ kind: "booster" }));
    expect(view("a").match!.players.find((player) => player.seatId === seatOf(view("a"), "a").seatId)!.coins)
      .toBe(startingCoins - 7);
    expect(() => session.handle("a", { type: "joinAuction" })).toThrow(/bought from the shop/);
    session.handle("a", { type: "submitItems", choice: { use: null } });

    clock.advance(20_000);
    expect(view("a").match!.auction).toBeNull();
    expect(internals.match.players.find((player) => player.id === seatOf(view("a"), "a").seatId)!.items)
      .toContainEqual(expect.objectContaining({ kind: "booster" }));
  });

  it("announces chaos before an auction when both are pending for the same round", () => {
    const { clock, session, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    const internals = session as unknown as {
      match: MatchState;
      startPhase: () => void;
      pendingChaosSpawn: { type: "chaosSpacePlaced"; round: number; spaceId: number; spaceType: "monochromeChaos" } | null;
    };
    internals.match.round = 3;
    internals.match.phase = { kind: "items" };
    internals.pendingChaosSpawn = {
      type: "chaosSpacePlaced",
      round: 3,
      spaceId: 4,
      spaceType: "monochromeChaos",
    };

    internals.startPhase();
    expect(view("a").match!.step.kind).toBe("chaosSpawn");
    expect(view("a").match!.auction).toBeNull();
    clock.advance(5_000);
    expect(view("a").match!.step.kind).toBe("auctionAnnouncement");
    expect(view("a").match!.auction).toBeNull();
  });
});

describe("standalone boss simulator", () => {
  function simulate(challenger: "you" | "bot" | "both", defaultDie: 4 | 6 = 6, seed = 1) {
    const clock = new FakeClock();
    const session = new GameSession({
      code: "BOSS01", seed, timing: TIMING,
      bossTest: { challenger, bossFixed: 4, defaultDie },
      now: () => clock.now, schedule: clock.schedule, onChange: () => {},
    });
    session.addHuman("tester", "Boss tester");
    for (let i = 0; i < 3; i++) session.handle("tester", { type: "addBot" });
    session.handle("tester", { type: "start" });
    return { session, clock, view: () => session.viewFor("tester") };
  }

  it("starts at the boss immediately with saved dice and a spectator watching bots", () => {
    const { view, clock } = simulate("bot");
    const match = view().match!;
    expect(match.round).toBe(1);
    expect(match.events[0]).toEqual({ type: "roundStarted", round: 1 });
    expect(match.phase).toEqual({ kind: "boss", challengers: [view().seats[1]!.seatId] });
    expect(match.you!.decision).toBeNull();
    expect(match.you!.dice.map((d) => d.sides)).toEqual([8, 10, 12]);
    expect(match.step).toMatchObject({ kind: "bossBattle", stage: "choosing" });
    clock.advance(BOT_BOSS_CHOICE_MS);
    expect(view().match!.step).toMatchObject({ stage: "playerRoll", sides: 12 });
  });

  it("reproduces the win preset through the real boss rules", () => {
    const { session, clock, view } = simulate("you");
    const die = view().match!.you!.dice.find((d) => d.sides === 12)!;
    session.handle("tester", { type: "submitBattle", choice: { die: die.id } });
    expect(view().match!.step).toMatchObject({ stage: "playerRoll", playerRoll: 8 });
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view().match!.step).toMatchObject({ stage: "outcome", bossScore: 5, result: "won" });
    clock.advance(BOSS_OUTCOME_MS);
    expect(view().stage).toBe("finished");
  });

  it("pauses after a loss and knockback without starting a minigame", () => {
    const { session, clock, view } = simulate("you", 4);
    session.handle("tester", { type: "submitBattle", choice: { die: null } });
    clock.advance(BOSS_ROLL_DELAY_MS + BOSS_OUTCOME_MS);
    expect(view().match!.phase.kind).toBe("minigame");
    expect(view().match!.step.kind).toBe("revealing");
    expect(view().match!.events.some((e) => e.type === "knockedBack")).toBe(true);
    clock.advance(1_000_000);
    expect(view().match!.step.kind).toBe("revealing");
    expect(view().match!.minigame).toBeNull();
  });

  it("reproduces the tie preset and rerolls without changing dice", () => {
    const { session, clock, view } = simulate("you", 6, 3);
    session.handle("tester", { type: "submitBattle", choice: { die: null } });
    clock.advance(BOSS_ROLL_DELAY_MS);
    expect(view().match!.step).toMatchObject({ stage: "outcome", playerRoll: 5, bossScore: 5, result: "tie" });
    clock.advance(BOSS_OUTCOME_MS);
    expect(view().match!.step).toMatchObject({ stage: "playerRoll", attempt: 2, sides: 6 });
  });
});

describe("away players", () => {
  function playRounds(clock: FakeClock, session: GameSession, rounds: number) {
    const startRound = () => session.viewFor("a").match!.round;
    const target = startRound() + rounds;
    for (let i = 0; i < 1000 && session.stage === "playing" && startRound() < target; i++) {
      clock.advance(1_000);
    }
  }

  it("hands a seat to a bot after 2 rounds away, and back when the player returns", () => {
    const { session, clock, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    session.drop("b");
    session.removeHuman("a");

    playRounds(clock, session, 1);
    expect(seatOf(view("b"), "b").botControlled).toBe(false);

    playRounds(clock, session, 1);
    if (session.stage === "playing") expect(seatOf(view("b"), "b").botControlled).toBe(true);

    session.reconnect("b");
    expect(seatOf(view("b"), "b")).toMatchObject({ botControlled: false, connected: true });
  });

  it("gives a bot the seat of a player who leaves mid-match right away", () => {
    const { session, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    session.removeHuman("b");
    expect(seatOf(view("a"), "b").botControlled).toBe(true);
  });
});

describe("private information", () => {
  it("shows a knockout announcement only to the player who was knocked out", () => {
    const { session, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    const a = seatOf(view("a"), "a").seatId;
    const b = seatOf(view("b"), "b").seatId;
    const internals = session as unknown as { step: Step | null };
    internals.step = {
      kind: "death",
      events: [
        { type: "playerDied", playerId: a, reason: "item", cause: "candyMissile", sourcePlayerId: b },
        { type: "playerDied", playerId: b, reason: "battle" },
      ],
      until: 10_000,
    };

    expect(view("a").match!.step).toMatchObject({
      kind: "death",
      events: [{ playerId: a, cause: "candyMissile" }],
    });
    expect(view("b").match!.step).toMatchObject({
      kind: "death",
      events: [{ playerId: b, reason: "battle" }],
    });
  });

  it("shows everyone's minigame prizes, but only your own saved dice", () => {
    const { session, clock, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });

    for (let i = 0; i < 200 && session.stage === "playing"; i++) clock.advance(1_000);

    const awardsSeenByA = view("a").match!.events.filter((e) => e.type === "dieAwarded");
    const awardsSeenByB = view("b").match!.events.filter((e) => e.type === "dieAwarded");
    expect(awardsSeenByA.length).toBeGreaterThan(0);
    expect(awardsSeenByA).toEqual(awardsSeenByB);
    expect(view("a").match!.players[0]).not.toHaveProperty("dice");
  });

  it("keeps purchases and items private, but shows the coins going down", () => {
    const { session, clock, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    const a = seatOf(view("a"), "a").seatId;
    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });
    session.handle("b", { type: "submitMove", choice: { die: null, lane: 0 } });
    for (
      let i = 0;
      i < 120 && !(view("a").match!.round >= 2 && view("a").match!.phase.kind === "items" && view("a").match!.step.kind === "deciding");
      i++
    ) clock.advance(1_000);
    expect(view("a").match!.round).toBe(2);

    session.handle("a", { type: "buyShopItem", kind: "booster" });
    session.handle("b", { type: "submitItems", choice: {} });
    expect(view("a").match!.you!.items.some((item) => item.kind === "booster")).toBe(true);
    session.handle("a", { type: "submitItems", choice: { use: null } });
    clock.advance(TIMING.itemRevealMs);
    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });
    session.handle("b", { type: "submitMove", choice: { die: null, lane: 0 } });

    const bought = view("a").match!.events.find((e) => e.type === "itemBought" && e.playerId === a);
    expect(bought).toBeDefined();
    expect(view("a").match!.you!.items).toContainEqual(bought!.type === "itemBought" && bought!.item);
    expect(view("b").match!.events.some((e) => e.type === "itemBought" && e.playerId === a)).toBe(false);
    expect(view("b").match!.events).toContainEqual({ type: "coinsChanged", playerId: a, delta: -7, reason: "shop" });
    expect(JSON.stringify(view("b"))).not.toContain(bought!.type === "itemBought" ? bought!.item.id : "?");
  });

  it("has no item decision in the first round", () => {
    const { session, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    expect(view("a").match!.you!.decision).toMatchObject({ kind: "move" });
    expect(() => session.handle("a", { type: "submitItems", choice: { buy: "booster" } })).toThrow(SessionError);
  });
});

describe("minigames", () => {
  function toMinigame(humans: string[], bots: number, minigames: readonly MinigameKind[] = ["reaction", "mash"]) {
    const ctx = setup(humans, bots, minigames);
    ctx.session.handle(humans[0]!, { type: "start" });
    for (const id of humans) ctx.session.handle(id, { type: "submitMove", choice: { die: null, lane: 0 } });
    finishMovementReveal(ctx);
    const step = ctx.view(humans[0]!).match!.step;
    if (step.kind !== "minigame" || step.mode !== "client") throw new Error(`Expected a client minigame, got ${step.kind}`);
    return { ...ctx, step };
  }

  const goodScore = (game: ClientMinigameKind) => (game === "reaction" ? 300 : 40);

  function lastResults(view: RoomView) {
    const results = view.match!.events.filter((e) => e.type === "minigameResults").at(-1);
    if (results?.type !== "minigameResults") throw new Error("No minigame results");
    return results;
  }

  it("schedules a shared start time after a countdown", () => {
    const { step, clock } = toMinigame(["a"], 3);
    expect(step.startAt).toBe(clock.now + TIMING.countdownMs);
    expect(step.endAt).toBe(step.startAt + CLIENT_MINIGAMES[step.game].durationMs);
    expect(step.until).toBe(step.endAt + TIMING.graceMs);
  });

  it("waits for every connected human before starting a client minigame when enabled", () => {
    const ctx = setup(["a", "b"], 2);
    const { session, clock, view } = ctx;
    session.handle("a", { type: "start", waitForMinigameReady: true });
    for (const id of ["a", "b"]) session.handle(id, { type: "submitMove", choice: { die: null, lane: 0 } });
    finishMovementReveal(ctx);
    expect(view("a").match!.step).toMatchObject({ kind: "minigame", mode: "client", stage: "ready", readyRequired: true });
    session.handle("a", { type: "ready" });
    expect(view("a").match!.step).toMatchObject({ kind: "minigame", stage: "ready" });
    session.handle("b", { type: "ready" });
    const launched = view("a").match!.step;
    expect(launched).toMatchObject({ kind: "minigame", mode: "client", readyRequired: true });
    if (launched.kind !== "minigame" || launched.mode !== "client") throw new Error("Expected client minigame");
    expect(launched.startAt).toBe(clock.now);
  });

  it("starts a server-run minigame immediately after all players are ready", () => {
    const ctx = setup(["a", "b"], 2, ["rps"]);
    ctx.session.handle("a", { type: "start", waitForMinigameReady: true });
    for (const id of ["a", "b"]) ctx.session.handle(id, { type: "submitMove", choice: { die: null, lane: 0 } });
    finishMovementReveal(ctx);
    expect(ctx.view("a").match!.step).toMatchObject({ kind: "minigame", mode: "server", game: "rps", stage: "ready" });
    ctx.session.handle("a", { type: "ready" });
    expect(ctx.view("a").match!.step).toMatchObject({ kind: "minigame", stage: "ready" });
    ctx.session.handle("b", { type: "ready" });
    expect(ctx.view("a").match!.step).toMatchObject({
      kind: "minigame", mode: "server", game: "rps", stage: "countdown", until: ctx.clock.now,
    });
    ctx.clock.advance(0);
    expect(ctx.view("a").match!.step).toMatchObject({ kind: "minigame", mode: "server", stage: "choosing" });
  });

  it("ranks players by their results and resolves once every human has sent one", () => {
    const { session, clock, view, step } = toMinigame(["a", "b"], 2);
    clock.advance(step.endAt - clock.now);
    session.handle("a", { type: "submitMinigame", score: goodScore(step.game) });
    expect(view("a").match!.step.kind).toBe("minigame");
    session.handle("b", { type: "submitMinigame", score: null });

    const results = lastResults(view("a"));
    const a = seatOf(view("a"), "a").seatId;
    const b = seatOf(view("a"), "b").seatId;
    expect(results.played).toMatchObject({ game: step.game, scores: { [a]: goodScore(step.game), [b]: null } });
    expect(results.ranking.at(-1)).toContain(b);
  });

  it("counts implausible results, and results sent before the game could be over, as no result", () => {
    const { session, clock, view, step } = toMinigame(["a", "b"], 2);
    clock.advance(step.startAt - clock.now);
    session.handle("a", { type: "submitMinigame", score: goodScore(step.game) });
    clock.advance(step.endAt - clock.now);
    session.handle("b", { type: "submitMinigame", score: 1_000_000 });

    const scores = lastResults(view("a")).played!.scores;
    expect(scores[seatOf(view("a"), "a").seatId]).toBeNull();
    expect(scores[seatOf(view("a"), "b").seatId]).toBeNull();
  });

  it("gives players who never report a result last place when time runs out", () => {
    const { clock, view, step } = toMinigame(["a"], 3);
    clock.advance(step.until - clock.now);

    const results = lastResults(view("a"));
    expect(results.ranking.at(-1)).toEqual([seatOf(view("a"), "a").seatId]);
  });

  it("shows a results screen with everyone's placements and prizes for 10 seconds", () => {
    const { clock, view, step } = toMinigame(["a", "b"], 2);
    clock.advance(step.until - clock.now);

    const results = view("b").match!.step;
    if (results.kind !== "results") throw new Error(`Expected results, got ${results.kind}`);
    expect(results.until).toBe(clock.now + TIMING.resultsMs);
    expect(results.ranking.flat()).toHaveLength(4);
    expect(Object.keys(results.prizes)).toHaveLength(4);
    const first = results.ranking[0]![0]!;
    expect(results.prizes[first]!.coins).toBe(10);
    expect(results.ranking.flat().some((id) => results.prizes[id]!.die !== null)).toBe(true);

    clock.advance(TIMING.resultsMs - 1);
    expect(view("a").match!.step.kind).toBe("results");
    clock.advance(1);
    expect(view("a").match!.step.kind).toBe("deciding");
  });

  it("ends the results screen early once every human is ready", () => {
    const { session, clock, view, step } = toMinigame(["a", "b"], 2);
    clock.advance(step.until - clock.now);
    session.handle("a", { type: "ready" });
    expect(view("a").match!.step.kind).toBe("results");
    session.handle("b", { type: "ready" });
    expect(view("a").match!.step.kind).toBe("deciding");
    expect(() => session.handle("a", { type: "ready" })).toThrow(SessionError);
  });

  it("accepts only one result per player", () => {
    const { session, clock, step } = toMinigame(["a", "b"], 2);
    clock.advance(step.endAt - clock.now);
    session.handle("a", { type: "submitMinigame", score: goodScore(step.game) });
    expect(() => session.handle("a", { type: "submitMinigame", score: goodScore(step.game) })).toThrow(/already/);
  });

  it("starts an isolated playtest directly in the selected minigame with the requested bot count", () => {
    const clock = new FakeClock();
    const session = new GameSession({
      code: "TEST02",
      seed: 2,
      timing: TIMING,
      minigames: ["singleWord"],
      minigameTest: { game: "singleWord" },
      now: () => clock.now,
      schedule: clock.schedule,
      onChange: () => {},
    });
    session.addHuman("tester", "Tester");
    session.handle("tester", { type: "addBot" });
    session.handle("tester", { type: "addBot" });
    session.handle("tester", { type: "start" });

    const countdown = session.viewFor("tester").match!;
    expect(countdown.players).toHaveLength(3);
    expect(countdown.step).toMatchObject({ kind: "minigame", mode: "server", game: "singleWord", stage: "countdown" });
    clock.advance(TIMING.countdownMs);
    expect(session.viewFor("tester").match!.step).toMatchObject({
      kind: "minigame", mode: "server", game: "singleWord", stage: "choosing",
    });
    expect(session.viewFor("tester").match!.minigame!.deciders).toHaveLength(3);
  });

  it("shows isolated playtest results without applying match-only reward rules", () => {
    const clock = new FakeClock();
    const session = new GameSession({
      code: "TEST03",
      seed: 3,
      timing: TIMING,
      minigames: ["singleWord"],
      minigameTest: { game: "singleWord" },
      now: () => clock.now,
      schedule: clock.schedule,
      onChange: () => {},
    });
    session.addHuman("tester", "Tester");
    session.handle("tester", { type: "addBot" });
    session.handle("tester", { type: "addBot" });
    session.handle("tester", { type: "start" });
    clock.advance(TIMING.countdownMs);
    for (let round = 0; round < 3; round++) {
      session.handle("tester", { type: "minigameMove", move: { word: "APPLE" } });
      if (round < 2) clock.advance(1_500);
    }
    clock.advance(TIMING.minigameEndMs);

    const results = session.viewFor("tester").match!;
    expect(results.players).toHaveLength(3);
    expect(results.step.kind).toBe("results");
    if (results.step.kind === "results") {
      expect(Object.values(results.step.prizes)).toHaveLength(3);
      expect(Object.values(results.step.prizes).every((prize) => prize.coins === 0 && prize.die === null)).toBe(true);
    }
  });
});

describe("server-run minigames", () => {
  function toServerMinigame(game: MinigameKind, humans: string[], bots: number) {
    const ctx = setup(humans, bots, [game]);
    ctx.session.handle(humans[0]!, { type: "start" });
    for (const id of humans) ctx.session.handle(id, { type: "submitMove", choice: { die: null, lane: 0 } });
    finishMovementReveal(ctx);
    const step = () => {
      const s = ctx.view(humans[0]!).match!.step;
      if (s.kind !== "minigame" || s.mode !== "server") throw new Error(`Expected a server minigame, got ${s.kind}`);
      return s;
    };
    return { ...ctx, step };
  }

  function lastResults(view: RoomView) {
    const results = view.match!.events.filter((e) => e.type === "minigameResults").at(-1);
    if (results?.type !== "minigameResults") throw new Error("No minigame results");
    return results;
  }

  it("counts down, then opens a round of secret picks that ends once every human has picked", () => {
    const { session, clock, view, step } = toServerMinigame("rps", ["a", "b"], 2);
    expect(step()).toMatchObject({ game: "rps", stage: "countdown", until: clock.now + TIMING.countdownMs });
    clock.advance(TIMING.countdownMs);
    expect(step()).toMatchObject({ stage: "choosing", round: 1 });
    expect(view("a").match!.minigame!.deciders).toHaveLength(4);

    session.handle("a", { type: "minigameMove", move: "rock" });
    expect(view("a").match!.minigame!.submitted).toBe("rock");
    expect(view("b").match!.minigame!.submitted).toBeNull();
    expect(step().stage).toBe("choosing");
    session.handle("b", { type: "minigameMove", move: "paper" });
    expect(step().stage).toBe("reveal");
  });

  it("rejects invalid picks, second picks, and picks between rounds", () => {
    const { session, clock } = toServerMinigame("rps", ["a", "b"], 2);
    expect(() => session.handle("a", { type: "minigameMove", move: "rock" })).toThrow(/next round/);
    clock.advance(TIMING.countdownMs);
    expect(() => session.handle("a", { type: "minigameMove", move: "lizard" })).toThrow(/valid/);
    session.handle("a", { type: "minigameMove", move: "rock" });
    expect(() => session.handle("a", { type: "minigameMove", move: "paper" })).toThrow(/already/);
  });

  it("doesn't wait for a disconnected player, and gives them the timeout pick", () => {
    const { session, clock, step } = toServerMinigame("headsTails", ["a", "b"], 2);
    clock.advance(TIMING.countdownMs);
    session.drop("b");
    session.handle("a", { type: "minigameMove", move: { call: "pass" } });
    expect(step().stage).toBe("reveal");
  });

  it("scores Stopwatch by the absolute difference from its seeded target", () => {
    const ctx = setup(["a"], 3, ["stopwatch"]);
    const { session, clock, view } = ctx;
    session.handle("a", { type: "start" });
    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });
    finishMovementReveal(ctx);
    const step = view("a").match!.step;
    if (step.kind !== "minigame" || step.mode !== "client" || step.game !== "stopwatch") {
      throw new Error("Expected Stopwatch client minigame");
    }
    const elapsed = 15_000;
    clock.advance(step.startAt + elapsed - clock.now);
    session.handle("a", { type: "submitMinigame", score: elapsed });
    const result = view("a").match!.events.filter((event) => event.type === "minigameResults").at(-1);
    if (result?.type !== "minigameResults") throw new Error("Expected Stopwatch results");
    const playerId = seatOf(view("a"), "a").seatId;
    expect(result.played!.scores[playerId]).toBe(Math.abs(elapsed - stopwatchTarget(step.seed)));
    expect(result.played!.labels?.[playerId]).toContain("Stopped at 15.00s (15000ms)");
    expect(result.played!.labels?.[playerId]).toContain("ms from target");
  });

  it("validates Heads or Tails wagers and changes points by only the wager", () => {
    const { session, clock, view } = toServerMinigame("headsTails", ["a", "b"], 2);
    clock.advance(TIMING.countdownMs);
    expect(() => session.handle("a", { type: "minigameMove", move: { call: "heads", wager: 11 } })).toThrow(/valid/);
    session.handle("a", { type: "minigameMove", move: { call: "heads", wager: 2 } });
    expect(view("b").match!.minigame!.submitted).toBeNull();
    session.handle("b", { type: "minigameMove", move: { call: "tails", wager: 2 } });
    const state = view("a").match!.minigame!.view as { points: Record<string, number>; status: Record<string, string> };
    const a = seatOf(view("a"), "a").seatId;
    const b = seatOf(view("b"), "b").seatId;
    expect([state.points[a], state.points[b]].sort()).toEqual([12, 8].sort());
    expect(state.status[a]).toBe("betting");
    expect(state.status[b]).toBe("betting");
  });

  it("ranks equally accurate guesses in The by server-recorded submission time", () => {
    const { session, clock, view } = toServerMinigame("theCount", ["a", "b"], 2);
    clock.advance(TIMING.countdownMs);
    const answer = countThe((view("a").match!.minigame!.view as TheCountView).text!);
    session.handle("a", { type: "minigameMove", move: null });
    session.handle("b", { type: "minigameMove", move: null });
    clock.advance(1_000);
    expect((view("a").match!.minigame!.view as TheCountView).stage).toBe("guess");
    expect(() => session.handle("a", { type: "minigameMove", move: { guess: answer, elapsedMs: 0 } })).toThrow(/valid/);
    clock.advance(1_200);
    session.handle("b", { type: "minigameMove", move: answer });
    expect((view("a").match!.minigame!.view as TheCountView).answerMs).toBeNull();
    clock.advance(1_000);
    session.handle("a", { type: "minigameMove", move: answer });
    // The bots' guesses are deliberately delayed by 1–5 seconds.
    let shown = view("a").match!.minigame!.view as TheCountView;
    for (let i = 0; i < 50 && shown.answerMs === null; i++) {
      clock.advance(100);
      const minigame = view("a").match!.minigame;
      if (!minigame) break;
      shown = minigame.view as TheCountView;
    }
    const a = seatOf(view("a"), "a").seatId;
    const b = seatOf(view("b"), "b").seatId;
    expect(shown.answerMs).toMatchObject({ [a]: 2_200, [b]: 1_200 });
    clock.advance(TIMING.minigameEndMs);
    const results = lastResults(view("a"));
    expect(results.ranking.findIndex((group) => group.includes(b))).toBeLessThan(results.ranking.findIndex((group) => group.includes(a)));
  });

  it("keeps human Timebomb holders until they pass or explode, then resets for 2s", () => {
    const humans = ["a", "b", "c", "d"];
    const { session, clock, view, step } = toServerMinigame("timebomb", humans, 0);
    clock.advance(TIMING.countdownMs);
    const bomb = () => view("a").match!.minigame!.view as TimebombView;
    const holder = bomb().holder;
    expect(JSON.stringify(bomb())).not.toContain("fuseAt");
    clock.advance(4_000);
    expect(bomb().holder).toBe(holder);
    expect(bomb().eliminated).toEqual([]);
    for (let i = 0; i < 24 && bomb().exploded === null; i++) clock.advance(250);
    const reset = bomb().resetAt!;
    expect(bomb().eliminated).toEqual([holder]);
    expect(step().stage).toBe("live");
    clock.advance(reset - clock.now - 1);
    expect(bomb().exploded).toBe(holder);
    clock.advance(1);
    const next = bomb().holder;
    expect(next).not.toBe(holder);
    const who = humans.find((id) => seatOf(view(id), id).seatId === next)!;
    clock.advance(249);
    session.handle(who, { type: "minigameMove", move: "pass" });
    expect(bomb().holder).toBe(next);
    clock.advance(1);
    session.handle(who, { type: "minigameMove", move: "pass" });
    expect(bomb().holder).not.toBe(next);
    expect(bomb().holder).not.toBe(holder);
  });

  it("plays every round to the end and reports placements with readable results", () => {
    const { clock, view, session } = toServerMinigame("laserFight", ["a"], 3);
    const before = view("a").match!.round;
    for (let i = 0; i < 400 && view("a").match!.round === before; i++) clock.advance(1_000);
    const results = lastResults(view("a"));
    expect(results.played?.game).toBe("laserFight");
    expect(results.ranking.flat()).toHaveLength(4);
    expect(Object.values(results.played!.labels!).every((l) => typeof l === "string")).toBe(true);
    expect(view("a").match!.minigame).toBeNull();
    expect(session.stage).toBe("playing");
  });

  it("keeps other players' hints private in Higher or Lower", () => {
    const { session, clock, view } = toServerMinigame("higherLower", ["a", "b"], 2);
    clock.advance(TIMING.countdownMs);
    session.handle("a", { type: "minigameMove", move: 50 });
    session.handle("b", { type: "minigameMove", move: 10 });
    const seen = view("a").match!.minigame!.view as { you: { guesses: number[] }; guesses: unknown };
    expect(seen.you.guesses).toEqual([50]);
    expect(seen.guesses).toBeNull();
    expect(JSON.stringify(view("a").match!.minigame)).not.toContain('"secret":' + "1");
  });

  it("runs Timebomb through repeated explosions until one survivor remains", () => {
    const { session, clock, view, step } = toServerMinigame("timebomb", ["a", "b"], 2);
    clock.advance(TIMING.countdownMs);
    expect(step()).toMatchObject({ stage: "live", until: null });
    const bomb = () => view("a").match!.minigame!.view as { holder: string; exploded: string | null };
    const holderSession = (id: string) => (seatOf(view("a"), "a").seatId === id ? "a" : seatOf(view("a"), "b").seatId === id ? "b" : null);

    const before = view("a").match!.round;
    for (let i = 0; i < 2_000 && view("a").match!.round === before; i++) {
      const who = bomb()?.holder && holderSession(bomb().holder);
      if (who && i % 3 === 0) session.handle(who, { type: "minigameMove", move: "pass" });
      clock.advance(250);
    }
    const results = lastResults(view("a"));
    expect(results.played?.game).toBe("timebomb");
    expect(results.ranking.at(-1)).toHaveLength(1);
  });

  it("plays a whole match with every minigame in the rotation", () => {
    const { session, clock } = setup(["a"], 5, MINIGAME_KINDS);
    session.handle("a", { type: "start" });
    session.removeHuman("a");
    for (let i = 0; i < 20_000 && session.stage === "playing"; i++) clock.advance(1_000);
    expect(session.stage).toBe("finished");
  });
});
