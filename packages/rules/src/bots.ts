import { BOUGHT_ITEM, checkBuy, ITEMS, trapSpaces } from "./items";
import { canUseSavedDice, getPlayer, pendingDecisions } from "./match";
import { walkForward } from "./movement";
import { nextFloat, pick, randInt, shuffle, type Rng } from "./rng";
import type {
  BattleChoice,
  BattleInitiationChoice,
  ItemChoice,
  ItemKind,
  ItemUse,
  MatchState,
  MinigameRanking,
  MoveChoice,
  OwnedItem,
  PhaseInput,
  Player,
  PlayerId,
} from "./types";

/** Bots usually save their best dice for battles, but sometimes spend a lower-tier die on movement. */
export function botMoveChoice(state: MatchState, playerId: PlayerId, rng: Rng): MoveChoice {
  const player = getPlayer(state, playerId);
  const mods = state.pendingItems?.mods[playerId];
  let die: string | null = null;
  if (!player.skipNextMove && player.dice.length > 0 && !mods?.hyperCandy) {
    const saved = [...player.dice].sort((a, b) => a.sides - b.sides);
    if (player.dead) {
      const successChance = (sides: number) =>
        Math.max(0, Math.min(sides, sides - player.reviveRequirement + 1)) / sides;
      const defaultChance = successChance(player.defaultDie);
      const usefulDice = saved.filter((candidate) => successChance(candidate.sides) > defaultChance);
      // Revival is urgent; use a die when it helps, while still favoring lower tiers.
      if (usefulDice.length > 0 && nextFloat(rng) < 0.75) {
        const useHigherTier = usefulDice.length > 1 && nextFloat(rng) < 0.15;
        die = (useHigherTier ? usefulDice.at(-1)! : usefulDice[0]!).id;
      }
    } else if (canUseSavedDice(player)) {
      const candidate = saved[0]!;
      const useChance = candidate.sides <= 8 ? 0.25 : candidate.sides <= 10 ? 0.10 : 0.03;
      if (nextFloat(rng) < useChance) die = candidate.id;
    }
  }
  const lane = randInt(rng, 0, state.board.paths - 1);
  if (mods?.customRoll) {
    const savedSides = player.dice.find((candidate) => candidate.id === die)?.sides;
    const sides = mods.forcedSides ?? (mods.sandDie ? state.rules.items.sandDieSides : savedSides ?? player.defaultDie);
    const hazards = new Set(["black", "maroon", "purple"]);
    const safeSpaces = Array.from({ length: sides + 1 }, (_, spaces) => spaces).filter((spaces) => {
      const path = walkForward(state.board, player.position, spaces, lane);
      const destination = path.at(-1);
      if (destination === undefined) return true;
      const landingType = state.board.spaces[destination]!.type;
      return !hazards.has(landingType);
    });
    return { die, lane, customSpaces: safeSpaces.length > 0 ? Math.max(...safeSpaces) : 0 };
  }
  return { die, lane };
}

/** Bots sometimes use an item and sometimes buy one, in the item phase. */
export function botItemChoice(state: MatchState, playerId: PlayerId, rng: Rng): ItemChoice {
  const player = getPlayer(state, playerId);
  const usable = player.items.filter((i) => !ITEMS[i.kind].passive);
  const holySugarDust = player.dead
    ? usable.find((item) => item.kind === "holySugarDust")
    : undefined;
  let use = holySugarDust
    ? { itemId: holySugarDust.id }
    : nextFloat(rng) < 0.5 ? botItemUse(state, player, usable, rng) : null;
  const buy = nextFloat(rng) < 0.5 ? botPurchase(state, player, use !== null, rng) : null;
  if (buy && !use && !ITEMS[buy].passive && nextFloat(rng) < 0.5) {
    use = botItemUse(state, player, [{ id: BOUGHT_ITEM, kind: buy }], rng);
  }
  return { use, buy };
}

function distance(state: MatchState, player: Player): number {
  return state.board.spaces[player.position]!.distanceToFinish;
}

