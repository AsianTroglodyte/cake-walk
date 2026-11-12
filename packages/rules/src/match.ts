import { DEFAULT_BOARD, generateBoard } from "./board";
import {
  applyRollMods,
  awardMinigameItem,
  DEFAULT_ITEM_RULES,
  itemsAllowed,
  resolveItems,
  trapSpaces,
  triggerTraps,
} from "./items";
import { clampLane, walkBackward, walkForward } from "./movement";
import { createRng, randInt, rollDie, shuffle } from "./rng";
import type {
  BattleChoice,
  BoardConfig,
  BossAttempt,
  CoinReason,
  Decision,
  DefaultDieSides,
  DieOption,
  MatchEvent,
  MatchState,
  MinigamePlayed,
  MinigameRanking,
  MoveChoice,
  PhaseInput,
  PhaseResult,
  Player,
  PlayerId,
  RuleConfig,
  SavedDie,
  SpaceId,
} from "./types";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

export const DEFAULT_RULES: RuleConfig = {
  startingCoins: 10,
  blueCoins: 3,
  redCoins: 3,
  arrowDistance: 3,
  bossStartFixed: 4,
  bossMinFixed: 1,
  bossDieSides: 4,
  knockbackMin: 6,
  knockbackMax: 10,
  d12IntervalMin: 3,
  d12IntervalMax: 5,
  coinsByQuartile: [10, 6, 3, 0],
  items: DEFAULT_ITEM_RULES,
};

export interface MatchSetup {
  players: { id: PlayerId; name: string; isBot: boolean }[];
  seed: number;
  board?: Partial<BoardConfig>;
  rules?: Partial<RuleConfig>;
}

export function createMatch(setup: MatchSetup): MatchState {
  const count = setup.players.length;
  if (count < MIN_PLAYERS || count > MAX_PLAYERS) {
    throw new Error(`A match needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${count}`);
  }
  if (new Set(setup.players.map((p) => p.id)).size !== count) {
    throw new Error("Player ids must be unique");
  }

  const rng = createRng(setup.seed);
  const rules = structuredClone({ ...DEFAULT_RULES, ...setup.rules });
  const board = generateBoard(count, { ...DEFAULT_BOARD, ...setup.board }, rng);

  return {
    board,
    rules,
    players: setup.players.map((p) => ({
      ...p,
      position: board.start,
      coins: rules.startingCoins,
      dice: [],
      items: [],
      defaultDie: 6,
    })),
    round: 1,
    phase: { kind: "move" },
    bossFixed: rules.bossStartFixed,
    nextD12Round: randInt(rng, rules.d12IntervalMin, rules.d12IntervalMax),
    rng,
    nextDieId: 1,
    nextItemId: 1,
    traps: [],
  };
}

export function getPlayer(state: MatchState, id: PlayerId): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`Unknown player "${id}"`);
  return player;
}

/** Placing last in a minigame forces the d4 for every roll of the next round. */
export function canUseSavedDice(player: Player): boolean {
  return player.defaultDie !== 4;
}

export function dieOptions(player: Player): DieOption[] {
  const saved = canUseSavedDice(player) ? player.dice.map((d) => ({ id: d.id, sides: d.sides })) : [];
  return [{ id: null, sides: player.defaultDie }, ...saved];
}

/** Who has to decide something in the current phase. The minigame phase takes a ranking instead. */
export function pendingDecisions(state: MatchState): Decision[] {
  const { phase } = state;
  switch (phase.kind) {
    case "move":
      return state.players.map((p) => ({
        playerId: p.id,
        kind: "move",
        dice: dieOptions(p),
        lanes: state.board.paths,
        itemsAllowed: itemsAllowed(state),
        items: p.items,
        targets: state.players.filter((o) => o.id !== p.id).map((o) => o.id),
        trapSpaces: trapSpaces(state.board, p.position, state.rules.items.trapRange),
        prices: state.rules.items.prices,
        maxHeld: state.rules.items.maxHeld,
      }));
    case "boss":
      return phase.challengers.map((id) => ({ playerId: id, kind: "boss", dice: dieOptions(getPlayer(state, id)) }));
    case "showdown":
      return phase.contenders.map((id) => ({ playerId: id, kind: "showdown", dice: dieOptions(getPlayer(state, id)) }));
    case "minigame":
    case "gameOver":
      return [];
  }
}

