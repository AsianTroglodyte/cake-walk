import { BOUGHT_ITEM, checkBuy, ITEM_KINDS, trapSpaces } from "./items";
import { canUseSavedDice, getPlayer } from "./match";
import { nextFloat, pick, randInt, shuffle, type Rng } from "./rng";
import type {
  BattleChoice,
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
  const player = getPlayer(state, playerId);
  const lane = randInt(rng, 0, state.board.paths - 1);
  let use = nextFloat(rng) < 0.5 ? botItemUse(state, player, player.items, rng) : null;
  const buy = nextFloat(rng) < 0.5 ? botPurchase(state, player, use !== null, rng) : null;
  if (buy && !use && nextFloat(rng) < 0.5) use = botItemUse(state, player, [{ id: BOUGHT_ITEM, kind: buy }], rng);
  return { die: null, lane, use, buy };
}

function distance(state: MatchState, player: Player): number {
  return state.board.spaces[player.position]!.distanceToFinish;
}

/** Coin Thief goes after the richest player, other attacks after the leader; Shield only when in the top 2. */
function botItemUse(state: MatchState, player: Player, items: OwnedItem[], rng: Rng): ItemUse | null {
  if (items.length === 0) return null;
  const item = pick(rng, items);
  const others = state.players.filter((p) => p.id !== player.id);
  switch (item.kind) {
    case "coinThief": {
      const richest = others.reduce((a, b) => (b.coins > a.coins ? b : a));
      return richest.coins > 0 ? { itemId: item.id, target: richest.id } : null;
    }
    case "weight":
    case "sandDie":
    case "shove": {
      const leader = others.reduce((a, b) => (distance(state, b) < distance(state, a) ? b : a));
      return { itemId: item.id, target: leader.id };
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
  }
}

function botPurchase(state: MatchState, player: Player, using: boolean, rng: Rng): ItemKind | null {
  const affordable = ITEM_KINDS.filter((kind) => checkBuy(state, player, kind, using) === null);
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
