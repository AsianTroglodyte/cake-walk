import { describe, expect, it } from "vitest";
import type { RoomView } from "@pbg/protocol";
import { CLIENT_MINIGAME_KINDS, CLIENT_MINIGAMES, MINIGAME_KINDS, type ClientMinigameKind, type MinigameKind } from "@pbg/rules";
import { GameSession, SessionError, type Timing } from "../src/session";

const TIMING: Timing = {
  moveMs: 30_000,
  battleMs: 20_000,
  countdownMs: 3_000,
  graceMs: 1_000,
  revealMs: 3_000,
  minigameEndMs: 2_000,
  resultsMs: 10_000,
};
const LONGEST_MINIGAME_MS = Math.max(...Object.values(CLIENT_MINIGAMES).map((m) => m.durationMs));
const FULL_MINIGAME_MS = TIMING.countdownMs + LONGEST_MINIGAME_MS + TIMING.graceMs;

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
function setup(humans: string[], bots = 0, minigames: readonly MinigameKind[] = CLIENT_MINIGAME_KINDS) {
  const clock = new FakeClock();
  const session = new GameSession({
    code: "TEST01",
    seed: 1,
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

describe("lobby", () => {
  it("makes the first human the host and gives everyone a different character", () => {
    const { view } = setup(["a", "b"], 2);
    const seats = view("a").seats;
    expect(seats.map((s) => s.isHost)).toEqual([true, false, false, false]);
    expect(new Set(seats.map((s) => s.character)).size).toBe(4);
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
  it("ends a phase as soon as every human is ready", () => {
    const { session, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    expect(view("a").match?.step.kind).toBe("deciding");

    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });

    expect(view("a").match?.step.kind).toBe("revealing");
  });

  it("uses the timeout defaults when a player doesn't decide in time", () => {
    const { session, clock, view } = setup(["a"], 3);
    session.handle("a", { type: "start" });

    clock.advance(TIMING.moveMs);

    const match = view("a").match!;
    expect(match.step.kind).toBe("revealing");
    const roll = match.events.find((e) => e.type === "dieRolled" && e.playerId === seatOf(view("a"), "a").seatId);
    expect(roll).toMatchObject({ sides: 6, saved: false });
  });

  it("doesn't wait for a disconnected player", () => {
    const { session, view } = setup(["a", "b"], 2);
    session.handle("a", { type: "start" });
    session.drop("b");

    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0 } });

    expect(view("a").match?.step.kind).toBe("revealing");
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
    clock.advance(TIMING.revealMs + FULL_MINIGAME_MS + TIMING.resultsMs);
    expect(view("a").match!.round).toBe(2);

    session.handle("a", { type: "submitMove", choice: { die: null, lane: 0, buy: "booster" } });
    session.handle("b", { type: "submitMove", choice: { die: null, lane: 0 } });

    const bought = view("a").match!.events.find((e) => e.type === "itemBought");
    expect(bought).toBeDefined();
    expect(view("a").match!.you!.items).toContainEqual(bought!.type === "itemBought" && bought!.item);
    expect(view("b").match!.events.some((e) => e.type === "itemBought")).toBe(false);
    expect(view("b").match!.events).toContainEqual({ type: "coinsChanged", playerId: a, delta: -5, reason: "shop" });
    expect(JSON.stringify(view("b"))).not.toContain(bought!.type === "itemBought" ? bought!.item.id : "?");
  });

  it("rejects item choices the rules don't allow", () => {
    const { session } = setup(["a"], 3);
    session.handle("a", { type: "start" });
    expect(() => session.handle("a", { type: "submitMove", choice: { die: null, lane: 0, buy: "booster" } })).toThrow(
      /first round/,
    );
  });
});

describe("minigames", () => {
  function toMinigame(humans: string[], bots: number) {
    const ctx = setup(humans, bots);
    ctx.session.handle(humans[0]!, { type: "start" });
    for (const id of humans) ctx.session.handle(id, { type: "submitMove", choice: { die: null, lane: 0 } });
    ctx.clock.advance(TIMING.revealMs);
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
});

describe("server-run minigames", () => {
  function toServerMinigame(game: MinigameKind, humans: string[], bots: number) {
    const ctx = setup(humans, bots, [game]);
    ctx.session.handle(humans[0]!, { type: "start" });
    for (const id of humans) ctx.session.handle(id, { type: "submitMove", choice: { die: null, lane: 0 } });
    ctx.clock.advance(TIMING.revealMs);
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
    session.handle("a", { type: "minigameMove", move: "stop" });
    expect(step().stage).toBe("reveal");
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

  it("runs Timebomb in real time: only the holder can pass, and it ends with the holder exploding", () => {
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
