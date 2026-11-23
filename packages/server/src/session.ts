import {
  botBattleChoice,
  botBattleInitiationChoice,
  botItemChoice,
  botMoveChoice,
  BOUGHT_ITEM,
  CHARACTERS,
  checkItemChoice,
  checkMoveChoice,
  createMatch,
  boardConfigForSize,
  createRng,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SPECIAL_ITEM_KINDS,
  awardAuctionItem,
  botMinigameScore,
  CLIENT_MINIGAMES,
  isClientMinigame,
  isPlausibleScore,
  MINIGAME_KINDS,
  minigamePrizes,
  pendingDecisions,
  purchaseShopItem,
  REALTIME_GAMES,
  ROUND_GAMES,
  pick,
  privateEventOwner,
  randInt,
  rankScores,
  reactionGoDelay,
  stopwatchTarget,
  refreshShop,
  resolvePhase,
  type BattleChoice,
  type BoardSize,
  type BattleInitiationChoice,
  type ClientMinigameKind,
  type Decision,
  type GameResult,
  type ItemChoice,
  type ItemKind,
  type MatchEvent,
  type MatchState,
  type MinigameKind,
  type MoveChoice,
  type PhaseInput,
  type PhaseResult,
  type PlayerId,
  type Rng,
  type ServerGame,
  type ServerMinigameKind,
} from "@pbg/rules";
import {
  MAX_NAME_LENGTH,
  type AuctionView,
  type BossTestOptions,
  type ClientAction,
  type EndGameStats,
  type RoomView,
  type Step,
} from "@pbg/protocol";

export interface Timing {
  /** Item use and shop choices. */
  itemMs: number;
  /** How long the item-use reveal stays up. */
  itemRevealMs: number;
  /** Die and path choices. */
  moveMs: number;
  battleMs: number;
  /** Time to read the instructions before every browser starts the minigame together. */
  countdownMs: number;
  /** How long after a minigame ends results may still arrive. */
  graceMs: number;
  /** Pause on the board after the movement animation, before the next phase. */
  revealMs: number;
  /** How long one animated space takes. */
  spaceMs: number;
  /** Shortest pause on a minigame's final results before the board comes back. */
  minigameEndMs: number;
  /** The placements and prizes screen after every minigame. */
  resultsMs: number;
}

export const DEFAULT_TIMING: Timing = {
  itemMs: 60_000,
  itemRevealMs: 10_000,
  moveMs: 20_000,
  battleMs: 15_000,
  countdownMs: 4_000,
  graceMs: 2_000,
  revealMs: 5_000,
  spaceMs: 220,
  minigameEndMs: 3_000,
  resultsMs: 10_000,
};
const READY_MINIGAME_DELAY_MS = 5_000;

/** Allowance for clock-sync error when checking a result didn't arrive impossibly early. */
const RESULT_TIMING_SLACK_MS = 1_000;

/** Rounds a disconnected player can miss before a bot takes over their seat. */
export const AWAY_ROUNDS_BEFORE_BOT = 2;
const EVENTS_IN_VIEW = 150;
export const BOT_BOSS_CHOICE_MS = 1_000;
export const BOSS_ROLL_DELAY_MS = 2_000;
export const BOSS_OUTCOME_MS = 3_000;
export const SHOWDOWN_ROLL_GAP_MS = 2_000;
export const SHOWDOWN_OUTCOME_MS = 3_000;
export const MOVE_ROLL_SUMMARY_MS = 5_000;
export const CHAOS_INITIATOR_MS = 2_000;
export const CHAOS_TARGET_SPIN_MS = 2_000;
export const CHAOS_EFFECT_SPIN_MS = 3_000;
export const RAINBOW_INTRO_MS = 2_000;
export const RAINBOW_EFFECT_SPIN_MS = 5_000;
export const CHAOS_SPAWN_ANNOUNCEMENT_MS = 5_000;
export const CHAOS_MINIGAME_BUFFER_MS = 5_000;
export const TRAP_REVEAL_MS = 5_000;
export const DEATH_REVEAL_MS = 3_000;
export const COLLISION_BUFFER_MS = 2_000;
export const AUCTION_INITIAL_MS = 20_000;
export const AUCTION_RESET_MS = 10_000;
export const AUCTION_ANNOUNCEMENT_MS = 3_000;

export interface SessionDeps {
  code: string;
  seed: number;
  /** Replace every traversable board tile with Chaos for local playtesting. */
  chaosBoardTest?: boolean;
  /** Local auction playtest: randomize each player's starting wallet between 1 and 50 coins. */
  auctionTestCoins?: boolean;
  /** Local-only playtest: pre-seed every board space with a different player's trap. */
  trapBoardTest?: boolean;
  timing?: Timing;
  /** Minigames in the rotation, picked with equal odds. Defaults to all of them. */
  minigames?: readonly MinigameKind[];
  /** Only supplied by the separate, explicitly enabled boss-test room. Never accepted from match actions. */
  bossTest?: Pick<BossTestOptions, "mode" | "contenders" | "challenger" | "bossFixed" | "defaultDie">;
  /** Starts one chosen minigame directly in the isolated minigame-test room. */
  minigameTest?: { game: MinigameKind };
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

type Choice = ItemChoice | MoveChoice | BattleChoice | BattleInitiationChoice;

interface LiveAuction {
  item: ItemKind;
  round: number;
  startedAt: number;
  firstBotBidAt: number;
  hasBotBid: boolean;
  previousHighBidders: Set<PlayerId>;
  deadline: number;
  participants: Set<PlayerId>;
  currentBid: number;
  bidderId: PlayerId | null;
  status: "open" | "closed";
  winnerId: PlayerId | null;
  winningBid: number | null;
}

interface ServerMinigame {
  game: ServerMinigameKind;
  def: ServerGame;
  state: unknown;
  rng: Rng;
  round: number;
  deciders: PlayerId[];
  choices: Map<PlayerId, unknown>;
  pendingBotAnswers: Map<PlayerId, { choice: unknown; cancel: () => void }>;
  choosingStartedAt: number;
}

export class SessionError extends Error {}

export class GameSession {
  readonly code: string;
  stage: "lobby" | "playing" | "finished" = "lobby";
  private seats: Seat[] = [];
  private nextSeatNumber = 1;
  private match: MatchState | null = null;
  private log: MatchEvent[] = [];
  private boardProgress: EndGameStats["progress"] = [];
  private boardFirsts: Record<PlayerId, number> = {};
  private step: Step | null = null;
  private choices = new Map<PlayerId, Choice>();
  private ready = new Set<PlayerId>();
  private minigameScores = new Map<PlayerId, number | null>();
  private minigameStopTimes = new Map<PlayerId, number>();
  private serverGame: ServerMinigame | null = null;
  private pendingBoss: PhaseResult | null = null;
  private pendingShowdown: PhaseResult | null = null;
  private pendingMoveEvents: MatchEvent[] | null = null;
  private pendingChaosSpawn: Extract<MatchEvent, { type: "chaosSpacePlaced" }> | null = null;
  private pendingRainbowChaosDeaths: Extract<MatchEvent, { type: "playerDied" }>[] = [];
  private auction: LiveAuction | null = null;
  private auctionLock = new Map<PlayerId, "shop" | "bid">();
  /** Bots that commit to joining this auction before making their shop decision. */
  private auctionPriority = new Set<PlayerId>();
  private cancelAuctionTimer: (() => void) | null = null;
  private auctionBotTimers: (() => void)[] = [];
  private auctionJoinTimers: (() => void)[] = [];
  private battleBotChoiceAt = 0;
  private cancelTimer: (() => void) | null = null;
  private botRng: Rng;
  private auctionRng: Rng;
  private seed: number;
  private readonly timing: Timing;
  private waitForMinigameReady = false;
  private recentMinigames: MinigameKind[] = [];
  private pendingMinigame: MinigameKind | null = null;