/** Pure: returns a new state and never mutates the one passed in. */
export function resolvePhase(state: MatchState, input: PhaseInput): PhaseResult {
  if (state.phase.kind !== input.kind) {
    throw new Error(`Expected input for the "${state.phase.kind}" phase, got "${input.kind}"`);
  }
  const { board, ...rest } = state;
  const s: MatchState = { ...structuredClone(rest), board };
  const events: MatchEvent[] = [];

  switch (input.kind) {
    case "move":
      resolveMove(s, input.choices, events);
      break;
    case "boss":
      resolveBoss(s, input.choices, events);
      break;
    case "showdown":
      resolveShowdown(s, input.choices, events);
      break;
    case "minigame":
      resolveMinigame(s, input.ranking, input.played, events);
      break;
  }
  return { state: s, events };
}

function takeDie(player: Player, dieId: string | null): { sides: number; saved: boolean } {
  if (dieId !== null && canUseSavedDice(player)) {
    const index = player.dice.findIndex((d) => d.id === dieId);
    if (index >= 0) {
      const [die] = player.dice.splice(index, 1);
      return { sides: die!.sides, saved: true };
    }
  }
  return { sides: player.defaultDie, saved: false };
}

function changeCoins(player: Player, delta: number, reason: CoinReason, events: MatchEvent[]): void {
  const applied = Math.max(-player.coins, delta);
  if (applied === 0) return;
  player.coins += applied;
  events.push({ type: "coinsChanged", playerId: player.id, delta: applied, reason });
}

function resolveMove(s: MatchState, choices: Partial<Record<PlayerId, MoveChoice>>, events: MatchEvent[]): void {
  events.push({ type: "roundStarted", round: s.round });
  const mods = resolveItems(s, choices, events);
  const lanes = new Map<PlayerId, number>();
  const moved: Player[] = [];

  for (const player of s.players) {
    const choice = choices[player.id] ?? { die: null, lane: randInt(s.rng, 0, s.board.paths - 1) };
    const lane = clampLane(choice.lane, s.board.paths);
    lanes.set(player.id, lane);

    // A Sand Die replaces whatever die the player picked, without using it up.
    const playerMods = mods.get(player.id)!;
    const die = playerMods.sandDie
      ? { sides: s.rules.items.sandDieSides, saved: false }
      : takeDie(player, choice.die);
    const rolled = rollDie(s.rng, die.sides);
    events.push({ type: "dieRolled", playerId: player.id, sides: die.sides, saved: die.saved, value: rolled });
    const value = applyRollMods(s, player.id, rolled, playerMods, events);

    const path = walkForward(s.board, player.position, value, lane);
    if (path.length > 0) {
      player.position = path[path.length - 1]!;
      moved.push(player);
      events.push({ type: "moved", playerId: player.id, path });
    }
  }

  for (const player of moved) applyLandingEffect(s, player, lanes.get(player.id)!, events);
  triggerTraps(s, events);
  resolveCollisions(s, events);

  const challengers = s.players.filter((p) => p.position === s.board.finish).map((p) => p.id);
  s.phase = challengers.length > 0 ? { kind: "boss", challengers } : { kind: "minigame" };
}

