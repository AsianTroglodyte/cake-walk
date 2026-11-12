import { pick, randInt, shuffle } from "../rng";
import type { PlayerId } from "../types";
import { isInt, isRecord, mapPlayers, rankUnderTarget, type RoundGame } from "./framework";

export const INSERT_COINS_EACH = 10;
/** Bot simulations put about 70% of boxes at 13 or less at every player count. */
export const INSERT_COINS_TARGET = 13;

/** Coins put into each player's box. */
export type CoinDrop = Record<PlayerId, number>;

export interface InsertCoinsState {
  players: PlayerId[];
  target: number;
  drops: Record<PlayerId, CoinDrop> | null;
  boxes: Record<PlayerId, number> | null;
}

export type InsertCoinsView = InsertCoinsState;

export const insertCoins: RoundGame<InsertCoinsState, CoinDrop> = {
  mode: "round",
  setup: ({ players }) => ({ players, target: INSERT_COINS_TARGET, drops: null, boxes: null }),
  roundMs: () => 20_000,
  revealMs: 4_000,
  deciders: (s) => (s.boxes ? [] : s.players),
  parse(s, _id, raw) {
    if (!isRecord(raw)) return undefined;
    const drop: CoinDrop = {};
    let total = 0;
    for (const [box, coins] of Object.entries(raw)) {
      if (!s.players.includes(box) || !isInt(coins, 0, INSERT_COINS_EACH)) return undefined;
      if (coins > 0) drop[box] = coins;
      total += coins;
    }
    return total === INSERT_COINS_EACH && Object.keys(drop).length >= 2 ? drop : undefined;
  },
  fallback(s, id, rng) {
    const half = INSERT_COINS_EACH / 2;
    return { [id]: half, [pick(rng, s.players.filter((p) => p !== id))]: half };
  },
  bot(s, _id, rng) {
    const boxes = shuffle(rng, s.players).slice(0, randInt(rng, 2, Math.min(4, s.players.length)));
    const drop: CoinDrop = Object.fromEntries(boxes.map((b) => [b, 1]));
    for (let left = INSERT_COINS_EACH - boxes.length; left > 0; left--) drop[pick(rng, boxes)]!++;
    return drop;
  },
  resolve(s, drops) {
    s.drops = drops;
    s.boxes = mapPlayers(s.players, (box) => s.players.reduce((sum, from) => sum + (drops[from]![box] ?? 0), 0));
  },
  done: (s) => s.boxes !== null,
  result(s) {
    const total = (id: PlayerId) => s.boxes![id]!;
    return {
      ranking: rankUnderTarget(s.players, total, s.target),
      scores: { ...s.boxes! },
      labels: mapPlayers(s.players, (id) => `${total(id)} coins${total(id) > s.target ? ", over" : ""}`),
    };
  },
  view: (s) => s,
};