  constructor(private readonly deps: SessionDeps) {
    this.code = deps.code;
    this.seed = deps.seed;
    this.timing = {
      ...DEFAULT_TIMING,
      ...deps.timing,
      ...(deps.trapBoardTest ? { itemMs: 10 * 60_000, moveMs: 10 * 60_000, battleMs: 10 * 60_000 } : {}),
    };
    this.botRng = createRng(deps.seed ^ 0x9e3779b9);
    this.auctionRng = createRng(deps.seed ^ 0x85ebca6b);
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
      if (this.auction?.status === "open") {
        if (this.auction.bidderId !== seat.seatId) this.auction.participants.delete(seat.seatId);
        this.scheduleBotJoin(seat);
      }
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
    const free = this.freeCharacters();
    const character = (kind === "bot" && free.length > 0 ? pick(this.botRng, free) : free[0]) ?? CHARACTERS[0]!;
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
        this.waitForMinigameReady = action.waitForMinigameReady === true;
        this.startMatch(action.boardSize ?? "short");
        break;
      case "submitItems":
        this.submit(seat, "items", action.choice);
        return;
      case "buyShopItem":
        this.buyShopItem(seat, action.kind, action.use ?? null);
        return;
      case "joinAuction":
        this.joinAuction(seat);
        return;
      case "leaveAuction":
        this.leaveAuction(seat);
        return;
      case "auctionBid":
        this.auctionBid(seat, action.amount);
        return;
      case "submitMove":
        this.submit(seat, "move", action.choice);
        return;
      case "submitBattleInitiation":
        this.submit(seat, "battleInitiation", action.choice);
        return;
      case "submitBattle":
        this.submit(seat, "battle", action.choice);
        return;
      case "submitMinigame":
        this.submitMinigame(seat, action.score);
        return;
      case "minigameMove":
        this.minigameMove(seat, action.move);
        return;
      case "ready":
        if (this.step?.kind === "minigame" && this.step.stage === "ready") {
          if (!this.waitForMinigameReady) throw new SessionError("Minigame readiness is disabled");
          if (!this.isActiveHuman(seat.seatId)) return;
          this.ready.add(seat.seatId);
          this.changed();
          this.resolveIfEveryoneReady();
          return;
        }
        if (this.step?.kind !== "results") throw new SessionError("There's nothing to dismiss");
        if (this.deps.minigameTest) {
          this.match!.phase = { kind: "minigame" };
          this.startPhase();
          break;
        }
        this.ready.add(seat.seatId);
        this.changed();
        this.resolveIfEveryoneReady();
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

  private startMatch(boardSize: BoardSize = "short"): void {
    this.pendingMoveEvents = null;
    if (this.seats.length < (this.deps.minigameTest ? 1 : MIN_PLAYERS)) {
      throw new SessionError(`You need at least ${this.deps.minigameTest ? 1 : MIN_PLAYERS} players`);
    }
    const players = this.seats.map((s) => ({ id: s.seatId, name: s.name, isBot: s.kind === "bot" }));
    // The board race normally requires four players, but the isolated minigame runner can use fewer.
    const boardPlayers = [...players];
    while (this.deps.minigameTest && boardPlayers.length < MIN_PLAYERS) {
      const index = boardPlayers.length;
      boardPlayers.push({ id: `test-standin-${index}`, name: "Test stand-in", isBot: true });
    }
    this.match = createMatch({
      players: boardPlayers,
      seed: this.seed,
      board: boardConfigForSize(boardSize),
    });
    if (this.deps.minigameTest) {
      const seatIds = new Set(players.map((player) => player.id));
      this.match.players = this.match.players.filter((player) => seatIds.has(player.id));
      this.match.phase = { kind: "minigame" };
    }
    if (this.deps.auctionTestCoins) {
      for (const player of this.match.players) {
        player.coins = randInt(this.match.rng, 1, 50);
      }
      this.match.round = 3;
      this.match.phase = { kind: "items" };
      refreshShop(this.match);
    }
    if (this.deps.chaosBoardTest) {
      for (const space of this.match.board.spaces) {
        if (space.lane !== null) {
          space.type = "monochromeChaos";
        }
      }
    }
    if (this.deps.trapBoardTest) {
      const kinds = ["sandTrap", "itemTrap", "deathTrap"] as const;
      for (const space of this.match.board.spaces) {
        const owner = this.match.players[(space.id + 1) % this.match.players.length]!;
        this.match.traps.push({
          spaceId: space.id,
          ownerId: owner.id,
          kind: kinds[space.id % kinds.length]!,
        });
      }
      for (const [index, player] of this.match.players.entries()) {
        player.items.push({
          id: `trap-test-${player.id}`,
          kind: index === 0 ? "ghostFeet" : "booster",
        });
      }
    }
    if (this.deps.bossTest) {
      const { challenger, bossFixed, defaultDie } = this.deps.bossTest;
      const indexes = challenger === "you" ? [0] : challenger === "bot" ? [1] : [0, 1];
      const showdown = this.deps.bossTest.mode === "showdown";
      const challengers = showdown
        ? this.match.players.slice(0, this.deps.bossTest.contenders ?? 4).map((p) => p.id)
        : indexes.map((index) => this.match!.players[index]!.id);
      this.match.phase = showdown ? { kind: "showdown", contenders: challengers } : { kind: "boss", challengers };
      this.match.bossFixed = bossFixed;
      this.match.rng = createRng(this.seed);
      for (const player of this.match.players) {
        player.defaultDie = defaultDie;
        player.dice = ([8, 10, 12] as const).map((sides) => ({ id: `test-${player.id}-d${sides}`, sides }));
        if (challengers.includes(player.id)) player.position = this.match.board.finish;
      }
    }
    this.log = this.deps.bossTest ? [{ type: "roundStarted", round: this.match.round }] : [];
    this.boardProgress = [];
    this.boardFirsts = Object.fromEntries(this.match.players.map((player) => [player.id, 0]));
    this.stage = "playing";
    this.startPhase();
  }

  private backToLobby(): void {
    this.clearTimer();
    this.clearAuctionTimers();
    this.stage = "lobby";
    this.match = null;
    this.step = null;
    this.serverGame = null;
    this.ready.clear();
    this.recentMinigames = [];
    this.pendingMinigame = null;
    this.log = [];
    this.pendingMoveEvents = null;
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

    if (this.pendingChaosSpawn) {
      const event = this.pendingChaosSpawn;
      this.pendingChaosSpawn = null;
      this.step = {
        kind: "chaosSpawn",
        event,
        until: this.deps.now() + CHAOS_SPAWN_ANNOUNCEMENT_MS,
      };
      this.setTimer(CHAOS_SPAWN_ANNOUNCEMENT_MS, () => {
        this.startPhase();
        this.changed();
      });
      return;
    }

    if (match.phase.kind === "gameOver") {
      if (this.boardProgress.at(-1)?.label !== "Final") this.captureBoardProgress("Final", false);
      this.stage = "finished";
      this.step = { kind: "finished" };
      return;
    }
    if (match.phase.kind === "minigame") {
      this.startMinigame();
      return;
    }
    if (match.phase.kind === "boss") {
      this.startBattleChoices("bossBattle");
      return;
    }
    if (match.phase.kind === "showdown") {
      this.startBattleChoices("showdown");
      return;
    }
    if (match.phase.kind === "battle") {
      this.startBattleChoices("battle");
      return;
    }

    this.startDeciding();
  }

  private startBattleChoices(kind: "bossBattle" | "showdown" | "battle"): void {
    const match = this.match!;
    if (match.phase.kind !== "boss" && match.phase.kind !== "showdown" && match.phase.kind !== "battle") return;
    this.pendingBoss = null;
    this.pendingShowdown = null;
    this.battleBotChoiceAt = this.deps.now() + BOT_BOSS_CHOICE_MS;
    this.step = {
      kind: kind === "bossBattle" ? "bossBattle" : "showdown",
      stage: "choosing",
      ...(kind === "battle" ? { battle: true } : {}),
      contenders: match.phase.kind === "boss"
        ? match.phase.challengers
        : match.phase.kind === "showdown"
          ? match.phase.contenders
          : match.phase.groups[match.phase.groupIndex]?.contenders ?? [],
      selected: {},
      deadline: this.deps.now() + this.timing.battleMs,
    };
    // Even a bot-only encounter must be visible before any roll is revealed.
      this.setTimer(BOT_BOSS_CHOICE_MS, () => {
        this.resolveIfEveryoneReady();
        if ((this.step?.kind === "bossBattle" || this.step?.kind === "showdown") && this.step.stage === "choosing") {
          this.setTimer(Math.max(0, this.step.deadline - this.deps.now()), () => {
            this.selectDefaultBattleDice();
            this.resolveBattleChoices();
          });
        }
      this.changed();
    });
  }

  private selectDefaultBattleDice(): void {
    const step = this.step;
    if ((step?.kind !== "bossBattle" && step?.kind !== "showdown") || step.stage !== "choosing") return;
    for (const playerId of step.contenders) {
      if (this.ready.has(playerId)) continue;
      const decision = pendingDecisions(this.match!).find((candidate) => candidate.playerId === playerId);
      if (!decision || (decision.kind !== "boss" && decision.kind !== "showdown" && decision.kind !== "battle")) continue;
      const die = decision.dice.find((candidate) => candidate.id === null && candidate.sides === 6) ??
        decision.dice.find((candidate) => candidate.sides === 6) ??
        decision.dice.find((candidate) => candidate.id === null) ??
        decision.dice[0];
      if (!die) continue;
      const choice: BattleChoice = { die: die.id };
      this.choices.set(playerId, choice);
      this.ready.add(playerId);
      step.selected[playerId] = die.sides;
    }
  }

  private submitBattleChoice(seat: Seat, choice: BattleChoice): void {
    const step = this.step;
    if ((step?.kind !== "bossBattle" && step?.kind !== "showdown") || step.stage !== "choosing") throw new SessionError("Nothing to decide right now");
    const decision = pendingDecisions(this.match!).find((d) => d.playerId === seat.seatId);
    const expected = step.kind === "bossBattle" ? "boss" : step.battle ? "battle" : "showdown";
    if (!decision || (decision.kind !== "boss" && decision.kind !== "showdown" && decision.kind !== "battle") || decision.kind !== expected) {
      throw new SessionError("You aren't in this fight");
    }
    if (!choice || typeof choice !== "object") throw new SessionError("Pick a battle die");
    const die = decision.dice.find((d) => d.id === choice.die);
    if (!die) throw new SessionError("You don't have that die");
    this.choices.set(seat.seatId, choice);
    this.ready.add(seat.seatId);
    step.selected[seat.seatId] = die.sides;
    this.resolveIfEveryoneReady();
    this.changed();
  }

  private resolveBattleChoices(): void {
    if ((this.step?.kind !== "bossBattle" && this.step?.kind !== "showdown") || this.step.stage !== "choosing") return;
    this.clearTimer();
    const isBattle = this.step.kind === "showdown" && this.step.battle === true;
    const result = resolvePhase(this.match!, {
      kind: this.step.kind === "bossBattle" ? "boss" : isBattle ? "battle" : "showdown",
      choices: Object.fromEntries(this.choices) as Record<PlayerId, BattleChoice>,
    });
    if (this.step.kind === "bossBattle") {
      this.pendingBoss = result;
      this.presentBossAttempt(0, 0);
    } else {
      this.pendingShowdown = result;
      this.presentShowdownRoll(0, 0, {}, isBattle);
    }
    this.changed();
  }

  private presentBossAttempt(encounter: number, attempt: number): void {
    const fights = this.pendingBoss!.events.filter((e) => e.type === "bossFight");
    const fight = fights[encounter]!;
    const roll = fight.attempts[attempt]!;
    const visible = {
      kind: "bossBattle" as const,
      playerId: fight.playerId,
      sides: fight.sides,
      saved: fight.saved,
      playerRoll: roll.playerRoll,
      attempt: attempt + 1,
      encounter: encounter + 1,
      encounters: fights.length,
    };
    this.step = { ...visible, stage: "playerRoll", until: this.deps.now() + BOSS_ROLL_DELAY_MS };
    this.setTimer(BOSS_ROLL_DELAY_MS, () => {
      const knockback = this.pendingBoss!.events.find((e) => e.type === "knockedBack" && e.playerId === fight.playerId);
      const result = roll.playerRoll === roll.bossScore ? "tie" : roll.playerRoll > roll.bossScore ? "won" : "lost";
      this.step = {
        ...visible, stage: "outcome", until: this.deps.now() + BOSS_OUTCOME_MS,
        bossRoll: roll.bossRoll, bossFixed: fight.bossFixed, bossScore: roll.bossScore,
        result,
        knockback: result === "lost" && knockback?.type === "knockedBack" ? knockback.spaces : 0,
      };
      this.setTimer(BOSS_OUTCOME_MS, () => {
        if (attempt + 1 < fight.attempts.length) this.presentBossAttempt(encounter, attempt + 1);
        else if (encounter + 1 < fights.length) this.presentBossAttempt(encounter + 1, 0);
        else this.finishBossBattle();
        this.changed();
      });
      this.changed();
    });
  }

  private finishBossBattle(): void {
    const result = this.pendingBoss!;
    this.pendingBoss = null;
    this.match = result.state;
    this.log.push(...result.events);
    if (this.match.phase.kind === "gameOver" || this.match.phase.kind === "showdown") this.startPhase();
    else {
      const duration = this.revealDuration(result.events);
      this.step = { kind: "revealing", until: this.deps.now() + duration, events: result.events };
      if (!this.deps.bossTest) {
        this.setTimer(duration, () => {
          this.startPhase();
          this.changed();
        });
      }
    }
  }

  private presentShowdownRoll(
    roundIndex: number,
    rollIndex: number,
    previousOut: Record<PlayerId, number>,
    battle = false,
  ): void {
    const rounds = this.pendingShowdown!.events.filter((e) => e.type === "showdownRoll");
    const entries = Object.entries(rounds[roundIndex]!.rolls);
    const contenders = Object.keys(rounds[0]!.rolls);
    const dice = Object.fromEntries(Object.entries(rounds[0]!.rolls).map(([id, roll]) => [id, { sides: roll.sides, saved: roll.saved }]));
    const rolls = Object.fromEntries(entries.slice(0, rollIndex + 1).map(([id, roll]) => [id, roll.value]));
    const complete = rollIndex === entries.length - 1;
    const best = complete ? Math.max(...Object.values(rolls)) : null;
    const leaders = complete ? entries.filter(([, roll]) => roll.value === best).map(([id]) => id) : [];
    const eliminated = { ...previousOut };
    if (complete) for (const [id, roll] of entries) if (!leaders.includes(id)) eliminated[id] = roll.value;
    const duration = complete ? SHOWDOWN_OUTCOME_MS : SHOWDOWN_ROLL_GAP_MS;
    this.step = {
      kind: "showdown", stage: complete ? "outcome" : "rolling",
      ...(battle ? { battle: true } : {}),
      contenders, active: entries.map(([id]) => id), dice, rolls, eliminated,
      round: roundIndex + 1, currentPlayer: entries[rollIndex]![0], leaders,
      until: this.deps.now() + duration,
    };
    this.setTimer(duration, () => {
      if (!complete) this.presentShowdownRoll(roundIndex, rollIndex + 1, previousOut, battle);
      else if (roundIndex + 1 < rounds.length) this.presentShowdownRoll(roundIndex + 1, 0, eliminated, battle);
      else {
        const result = this.pendingShowdown!;
        this.pendingShowdown = null;
        this.match = result.state;
        this.log.push(...result.events);
        const battleDeaths = battle
          ? result.events.filter(
              (event): event is Extract<MatchEvent, { type: "playerDied" }> =>
                event.type === "playerDied",
            )
          : [];
        if (battleDeaths.length > 0) this.startBattleDeathSequence(battleDeaths);
        else this.startPhase();
      }
      this.changed();
    });
  }

  private startBattleDeathSequence(deaths: Extract<MatchEvent, { type: "playerDied" }>[]): void {
    this.step = { kind: "death", events: deaths, until: this.deps.now() + DEATH_REVEAL_MS };
    this.setTimer(DEATH_REVEAL_MS, () => {
      this.startPhase();
      this.changed();
    });
    this.changed();
  }

  private startDeciding(): void {
    const match = this.match!;
    if (match.phase.kind === "items") {
      this.auctionLock.clear();
      if (match.round % 3 === 0 && this.auction?.round !== match.round) {
        const item = pick(this.auctionRng, SPECIAL_ITEM_KINDS);
        this.step = {
          kind: "auctionAnnouncement",
          item,
          round: match.round,
          until: this.deps.now() + AUCTION_ANNOUNCEMENT_MS,
        };
        this.setTimer(AUCTION_ANNOUNCEMENT_MS, () => {
          this.startAuction(item);
          this.startDeciding();
          this.changed();
        });
        this.changed();
        return;
      }
      else if (this.auction?.round !== match.round) this.auction = null;
    }
    for (const decision of pendingDecisions(match)) {
      const seat = this.seatById(decision.playerId);
      if (this.playsAsBot(seat)) this.submitBotChoice(decision);
    }
    const ms =
      match.phase.kind === "items"
        ? this.timing.itemMs
        : match.phase.kind === "move"
          ? this.timing.moveMs
          : this.timing.battleMs;
    this.step = { kind: "deciding", deadline: this.deps.now() + ms };
    this.setTimer(ms, () => this.resolveDecisions());
    this.resolveIfEveryoneReady();
  }

  private startAuction(item: ItemKind): void {
    if (!this.match || this.match.phase.kind !== "items") return;
    this.clearAuctionTimers();
    const startedAt = this.deps.now();
    this.auction = {
      item,
      round: this.match.round,
      startedAt,
      // Keep the first bot bid inside the requested 1–15 second window, even
      // when an eligible bot takes the full 15 seconds to join.
      firstBotBidAt: startedAt + 15_000,
      hasBotBid: false,
      previousHighBidders: new Set(),
      deadline: startedAt + AUCTION_INITIAL_MS,
      participants: new Set(),
      currentBid: 0,
      bidderId: null,
      status: "open",
      winnerId: null,
      winningBid: null,
    };
    this.setAuctionTimer(AUCTION_INITIAL_MS, () => this.closeAuction());
    for (const seat of this.seats) {
      if (this.playsAsBot(seat)) {
        this.scheduleBotJoin(seat);
      }
    }
  }

  private setAuctionTimer(ms: number, fn: () => void): void {
    this.cancelAuctionTimer?.();
    this.cancelAuctionTimer = this.deps.schedule(Math.max(0, ms), () => {
      this.cancelAuctionTimer = null;
      fn();
    });
  }

  private clearAuctionTimers(): void {
    this.cancelAuctionTimer?.();
    this.cancelAuctionTimer = null;
    for (const cancel of this.auctionBotTimers) cancel();
    for (const cancel of this.auctionJoinTimers) cancel();
    this.auctionBotTimers = [];
    this.auctionJoinTimers = [];
    this.auctionPriority.clear();
  }

  private scheduleBotJoin(seat: Seat): void {
    const playerAtDecision = this.match?.players.find((candidate) => candidate.id === seat.seatId);
    if (!playerAtDecision || playerAtDecision.coins < 10) return;
    const willing = randInt(this.auctionRng, 0, 99) < 75;
    if (!willing) return;
    this.auctionPriority.add(seat.seatId);
    const auction = this.auction;
    if (!auction) return;
    const delay = randInt(this.auctionRng, 1_000, 15_000);
    this.auctionJoinTimers.push(this.deps.schedule(delay, () => {
      const auction = this.auction;
      const player = this.match?.players.find((candidate) => candidate.id === seat.seatId);
      if (
        !auction || auction.status !== "open" || !player || player.coins < 10 ||
        this.auctionLock.get(seat.seatId) === "shop"
      ) return;
      auction.participants.add(seat.seatId);
      this.changed();
      this.scheduleBotBid(seat);
    }));
  }

  private scheduleBotLateJoin(seat: Seat): void {
    const player = this.match?.players.find((candidate) => candidate.id === seat.seatId);
    if (!this.auction || !player || player.coins < 10 || randInt(this.auctionRng, 0, 99) >= 30) return;
    const delay = randInt(this.auctionRng, 1_000, 4_000);
    this.auctionJoinTimers.push(this.deps.schedule(delay, () => {
      const live = this.auction;
      const currentPlayer = this.match?.players.find((candidate) => candidate.id === seat.seatId);
      if (
        !live || live.status !== "open" || live.participants.has(seat.seatId) ||
        live.currentBid <= 0 ||
        !currentPlayer || currentPlayer.coins < 10 ||
        this.auctionLock.get(seat.seatId) === "shop"
      ) return;
      live.participants.add(seat.seatId);
      this.changed();
      this.scheduleBotBid(seat);
    }));
  }

  private scheduleBotDeparturesAfterFirstBid(highBidderId: PlayerId): void {
    const auction = this.auction;
    if (!auction || auction.status !== "open") return;
    for (const playerId of auction.participants) {
      if (
        playerId === highBidderId ||
        auction.previousHighBidders.has(playerId) ||
        randInt(this.auctionRng, 0, 99) >= 30
      ) continue;
      const seat = this.seats.find((candidate) => candidate.seatId === playerId);
      if (!seat || !this.playsAsBot(seat)) continue;
      const delay = randInt(this.auctionRng, 2_000, 8_000);
      this.auctionJoinTimers.push(this.deps.schedule(delay, () => {
        const live = this.auction;
        if (
          live?.status !== "open" || live.bidderId === playerId ||
          live.previousHighBidders.has(playerId) ||
          !live.participants.delete(playerId)
        ) return;
        this.changed();
        // Preserve the occasional leave-and-rejoin behavior.
        if (randInt(this.auctionRng, 0, 99) < 80) {
          const rejoinDelay = randInt(this.auctionRng, 1_000, 4_000);
          this.auctionJoinTimers.push(this.deps.schedule(rejoinDelay, () => {
            const current = this.auction;
            const currentPlayer = this.match?.players.find((candidate) => candidate.id === playerId);
            if (
              current?.status === "open" &&
              currentPlayer && currentPlayer.coins >= 10 &&
              this.auctionLock.get(playerId) !== "shop" &&
              current.bidderId !== playerId
            ) {
              current.participants.add(playerId);
              this.changed();
              this.scheduleBotBid(seat);
            }
          }));
        }
      }));
    }
  }

  private botBidLimit(playerId: PlayerId): number {
    const player = this.match?.players.find((candidate) => candidate.id === playerId);
    if (!player || player.coins <= 0 || !this.match) return 0;
    const choice = this.choices.get(playerId) as ItemChoice | undefined;
    const spend = choice?.use?.amount ?? 0;
    const budget = Math.max(0, player.coins - spend);
    if (budget <= 0) return 0;
    const wealthiestOpponent = Math.max(
      0,
      ...this.match.players.filter((other) => other.id !== playerId).map((other) => other.coins),
    );
    const willingness = 0.3 + Math.min(0.4, wealthiestOpponent / 125);
    return Math.min(budget, Math.floor(budget * willingness));
  }

  private scheduleBotBid(seat: Seat): void {
    const auction = this.auction;
    if (!auction || auction.status !== "open" || auction.bidderId === seat.seatId) return;
    if (!auction.hasBotBid) {
      // The first bot bid is scheduled only at the auction's chosen 1–15 second mark.
      // Late arrivals wait until a bot has made that first bid.
      if (this.deps.now() > auction.firstBotBidAt) return;
      const delay = Math.max(0, auction.firstBotBidAt - this.deps.now());
      this.auctionBotTimers.push(this.deps.schedule(delay, () => {
        const live = this.auction;
        if (
          !live || live.status !== "open" || live.hasBotBid ||
          !live.participants.has(seat.seatId) || live.bidderId === seat.seatId
        ) return;
        if (this.botBidLimit(seat.seatId) <= live.currentBid) return;
        const amount = live.currentBid + 1;
        this.acceptAuctionBid(seat, amount);
      }));
      return;
    }
    const player = this.match?.players.find((candidate) => candidate.id === seat.seatId);
    const limit = this.botBidLimit(seat.seatId);
    if (!player || limit <= auction.currentBid || randInt(this.auctionRng, 0, 99) >= 90) return;
    const remainingAtBid = randInt(this.auctionRng, 1, 8) * 1_000;
    const delay = Math.max(0, auction.deadline - this.deps.now() - remainingAtBid);
    this.auctionBotTimers.push(this.deps.schedule(delay, () => {
      const live = this.auction;
      if (!live || live.status !== "open" || !live.participants.has(seat.seatId)) return;
      const remaining = live.deadline - this.deps.now();
      if (remaining < 1_000 || remaining > 8_000) return;
      const currentLimit = this.botBidLimit(seat.seatId);
      if (currentLimit <= live.currentBid) return;
      const available = currentLimit - live.currentBid;
      const increment = randInt(this.auctionRng, 0, 99) < 35
        ? randInt(this.auctionRng, Math.max(1, Math.ceil(available * 0.65)), available)
        : randInt(this.auctionRng, 1, available);
      const amount = live.currentBid + increment;
      this.acceptAuctionBid(seat, amount);
    }));
  }

  private joinAuction(seat: Seat): void {
    const auction = this.auction;
    if (this.stage !== "playing" || !auction || auction.status !== "open") {
      throw new SessionError("The auction is not open");
    }
    if (this.auctionLock.get(seat.seatId) === "shop") {
      throw new SessionError("You bought from the shop and can't bid this auction");
    }
    const player = this.match!.players.find((candidate) => candidate.id === seat.seatId)!;
    if (player.coins <= auction.currentBid) throw new SessionError("You need more coins than the current bid to join");
    auction.participants.add(seat.seatId);
    this.changed();
  }

  private leaveAuction(seat: Seat): void {
    const auction = this.auction;
    if (!auction || auction.status !== "open" || !auction.participants.has(seat.seatId)) {
      throw new SessionError("You aren't participating in this auction");
    }
    if (auction.bidderId === seat.seatId) {
      throw new SessionError("The current high bidder can't leave the auction");
    }
    auction.participants.delete(seat.seatId);
    this.changed();
  }

  private auctionBid(seat: Seat, amount: number): void {
    const auction = this.auction;
    if (this.stage !== "playing" || !auction || auction.status !== "open") {
      throw new SessionError("The auction is not open");
    }
    if (!auction.participants.has(seat.seatId)) throw new SessionError("Join the auction before bidding");
    if (this.auctionLock.get(seat.seatId) === "shop") {
      throw new SessionError("You bought from the shop and can't bid this auction");
    }
    this.acceptAuctionBid(seat, amount);
  }

  private buyShopItem(seat: Seat, kind: ItemKind, use: ItemChoice["use"] = null): void {
    const match = this.match;
    if (this.stage !== "playing" || !match || match.phase.kind !== "items" || this.step?.kind !== "deciding") {
      throw new SessionError("The shop is not open");
    }
    if (this.auctionLock.get(seat.seatId) === "bid") {
      throw new SessionError("You bid in the auction and can't buy from the shop");
    }
    if (this.auctionLock.get(seat.seatId) === "shop") {
      throw new SessionError("You already bought an item from the shop this round");
    }
    const problem = checkItemChoice(match, seat.seatId, { use, buy: kind });
    if (problem) throw new SessionError(problem);
    let result: ReturnType<typeof purchaseShopItem>;
    try {
      result = purchaseShopItem(match, seat.seatId, kind, use !== null);
    } catch (error) {
      throw new SessionError(error instanceof Error ? error.message : "That purchase isn't valid");
    }
    this.match = result.state;
    this.log.push(...result.events);
    this.auctionLock.set(seat.seatId, "shop");
    if (this.auction?.bidderId !== seat.seatId) this.auction?.participants.delete(seat.seatId);
    this.changed();
  }

  private acceptAuctionBid(seat: Seat, amount: number): void {
    const auction = this.auction;
    const player = this.match?.players.find((candidate) => candidate.id === seat.seatId);
    if (!auction || auction.status !== "open" || !player) return;
    if (!Number.isInteger(amount) || amount <= auction.currentBid) {
      throw new SessionError(`Bid more than ${auction.currentBid} coins`);
    }
    const submitted = this.choices.get(seat.seatId) as ItemChoice | undefined;
    const plannedSpend = submitted?.use?.amount ?? 0;
    if (amount + plannedSpend > player.coins) {
      throw new SessionError("Your bid plus planned item spending exceeds your coins");
    }
    if (amount > player.coins) throw new SessionError("You don't have enough coins for that bid");
    const firstBid = auction.currentBid === 0;
    this.auctionLock.set(seat.seatId, "bid");
    auction.previousHighBidders.add(seat.seatId);
    if (this.playsAsBot(seat)) auction.hasBotBid = true;
    auction.currentBid = amount;
    auction.bidderId = seat.seatId;
    auction.deadline = this.deps.now() + AUCTION_RESET_MS;
    this.setAuctionTimer(AUCTION_RESET_MS, () => this.closeAuction());
    const itemDeadline = this.deps.now() + this.timing.itemMs;
    if (this.step?.kind === "deciding") {
      this.step = { ...this.step, deadline: itemDeadline };
    }
    this.setTimer(this.timing.itemMs, () => this.resolveDecisions());
    if (firstBid) {
      for (const botSeat of this.seats) {
        if (this.playsAsBot(botSeat)) this.scheduleBotLateJoin(botSeat);
      }
      this.scheduleBotDeparturesAfterFirstBid(seat.seatId);
    }
    for (const cancel of this.auctionBotTimers) cancel();
    this.auctionBotTimers = [];
    for (const id of auction.participants) {
      const bot = this.seats.find((candidate) => candidate.seatId === id);
      if (bot && this.playsAsBot(bot)) this.scheduleBotBid(bot);
    }
    this.changed();
  }

  private closeAuction(): void {
    const auction = this.auction;
    if (!auction || auction.status !== "open") return;
    if (auction.bidderId && auction.currentBid > 0) {
      const result = awardAuctionItem(this.match!, auction.bidderId, auction.item, auction.currentBid);
      this.match = result.state;
      this.log.push(...result.events);
      auction.winnerId = auction.bidderId;
      auction.winningBid = auction.currentBid;
      this.choices.delete(auction.bidderId);
      this.ready.delete(auction.bidderId);
      const winnerSeat = this.seatById(auction.bidderId);
      const winnerDecision = pendingDecisions(this.match).find((decision) => decision.playerId === auction.bidderId);
      if (winnerDecision && this.playsAsBot(winnerSeat)) this.submitBotChoice(winnerDecision);
    }
    auction.status = "closed";
    auction.deadline = this.deps.now();
    this.clearAuctionTimers();
    this.changed();
    this.resolveIfEveryoneReady();
  }

  private startMinigame(): void {
    const rotation = this.deps.minigames ?? MINIGAME_KINDS;
    const available = rotation.filter((game) => !this.recentMinigames.includes(game));
    const game = this.deps.minigameTest?.game ?? pick(this.botRng, available.length > 0 ? available : rotation);
    this.recentMinigames.push(game);
    if (this.recentMinigames.length > 10) this.recentMinigames.shift();
    this.ready.clear();
    if (this.waitForMinigameReady && !this.deps.minigameTest) {
      this.pendingMinigame = game;
      this.step = isClientMinigame(game)
        ? { kind: "minigame", mode: "client", game, seed: 0, startAt: 0, endAt: 0, until: 0, stage: "ready", readyRequired: true }
        : { kind: "minigame", mode: "server", game, stage: "ready", round: 0, until: null };
      this.changed();
      this.resolveIfEveryoneReady();
      return;
    }
    this.launchMinigame(game);
  }

  private launchMinigame(game: MinigameKind): void {
    if (isClientMinigame(game)) this.startClientMinigame(game);
    else this.startServerMinigame(game);
  }

  private startClientMinigame(game: ClientMinigameKind): void {
    const now = this.deps.now();
    const startAt = now + (this.waitForMinigameReady ? READY_MINIGAME_DELAY_MS : this.timing.countdownMs);
    const endAt = startAt + CLIENT_MINIGAMES[game].durationMs;
    const until = endAt + this.timing.graceMs;
    const seed = randInt(this.botRng, 1, 2 ** 31 - 1);
    this.step = {
      kind: "minigame",
      mode: "client",
      game,
      readyRequired: this.waitForMinigameReady,
      seed,
      startAt,
      endAt,
      until,
    };
    this.minigameScores.clear();
    this.minigameStopTimes.clear();
    for (const seat of this.seats) {
      if (this.playsAsBot(seat)) {
        const score = botMinigameScore(game, this.botRng);
        this.minigameScores.set(seat.seatId, score);
        if (game === "stopwatch") {
          const sign = randInt(this.botRng, 0, 1) === 0 ? -1 : 1;
          const target = stopwatchTarget(seed);
          this.minigameStopTimes.set(seat.seatId, Math.max(0, Math.min(CLIENT_MINIGAMES.stopwatch.durationMs, target + sign * score)));
        }
      }
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
    const countdownMs = this.waitForMinigameReady ? READY_MINIGAME_DELAY_MS : this.timing.countdownMs;
    const startAt = now + countdownMs;
    const state = def.mode === "round" ? def.setup({ players, bots, rng }) : def.setup({ players, bots, rng }, startAt);
    this.serverGame = {
      game, def, state, rng, round: 0, deciders: [], choices: new Map(),
      pendingBotAnswers: new Map(), choosingStartedAt: 0,
    };
    this.setServerStep("countdown", startAt);
    this.setTimer(countdownMs, () => {
      if (def.mode === "round") this.startGameRound();
      else this.runRealtime();
      this.changed();
    });
  }

  private setServerStep(stage: "countdown" | "choosing" | "reveal" | "live", until: number | null): void {
    const g = this.serverGame!;
    this.step = {
      kind: "minigame", mode: "server", game: g.game, stage, round: g.round, until,
      ...(stage === "countdown" && this.waitForMinigameReady ? { readyRequired: true } : {}),
    };
  }

  private startGameRound(): void {
    const g = this.serverGame!;
    if (g.def.mode !== "round") return;
    this.clearPendingBotAnswers(g);
    const def = g.def;
    if (def.done(g.state)) {
      this.finishServerMinigame(def.result(g.state));
      return;
    }
    g.round++;
    g.choices.clear();
    def.beginRound?.(g.state);
    g.deciders = def.deciders(g.state);
    g.choosingStartedAt = this.deps.now();
    const ms = def.roundMs(g.state);
    for (const id of g.deciders) {
      if (this.playsAsBot(this.seatById(id))) {
        const choice = def.bot(g.state, id, g.rng);
        if (g.game === "theCount" && (g.state as { stage?: string }).stage === "guess") {
          const pending = { choice, cancel: () => {} };
          g.pendingBotAnswers.set(id, pending);
          pending.cancel = this.deps.schedule(randInt(g.rng, 1_000, 5_000), () => {
            if (this.serverGame !== g || this.step?.kind !== "minigame" || this.step.mode !== "server" || this.step.stage !== "choosing") return;
            if (!g.pendingBotAnswers.delete(id)) return;
            g.choices.set(id, choice);
            def.onSubmit?.(g.state, id, choice, this.deps.now() - g.choosingStartedAt);
            this.changed();
            this.resolveIfEveryoneReady();
          });
        } else if (def.botDelayMs?.(g.state, id) != null) {
          const pending = { choice, cancel: () => {} };
          g.pendingBotAnswers.set(id, pending);
          pending.cancel = this.deps.schedule(def.botDelayMs!(g.state, id)!, () => {
            if (this.serverGame !== g || this.step?.kind !== "minigame" || this.step.mode !== "server" || this.step.stage !== "choosing") return;
            if (!g.pendingBotAnswers.delete(id)) return;
            g.choices.set(id, choice);
            def.onSubmit?.(g.state, id, choice, this.deps.now() - g.choosingStartedAt);
            this.changed();
            this.resolveIfEveryoneReady();
          });
        } else {
          g.choices.set(id, choice);
          // Bot choices are precomputed; simulate their answer time instead of giving them 0ms.
          if (def.onSubmit) def.onSubmit(g.state, id, choice, randInt(g.rng, Math.min(1_000, ms), ms));
        }
      }
    }
    this.setServerStep("choosing", this.deps.now() + ms);
    this.setTimer(ms, () => this.resolveGameRound());
    this.resolveIfEveryoneReady();
  }

  private resolveGameRound(): void {
    const g = this.serverGame;
    if (!g || g.def.mode !== "round" || this.step?.kind !== "minigame" || this.step.mode !== "server") return;
    if (this.step.stage !== "choosing") return;
    const def = g.def;
    this.clearPendingBotAnswers(g);
    for (const id of g.deciders) {
      if (!g.choices.has(id)) {
        const choice = def.fallback(g.state, id, g.rng);
        g.choices.set(id, choice);
        def.onSubmit?.(g.state, id, choice, def.roundMs(g.state));
      }
    }
    def.resolve(g.state, Object.fromEntries(g.choices), g.rng);
    const configuredRevealMs = typeof def.revealMs === "function" ? def.revealMs(g.state) : def.revealMs;
    const revealMs = def.done(g.state) ? Math.max(configuredRevealMs, this.timing.minigameEndMs) : configuredRevealMs;
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
      g.def.input(g.state, seat.seatId, move, this.deps.now(), g.rng);
      this.runRealtime();
      this.changed();
      return;
    }
    if (step.stage !== "choosing") throw new SessionError("Wait for the next round");
    if (!g.deciders.includes(seat.seatId)) throw new SessionError("You don't pick this round");
    if (g.choices.has(seat.seatId)) throw new SessionError("You already picked this round");
    const choice = g.def.parse(g.state, seat.seatId, move);
    if (choice === undefined) throw new SessionError("That isn't a valid pick");
    g.def.onSubmit?.(g.state, seat.seatId, choice, Math.max(0, this.deps.now() - g.choosingStartedAt));
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
      played: { game: g.game, scores: result.scores, labels: result.labels,
        ...(result.allLast !== undefined ? { allLast: result.allLast } : {}) },
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
      if (step.game === "stopwatch") {
        const elapsed = this.deps.now() - step.startAt;
        if (elapsed >= 0 && Math.abs(elapsed - score) <= RESULT_TIMING_SLACK_MS) {
          accepted = Math.abs(Math.round(score) - stopwatchTarget(step.seed));
          this.minigameStopTimes.set(seat.seatId, Math.round(score));
        }
      } else {
        const playedFor = step.game === "reaction" ? reactionGoDelay(step.seed) + score : CLIENT_MINIGAMES[step.game].durationMs;
        if (this.deps.now() >= step.startAt + playedFor - RESULT_TIMING_SLACK_MS) accepted = Math.round(score);
      }
    }
    this.minigameScores.set(seat.seatId, accepted);
    this.changed();
    this.resolveIfEveryoneReady();
  }