function boardDistance(state: MatchState, from: number, to: number): number {
  if (from === to) return 0;
  const seen = new Set<number>([from]);
  let frontier = [from];
  for (let length = 1; frontier.length > 0; length++) {
    const next: number[] = [];
    for (const id of frontier) {
      const space = state.board.spaces[id]!;
      for (const adjacent of [...space.next, ...space.prev]) {
        if (adjacent === to) return length;
        if (!seen.has(adjacent)) {
          seen.add(adjacent);
          next.push(adjacent);
        }
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

/** Living-player leaderboard order, with ties kept in seat order. */
function leaderboard(state: MatchState): Player[] {
  return state.players
    .filter((candidate) => !candidate.dead)
    .sort((a, b) => distance(state, a) - distance(state, b));
}

function anyonePassedFirstCheckpoint(state: MatchState): boolean {
  const checkpoint = state.board.spaces.find((space) => space.type === "checkpoint" && space.segment === 0);
  return checkpoint !== undefined && state.players.some((player) => distance(state, player) < checkpoint.distanceToFinish);
}

/** Bots favor the leader but may choose a player in a lower placement tier. */
function botItemUse(state: MatchState, player: Player, items: OwnedItem[], rng: Rng): ItemUse | null {
  if (items.length === 0) return null;
  const item = pick(rng, items);
  const others = state.players.filter((p) => p.id !== player.id && !p.dead);
  const targetTiers: Player[][] = [];
  for (const target of [...others].sort((a, b) => distance(state, a) - distance(state, b))) {
    const tier = targetTiers.at(-1);
    if (tier && distance(state, tier[0]!) === distance(state, target)) tier.push(target);
    else targetTiers.push([target]);
  }
  let selectedTier = 0;
  while (selectedTier < targetTiers.length - 1 && nextFloat(rng) >= 2 / 3) selectedTier++;
  const target = targetTiers.length > 0 ? pick(rng, targetTiers[selectedTier]!) : undefined;
  switch (item.kind) {
    case "coinThief": {
      if (others.length === 0) return null;
      const maxCoins = Math.max(...others.map((other) => other.coins));
      const richest = others.filter((other) => other.coins === maxCoins);
      return { itemId: item.id, target: pick(rng, richest).id };
    }
    case "weight":
    case "sandDie":
    case "shove":
    case "collision":
      if (!target || !anyonePassedFirstCheckpoint(state)) return null;
      return { itemId: item.id, target: target.id };
    case "stickyCandy":
    case "poisonedBread":
    case "jellyBoxingGloves":
    case "trainedMimic": {
      if (!target) return null;
      if (item.kind === "trainedMimic" && target.items.length === 0) return null;
      return { itemId: item.id, target: target.id };
    }
    case "candyGun": {
      const certainTargets = others.filter((other) => boardDistance(state, player.position, other.position) <= 3);
      if (certainTargets.length === 0) return null;
      return { itemId: item.id, target: pick(rng, certainTargets).id };
    }
    case "candyExplosion": {
      const usefulTargets = others.filter((candidate) =>
        boardDistance(state, player.position, candidate.position) > 2 &&
        others.some((other) =>
        other.id !== candidate.id && boardDistance(state, candidate.position, other.position) <= 2,
      ));
      if (usefulTargets.length === 0) return null;
      const bestTargets = usefulTargets.filter((candidate) =>
        others.filter((other) => boardDistance(state, candidate.position, other.position) <= 2).length ===
        Math.max(...usefulTargets.map((potential) =>
          others.filter((other) => boardDistance(state, potential.position, other.position) <= 2).length,
        )),
      );
      const closestToEnd = Math.min(...bestTargets.map((candidate) => distance(state, candidate)));
      const bestClusterAndProgress = bestTargets.filter((candidate) => distance(state, candidate) === closestToEnd);
      return { itemId: item.id, target: pick(rng, bestClusterAndProgress).id };
    }
    case "shield": {
      const ahead = others.filter((p) => distance(state, p) < distance(state, player)).length;
      return ahead < 2 ? { itemId: item.id } : null;
    }
    case "sandTrap": {
      const spaces = trapSpaces(state.board, player.position, state.rules.items.trapRange);
      return spaces.length > 0 ? { itemId: item.id, space: pick(rng, spaces) } : null;
    }
    case "itemTrap":
    case "deathTrap": {
      const spaces = trapSpaces(state.board, player.position, state.rules.items.trapRange);
      return spaces.length > 0 ? { itemId: item.id, space: pick(rng, spaces) } : null;
    }
    case "mimic":
      if (!others.some((other) => other.items.length > 0)) return null;
      return { itemId: item.id };
    case "swapCandy":
      {
        const order = leaderboard(state);
        const rank = order.findIndex((candidate) => candidate.id === player.id);
        const firstPlace = order[0];
        const behindFirst = firstPlace
          ? distance(state, player) - distance(state, firstPlace)
          : 0;
        const minimumRank = Math.ceil(order.length / 2);
        if (rank < minimumRank || behindFirst < 10 || nextFloat(rng) >= 0.75) return null;
        return { itemId: item.id };
      }
    case "chaosCandy":
    case "batchPoisonedCandy":
    case "magicSugarDice":
    case "sugarAbsorb":
    case "pairOfCandy":
    case "bread":
    case "chocolateCoinBag":
    case "hyperCandy":
    case "customDiceRoll":
    case "powerCreep":
    case "holySugarDust":
      if (item.kind === "holySugarDust" && !player.dead) return null;
      if (item.kind === "hyperCandy" && player.defaultDie !== 4 && player.defaultDie !== 6) return null;
      return { itemId: item.id };
    case "moonwalkRing": {
      const order = leaderboard(state);
      const rank = order.findIndex((candidate) => candidate.id === player.id);
      if (rank < 0) return null;
      const frontness = order.length <= 1 ? 1 : 1 - rank / (order.length - 1);
      const useChance = 0.2 + frontness * 0.6;
      return nextFloat(rng) < useChance ? { itemId: item.id } : null;
    }
    case "candyShotgun":
      return others.some((other) =>
        distance(state, other) < distance(state, player) &&
        distance(state, player) - distance(state, other) <= 3,
      ) ? { itemId: item.id } : null;
    case "candySniper": {
      const firstPlace = Math.min(...state.players.filter((candidate) => !candidate.dead).map((candidate) => distance(state, candidate)));
      const leaders = others.filter((other) => distance(state, other) === firstPlace);
      return distance(state, player) > firstPlace && leaders.length > 0 ? { itemId: item.id } : null;
    }
    case "candyMissile":
      return others.length > 0 ? { itemId: item.id } : null;
    case "chocolateCoinMachine":
    case "infiniteItemBag": {
      const threshold = item.kind === "chocolateCoinMachine" ? 4 : 15;
      const amount = Math.floor(player.coins / threshold) * threshold;
      return item.kind === "infiniteItemBag" || amount >= threshold ? { itemId: item.id, amount } : null;
    }
    case "booster":
    case "extraDie":
      return { itemId: item.id };
    case "floatie":
    case "candySpirit":
    case "ghostFeet":
      return null;
  }
}

function botPurchase(state: MatchState, player: Player, using: boolean, rng: Rng): ItemKind | null {
  const affordable = state.shop.filter((kind) => checkBuy(state, player, kind, using) === null);
  return affordable.length > 0 ? pick(rng, affordable) : null;
}

export function botBattleChoice(state: MatchState, playerId: PlayerId): BattleChoice {
  const player = getPlayer(state, playerId);
  if (!canUseSavedDice(player)) return { die: null };
  const best = player.dice.reduce<(typeof player.dice)[number] | undefined>(
    (top, die) => (!top || die.sides > top.sides ? die : top),
    undefined,
  );
  return { die: best && best.sides > player.defaultDie ? best.id : null };
}

export function botBattleInitiationChoice(
  state: MatchState,
  playerId: PlayerId,
  targets: PlayerId[],
  rng: Rng,
): BattleInitiationChoice {
  const player = getPlayer(state, playerId);
  if (player.defaultDie === 4) return { target: null };
  const startDistance = state.board.spaces[state.board.start]!.distanceToFinish;
  const currentDistance = state.board.spaces[player.position]!.distanceToFinish;
  const progress = startDistance > 0 ? Math.max(0, Math.min(1, (startDistance - currentDistance) / startDistance)) : 1;
  const initiationChance = 0.1 + progress * 0.6;
  if (targets.length === 0 || nextFloat(rng) >= initiationChance) return { target: null };
  const d4Targets = targets.filter((id) => getPlayer(state, id).defaultDie === 4);
  return {
    target: d4Targets.length > 0 && nextFloat(rng) < 0.8 ? pick(rng, d4Targets) : pick(rng, targets),
  };
}

/** Stand-in until real minigames exist: a random finishing order with no ties. */
export function randomMinigameRanking(state: MatchState, rng: Rng): MinigameRanking {
  return shuffle(
    rng,
    state.players.map((p) => p.id),
  ).map((id) => [id]);
}

/** Builds the input for the current phase as if every player were a bot. */
export function botPhaseInput(state: MatchState, rng: Rng): PhaseInput {
  const { phase } = state;
  switch (phase.kind) {
    case "items":
      return {
        kind: "items",
        choices: Object.fromEntries(state.players.map((p) => [p.id, botItemChoice(state, p.id, rng)])),
      };
    case "move":
      return {
        kind: "move",
        choices: Object.fromEntries(state.players.map((p) => [p.id, botMoveChoice(state, p.id, rng)])),
      };
    case "battleInitiation":
      return {
        kind: "battleInitiation",
        choices: Object.fromEntries(
          pendingDecisions(state)
            .filter((decision) => decision.kind === "battleInitiation")
            .map((decision) => [
              decision.playerId,
              botBattleInitiationChoice(state, decision.playerId, decision.targets, rng),
            ]),
        ),
      };
    case "battle":
      return {
        kind: "battle",
        choices: Object.fromEntries(
          pendingDecisions(state).map((decision) => [decision.playerId, botBattleChoice(state, decision.playerId)]),
        ),
      };
    case "boss":
      return {
        kind: "boss",
        choices: Object.fromEntries(phase.challengers.map((id) => [id, botBattleChoice(state, id)])),
      };
    case "showdown":
      return {
        kind: "showdown",
        choices: Object.fromEntries(phase.contenders.map((id) => [id, botBattleChoice(state, id)])),
      };
    case "minigame":
      return { kind: "minigame", ranking: randomMinigameRanking(state, rng) };
    case "gameOver":
      throw new Error("The match is over");
  }
}
