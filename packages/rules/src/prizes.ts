import type { ItemKind, MatchEvent, MinigameRanking, PlayerId, SavedDieSides } from "./types";

/** What one player won from a minigame. Shown to everyone on the results screen. */
export interface MinigamePrize {
  coins: number;
  die: SavedDieSides | null;
  item: ItemKind | null;
  /** Won an item but had no room for it. */
  itemSkipped: ItemKind | null;
  /** Placed last: rolls the d4 next round. */
  d4: boolean;
}

/** Reads the prizes from the events of resolving a minigame. */
export function minigamePrizes(ranking: MinigameRanking, events: readonly MatchEvent[]): Record<PlayerId, MinigamePrize> {
  const last = ranking.length > 1 ? new Set(ranking[ranking.length - 1]) : new Set<PlayerId>();
  const prizes: Record<PlayerId, MinigamePrize> = Object.fromEntries(
    ranking.flat().map((id) => [id, { coins: 0, die: null, item: null, itemSkipped: null, d4: last.has(id) }]),
  );
  for (const e of events) {
    if (e.type === "coinsChanged" && e.reason === "minigame") prizes[e.playerId]!.coins += e.delta;
    if (e.type === "dieAwarded") prizes[e.playerId]!.die = e.die.sides;
    if (e.type === "itemAwarded") prizes[e.playerId]!.item = e.item.kind;
    if (e.type === "itemAwardSkipped") prizes[e.playerId]!.itemSkipped = e.kind;
  }
  return prizes;
}