  private resolveMinigame(): void {
    const step = this.step;
    if (step?.kind !== "minigame" || step.mode !== "client") return;
    const scores = Object.fromEntries(this.seats.map((s) => [s.seatId, this.minigameScores.get(s.seatId) ?? null]));
    const labels = step.game === "stopwatch"
      ? Object.fromEntries(this.seats.map((seat) => {
          const elapsed = this.minigameStopTimes.get(seat.seatId);
          const error = scores[seat.seatId];
          return [seat.seatId, elapsed === undefined || error === null
            ? "no result"
            : `Stopped at ${(elapsed / 1000).toFixed(2)}s (${elapsed}ms) · ${error}ms from target`];
        }))
      : undefined;
    this.resolve({
      kind: "minigame",
      ranking: rankScores(step.game, scores),
      played: { game: step.game, scores, ...(labels ? { labels } : {}) },
    });
  }

  private submit(seat: Seat, kind: "items" | "move" | "battle" | "battleInitiation", choice: Choice): void {
    if (kind === "battle" && (this.step?.kind === "bossBattle" || this.step?.kind === "showdown")) {
      this.submitBattleChoice(seat, choice as BattleChoice);
      return;
    }
    const match = this.match;
    if (this.stage !== "playing" || !match || this.step?.kind !== "deciding") {
      throw new SessionError("Nothing to decide right now");
    }
    const decision = pendingDecisions(match).find((d) => d.playerId === seat.seatId);
    if (!decision) throw new SessionError("You don't have a decision this phase");
    const expected = kind === "battle" ? "boss" : kind;
    if (decision.kind !== expected && !(kind === "battle" && (decision.kind === "showdown" || decision.kind === "battle"))) {
      throw new SessionError("Wrong kind of decision");
    }

    if (kind === "items") {
      const itemChoice = choice as ItemChoice;
      if (itemChoice.buy) {
        throw new SessionError("Confirm shop purchases in the shop before locking in items");
      }
      const itemPlayer = match.players.find((candidate) => candidate.id === seat.seatId)!;
      if (itemPlayer.items.length > match.rules.items.maxHeld && !itemChoice.use) {
        throw new SessionError("Use an item this round to make room for your confirmed purchase");
      }
      const problem = checkItemChoice(match, seat.seatId, itemChoice);
      if (problem) throw new SessionError(problem);
      const auction = this.auction;
      const player = match.players.find((candidate) => candidate.id === seat.seatId)!;
      if (
        auction?.status === "open" &&
        auction.bidderId === seat.seatId &&
        (itemChoice.use?.amount ?? 0) + auction.currentBid > player.coins
      ) {
        throw new SessionError("Your planned item spending plus bid exceeds your coins");
      }
      if (itemChoice.buy) {
        this.auctionLock.set(seat.seatId, "shop");
        if (auction?.bidderId !== seat.seatId) auction?.participants.delete(seat.seatId);
      }
    }
    if (kind === "move") {
      const problem = checkMoveChoice(match, seat.seatId, choice as MoveChoice);
      if (problem) throw new SessionError(problem);
    }
    if (kind === "battleInitiation") {
      const target = (choice as BattleInitiationChoice).target;
      if (decision.kind !== "battleInitiation" || (target !== null && !decision.targets.includes(target))) {
        throw new SessionError("Choose someone sharing your space");
      }
    }

    this.choices.set(seat.seatId, choice);
    this.ready.add(seat.seatId);
    this.changed();
    this.resolveIfEveryoneReady();
  }

