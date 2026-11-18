import { DEFAULT_BOARD, generateBoard } from "./board";
import {
  applyRollMods,
  awardMinigameItem,
  consumeFloatie,
  DEFAULT_ITEM_RULES,
  ITEM_KINDS,
  itemsAllowed,
  knockOutPlayer,
  randomRewardItem,
  refreshShop,
  resolveItems,
  trapSpaces,
  triggerTraps,
} from "./items";
import { clampLane, walkBackward, walkForward } from "./movement";
import { createRng, pick, randInt, rollDie, shuffle } from "./rng";
import type {
  BattleChoice,
  BattleInitiationChoice,
  BoardTileType,
  BoardConfig,
  BossAttempt,
  CoinReason,
  Decision,
  DefaultDieSides,
  DieOption,
  ItemChoice,
  ItemEffects,
  ItemPlay,
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
  RollMods,
  SavedDie,
  SpaceId,
} from "./types";

import { isAllLast, minigameCoinPayouts } from "./payouts";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 12;

export const DEFAULT_RULES: RuleConfig = {
  startingCoins: 10,
  blueCoins: 3,
  redCoins: 3,
  arrowDistance: 3,
  bossStartFixed: 6,
  bossMinFixed: 1,
  bossDieSides: 4,
  knockbackMin: 6,
  knockbackMax: 10,
  d12IntervalMin: 3,
  d12IntervalMax: 5,
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

  const state: MatchState = {
    board,
    rules,
    players: setup.players.map((p) => ({
      ...p,
      position: board.start,
      coins: rules.startingCoins,
      dice: [],
      items: [],
      defaultDie: 6,
      skipNextMove: false,
      extraSkippedTurns: 0,
      dead: false,
      reviveRequirement: 6,
    })),
    round: 1,
    phase: { kind: "move" },
    bossFixed: rules.bossStartFixed,
    nextD12Round: randInt(rng, rules.d12IntervalMin, rules.d12IntervalMax),
    rng,
    nextDieId: 1,
    nextItemId: 1,
    traps: [],
    shop: [],
    lastRotating: [],
    pendingItems: null,
    chaosChance: 10,
    lastChaosRound: null,
    chaosSpaces: [],
  };
  if (itemsAllowed(state)) {
    state.phase = { kind: "items" };
    refreshShop(state);
  }
  return state;
}

export function getPlayer(state: MatchState, id: PlayerId): Player {
  const player = state.players.find((p) => p.id === id);
  if (!player) throw new Error(`Unknown player "${id}"`);
  return player;
}

/** Placing last in a minigame forces the d4 for every roll of the next round. */
export function canUseSavedDice(player: Player): boolean {
  return player.defaultDie !== 4 && !player.skipNextMove;
}

export function dieOptions(player: Player, allowSaved = false): DieOption[] {
  const saved = !player.skipNextMove && (canUseSavedDice(player) || allowSaved)
    ? player.dice.map((d) => ({ id: d.id, sides: d.sides }))
    : [];
  return [{ id: null, sides: player.defaultDie }, ...saved];
}

