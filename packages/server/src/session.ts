import {
  botBattleChoice,
  botMoveChoice,
  CHARACTERS,
  checkMoveChoice,
  createMatch,
  createRng,
  MAX_PLAYERS,
  MIN_PLAYERS,
  botMinigameScore,
  CLIENT_MINIGAMES,
  isClientMinigame,
  isPlausibleScore,
  MINIGAME_KINDS,
  pendingDecisions,
  REALTIME_GAMES,
  ROUND_GAMES,
  pick,
  privateEventOwner,
  randInt,
  rankScores,
  reactionGoDelay,
  resolvePhase,
  type BattleChoice,
  type ClientMinigameKind,
  type Decision,
  type GameResult,
  type MatchEvent,
  type MatchState,
  type MinigameKind,
  type MoveChoice,
  type PhaseInput,
  type PlayerId,
  type Rng,
  type ServerGame,
  type ServerMinigameKind,
} from "@pbg/rules";
import { MAX_NAME_LENGTH, type ClientAction, type RoomView, type Step } from "@pbg/protocol";

export interface Timing {
  moveMs: number;
  battleMs: number;
  /** Time to read the instructions before every browser starts the minigame together. */
  countdownMs: number;
  /** How long after a minigame ends results may still arrive. */
  graceMs: number;
  revealMs: number;
  /** Shortest pause on a minigame's final results before the board comes back. */
  minigameEndMs: number;
}

export const DEFAULT_TIMING: Timing = {
  moveMs: 45_000,
  battleMs: 20_000,
  countdownMs: 4_000,
  graceMs: 2_000,
  revealMs: 3_000,
  minigameEndMs: 3_000,
};

/** Allowance for clock-sync error when checking a result didn't arrive impossibly early. */
const RESULT_TIMING_SLACK_MS = 1_000;

/** Rounds a disconnected player can miss before a bot takes over their seat. */
export const AWAY_ROUNDS_BEFORE_BOT = 2;
const EVENTS_IN_VIEW = 150;

export interface SessionDeps {
  code: string;
  seed: number;
  timing?: Timing;
  /** Minigames in the rotation, picked with equal odds. Defaults to all of them. */
  minigames?: readonly MinigameKind[];
  now: () => number;
  /** Returns a function that cancels the timer. */
  schedule: (ms: number, fn: () => void) => () => void;
  onChange: () => void;
}

interface Seat {
  seatId: PlayerId;
  name: string;
  character: string;
  kind: "human" | "bot";
  sessionId: string | null;
  connected: boolean;
  botControlled: boolean;
  awayRounds: number;
}

type Choice = MoveChoice | BattleChoice;

interface ServerMinigame {
  game: ServerMinigameKind;
  def: ServerGame;
  state: unknown;
  rng: Rng;
  round: number;
  deciders: PlayerId[];
  choices: Map<PlayerId, unknown>;
}

export class SessionError extends Error {}

export class GameSession {
  readonly code: string;
  stage: "lobby" | "playing" | "finished" = "lobby";
  private seats: Seat[] = [];
  private nextSeatNumber = 1;
  private match: MatchState | null = null;
  private log: MatchEvent[] = [];
  private step: Step | null = null;
  private choices = new Map<PlayerId, Choice>();
  private ready = new Set<PlayerId>();
  private minigameScores = new Map<PlayerId, number | null>();
  private serverGame: ServerMinigame | null = null;
  private cancelTimer: (() => void) | null = null;
  private botRng: Rng;
  private seed: number;
  private readonly timing: Timing;

  constructor(private readonly deps: SessionDeps) {
    this.code = deps.code;
    this.seed = deps.seed;
    this.timing = deps.timing ?? DEFAULT_TIMING;
    this.botRng = createRng(deps.seed ^ 0x9e3779b9);
  }

  // ---- Seats -------------------------------------------------------------

  addHuman(sessionId: string, rawName: string): PlayerId {
    if (this.stage !== "lobby") throw new SessionError("This match has already started");
    if (this.seats.length >= MAX_PLAYERS) {
      const bot = [...this.seats].reverse().find((s) => s.kind === "bot");
      if (!bot) throw new SessionError("This room is full");
      this.seats = this.seats.filter((s) => s !== bot);
    }
    const name = rawName.trim().slice(0, MAX_NAME_LENGTH) || "Player";
    const seat = this.newSeat("human", name);
    seat.sessionId = sessionId;
    seat.connected = true;
    this.changed();
    return seat.seatId;
  }