  private submitBotChoice(decision: Decision): void {
    const match = this.match!;
    const choice =
      decision.kind === "items"
        ? botItemChoice(match, decision.playerId, this.botRng)
        : decision.kind === "move"
          ? botMoveChoice(match, decision.playerId, this.botRng)
          : decision.kind === "battleInitiation"
            ? botBattleInitiationChoice(match, decision.playerId, decision.targets, this.botRng)
            : botBattleChoice(match, decision.playerId);
    if (decision.kind === "items") {
      const itemChoice = choice as ItemChoice;
      if (this.auctionLock.get(decision.playerId) === "bid" && itemChoice.buy) {
        itemChoice.buy = null;
        if (itemChoice.use?.itemId === BOUGHT_ITEM) itemChoice.use = null;
      }
      if (this.auctionPriority.has(decision.playerId) && itemChoice.buy) {
        itemChoice.buy = null;
        if (itemChoice.use?.itemId === BOUGHT_ITEM) itemChoice.use = null;
      }
      if (itemChoice.buy) this.auctionLock.set(decision.playerId, "shop");
    }
    this.choices.set(decision.playerId, choice);
    this.ready.add(decision.playerId);
  }

  private submitForBotIfDeciding(seat: Seat): void {
    if (this.stage !== "playing") return;
    const step = this.step;
    if (step?.kind === "bossBattle" || step?.kind === "showdown") {
      this.resolveIfEveryoneReady();
      return;
    }
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
        const choice = g.def.bot(g.state, seat.seatId, g.rng);
        g.choices.set(seat.seatId, choice);
        g.def.onSubmit?.(g.state, seat.seatId, choice, Math.max(0, this.deps.now() - g.choosingStartedAt));
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
    if (step?.kind === "minigame" && step.stage === "ready") {
      const waiting = this.seats.some((seat) => this.isWaitingOn(seat.seatId));
      if (!waiting) {
        const game = this.pendingMinigame;
        this.pendingMinigame = null;
        if (game) this.launchMinigame(game);
        this.changed();
      }
      return;
    }
    if (step?.kind === "bossBattle" || step?.kind === "showdown") {
      if (step.stage !== "choosing") return;
      if (this.deps.now() >= this.battleBotChoiceAt) {
        for (const playerId of step.contenders) {
          const decision = pendingDecisions(this.match!).find((candidate) => candidate.playerId === playerId);
          if (decision && !this.ready.has(playerId) && !this.isActiveHuman(playerId)) {
            this.submitBotChoice(decision);
            const choice = this.choices.get(playerId) as BattleChoice;
            const die = "dice" in decision
              ? decision.dice.find((candidate) => candidate.id === choice.die)
              : undefined;
            if (die) step.selected[playerId] = die.sides;
          }
        }
      }
      if (step.contenders.every((id) => this.ready.has(id))) this.resolveBattleChoices();
      return;
    }
    if (step?.kind === "results") {
      if (!this.seats.some((s) => this.isWaitingOn(s.seatId))) {
        this.startPhase();
        this.changed();
      }
      return;
    }
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
      if (g.pendingBotAnswers.size > 0) return;
      if (!g.deciders.some((id) => !g.choices.has(id) && this.isActiveHuman(id))) this.resolveGameRound();
      return;
    }
    if (this.step?.kind !== "deciding") return;
    const waiting = pendingDecisions(this.match!).some((d) => this.isWaitingOn(d.playerId));
    if (!waiting) {
      if (this.match!.phase.kind === "items" && this.auction?.status === "open") return;
      this.resolveDecisions();
    }
  }

