import { BOUGHT_ITEM, checkBuy, ITEMS, trapSpaces } from "./items";
import { canUseSavedDice, getPlayer } from "./match";
import { nextFloat, pick, randInt, shuffle, type Rng } from "./rng";
import type {
  BattleChoice,
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

/** Bots save their dice for the boss and move with the default die. */
export function botMoveChoice(state: MatchState, playerId: PlayerId, rng: Rng): MoveChoice {
  return { die: null, lane: randInt(rng, 0, state.board.paths - 1) };
}

/** Bots sometimes use an item and sometimes buy one, in the item phase. */
export function botItemChoice(state: MatchState, playerId: PlayerId, rng: Rng): ItemChoice {
  const player = getPlayer(state, playerId);
  const usable = player.items.filter((i) => !ITEMS[i.kind].passive);
  let use = nextFloat(rng) < 0.5 ? botItemUse(state, player, usable, rng) : null;
  const buy = nextFloat(rng) < 0.5 ? botPurchase(state, player, use !== null, rng) : null;
  if (buy && !use && !ITEMS[buy].passive && nextFloat(rng) < 0.5) {
    use = botItemUse(state, player, [{ id: BOUGHT_ITEM, kind: buy }], rng);
  }
  return { use, buy };
}

function distance(state: MatchState, player: Player): number {
  return state.board.spaces[player.position]!.distanceToFinish;
}

function anyonePassedFirstCheckpoint(state: MatchState): boolean {
  const checkpoint = state.board.spaces.find((space) => space.type === "checkpoint" && space.segment === 0);
  return checkpoint !== undefined && state.players.some((player) => distance(state, player) < checkpoint.distanceToFinish);
}

/** Bots favor the leader but may choose a player in a lower placement tier. */
function botItemUse(state: MatchState, player: Player, items: OwnedItem[], rng: Rng): ItemUse | null {
  if (items.length === 0) return null;
  const item = pick(rng, items);
  const others = state.players.filter((p) => p.id !== player.id);
  const targetTiers: Player[][] = [];
  for (const target of [...others].sort((a, b) => distance(state, a) - distance(state, b))) {
    const tier = targetTiers.at(-1);
    if (tier && distance(state, tier[0]!) === distance(state, target)) tier.push(target);
    else targetTiers.push([target]);
  }
  let selectedTier = 0;
  while (selectedTier < targetTiers.length - 1 && nextFloat(rng) >= 2 / 3) selectedTier++;
  const target = pick(rng, targetTiers[selectedTier]!);
  switch (item.kind) {
    case "coinThief": {
      return target.coins > 0 ? { itemId: item.id, target: target.id } : null;
    }
    case "weight":
    case "sandDie":
    case "shove":
    case "collision": {
      if (!anyonePassedFirstCheckpoint(state)) return null;
      return { itemId: item.id, target: target.id };
    }
    case "shield": {
      const ahead = others.filter((p) => distance(state, p) < distance(state, player)).length;
      return ahead < 2 ? { itemId: item.id } : null;
    }
    case "sandTrap": {
      const spaces = trapSpaces(state.board, player.position, state.rules.items.trapRange);
      return spaces.length > 0 ? { itemId: item.id, space: pick(rng, spaces) } : null;
    }
    case "booster":
    case "extraDie":
      return { itemId: item.id };
    case "floatie":
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