  /** The player left for good (or their reconnection window ran out). */
  removeHuman(sessionId: string): void {
    const seat = this.seatBySession(sessionId);
    if (!seat) return;
    if (this.stage === "lobby") {
      this.seats = this.seats.filter((s) => s !== seat);
    } else {
      seat.sessionId = null;
      seat.connected = false;
      seat.botControlled = true;
      this.submitForBotIfDeciding(seat);
    }
    this.changed();
  }

  drop(sessionId: string): void {
    const seat = this.seatBySession(sessionId);
    if (!seat) return;
    seat.connected = false;
    this.resolveIfEveryoneReady();
    this.changed();
  }

  reconnect(sessionId: string): void {
    const seat = this.seatBySession(sessionId);
    if (!seat) return;
    seat.connected = true;
    seat.awayRounds = 0;
    seat.botControlled = false;
    this.changed();
  }

  hasConnectedHumans(): boolean {
    return this.seats.some((s) => s.kind === "human" && s.connected);
  }

  private newSeat(kind: Seat["kind"], name: string | null): Seat {
    const character = this.freeCharacters()[0] ?? CHARACTERS[0]!;
    const seat: Seat = {
      seatId: `s${this.nextSeatNumber++}`,
      name: name ?? character,
      character,
      kind,
      sessionId: null,
      connected: kind === "bot",
      botControlled: false,
      awayRounds: 0,
    };
    this.seats.push(seat);
    return seat;
  }

  private freeCharacters(): string[] {
    const taken = new Set(this.seats.map((s) => s.character));
    return CHARACTERS.filter((name) => !taken.has(name));
  }

  private host(): Seat | undefined {
    return this.seats.find((s) => s.kind === "human" && s.connected);
  }

  private seatBySession(sessionId: string): Seat | undefined {
    return this.seats.find((s) => s.sessionId === sessionId);
  }

  private seatById(seatId: PlayerId): Seat {
    const seat = this.seats.find((s) => s.seatId === seatId);
    if (!seat) throw new SessionError(`Unknown seat "${seatId}"`);
    return seat;
  }

  private playsAsBot(seat: Seat): boolean {
    return seat.kind === "bot" || seat.botControlled;
  }

  // ---- Actions -----------------------------------------------------------

  handle(sessionId: string, action: ClientAction): void {
    const seat = this.seatBySession(sessionId);
    if (!seat) throw new SessionError("You don't have a seat in this room");
    const isHost = this.host() === seat;

    switch (action.type) {
      case "pickCharacter":
        this.requireStage("lobby");
        if (!CHARACTERS.includes(action.character)) throw new SessionError("Unknown character");
        if (this.seats.some((s) => s !== seat && s.character === action.character)) {
          throw new SessionError("That character is taken");
        }
        seat.character = action.character;
        break;
      case "addBot":
        this.requireStage("lobby");
        this.requireHost(isHost);
        if (this.seats.length >= MAX_PLAYERS) throw new SessionError("The room is full");
        this.newSeat("bot", null);
        break;
      case "removeBot": {
        this.requireStage("lobby");
        this.requireHost(isHost);
        const bot = this.seatById(action.seatId);
        if (bot.kind !== "bot") throw new SessionError("Only bots can be removed");
        this.seats = this.seats.filter((s) => s !== bot);
        break;
      }
      case "start":
        this.requireStage("lobby");
        this.requireHost(isHost);
        this.startMatch();
        break;
      case "submitMove":
      case "submitBattle":
        this.submit(seat, action.type === "submitMove" ? "move" : "battle", action.choice);
        return;
      case "submitMinigame":
        this.submitMinigame(seat, action.score);
        return;
      case "minigameMove":
        this.minigameMove(seat, action.move);
        return;
      case "playAgain":
        this.requireStage("finished");
        this.requireHost(isHost);
        this.backToLobby();
        break;
    }
    this.changed();
  }

  private requireStage(stage: GameSession["stage"]): void {
    if (this.stage !== stage) throw new SessionError(`You can only do that in the ${stage}`);
  }