  private resolveDecisions(): void {
    const match = this.match!;
    if (match.phase.kind === "items" && this.auction?.status === "open") {
      this.setTimer(Math.max(1, this.auction.deadline - this.deps.now()), () => this.resolveDecisions());
      return;
    }
    const choices = Object.fromEntries(this.choices);
    const kind = match.phase.kind;
    if (kind === "items") this.resolve({ kind, choices: choices as Record<PlayerId, ItemChoice> });
    else if (kind === "move") this.resolve({ kind, choices: choices as Record<PlayerId, MoveChoice> });
    else if (kind === "battleInitiation") this.resolve({ kind, choices: choices as Record<PlayerId, BattleInitiationChoice> });
    else if (kind === "battle") this.resolve({ kind, choices: choices as Record<PlayerId, BattleChoice> });
    else if (kind === "boss" || kind === "showdown") this.resolve({ kind, choices: choices as Record<PlayerId, BattleChoice> });
  }

  private resolve(input: PhaseInput): void {
    this.clearTimer();
    if (this.deps.minigameTest && input.kind === "minigame") {
      const prizes = Object.fromEntries(this.seats.map((seat) => [seat.seatId, {
        coins: 0, die: null, item: null, itemSkipped: null, d4: false,
      }]));
      this.ready.clear();
      this.step = {
        kind: "results",
        until: this.deps.now() + this.timing.resultsMs,
        ranking: input.ranking,
        played: input.played ?? null,
        prizes,
      };
      this.setTimer(this.timing.resultsMs, () => {
        this.match!.phase = { kind: "minigame" };
        this.startPhase();
        this.changed();
      });
      this.changed();
      return;
    }
    if (input.kind === "minigame") this.captureBoardProgress(`Round ${this.match!.round}`, true);
    const result = resolvePhase(this.match!, input);
    this.match = result.state;
    this.log.push(...result.events);
    const chaosSpawn = result.events.find(
      (event): event is Extract<MatchEvent, { type: "chaosSpacePlaced" }> => event.type === "chaosSpacePlaced",
    );
    if (chaosSpawn) this.pendingChaosSpawn = chaosSpawn;
    if (input.kind === "minigame") this.countAwayRound();

    if (this.match.phase.kind === "gameOver") {
      this.captureBoardProgress("Final", false);
      this.startPhase();
    } else if (input.kind === "minigame") {
      this.ready.clear();
      this.step = {
        kind: "results",
        until: this.deps.now() + this.timing.resultsMs,
        ranking: input.ranking,
        played: input.played ?? null,
        prizes: minigamePrizes(input.ranking, result.events),
      };
      this.setTimer(this.timing.resultsMs, () => {
        this.startPhase();
        this.changed();
      });
      this.resolveIfEveryoneReady();
    } else if (input.kind === "items") {
      const plays = result.itemPlays ?? [];
      const spiritEvents = result.events.filter(
        (event): event is Extract<MatchEvent, { type: "candySpiritTriggered" }> =>
          event.type === "candySpiritTriggered",
      );
      if (plays.length === 0 && spiritEvents.length === 0) {
        this.startPhase();
      } else {
        this.step = {
          kind: "itemReveal",
          until: this.deps.now() + this.timing.itemRevealMs,
          plays,
          spiritEvents,
          knockoutEvents: result.events.filter(
            (event): event is Extract<MatchEvent, { type: "playerDied" }> =>
              event.type === "playerDied" && event.reason === "item",
          ),
        };
        this.setTimer(this.timing.itemRevealMs, () => {
          const allDeaths = result.events.filter(
            (event): event is Extract<MatchEvent, { type: "playerDied" }> => event.type === "playerDied",
          );
          this.pendingRainbowChaosDeaths = allDeaths.filter((event) => event.reason === "rainbowChaos");
          const deaths = allDeaths.filter((event) => event.reason !== "rainbowChaos");
          const outcomes = result.events.filter(
            (event): event is Extract<MatchEvent, { type: "chaosOutcome" }> => event.type === "chaosOutcome",
          );
          if (deaths.length > 0) this.startDeathSequence(deaths, [], outcomes, result.events);
          else if (outcomes.length > 0) this.startChaosSequence(outcomes);
          else this.startPhase();
          this.changed();
        });
      }
    } else if (input.kind === "move") {
      this.pendingMoveEvents = result.events;
      this.step = {
        kind: "rollSummary",
        until: this.deps.now() + MOVE_ROLL_SUMMARY_MS,
        events: result.events,
      };
      this.setTimer(MOVE_ROLL_SUMMARY_MS, () => {
        this.startMovementReveal();
        this.changed();
      });
    } else if (input.kind === "battle") {
      this.pendingShowdown = result;
      this.presentShowdownRoll(0, 0, {}, true);
    } else if (input.kind === "battleInitiation") {
      this.startPhase();
    } else {
      const duration = this.revealDuration(result.events);
      this.step = { kind: "revealing", until: this.deps.now() + duration, events: result.events };
      this.setTimer(duration, () => {
        this.startPhase();
        this.changed();
      });
    }
    this.changed();
  }