function applyLandingEffect(s: MatchState, player: Player, lane: number, events: MatchEvent[]): void {
  const space = s.board.spaces[player.position]!;
  switch (space.type) {
    case "blue":
      changeCoins(player, s.rules.blueCoins, "blueSpace", events);
      break;
    case "red":
      changeCoins(player, -s.rules.redCoins, "redSpace", events);
      break;
    case "greenArrow":
    case "purpleArrow": {
      const forward = space.type === "greenArrow";
      const path = forward
        ? walkForward(s.board, player.position, s.rules.arrowDistance, lane, { stopAtCheckpoint: true })
        : walkBackward(s.board, player.position, s.rules.arrowDistance, s.rng, { stopAtCheckpoint: true });
      if (path.length > 0) {
        player.position = path[path.length - 1]!;
        events.push({ type: "arrow", playerId: player.id, direction: forward ? "forward" : "back", path });
      }
      break;
    }
    default:
      break;
  }
}

/** Beach Party: everyone sharing a space that isn't collision-free goes back to the checkpoint behind it. */
export function resolveCollisions(s: MatchState, events: MatchEvent[]): void {
  const bySpace = new Map<SpaceId, Player[]>();
  for (const player of s.players) {
    if (s.board.spaces[player.position]!.collisionFree) continue;
    const group = bySpace.get(player.position) ?? [];
    group.push(player);
    bySpace.set(player.position, group);
  }
  for (const [spaceId, group] of bySpace) {
    if (group.length < 2) continue;
    const sentTo = s.board.spaces[spaceId]!.checkpointBehind;
    for (const player of group) player.position = sentTo;
    events.push({ type: "collision", spaceId, playerIds: group.map((p) => p.id), sentTo });
  }
}

/** One player against the boss. Ties make both sides roll again. */
export function runBossDuel(
  bossFixed: number,
  rollPlayer: () => number,
  rollBoss: () => number,
): { won: boolean; attempts: BossAttempt[] } {
  const attempts: BossAttempt[] = [];
  for (;;) {
    const playerRoll = rollPlayer();
    const bossRoll = rollBoss();
    const bossScore = bossFixed + bossRoll;
    attempts.push({ playerRoll, bossRoll, bossScore });
    if (playerRoll !== bossScore) return { won: playerRoll > bossScore, attempts };
  }
}

export function weakenBoss(bossFixed: number, losses: number, minFixed: number): number {
  return Math.max(minFixed, bossFixed - losses);
}

function resolveBoss(s: MatchState, choices: Partial<Record<PlayerId, BattleChoice>>, events: MatchEvent[]): void {
  if (s.phase.kind !== "boss") return;
  const bossFixed = s.bossFixed;
  const winners: PlayerId[] = [];
  let losses = 0;

  // Everyone arriving this round fights the same boss; the shared weakening applies afterward.
  for (const id of s.phase.challengers) {
    const player = getPlayer(s, id);
    const die = takeDie(player, choices[id]?.die ?? null);
    const duel = runBossDuel(
      bossFixed,
      () => rollDie(s.rng, die.sides),
      () => rollDie(s.rng, s.rules.bossDieSides),
    );
    events.push({ type: "bossFight", playerId: id, sides: die.sides, saved: die.saved, bossFixed, ...duel });

    if (duel.won) {
      winners.push(id);
      continue;
    }
    losses++;
    const spaces = randInt(s.rng, s.rules.knockbackMin, s.rules.knockbackMax);
    const path = walkBackward(s.board, player.position, spaces, s.rng);
    if (path.length > 0) player.position = path[path.length - 1]!;
    events.push({ type: "knockedBack", playerId: id, spaces, path });
  }

  if (losses > 0) {
    const weakened = weakenBoss(bossFixed, losses, s.rules.bossMinFixed);
    if (weakened !== bossFixed) events.push({ type: "bossWeakened", from: bossFixed, to: weakened });
    s.bossFixed = weakened;
  }

  if (winners.length === 1) endMatch(s, winners[0]!, events);
  else if (winners.length > 1) s.phase = { kind: "showdown", contenders: winners };
  else s.phase = { kind: "minigame" };
}