  private requireHost(isHost: boolean): void {
    if (!isHost) throw new SessionError("Only the host can do that");
  }

  // ---- Match flow --------------------------------------------------------

  private startMatch(): void {
    if (this.seats.length < MIN_PLAYERS) throw new SessionError(`You need at least ${MIN_PLAYERS} players`);
    this.match = createMatch({
      players: this.seats.map((s) => ({ id: s.seatId, name: s.name, isBot: s.kind === "bot" })),
      seed: this.seed,
    });
    this.log = [];
    this.stage = "playing";
    this.startPhase();
  }

  private backToLobby(): void {
    this.clearTimer();
    this.stage = "lobby";
    this.match = null;
    this.step = null;
    this.serverGame = null;
    this.log = [];
    this.seed = (this.seed + 1) >>> 0;
    this.seats = this.seats.filter((s) => s.kind === "bot" || s.sessionId !== null);
    for (const seat of this.seats) {
      seat.botControlled = false;
      seat.awayRounds = 0;
    }
  }

  private startPhase(): void {
    const match = this.match!;
    this.clearTimer();
    this.choices.clear();
    this.ready.clear();

    if (match.phase.kind === "gameOver") {
      this.stage = "finished";
      this.step = { kind: "finished" };
      return;
    }
    if (match.phase.kind === "minigame") {
      this.startMinigame();
      return;
    }

    for (const decision of pendingDecisions(match)) {
      const seat = this.seatById(decision.playerId);
      if (this.playsAsBot(seat)) this.submitBotChoice(decision);
    }
    const ms = match.phase.kind === "move" ? this.timing.moveMs : this.timing.battleMs;
    this.step = { kind: "deciding", deadline: this.deps.now() + ms };
    this.setTimer(ms, () => this.resolveDecisions());
    this.resolveIfEveryoneReady();
  }

  private startMinigame(): void {
    const game = pick(this.botRng, this.deps.minigames ?? MINIGAME_KINDS);
    if (isClientMinigame(game)) this.startClientMinigame(game);
    else this.startServerMinigame(game);
  }

  private startClientMinigame(game: ClientMinigameKind): void {
    const now = this.deps.now();
    const startAt = now + this.timing.countdownMs;
    const endAt = startAt + CLIENT_MINIGAMES[game].durationMs;
    const until = endAt + this.timing.graceMs;
    this.step = {
      kind: "minigame",
      mode: "client",
      game,
      seed: randInt(this.botRng, 1, 2 ** 31 - 1),
      startAt,
      endAt,
      until,
    };
    this.minigameScores.clear();
    for (const seat of this.seats) {
      if (this.playsAsBot(seat)) this.minigameScores.set(seat.seatId, botMinigameScore(game, this.botRng));
    }
    this.setTimer(until - now, () => this.resolveMinigame());
  }

  // ---- Server-run minigames ----------------------------------------------

  private startServerMinigame(game: ServerMinigameKind): void {
    const def: ServerGame = game in ROUND_GAMES ? ROUND_GAMES[game as keyof typeof ROUND_GAMES] : REALTIME_GAMES[game as keyof typeof REALTIME_GAMES];
    const rng = createRng(randInt(this.botRng, 1, 2 ** 31 - 1));
    const players = this.seats.map((s) => s.seatId);
    const bots = this.seats.filter((s) => this.playsAsBot(s)).map((s) => s.seatId);
    const now = this.deps.now();
    const startAt = now + this.timing.countdownMs;
    const state = def.mode === "round" ? def.setup({ players, bots, rng }) : def.setup({ players, bots, rng }, startAt);
    this.serverGame = { game, def, state, rng, round: 0, deciders: [], choices: new Map() };
    this.setServerStep("countdown", startAt);
    this.setTimer(startAt - now, () => {
      if (def.mode === "round") this.startGameRound();
      else this.runRealtime();
      this.changed();
    });
  }

  private setServerStep(stage: "countdown" | "choosing" | "reveal" | "live", until: number | null): void {
    const g = this.serverGame!;
    this.step = { kind: "minigame", mode: "server", game: g.game, stage, round: g.round, until };
  }