  private startMovementReveal(): void {
    const events = this.pendingMoveEvents ?? [];
    this.pendingMoveEvents = null;
    const duration = this.revealDuration(events);
    this.step = { kind: "revealing", until: this.deps.now() + duration, events };
    this.setTimer(duration, () => {
      const deaths = events.filter(
        (event): event is Extract<MatchEvent, { type: "playerDied" }> =>
          event.type === "playerDied",
      );
      this.pendingRainbowChaosDeaths = deaths.filter((event) => event.reason === "rainbowChaos");
      const priorDeaths = deaths.filter((event) => event.reason !== "rainbowChaos");
      const traps = events.filter(
        (event): event is Extract<MatchEvent, { type: "trapTriggered" }> => event.type === "trapTriggered",
      );
      const outcomes = events.filter(
        (event): event is Extract<MatchEvent, { type: "chaosOutcome" }> => event.type === "chaosOutcome",
      );
      if (priorDeaths.length > 0) this.startDeathSequence(priorDeaths, traps, outcomes, events);
      else this.continueAfterBlackDeaths(traps, outcomes, events);
    });
  }

  private startDeathSequence(
    deaths: Extract<MatchEvent, { type: "playerDied" }>[],
    traps: Extract<MatchEvent, { type: "trapTriggered" }>[],
    outcomes: Extract<MatchEvent, { type: "chaosOutcome" }>[],
    allEvents: MatchEvent[],
  ): void {
    this.step = { kind: "death", events: deaths, until: this.deps.now() + DEATH_REVEAL_MS };
    this.setTimer(DEATH_REVEAL_MS, () => this.continueAfterBlackDeaths(traps, outcomes, allEvents));
    this.changed();
  }