/** Highest roll wins; players tied for highest roll again with the same dice. */
export function runShowdown(
  contenders: PlayerId[],
  roll: (id: PlayerId) => number,
): { winner: PlayerId; rounds: Record<PlayerId, number>[] } {
  const rounds: Record<PlayerId, number>[] = [];
  let remaining = contenders;
  for (;;) {
    const rolls: Record<PlayerId, number> = {};
    for (const id of remaining) rolls[id] = roll(id);
    rounds.push(rolls);
    const best = Math.max(...Object.values(rolls));
    remaining = remaining.filter((id) => rolls[id] === best);
    if (remaining.length === 1) return { winner: remaining[0]!, rounds };
  }
}

function resolveShowdown(
  s: MatchState,
  choices: Partial<Record<PlayerId, BattleChoice>>,
  events: MatchEvent[],
): void {
  if (s.phase.kind !== "showdown") return;
  const dice = new Map<PlayerId, { sides: number; saved: boolean }>();
  for (const id of s.phase.contenders) dice.set(id, takeDie(getPlayer(s, id), choices[id]?.die ?? null));

  const { winner, rounds } = runShowdown(s.phase.contenders, (id) => rollDie(s.rng, dice.get(id)!.sides));
  for (const rolls of rounds) {
    const detailed: Record<PlayerId, { sides: number; saved: boolean; value: number }> = {};
    for (const [id, value] of Object.entries(rolls)) detailed[id] = { ...dice.get(id)!, value };
    events.push({ type: "showdownRoll", rolls: detailed });
  }
  endMatch(s, winner, events);
}

function endMatch(s: MatchState, winner: PlayerId, events: MatchEvent[]): void {
  s.phase = { kind: "gameOver", winner };
  events.push({ type: "matchWon", playerId: winner, round: s.round });
}

function validateRanking(s: MatchState, ranking: MinigameRanking): void {
  const ids = ranking.flat();
  const expected = new Set(s.players.map((p) => p.id));
  const valid =
    ranking.every((group) => group.length > 0) &&
    ids.length === expected.size &&
    new Set(ids).size === ids.length &&
    ids.every((id) => expected.has(id));
  if (!valid) throw new Error("Minigame ranking must list every player exactly once");
}

function resolveMinigame(
  s: MatchState,
  ranking: MinigameRanking,
  played: MinigamePlayed | undefined,
  events: MatchEvent[],
): void {
  validateRanking(s, ranking);
  const count = s.players.length;
  events.push(played ? { type: "minigameResults", ranking, played } : { type: "minigameResults", ranking });

  let placement = 0;
  for (const group of ranking) {
    const quartile = Math.min(3, Math.floor((placement * 4) / count));
    for (const id of group) changeCoins(getPlayer(s, id), s.rules.coinsByQuartile[quartile], "minigame", events);
    placement += group.length;
  }

  const d12Round = s.round >= s.nextD12Round;
  const diceCount = Math.ceil(count / 4);
  const order = ranking.flatMap((group) => shuffle(s.rng, group));
  order.slice(0, diceCount).forEach((id, index) => {
    const die: SavedDie = { id: `die${s.nextDieId++}`, sides: index === 0 ? (d12Round ? 12 : 10) : 8 };
    getPlayer(s, id).dice.push(die);
    events.push({ type: "dieAwarded", playerId: id, die });
  });
  if (d12Round) s.nextD12Round = s.round + randInt(s.rng, s.rules.d12IntervalMin, s.rules.d12IntervalMax);
  awardMinigameItem(s, ranking[0]!, events);

  const last = ranking.length > 1 ? new Set(ranking[ranking.length - 1]) : new Set<PlayerId>();
  for (const player of s.players) {
    const sides: DefaultDieSides = last.has(player.id) ? 4 : 6;
    if (sides !== player.defaultDie) events.push({ type: "defaultDieChanged", playerId: player.id, sides });
    player.defaultDie = sides;
  }

  s.round++;
  s.phase = { kind: "move" };
}