  private startGameRound(): void {
    const g = this.serverGame!;
    if (g.def.mode !== "round") return;
    const def = g.def;
    if (def.done(g.state)) {
      this.finishServerMinigame(def.result(g.state));
      return;
    }
    g.round++;
    g.choices.clear();
    g.deciders = def.deciders(g.state);
    for (const id of g.deciders) {
      if (this.playsAsBot(this.seatById(id))) g.choices.set(id, def.bot(g.state, id, g.rng));
    }
    const ms = def.roundMs(g.state);
    this.setServerStep("choosing", this.deps.now() + ms);
    this.setTimer(ms, () => this.resolveGameRound());
    this.resolveIfEveryoneReady();
  }

  private resolveGameRound(): void {
    const g = this.serverGame;
    if (!g || g.def.mode !== "round" || this.step?.kind !== "minigame" || this.step.mode !== "server") return;
    if (this.step.stage !== "choosing") return;
    const def = g.def;
    for (const id of g.deciders) {
      if (!g.choices.has(id)) g.choices.set(id, def.fallback(g.state, id, g.rng));
    }
    def.resolve(g.state, Object.fromEntries(g.choices), g.rng);
    const revealMs = def.done(g.state) ? Math.max(def.revealMs, this.timing.minigameEndMs) : def.revealMs;
    this.setServerStep("reveal", this.deps.now() + revealMs);
    this.setTimer(revealMs, () => {
      this.startGameRound();
      this.changed();
    });
    this.changed();
  }

  /** Catches the game up to now, then waits for its next timed event. */
  private runRealtime(): void {
    const g = this.serverGame!;
    if (g.def.mode !== "realtime") return;
    const def = g.def;
    const now = this.deps.now();
    def.advance(g.state, now, g.rng);
    if (def.done(g.state)) {
      this.setServerStep("reveal", now + this.timing.minigameEndMs);
      this.setTimer(this.timing.minigameEndMs, () => this.finishServerMinigame(def.result(g.state)));
      return;
    }
    this.setServerStep("live", null);
    const next = def.nextEventAt(g.state);
    if (next !== null) {
      this.setTimer(Math.max(0, next - now), () => {
        this.runRealtime();
        this.changed();
      });
    }
  }

  private minigameMove(seat: Seat, move: unknown): void {
    const g = this.serverGame;
    const step = this.step;
    if (this.stage !== "playing" || !g || step?.kind !== "minigame" || step.mode !== "server") {
      throw new SessionError("No minigame is running");
    }
    if (g.def.mode === "realtime") {
      if (step.stage !== "live") return;
      g.def.advance(g.state, this.deps.now(), g.rng);
      if (g.def.input(g.state, seat.seatId, move, this.deps.now(), g.rng)) {
        this.runRealtime();
        this.changed();
      }
      return;
    }
    if (step.stage !== "choosing") throw new SessionError("Wait for the next round");
    if (!g.deciders.includes(seat.seatId)) throw new SessionError("You don't pick this round");
    if (g.choices.has(seat.seatId)) throw new SessionError("You already picked this round");
    const choice = g.def.parse(g.state, seat.seatId, move);
    if (choice === undefined) throw new SessionError("That isn't a valid pick");
    g.choices.set(seat.seatId, choice);
    this.changed();
    this.resolveIfEveryoneReady();
  }

  private finishServerMinigame(result: GameResult): void {
    const g = this.serverGame!;
    this.serverGame = null;
    this.resolve({
      kind: "minigame",
      ranking: result.ranking,
      played: { game: g.game, scores: result.scores, labels: result.labels },
    });
  }

  /** Light checks for a prototype: implausible scores, or results sent before the game could be over, count as none. */
  private submitMinigame(seat: Seat, score: number | null): void {
    const step = this.step;
    if (this.stage !== "playing" || step?.kind !== "minigame" || step.mode !== "client") {
      throw new SessionError("No minigame is running");
    }
    if (this.minigameScores.has(seat.seatId)) throw new SessionError("You already sent your result");

    let accepted: number | null = null;
    if (typeof score === "number" && isPlausibleScore(step.game, score)) {
      const playedFor = step.game === "reaction" ? reactionGoDelay(step.seed) + score : CLIENT_MINIGAMES[step.game].durationMs;
      if (this.deps.now() >= step.startAt + playedFor - RESULT_TIMING_SLACK_MS) accepted = Math.round(score);
    }
    this.minigameScores.set(seat.seatId, accepted);
    this.changed();
    this.resolveIfEveryoneReady();
  }

