import { randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { mapPlayers, rankByKeys, type RealtimeGame } from "./framework";

export const TIMEBOMB_AUTO_PASS_MS = 10_000;
const FUSE_PER_PLAYER_MS = { min: 2_000, max: 4_000 };
const BOT_HOLD_MS = { min: 600, max: 3_500 };

export interface TimebombState {
  order: PlayerId[];
  bots: PlayerId[];
  startAt: number;
  holder: number;
  holderSince: number;
  /** Secret until the bomb goes off. */
  fuseAt: number;
  /** When the holder passes automatically (bots pass sooner, at a random moment). */
  passAt: number;
  /** Time held so far, not counting the current holder's current turn. */
  held: Record<PlayerId, number>;
  exploded: PlayerId | null;
  endedAt: number | null;
}

export interface TimebombView {
  order: PlayerId[];
  startAt: number;
  holder: PlayerId;
  holderSince: number;
  autoPassAt: number;
  held: Record<PlayerId, number>;
  exploded: PlayerId | null;
  endedAt: number | null;
}

function passAtFor(s: TimebombState, since: number, rng: Rng): number {
  return s.bots.includes(s.order[s.holder]!)
    ? since + randInt(rng, BOT_HOLD_MS.min, BOT_HOLD_MS.max)
    : since + TIMEBOMB_AUTO_PASS_MS;
}

function pass(s: TimebombState, now: number, rng: Rng): void {
  s.held[s.order[s.holder]!]! += now - s.holderSince;
  s.holder = (s.holder + 1) % s.order.length;
  s.holderSince = now;
  s.passAt = passAtFor(s, now, rng);
}

export const timebomb: RealtimeGame<TimebombState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const order = shuffle(rng, players);
    const s: TimebombState = {
      order,
      bots,
      startAt,
      holder: 0,
      holderSince: startAt,
      fuseAt: startAt + randInt(rng, FUSE_PER_PLAYER_MS.min * order.length, FUSE_PER_PLAYER_MS.max * order.length),
      passAt: 0,
      held: mapPlayers(players, () => 0),
      exploded: null,
      endedAt: null,
    };
    s.passAt = passAtFor(s, startAt, rng);
    return s;
  },
  input(s, id, raw, now, rng) {
    if (raw !== "pass" || s.exploded || now < s.startAt || s.order[s.holder] !== id) return false;
    pass(s, now, rng);
    return true;
  },
  nextEventAt: (s) => (s.exploded ? null : Math.min(s.fuseAt, s.passAt)),
  advance(s, now, rng) {
    while (!s.exploded) {
      if (s.fuseAt <= s.passAt) {
        if (s.fuseAt > now) return;
        const holder = s.order[s.holder]!;
        s.held[holder]! += s.fuseAt - s.holderSince;
        s.exploded = holder;
        s.endedAt = s.fuseAt;
      } else {
        if (s.passAt > now) return;
        pass(s, s.passAt, rng);
      }
    }
  },
  done: (s) => s.exploded !== null,
  result(s) {
    const survivors = s.order.filter((id) => id !== s.exploded);
    return {
      ranking: [...rankByKeys(survivors, (id) => [s.held[id]!]), ...(s.exploded ? [[s.exploded]] : [])],
      scores: { ...s.held },
      labels: mapPlayers(s.order, (id) =>
        id === s.exploded ? "BOOM! exploded" : `held it ${(s.held[id]! / 1000).toFixed(1)}s`,
      ),
    };
  },
  view: (s) =>
    ({
      order: s.order,
      startAt: s.startAt,
      holder: s.order[s.holder]!,
      holderSince: s.holderSince,
      autoPassAt: s.holderSince + TIMEBOMB_AUTO_PASS_MS,
      held: s.held,
      exploded: s.exploded,
      endedAt: s.endedAt,
    }) satisfies TimebombView,
};
