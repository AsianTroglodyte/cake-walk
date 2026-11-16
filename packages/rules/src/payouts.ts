import type { MinigamePlayed, MinigameRanking } from "./types";

/** Paid places decrease strictly; the bottom quarter receives nothing. */
export function minigameCoinPayouts(players: number): number[] {
  if (!Number.isInteger(players) || players < 4 || players > 12) throw new Error("Expected 4–12 players");
  const paid = players - Math.ceil(players / 4);
  const retention = players <= 6 ? 0.5 : players <= 9 ? 0.6 : 0.75;
  const payouts = [players <= 6 ? 10 : players <= 9 ? 12 : 15];
  for (let place = 1; place < paid; place++) {
    const previous = payouts[place - 1]!;
    payouts.push(Math.max(paid - place, Math.min(previous - 1, Math.round(previous * retention))));
  }
  return [...payouts, ...Array<number>(players - paid).fill(0)];
}

/** A single group normally means all-first; failed/no-result games explicitly mean all-last. */
export function isAllLast(ranking: MinigameRanking, played?: MinigamePlayed): boolean {
  return ranking.length === 1 && !!played &&
    (played.allLast === true || ranking[0]!.every((id) => played.scores[id] === null));
}