/** Who has to decide something in the current phase. The minigame phase takes a ranking instead. */
export function pendingDecisions(state: MatchState): Decision[] {
  const { phase } = state;
  switch (phase.kind) {
    case "items":
      return state.players.map((p) => ({
        playerId: p.id,
        kind: "items",
        items: p.items,
        targets: state.players.filter((o) => o.id !== p.id && !o.dead).map((o) => o.id),
        trapSpaces: trapSpaces(state.board, p.position, state.rules.items.trapRange),
        prices: state.rules.items.prices,
        shop: state.shop,
        maxHeld: state.rules.items.maxHeld,
      }));
    case "move":
      return state.players.filter((p) => !state.pendingItems?.stuck.includes(p.id)).map((p) => ({
        playerId: p.id,
        kind: "move",
        dice: state.pendingItems?.mods[p.id]?.forcedSides
          ? [{ id: null, sides: state.pendingItems.mods[p.id]!.forcedSides! }]
          : dieOptions(p, p.dead),
        lanes: state.board.paths,
        mods: state.pendingItems?.mods[p.id] ?? NO_ITEM_MODS,
      }));
    case "battleInitiation":
      return state.players.flatMap((player) => {
        const targets = battleTargets(state, player.id);
        return targets.length > 0 ? [{ playerId: player.id, kind: "battleInitiation" as const, targets }] : [];
      });
    case "battle": {
      const group = phase.groups[phase.groupIndex];
      return group?.contenders.map((id) => ({
        playerId: id,
        kind: "battle" as const,
        dice: dieOptions(getPlayer(state, id)),
      })) ?? [];
    }
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
  let itemPlays: PhaseResult["itemPlays"];

  switch (input.kind) {
    case "items":
      itemPlays = resolveItemPhase(s, input.choices, events);
      break;
    case "move":
      resolveMove(s, input.choices, events);
      break;
    case "battleInitiation":
      resolveBattleInitiation(s, input.choices);
      break;
    case "battle":
      resolveBattle(s, input.choices, events);
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
  return itemPlays ? { state: s, events, itemPlays } : { state: s, events };
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

function resolveItemPhase(
  s: MatchState,
  choices: Partial<Record<PlayerId, ItemChoice>>,
  events: MatchEvent[],
): ItemPlay[] {
  events.push({ type: "roundStarted", round: s.round });
  const { mods, forcedBack, shielded, trapImmune, stuck, jellyBattles, chaosInitiators, plays } = resolveItems(s, choices, events);
  for (const id of chaosInitiators) {
    const player = getPlayer(s, id);
    resolveChaosSpace(s, { player, spaceId: player.position, type: "monochromeChaos" }, events);
  }
  s.pendingItems = {
    mods: Object.fromEntries(mods) as ItemEffects["mods"],
    forcedBack: [...forcedBack],
    shielded: [...shielded],
    trapImmune: [...trapImmune],
    stuck: [...stuck],
    jellyBattles,
    plays,
  };
  s.phase = jellyBattles.length > 0
    ? { kind: "battle", groups: jellyBattles, groupIndex: 0, beforeMove: true }
    : { kind: "move" };
  return plays;
}

const NO_ITEM_MODS: RollMods = {
  sandDie: false,
  weights: 0,
  weightSources: [],
  booster: false,
  extraDie: false,
  extraDice: 0,
  rollBonuses: [],
  customRoll: false,
  hyperCandy: false,
  moveBackwards: false,
  pairOfCandy: false,
};

function resolveMove(s: MatchState, choices: Partial<Record<PlayerId, MoveChoice>>, events: MatchEvent[]): void {
  if (!s.pendingItems) events.push({ type: "roundStarted", round: s.round });
  const effects = s.pendingItems;
  const forcedBack = new Set(effects?.forcedBack ?? []);
  const lanes = new Map<PlayerId, number>();
  const moved: Player[] = [];
  const chaosLandings: { player: Player; spaceId: SpaceId; type: "monochromeChaos" | "rainbowChaos" }[] = [];

  for (const player of s.players) {
    if (player.skipNextMove || effects?.stuck.includes(player.id)) {
      const reasons = new Set<Extract<MatchEvent, { type: "moveSkipped" }>["reasons"][number]>();
      if (player.skipNextMove) reasons.add("maroonSpace");
      for (const play of effects?.plays ?? []) {
        if (play.status !== "resolved") continue;
        if (play.kind === "stickyCandy" && play.target === player.id) reasons.add("stickyCandy");
        if (play.kind === "moonwalkRing" && play.playerId === player.id) reasons.add("moonwalkRing");
      }
      if (player.skipNextMove) {
        if (player.extraSkippedTurns > 0) player.extraSkippedTurns--;
        else player.skipNextMove = false;
      }
      events.push({ type: "moveSkipped", playerId: player.id, reasons: [...reasons] });
      continue;
    }
    const choice = choices[player.id] ?? { die: null, lane: randInt(s.rng, 0, s.board.paths - 1) };
    const lane = clampLane(choice.lane, s.board.paths);
    lanes.set(player.id, lane);

    // A Sand Die replaces whatever die the player picked, without using it up.
    const playerMods = effects?.mods[player.id] ?? NO_ITEM_MODS;
    const die = playerMods.forcedSides
      ? { sides: playerMods.forcedSides, saved: false }
      : playerMods.sandDie
      ? { sides: s.rules.items.sandDieSides, saved: false }
      : takeDie(player, choice.die);
    const rolled = rollDie(s.rng, die.sides);
    const selectedRoll = playerMods.customRoll && Number.isInteger(choice.customSpaces)
      ? Math.max(0, Math.min(die.sides, choice.customSpaces!))
      : rolled;
    events.push({
      type: "dieRolled",
      playerId: player.id,
      sides: die.sides,
      saved: die.saved,
      value: selectedRoll,
      ...(playerMods.sandDie && playerMods.sandDieSource ? { source: playerMods.sandDieSource } : {}),
    });
    const value = applyRollMods(s, player.id, selectedRoll, playerMods, events);
    if (playerMods.hyperCandy && value > 10) {
      knockOutPlayer(s, player, "item", events, { item: "hyperCandy", sourcePlayerId: player.id });
      continue;
    }

    let spacesToMove = value;
    if (player.dead) {
      const requirement = player.reviveRequirement;
      if (value < requirement) {
        player.reviveRequirement = Math.max(1, requirement - 1);
        events.push({
          type: "revivalFailed",
          playerId: player.id,
          rolled: value,
          requirement,
          nextRequirement: player.reviveRequirement,
        });
        continue;
      }
      player.dead = false;
      player.reviveRequirement = 6;
      spacesToMove = Math.max(0, value - requirement);
      events.push({ type: "playerRevived", playerId: player.id, rolled: value, requirement, spaces: spacesToMove });
    }
    const path = playerMods.moveBackwards
      ? walkBackward(s.board, player.position, spacesToMove, s.rng, { stopAtCheckpoint: true })
      : walkForward(s.board, player.position, spacesToMove, lane);
    if (path.length > 0) {
      player.position = path[path.length - 1]!;
      moved.push(player);
      events.push({ type: "moved", playerId: player.id, path });
    }
  }

  for (const player of moved) {
    applyLandingEffect(s, player, lanes.get(player.id)!, events, chaosLandings, effects?.mods[player.id]?.pairOfCandy ?? false);
  }
  triggerTraps(s, events, new Set(effects?.shielded ?? []), new Set(effects?.trapImmune ?? []));
  resolveCollisions(s, forcedBack, events);
  chaosLandings.sort((a, b) =>
    s.board.spaces[a.spaceId]!.distanceToFinish - s.board.spaces[b.spaceId]!.distanceToFinish,
  );
  for (const landing of chaosLandings) resolveChaosSpace(s, landing, events);

  s.pendingItems = null;
  const battleCanStart = s.players.some((player) => battleTargets(s, player.id).length > 0);
  if (s.round > 1 && battleCanStart) {
    const challengers = s.players
      .filter((player) => !player.dead && player.position === s.board.finish)
      .map((player) => player.id);
    s.phase = challengers.length > 0
      ? { kind: "boss", challengers, afterBattleInitiation: true }
      : { kind: "battleInitiation" };
  } else {
    setAfterMovementPhase(s);
  }
}

function setAfterMovementPhase(s: MatchState): void {
  const challengers = s.players.filter((p) => !p.dead && p.position === s.board.finish).map((p) => p.id);
  s.phase = challengers.length > 0 ? { kind: "boss", challengers } : { kind: "minigame" };
}

/** Other living players currently sharing your space and eligible to battle. */
export function battleTargets(s: MatchState, playerId: PlayerId): PlayerId[] {
  const player = s.players.find((candidate) => candidate.id === playerId);
  if (!player || player.dead || player.position === s.board.finish) return [];
  return s.players
    .filter((other) =>
      other.id !== playerId && !other.dead &&
      other.position !== s.board.finish && other.position === player.position,
    )
    .map((other) => other.id);
}

function resolveBattleInitiation(
  s: MatchState,
  choices: Partial<Record<PlayerId, BattleInitiationChoice>>,
): void {
  if (s.phase.kind !== "battleInitiation") return;
  const edges = new Map<PlayerId, PlayerId>();
  for (const player of s.players) {
    const target = choices[player.id]?.target;
    if (target !== null && target !== undefined && battleTargets(s, player.id).includes(target)) {
      edges.set(player.id, target);
    }
  }
  const groups: { spaceId: SpaceId; contenders: PlayerId[] }[] = [];
  const visited = new Set<PlayerId>();
  for (const [initiator, target] of edges) {
    if (visited.has(initiator)) continue;
    const spaceId = s.players.find((player) => player.id === initiator)!.position;
    const group = new Set<PlayerId>();
    const queue = [initiator, target];
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (group.has(id)) continue;
      group.add(id);
      const challenged = edges.get(id);
      if (challenged) queue.push(challenged);
      for (const [from, to] of edges) if (to === id) queue.push(from);
    }
    for (const id of group) visited.add(id);
    groups.push({ spaceId, contenders: s.players.filter((player) => group.has(player.id)).map((player) => player.id) });
  }
  if (groups.length > 0) s.phase = { kind: "battle", groups, groupIndex: 0 };
  else setAfterMovementPhase(s);
}

function resolveBattle(s: MatchState, choices: Partial<Record<PlayerId, BattleChoice>>, events: MatchEvent[]): void {
  if (s.phase.kind !== "battle") return;
  const { groups, groupIndex, beforeMove } = s.phase;
  const group = groups[groupIndex];
  if (!group) {
    if (beforeMove) s.phase = { kind: "move" };
    else setAfterMovementPhase(s);
    return;
  }
  const contenders = group.contenders.filter((id) => !getPlayer(s, id).dead);
  if (contenders.length < 2) {
    advanceBattleGroups(s, groups, groupIndex + 1, beforeMove);
    return;
  }
  const dice = new Map<PlayerId, { sides: number; saved: boolean }>();
  for (const id of contenders) dice.set(id, takeDie(getPlayer(s, id), choices[id]?.die ?? null));
  const { winner, rounds } = runShowdown(contenders, (id) => rollDie(s.rng, dice.get(id)!.sides));
  for (const rolls of rounds) {
    const detailed: Record<PlayerId, { sides: number; saved: boolean; value: number }> = {};
    for (const [id, value] of Object.entries(rolls)) detailed[id] = { ...dice.get(id)!, value };
    events.push({ type: "showdownRoll", battle: true, rolls: detailed });
  }
  const losers = contenders.filter((id) => id !== winner);
  for (const id of losers) {
    knockOutPlayer(
      s,
      getPlayer(s, id),
      "battle",
      events,
      {
        ...(beforeMove ? { item: "jellyBoxingGloves" as const } : {}),
        sourcePlayerId: beforeMove ? group.contenders[0]! : winner,
      },
    );
  }
  events.push({ type: "battleFinished", spaceId: group.spaceId, winner, losers });
  advanceBattleGroups(s, groups, groupIndex + 1, beforeMove);
}

function advanceBattleGroups(
  s: MatchState,
  groups: { spaceId: SpaceId; contenders: PlayerId[] }[],
  fromIndex: number,
  beforeMove = false,
): void {
  let groupIndex = fromIndex;
  while (groupIndex < groups.length && groups[groupIndex]!.contenders.filter((id) => !getPlayer(s, id).dead).length < 2) groupIndex++;
  if (groupIndex < groups.length) s.phase = { kind: "battle", groups, groupIndex, ...(beforeMove ? { beforeMove: true } : {}) };
  else if (beforeMove) s.phase = { kind: "move" };
  else setAfterMovementPhase(s);
}

function applyLandingEffect(
  s: MatchState,
  player: Player,
  lane: number,
  events: MatchEvent[],
  chaosLandings: { player: Player; spaceId: SpaceId; type: "monochromeChaos" | "rainbowChaos" }[],
  pairOfCandy = false,
): void {
  const triggered = new Set<SpaceId>();
  let chain = 0;
  let moveChain = 0;
  let firstLanding = true;
  for (;;) {
    const space = s.board.spaces[player.position]!;
    if (triggered.has(space.id)) return;
    triggered.add(space.id);
    const double = firstLanding && pairOfCandy && space.type !== "black";
    if (double) events.push({ type: "pairEffect", playerId: player.id, spaceId: space.id });
    firstLanding = false;
    switch (space.type) {
      case "white":
        return;
      case "black":
        killPlayer(s, player, "blackSpace", events);
        return;
      case "blue":
        changeCoins(player, s.rules.blueCoins, "blueSpace", events);
        if (double) changeCoins(player, s.rules.blueCoins, "blueSpace", events);
        return;
      case "red":
        changeCoins(player, -s.rules.redCoins, "redSpace", events);
        if (double) changeCoins(player, -s.rules.redCoins, "redSpace", events);
        return;
      case "green": {
        const count = double ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const kind = randomRewardItem(s, 0.3);
          const item = { id: `item${s.nextItemId++}`, kind };
          if (player.items.length < s.rules.items.maxHeld) {
            player.items.push(item);
            events.push({ type: "spaceEffect", playerId: player.id, spaceId: space.id, effect: "item", item });
          } else {
            events.push({ type: "itemAwardSkipped", playerId: player.id, kind });
          }
        }
        return;
      }
      case "orange":
      case "purple": {
        const forward = space.type === "orange";
        for (let repeat = 0; repeat < (double ? 2 : 1); repeat++) {
          const distance = randInt(s.rng, 2, 4);
          const path = forward
            ? walkForward(s.board, player.position, distance, lane, { stopAtCheckpoint: true })
            : walkBackward(s.board, player.position, distance, s.rng, { stopAtCheckpoint: true });
          if (path.length === 0) break;
          player.position = path[path.length - 1]!;
          events.push({ type: "arrow", playerId: player.id, direction: forward ? "forward" : "back", path, chain: chain++ });
        }
        break;
      }
      case "pink": {
        for (let repeat = 0; repeat < (double ? 2 : 1); repeat++) {
          const sides = player.defaultDie;
          const value = rollDie(s.rng, sides);
          events.push({ type: "dieRolled", playerId: player.id, sides, saved: false, value });
          events.push({ type: "spaceEffect", playerId: player.id, spaceId: space.id, effect: "pinkRoll" });
          const path = walkForward(s.board, player.position, value, lane);
          if (path.length === 0) break;
          player.position = path[path.length - 1]!;
          events.push({ type: "moved", playerId: player.id, path, chain: ++moveChain });
        }
        break;
      }
      case "maroon":
        player.skipNextMove = true;
        if (double) player.extraSkippedTurns++;
        events.push({ type: "spaceEffect", playerId: player.id, spaceId: space.id, effect: "skip" });
        return;
      case "monochromeChaos":
      case "rainbowChaos":
        chaosLandings.push({ player, spaceId: space.id, type: space.type });
        if (double) chaosLandings.push({ player, spaceId: space.id, type: space.type });
        const chaosIndex = s.chaosSpaces.findIndex((chaos) => chaos.spaceId === space.id);
        if (chaosIndex >= 0) {
          s.board.spaces[space.id]!.type = s.chaosSpaces[chaosIndex]!.previousType;
          s.chaosSpaces.splice(chaosIndex, 1);
        }
        return;
      default:
        return;
    }
  }
}

/**
 * Natural collisions, then Collision-item victims. A Floatie saves its holder once per round
 * against either, and is used up. Only the Floatie holder stays in a real collision.
 */
export function resolveCollisions(s: MatchState, forcedBack: ReadonlySet<PlayerId>, events: MatchEvent[]): void {
  const alreadySent = new Set<PlayerId>();
  const bySpace = new Map<SpaceId, Player[]>();
  for (const player of s.players) {
    if (player.dead) continue;
    if (s.board.spaces[player.position]!.collisionFree) continue;
    const group = bySpace.get(player.position) ?? [];
    group.push(player);
    bySpace.set(player.position, group);
  }
  for (const [spaceId, group] of bySpace) {
    if (group.length < 2) continue;
    const sentTo = s.board.spaces[spaceId]!.checkpointBehind;
    const saved: PlayerId[] = [];
    for (const player of group) {
      if (consumeFloatie(player, spaceId, events)) {
        saved.push(player.id);
        continue;
      }
      player.position = sentTo;
      alreadySent.add(player.id);
    }
    events.push({ type: "collision", spaceId, playerIds: group.map((p) => p.id), sentTo, saved: saved.length ? saved : undefined });
  }

  for (const id of forcedBack) {
    if (alreadySent.has(id)) continue;
    const player = getPlayer(s, id);
    const spaceId = player.position;
    if (consumeFloatie(player, spaceId, events)) continue;
    const sentTo = s.board.spaces[spaceId]!.checkpointBehind;
    if (sentTo === spaceId) continue;
    player.position = sentTo;
    events.push({ type: "forcedBack", playerId: id, spaceId, sentTo });
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
  return Math.max(minFixed, bossFixed - (losses > 0 ? 1 : 0));
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
  else s.phase = s.phase.afterBattleInitiation
    ? { kind: "battleInitiation" }
    : { kind: "minigame" };
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
  const allLast = isAllLast(ranking, played);
  const last = ranking.length > 1 || allLast
    ? new Set(ranking[ranking.length - 1])
    : new Set<PlayerId>();
  const payouts = minigameCoinPayouts(count);

  let placement = 0;
  for (const group of ranking) {
    for (const id of group) {
      changeCoins(getPlayer(s, id), last.has(id) ? 0 : payouts[placement]!, "minigame", events);
    }
    placement += group.length;
  }

  const d12Round = s.round >= s.nextD12Round;
  const diceCount = Math.min(3, Math.ceil(count / 4));
  if (ranking.length > 1 && !allLast) {
    for (const playerId of ranking[0]!) {
      const die: SavedDie = { id: `die${s.nextDieId++}`, sides: d12Round ? 12 : 10 };
      getPlayer(s, playerId).dice.push(die);
      events.push({ type: "dieAwarded", playerId, die });
    }
  }
  const d8Groups: PlayerId[][] = [];
  let placementAfterFirst = ranking[0]?.length ?? 0;
  for (const group of ranking.slice(1)) {
    if (placementAfterFirst >= diceCount || group === ranking.at(-1)) break;
    d8Groups.push(group);
    placementAfterFirst += group.length;
  }
  for (const group of d8Groups) {
    for (const id of group) {
      const die: SavedDie = { id: `die${s.nextDieId++}`, sides: 8 };
      getPlayer(s, id).dice.push(die);
      events.push({ type: "dieAwarded", playerId: id, die });
    }
  }
  if (d12Round) s.nextD12Round = s.round + randInt(s.rng, s.rules.d12IntervalMin, s.rules.d12IntervalMax);
  if (!allLast) awardMinigameItem(s, ranking[0]!, events);

  for (const player of s.players) {
    const sides: DefaultDieSides = last.has(player.id) ? 4 : 6;
    if (sides !== player.defaultDie) events.push({ type: "defaultDieChanged", playerId: player.id, sides });
    player.defaultDie = sides;
  }

  s.round++;
  placeChaosSpace(s, events);
  s.phase = itemsAllowed(s) ? { kind: "items" } : { kind: "move" };
  refreshShop(s);
}

function placeChaosSpace(s: MatchState, events: MatchEvent[]): void {
  if (s.round < 4 || s.lastChaosRound === s.round - 1) return;
  if (randInt(s.rng, 1, 100) > s.chaosChance) {
    s.chaosChance = Math.min(100, s.chaosChance + 10);
    return;
  }

  const candidates = s.board.spaces.filter((space) =>
    space.lane !== null && space.type !== "black" &&
    space.type !== "monochromeChaos" && space.type !== "rainbowChaos",
  );
  if (candidates.length === 0) return;
  const firstPlace = [...s.players].sort((a, b) =>
    s.board.spaces[a.position]!.distanceToFinish - s.board.spaces[b.position]!.distanceToFinish,
  )[0]!;
  const firstDistance = s.board.spaces[firstPlace.position]!.distanceToFinish;
  const minDistance = firstDistance <= 10 ? 1 : firstDistance - 10;
  const maxDistance = firstDistance <= 10 ? 10 : firstDistance - 1;
  const inRange = candidates.filter((space) =>
    space.distanceToFinish >= minDistance && space.distanceToFinish <= maxDistance,
  );
  if (inRange.length === 0) return;
  const space = pick(s.rng, inRange);
  const previousType = space.type as BoardTileType;
  const spaceType = randInt(s.rng, 1, 100) <= 90 ? "monochromeChaos" : "rainbowChaos";
  space.type = spaceType;
  s.chaosSpaces.push({ spaceId: space.id, previousType });
  s.lastChaosRound = s.round;
  s.chaosChance = 10;
  events.push({ type: "chaosSpacePlaced", spaceId: space.id, spaceType, round: s.round });
}

function resolveChaosSpace(
  s: MatchState,
  landing: { player: Player; spaceId: SpaceId; type: "monochromeChaos" | "rainbowChaos" },
  events: MatchEvent[],
): void {
  const { player: initiator, type } = landing;
  const players = s.players;
  if (type === "monochromeChaos") {
    const target = pick(s.rng, players.filter((player) => player.id !== initiator.id));
    const option = randInt(s.rng, 0, 14);
    const coinAmounts = [3, 5, 10, 20, 30];
    if (option < 10) {
      const giver = option % 2 === 0 ? initiator : target;
      const receiver = giver === initiator ? target : initiator;
      const requested = coinAmounts[Math.floor(option / 2)]!;
      const given = transferCoins(s, giver, receiver, requested, events);
      chaosEvent(
        events, type, initiator,
        `${giver.name} gives ${requested} coins to ${receiver.name}.`,
        target.id,
        [{ giver: giver.id, receiver: receiver.id, requested, given }],
      );
    } else if (option === 10) {
      [initiator.coins, target.coins] = [target.coins, initiator.coins];
      chaosEvent(events, type, initiator, `${initiator.name} and ${target.name} swap coins.`, target.id);
    } else if (option === 11) {
      const giver = randInt(s.rng, 0, 1) === 0 ? initiator : target;
      const receiver = giver === initiator ? target : initiator;
      const item = giver.items.length > 0 ? pick(s.rng, giver.items) : undefined;
      if (item) {
        giver.items.splice(giver.items.indexOf(item), 1);
        receiver.items.push(item);
      }
      chaosEvent(
        events, type, initiator,
        item ? `${giver.name} gives an item to ${receiver.name}.` : "No item changed hands.",
        target.id,
        undefined,
        item ? [{ giver: giver.id, receiver: receiver.id, items: [item.kind] }] : [],
      );
    } else if (option === 12) {
      const initiatorItems = initiator.items.map((item) => item.kind);
      const targetItems = target.items.map((item) => item.kind);
      [initiator.items, target.items] = [target.items, initiator.items];
      chaosEvent(events, type, initiator, `${initiator.name} and ${target.name} swap items.`, target.id, undefined, [
        ...(initiatorItems.length ? [{ giver: initiator.id, receiver: target.id, items: initiatorItems }] : []),
        ...(targetItems.length ? [{ giver: target.id, receiver: initiator.id, items: targetItems }] : []),
      ]);
    } else if (option === 13) {
      const mover = randInt(s.rng, 0, 1) === 0 ? initiator : target;
      const other = mover === initiator ? target : initiator;
      const from = mover.position;
      mover.position = other.position;
      chaosEvent(events, type, initiator, `${mover.name} teleports to ${other.name}'s space.`, target.id, undefined, undefined, [
        { playerId: mover.id, from, to: mover.position },
      ]);
    } else {
      const initiatorFrom = initiator.position;
      const targetFrom = target.position;
      [initiator.position, target.position] = [target.position, initiator.position];
      chaosEvent(events, type, initiator, `${initiator.name} and ${target.name} swap spaces.`, target.id, undefined, undefined, [
        { playerId: initiator.id, from: initiatorFrom, to: initiator.position },
        { playerId: target.id, from: targetFrom, to: target.position },
      ]);
    }
    return;
  }

  const option = randInt(s.rng, 0, 6);
  const ranked = [...players].sort((a, b) =>
    s.board.spaces[a.position]!.distanceToFinish - s.board.spaces[b.position]!.distanceToFinish,
  );
  if (option === 0 || option === 1) {
    const givingCoins = option === 0;
    const direction = randInt(s.rng, 0, 1) === 0 ? 1 : -1;
    const snapshots = ranked.map((player) => givingCoins ? player.coins : [...player.items]);
    const itemTransfers: NonNullable<Extract<MatchEvent, { type: "chaosOutcome" }>["itemTransfers"]> = [];
    if (!givingCoins) ranked.forEach((player) => { player.items = []; });
    const coinTransfers: NonNullable<Extract<MatchEvent, { type: "chaosOutcome" }>["coinTransfers"]> = [];
    ranked.forEach((giver, index) => {
      const receiver = ranked[(index + direction + ranked.length) % ranked.length]!;
      if (givingCoins) {
        const requested = snapshots[index] as number;
        const given = transferCoins(s, giver, receiver, requested, events);
        coinTransfers.push({ giver: giver.id, receiver: receiver.id, requested, given });
      }
      else {
        const items = snapshots[index] as Player["items"];
        receiver.items.push(...items);
        if (items.length) itemTransfers.push({ giver: giver.id, receiver: receiver.id, items: items.map((item) => item.kind) });
      }
    });
    chaosEvent(events, type, initiator, givingCoins
      ? "Everyone passed their coins to a neighboring rank."
      : "Everyone passed items to neighboring ranks.",
    undefined,
    givingCoins ? coinTransfers : undefined,
    givingCoins ? undefined : itemTransfers);
  } else if (option === 2) {
    const average = Math.floor(players.reduce((sum, player) => sum + player.coins, 0) / players.length);
    players.forEach((player) => { player.coins = average; });
    chaosEvent(events, type, initiator, `Everyone's coins were averaged to ${average} each.`);
  } else if (option === 3) {
    players.forEach((player) => { player.coins = 0; });
    chaosEvent(events, type, initiator, "Everyone lost all their coins.");
  } else if (option === 4) {
    const itemTransfers = players.flatMap((player) =>
      player.items.length ? [{ giver: player.id, items: player.items.map((item) => item.kind) }] : [],
    );
    players.forEach((player) => { player.items = []; });
    chaosEvent(events, type, initiator, "Everyone lost their items.", undefined, undefined, itemTransfers);
  } else if (option === 5) {
    players.forEach((player) => killPlayer(s, player, "rainbowChaos", events));
    chaosEvent(events, type, initiator, "Knock all players out.");
  } else {
    const positions = shuffle(s.rng, players.map((player) => player.position));
    const teleports = players.map((player, index) => ({
      playerId: player.id,
      from: player.position,
      to: positions[index]!,
    }));
    players.forEach((player, index) => { player.position = positions[index]!; });
    chaosEvent(events, type, initiator, "Everyone teleports to randomly swapped spaces.", undefined, undefined, undefined, teleports);
  }
}

function killPlayer(
  s: MatchState,
  player: Player,
  reason: Extract<MatchEvent, { type: "playerDied" }>["reason"],
  events: MatchEvent[],
): void {
  knockOutPlayer(s, player, reason, events);
}

function transferCoins(s: MatchState, giver: Player, receiver: Player, amount: number, events: MatchEvent[]): number {
  const moved = Math.min(giver.coins, amount);
  giver.coins -= moved;
  receiver.coins += moved;
  if (moved > 0) {
    events.push({ type: "coinsChanged", playerId: giver.id, delta: -moved, reason: "chaos" });
    events.push({ type: "coinsChanged", playerId: receiver.id, delta: moved, reason: "chaos" });
  }
  return moved;
}

function chaosEvent(
  events: MatchEvent[],
  spaceType: "monochromeChaos" | "rainbowChaos",
  player: Player,
  description: string,
  targetPlayerId?: PlayerId,
  coinTransfers?: Extract<MatchEvent, { type: "chaosOutcome" }>["coinTransfers"],
  itemTransfers?: Extract<MatchEvent, { type: "chaosOutcome" }>["itemTransfers"],
  teleports?: Extract<MatchEvent, { type: "chaosOutcome" }>["teleports"],
): void {
  events.push({
    type: "chaosOutcome",
    spaceType,
    playerId: player.id,
    targetPlayerId,
    description,
    ...(coinTransfers ? { coinTransfers } : {}),
    ...(itemTransfers ? { itemTransfers } : {}),
    ...(teleports ? { teleports } : {}),
  });
}