  private resolveMinigame(): void {
    const step = this.step;
    if (step?.kind !== "minigame" || step.mode !== "client") return;
    const scores = Object.fromEntries(this.seats.map((s) => [s.seatId, this.minigameScores.get(s.seatId) ?? null]));
    this.resolve({ kind: "minigame", ranking: rankScores(step.game, scores), played: { game: step.game, scores } });
  }

  private submit(seat: Seat, kind: "move" | "battle", choice: Choice): void {
    const match = this.match;
    if (this.stage !== "playing" || !match || this.step?.kind !== "deciding") {
      throw new SessionError("Nothing to decide right now");
    }
    const decision = pendingDecisions(match).find((d) => d.playerId === seat.seatId);
    if (!decision) throw new SessionError("You don't have a decision this phase");
    if ((decision.kind === "move") !== (kind === "move")) throw new SessionError("Wrong kind of decision");
    if (choice.die !== null && !decision.dice.some((d) => d.id === choice.die)) {
      throw new SessionError("You don't have that die");
    }
    if (kind === "move") {
      const move = choice as MoveChoice;
      if (!Number.isInteger(move.lane) || move.lane < 0 || move.lane >= match.board.paths) {
        throw new SessionError("Unknown path");
      }
      const problem = checkMoveChoice(match, seat.seatId, move);
      if (problem) throw new SessionError(problem);
    }

    this.choices.set(seat.seatId, choice);
    this.ready.add(seat.seatId);
    this.changed();
    this.resolveIfEveryoneReady();
  }

  private submitBotChoice(decision: Decision): void {
    const match = this.match!;
    const choice =
      decision.kind === "move"
        ? botMoveChoice(match, decision.playerId, this.botRng)
        : botBattleChoice(match, decision.playerId);
    this.choices.set(decision.playerId, choice);
    this.ready.add(decision.playerId);
  }

  private submitForBotIfDeciding(seat: Seat): void {
    if (this.stage !== "playing") return;
    const step = this.step;
    if (step?.kind === "minigame") {
      const g = this.serverGame;
      if (step.mode === "client") {
        if (!this.minigameScores.has(seat.seatId)) {
          this.minigameScores.set(seat.seatId, botMinigameScore(step.game, this.botRng));
        }
      } else if (
        g?.def.mode === "round" &&
        step.stage === "choosing" &&
        g.deciders.includes(seat.seatId) &&
        !g.choices.has(seat.seatId)
      ) {
        g.choices.set(seat.seatId, g.def.bot(g.state, seat.seatId, g.rng));
      }
      this.resolveIfEveryoneReady();
      return;
    }
    if (this.step?.kind !== "deciding" || this.ready.has(seat.seatId)) return;
    const decision = pendingDecisions(this.match!).find((d) => d.playerId === seat.seatId);
    if (decision) this.submitBotChoice(decision);
    this.resolveIfEveryoneReady();
  }

  /** Disconnected players don't hold up a phase; they get the timeout defaults. */
  private isWaitingOn(seatId: PlayerId): boolean {
    return this.isActiveHuman(seatId) && !this.ready.has(seatId);
  }

  private isActiveHuman(seatId: PlayerId): boolean {
    const seat = this.seatById(seatId);
    return !this.playsAsBot(seat) && seat.connected;
  }

  private resolveIfEveryoneReady(): void {
    if (this.stage !== "playing") return;
    const step = this.step;
    if (step?.kind === "minigame" && step.mode === "client") {
      const waiting = this.seats.some(
        (s) => !this.playsAsBot(s) && s.connected && !this.minigameScores.has(s.seatId),
      );
      if (!waiting) this.resolveMinigame();
      return;
    }
    if (step?.kind === "minigame") {
      const g = this.serverGame;
      if (step.stage !== "choosing" || !g) return;
      if (!g.deciders.some((id) => !g.choices.has(id) && this.isActiveHuman(id))) this.resolveGameRound();
      return;
    }
    if (this.step?.kind !== "deciding") return;
    const waiting = pendingDecisions(this.match!).some((d) => this.isWaitingOn(d.playerId));
    if (!waiting) this.resolveDecisions();
  }