  private continueAfterBlackDeaths(
    traps: Extract<MatchEvent, { type: "trapTriggered" }>[],
    outcomes: Extract<MatchEvent, { type: "chaosOutcome" }>[],
    allEvents: MatchEvent[],
  ): void {
    if (traps.length > 0) this.startTrapSequence(traps, outcomes, allEvents);
    else if (outcomes.length > 0) this.startChaosSequence(outcomes);
    else {
      this.startPhase();
      this.changed();
    }
  }

  private startTrapSequence(
    traps: Extract<MatchEvent, { type: "trapTriggered" }>[],
    outcomes: Extract<MatchEvent, { type: "chaosOutcome" }>[],
    allEvents: MatchEvent[],
    index = 0,
  ): void {
    const event = traps[index];
    if (!event) {
      if (outcomes.length > 0) this.startChaosSequence(outcomes);
      else {
        this.startPhase();
        this.changed();
      }
      return;
    }
    const victims = new Set(event.victims);
    const steals = allEvents.filter(
      (item): item is Extract<MatchEvent, { type: "coinsStolen" }> =>
        item.type === "coinsStolen" && item.reason === "trap" && item.to === event.ownerId && victims.has(item.from),
    );
    const stolenItems = allEvents.filter(
      (item): item is Extract<MatchEvent, { type: "itemStolen" }> =>
        item.type === "itemStolen" && item.to === event.ownerId && victims.has(item.from),
    );
    const knockouts = allEvents.filter(
      (item): item is Extract<MatchEvent, { type: "playerDied" }> =>
        item.type === "playerDied" && victims.has(item.playerId),
    );
    const ghostFeetSaves = allEvents.filter(
      (item): item is Extract<MatchEvent, { type: "ghostFeetSaved" }> =>
        item.type === "ghostFeetSaved" &&
        item.spaceId === event.spaceId &&
        item.trapKind === event.kind &&
        (event.blocked?.includes(item.playerId) ?? false),
    );
    this.step = {
      kind: "trap",
      event,
      steals,
      stolenItems,
      knockouts,
      ghostFeetSaves,
      index: index + 1,
      total: traps.length,
      until: this.deps.now() + TRAP_REVEAL_MS,
    };
    this.setTimer(TRAP_REVEAL_MS, () => this.startTrapSequence(traps, outcomes, allEvents, index + 1));
    this.changed();
  }

  private startChaosSequence(
    outcomes: Extract<MatchEvent, { type: "chaosOutcome" }>[],
    index = 0,
  ): void {
    const event = outcomes[index];
      if (!event) {
        if (this.pendingRainbowChaosDeaths.length > 0) {
          const deaths = this.pendingRainbowChaosDeaths;
          this.pendingRainbowChaosDeaths = [];
          this.startDeathSequence(deaths, [], [], []);
          return;
        }
        if (this.match?.phase.kind === "minigame") {
        this.step = {
          kind: "chaosBuffer",
          until: this.deps.now() + CHAOS_MINIGAME_BUFFER_MS,
        };
        this.setTimer(CHAOS_MINIGAME_BUFFER_MS, () => {
          this.startPhase();
          this.changed();
        });
        this.changed();
        return;
      }
      this.startPhase();
      this.changed();
      return;
    }
    const stage = event.spaceType === "rainbowChaos" ? "rainbowIntro" : "initiator";
    this.startChaosStage(outcomes, index, stage);
  }

  private startChaosStage(
    outcomes: Extract<MatchEvent, { type: "chaosOutcome" }>[],
    index: number,
    stage: "initiator" | "targetSpin" | "rainbowIntro" | "effectSpin",
  ): void {
    const event = outcomes[index]!;
    const duration = stage === "rainbowIntro"
      ? RAINBOW_INTRO_MS
      : event.spaceType === "rainbowChaos"
        ? RAINBOW_EFFECT_SPIN_MS
      : stage === "initiator"
        ? CHAOS_INITIATOR_MS
        : stage === "targetSpin"
          ? CHAOS_TARGET_SPIN_MS
          : CHAOS_EFFECT_SPIN_MS;
    this.step = {
      kind: "chaos",
      event,
      stage,
      index: index + 1,
      total: outcomes.length,
      until: this.deps.now() + duration,
    };
    this.setTimer(duration, () => {
      if (stage === "rainbowIntro") {
        this.startChaosStage(outcomes, index, "effectSpin");
      } else if (event.spaceType === "rainbowChaos" || stage === "effectSpin") {
        this.startChaosSequence(outcomes, index + 1);
      } else if (stage === "initiator") {
        this.startChaosStage(outcomes, index, "targetSpin");
      } else {
        this.startChaosStage(outcomes, index, "effectSpin");
      }
    });
    this.changed();
  }

  /** Long enough for the client to walk every token along its path, plus the reading pause. */
  private revealDuration(events: MatchEvent[]): number {
    const phaseSpaces = { moved: 0, pushed: 0, knocked: 0 };
    const hasPhase: Record<keyof typeof phaseSpaces, boolean> = { moved: false, pushed: false, knocked: false };
    const arrowPhases = new Map<number, number>();
    let hasArrow = false;
    let hasCollision = false;
    for (const event of events) {
      if (event.type === "moved") {
        phaseSpaces.moved = Math.max(phaseSpaces.moved, event.path.length);
        hasPhase.moved = true;
      } else if (event.type === "arrow") {
        const chain = event.chain ?? 0;
        arrowPhases.set(chain, Math.max(arrowPhases.get(chain) ?? 0, event.path.length));
        hasArrow = true;
      } else if (event.type === "knockedBack") {
        phaseSpaces.knocked = Math.max(phaseSpaces.knocked, event.path.length);
        hasPhase.knocked = true;
      } else if (event.type === "forcedBack" || event.type === "collision") {
        phaseSpaces.pushed = Math.max(phaseSpaces.pushed, 1);
        hasPhase.pushed = true;
        hasCollision = true;
      }
    }
    const animatedTime = (Object.keys(phaseSpaces) as (keyof typeof phaseSpaces)[])
      .filter((phase) => hasPhase[phase])
      .reduce((total, phase) => total + Math.max(phaseSpaces[phase] * this.timing.spaceMs, 300), 0) +
      [...arrowPhases.values()].reduce((total, spaces) => total + Math.max(spaces * this.timing.spaceMs, 300), 0);
    if (hasArrow) return 12_000;
    return this.timing.revealMs + animatedTime +
      (hasCollision ? COLLISION_BUFFER_MS : 0);
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

  private clearPendingBotAnswers(g: ServerMinigame): void {
    for (const pending of g.pendingBotAnswers.values()) pending.cancel();
    g.pendingBotAnswers.clear();
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  dispose(): void {
    this.clearTimer();
    this.clearAuctionTimers();
    if (this.serverGame) this.clearPendingBotAnswers(this.serverGame);
    this.pendingBoss = null;
    this.pendingShowdown = null;
    this.pendingMoveEvents = null;
  }

  private changed(): void {
    this.deps.onChange();
  }

  // ---- Views -------------------------------------------------------------

  private captureBoardProgress(label: string, beforeMinigame: boolean): void {
    if (!this.match) return;
    const match = this.match;
    const length = match.board.spaces[match.board.start]!.distanceToFinish;
    const players = Object.fromEntries(match.players.map((player) => {
      const distance = match.board.spaces[player.position]!.distanceToFinish;
      return [player.id, Math.max(0, Math.min(100, length > 0 ? (length - distance) / length * 100 : 100))];
    }));
    this.boardProgress.push({ label, players });
    if (beforeMinigame) {
      const closest = Math.min(...match.players.map((player) => match.board.spaces[player.position]!.distanceToFinish));
      for (const player of match.players) {
        if (match.board.spaces[player.position]!.distanceToFinish === closest) {
          this.boardFirsts[player.id] = (this.boardFirsts[player.id] ?? 0) + 1;
        }
      }
    }
  }

  private endGameStats(match: MatchState): EndGameStats {
    const winner = match.phase.kind === "gameOver" ? match.phase.winner : null;
    const playerOrder = [...match.players]
      .sort((a, b) => Number(b.id === winner) - Number(a.id === winner) ||
        match.board.spaces[a.position]!.distanceToFinish - match.board.spaces[b.position]!.distanceToFinish)
      .map((player) => player.id);
    const sums: Record<PlayerId, { minigames: number; placements: number }> = Object.fromEntries(
      match.players.map((player) => [player.id, { minigames: 0, placements: 0 }]),
    );
    const players: EndGameStats["players"] = Object.fromEntries(match.players.map((player) => [player.id, {
      coinsCollected: 0,
      itemsCollected: 0,
      itemsUsed: 0,
      averageMinigamePlacement: null,
      d12sUsed: 0,
      d10sUsed: 0,
      d8sUsed: 0,
      d4sUsed: 0,
      firstPlacesBeforeMinigame: this.boardFirsts[player.id] ?? 0,
      kills: 0,
      deaths: 0,
    }]));
    for (const event of this.log) {
      if (event.type === "coinsChanged" && event.delta > 0) players[event.playerId]!.coinsCollected += event.delta;
      if (event.type === "coinsStolen") players[event.to]!.coinsCollected += event.amount;
      if (event.type === "itemBought" || event.type === "auctionWon" || event.type === "itemAwarded") {
        players[event.playerId]!.itemsCollected++;
      }
      if (event.type === "itemStolen") players[event.to]!.itemsCollected++;
      if (event.type === "chaosOutcome") {
        for (const transfer of event.itemTransfers ?? []) {
          if (transfer.receiver) players[transfer.receiver]!.itemsCollected += transfer.items.length;
        }
      }
      if (event.type === "itemUsed") players[event.playerId]!.itemsUsed++;
      if (event.type === "trapPlaced") players[event.playerId]!.itemsUsed++;
      if (event.type === "dieRolled") {
        if (event.sides === 12) players[event.playerId]!.d12sUsed++;
        if (event.sides === 10) players[event.playerId]!.d10sUsed++;
        if (event.sides === 8) players[event.playerId]!.d8sUsed++;
        if (event.sides === 4) players[event.playerId]!.d4sUsed++;
      }
      if (event.type === "showdownRoll") {
        for (const [id, roll] of Object.entries(event.rolls)) {
          if (roll.sides === 12) players[id]!.d12sUsed++;
          if (roll.sides === 10) players[id]!.d10sUsed++;
          if (roll.sides === 8) players[id]!.d8sUsed++;
          if (roll.sides === 4) players[id]!.d4sUsed++;
        }
      }
      if (event.type === "bossFight") {
        const rolls = Math.max(1, event.attempts.length);
        if (event.sides === 12) players[event.playerId]!.d12sUsed += rolls;
        if (event.sides === 10) players[event.playerId]!.d10sUsed += rolls;
        if (event.sides === 8) players[event.playerId]!.d8sUsed += rolls;
        if (event.sides === 4) players[event.playerId]!.d4sUsed += rolls;
      }
      if (event.type === "minigameResults") {
        let place = 1;
        for (const group of event.ranking) {
          for (const id of group) {
            sums[id]!.placements += place;
            sums[id]!.minigames++;
          }
          place += group.length;
        }
      }
      if (event.type === "playerDied") {
        players[event.playerId]!.deaths++;
        if (event.sourcePlayerId && event.sourcePlayerId !== event.playerId) {
          players[event.sourcePlayerId]!.kills++;
        }
      }
    }
    for (const player of match.players) {
      const total = sums[player.id]!;
      if (total.minigames > 0) {
        players[player.id]!.averageMinigamePlacement = Math.round(total.placements / total.minigames * 100) / 100;
      }
    }
    return {
      playerOrder,
      players,
      progress: this.boardProgress.map((snapshot) => ({ label: snapshot.label, players: { ...snapshot.players } })),
    };
  }

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
    const pendingKnockoutVisuals = new Set<PlayerId>(
      step.kind === "death"
        ? step.events.map((event) => event.playerId)
        : step.kind === "showdown" && step.battle && this.pendingShowdown
          ? this.pendingShowdown.events
              .filter(
                (event): event is Extract<MatchEvent, { type: "playerDied" }> =>
          event.type === "playerDied",
              )
              .map((event) => event.playerId)
        : step.kind === "revealing" || step.kind === "rollSummary"
          ? (step.events ?? [])
              .filter(
                (event): event is Extract<MatchEvent, { type: "playerDied" }> =>
          event.type === "playerDied",
              )
              .map((event) => event.playerId)
          : [],
    );
    const visibleStep: Step = step.kind === "death"
      ? { ...step, events: step.events.filter((event) => event.playerId === you?.seatId) }
      : step;
    const decisions = step.kind === "deciding" || ((step.kind === "bossBattle" || step.kind === "showdown") && step.stage === "choosing")
      ? pendingDecisions(match) : [];
    const deciding = new Set(decisions.map((d) => d.playerId));
    const inClientMinigame = step.kind === "minigame" && step.mode === "client";
    const g = this.serverGame;
    const picking = g && step.kind === "minigame" && step.mode === "server" && step.stage === "choosing" ? g.deciders : [];
    const player = you ? match.players.find((p) => p.id === you.seatId) : undefined;
    const minigameDone = (id: PlayerId) => step.kind === "minigame" && step.stage === "ready"
      ? this.ready.has(id)
      : inClientMinigame ? this.minigameScores.has(id) : !!g?.choices.has(id);
    const auction: AuctionView | null = this.auction &&
      (this.auction.status === "open" ||
        (this.auction.round === match.round && match.phase.kind === "items"))
      ? {
          item: this.auction.item,
          deadline: this.auction.deadline,
          participants: [...this.auction.participants],
          currentBid: this.auction.currentBid,
          bidderId: this.auction.bidderId,
          status: this.auction.status,
          winnerId: this.auction.winnerId,
          winningBid: this.auction.winningBid,
          me: you
            ? {
                lock: this.auctionLock.get(you.seatId) ?? null,
                participating: this.auction.participants.has(you.seatId),
              }
            : null,
        }
      : null;

    return {
      board: match.board,
      round: match.round,
      phase: match.phase,
      step: visibleStep,
      bossFixed: match.bossFixed,
      auction,
      players: match.players.map((p) => ({
        seatId: p.id,
        position: p.position,
        coins: p.coins,
        defaultDie: p.defaultDie,
        // Keep knockout visuals hidden until the announcement has completed.
        dead: p.dead && !pendingKnockoutVisuals.has(p.id),
       deciding: step.kind === "minigame" && step.stage === "ready" ? this.isActiveHuman(p.id) : inClientMinigame || picking.includes(p.id) || deciding.has(p.id),
       ready: step.kind === "minigame" && step.stage === "ready" ? this.ready.has(p.id)
         : step.kind === "minigame" ? minigameDone(p.id) : this.ready.has(p.id),
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
          if (e.type === "trapTriggered" && !e.victims.includes(you?.seatId ?? "") && !e.blocked?.includes(you?.seatId ?? "")) return false;
          if (e.type === "coinsStolen" && e.reason === "trap" && e.from !== you?.seatId) return false;
          if (e.type === "itemStolen" && e.from !== you?.seatId && e.to !== you?.seatId) return false;
          const owner = privateEventOwner(e);
          return owner === null || owner === you?.seatId;
        })
        .slice(-EVENTS_IN_VIEW),
      ...(this.deps.trapBoardTest
        ? { testTraps: match.traps.map(({ spaceId, ownerId, kind }) => ({ spaceId, ownerId, kind })) }
        : {}),
      you: player
        ? {
            dice: player.dice,
            items: player.items,
            traps: match.traps.filter((t) => t.ownerId === player.id).map((t) => t.spaceId),
            decision: decisions.find((d) => d.playerId === player.id) ?? null,
            submitted: this.choices.get(player.id) ?? null,
            minigameSubmitted: step.kind === "minigame" && minigameDone(player.id),
            dead: player.dead,
            reviveRequirement: player.reviveRequirement,
          }
        : null,
      endStats: match.phase.kind === "gameOver" ? this.endGameStats(match) : null,
    };
  }
}