  private resolveDecisions(): void {
    const match = this.match!;
    const choices = Object.fromEntries(this.choices);
    const kind = match.phase.kind;
    if (kind === "move") this.resolve({ kind, choices: choices as Record<PlayerId, MoveChoice> });
    else if (kind === "boss" || kind === "showdown") this.resolve({ kind, choices: choices as Record<PlayerId, BattleChoice> });
  }

  private resolve(input: PhaseInput): void {
    this.clearTimer();
    const result = resolvePhase(this.match!, input);
    this.match = result.state;
    this.log.push(...result.events);
    if (input.kind === "minigame") this.countAwayRound();

    if (this.match.phase.kind === "gameOver") {
      this.startPhase();
    } else {
      this.step = { kind: "revealing", until: this.deps.now() + this.timing.revealMs };
      this.setTimer(this.timing.revealMs, () => {
        this.startPhase();
        this.changed();
      });
    }
    this.changed();
  }

  private countAwayRound(): void {
    for (const seat of this.seats) {
      if (seat.kind !== "human" || seat.connected || seat.botControlled) continue;
      seat.awayRounds++;
      if (seat.awayRounds >= AWAY_ROUNDS_BEFORE_BOT) seat.botControlled = true;
    }
  }

  private setTimer(ms: number, fn: () => void): void {
    this.clearTimer();
    this.cancelTimer = this.deps.schedule(ms, fn);
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  dispose(): void {
    this.clearTimer();
  }

  private changed(): void {
    this.deps.onChange();
  }

  // ---- Views -------------------------------------------------------------

  viewFor(sessionId: string): RoomView {
    const you = this.seatBySession(sessionId) ?? null;
    const host = this.host();
    return {
      code: this.code,
      stage: this.stage,
      serverNow: this.deps.now(),
      seats: this.seats.map((s) => ({
        seatId: s.seatId,
        name: s.name,
        character: s.character,
        kind: s.kind,
        connected: s.connected,
        botControlled: s.botControlled,
        isHost: s === host,
      })),
      youSeatId: you?.seatId ?? null,
      takenCharacters: this.seats.map((s) => s.character),
      match: this.match && this.step ? this.matchView(this.match, this.step, you) : null,
    };
  }

  private matchView(match: MatchState, step: Step, you: Seat | null): NonNullable<RoomView["match"]> {
    const decisions = step.kind === "deciding" ? pendingDecisions(match) : [];
    const deciding = new Set(decisions.map((d) => d.playerId));
    const inClientMinigame = step.kind === "minigame" && step.mode === "client";
    const g = this.serverGame;
    const picking = g && step.kind === "minigame" && step.mode === "server" && step.stage === "choosing" ? g.deciders : [];
    const player = you ? match.players.find((p) => p.id === you.seatId) : undefined;
    const minigameDone = (id: PlayerId) => (inClientMinigame ? this.minigameScores.has(id) : !!g?.choices.has(id));

    return {
      board: match.board,
      round: match.round,
      phase: match.phase,
      step,
      bossFixed: match.bossFixed,
      players: match.players.map((p) => ({
        seatId: p.id,
        position: p.position,
        coins: p.coins,
        defaultDie: p.defaultDie,
        deciding: inClientMinigame || picking.includes(p.id) || deciding.has(p.id),
        ready: step.kind === "minigame" ? minigameDone(p.id) : this.ready.has(p.id),
      })),
      minigame: g
        ? {
            view: g.def.view(g.state, you?.seatId ?? null),
            deciders: picking,
            submitted: (you && g.choices.get(you.seatId)) ?? null,
          }
        : null,
      events: this.log
        .filter((e) => {
          const owner = privateEventOwner(e);
          return owner === null || owner === you?.seatId;
        })
        .slice(-EVENTS_IN_VIEW),
      you: player
        ? {
            dice: player.dice,
            items: player.items,
            traps: match.traps.filter((t) => t.ownerId === player.id).map((t) => t.spaceId),
            decision: decisions.find((d) => d.playerId === player.id) ?? null,
            submitted: this.choices.get(player.id) ?? null,
            minigameSubmitted: step.kind === "minigame" && minigameDone(player.id),
          }
        : null,
    };
  }
}
