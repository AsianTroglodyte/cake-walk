import { nextFloat, randInt, shuffle, type Rng } from "../rng";
import type { PlayerId } from "../types";
import { mapPlayers, type RealtimeGame } from "./framework";

export const TIMEBOMB = {
  fuseMinMs: 5_000,
  fuseMaxMs: 10_000,
  resetMs: 2_000,
  passLockoutMs: 250,
} as const;
const BOT_EARLY_PASS_CHANCE = 0.7;
const BOT_EARLY_HOLD_MS = { min: 500, max: 1_500 };
const BOT_LATE_HOLD_MS = { min: 1_501, max: 3_500 };

export interface TimebombState {
  order: PlayerId[];
  bots: PlayerId[];
  startAt: number;
  holder: number;
  holderSince: number;
  /** Secret; passing never changes the bomb's fuse. */
  fuseAt: number;
  /** Only bots schedule a pass. Humans must press Pass themselves. */
  passAt: number | null;
  /** First eliminated to most recently eliminated. */
  eliminated: PlayerId[];
  /** The last explosion, visible during the reset and final reveal. */
  exploded: PlayerId | null;
  resetAt: number | null;
  endedAt: number | null;
}

export interface TimebombView {
  order: PlayerId[];
  startAt: number;
  holder: PlayerId;
  holderSince: number;
  passAllowedAt: number;
  eliminated: PlayerId[];
  exploded: PlayerId | null;
  resetAt: number | null;
  endedAt: number | null;
}

function scheduleBotPass(s: TimebombState, since: number, rng: Rng): void {
  if (!s.bots.includes(s.order[s.holder]!)) {
    s.passAt = null;
    return;
  }
  const window = nextFloat(rng) < BOT_EARLY_PASS_CHANCE ? BOT_EARLY_HOLD_MS : BOT_LATE_HOLD_MS;
  s.passAt = since + randInt(rng, window.min, window.max);
}

function pass(s: TimebombState, now: number, rng: Rng): void {
  do s.holder = (s.holder + 1) % s.order.length;
  while (s.eliminated.includes(s.order[s.holder]!));
  s.holderSince = now;
  scheduleBotPass(s, now, rng);
}

function newBomb(s: TimebombState, now: number, rng: Rng): void {
  const survivors = s.order.filter((id) => !s.eliminated.includes(id));
  s.holder = s.order.indexOf(survivors[randInt(rng, 0, survivors.length - 1)]!);
  s.holderSince = now;
  s.fuseAt = now + randInt(rng, TIMEBOMB.fuseMinMs, TIMEBOMB.fuseMaxMs);
  s.exploded = null;
  s.resetAt = null;
  scheduleBotPass(s, now, rng);
}

export const timebomb: RealtimeGame<TimebombState> = {
  mode: "realtime",
  setup({ players, bots, rng }, startAt) {
    const s: TimebombState = {
      order: shuffle(rng, players),
      bots,
      startAt,
      holder: 0,
      holderSince: startAt,
      fuseAt: 0,
      passAt: null,
      eliminated: [],
      exploded: null,
      resetAt: null,
      endedAt: null,
    };
    newBomb(s, startAt, rng);
    return s;
  },
  input(s, id, raw, now, rng) {
    if (raw !== "pass" || s.endedAt !== null || s.exploded !== null ||
      now < s.startAt || now >= s.fuseAt ||
      now < s.holderSince + TIMEBOMB.passLockoutMs || s.order[s.holder] !== id) return false;
    pass(s, now, rng);
    return true;
  },
  nextEventAt(s) {
    if (s.endedAt !== null) return null;
    return s.resetAt ?? Math.min(s.fuseAt, s.passAt ?? Infinity);
  },
  advance(s, now, rng) {
    while (s.endedAt === null) {
      if (s.resetAt !== null) {
        if (now < s.resetAt) return;
        newBomb(s, s.resetAt, rng);
        continue;
      }
      const nextPass = s.passAt ?? Infinity;
      if (s.fuseAt <= nextPass) {
        if (s.fuseAt > now) return;
        const holder = s.order[s.holder]!;
        s.eliminated.push(holder);
        s.exploded = holder;
        s.passAt = null;
        if (s.eliminated.length === s.order.length - 1) s.endedAt = s.fuseAt;
        else s.resetAt = s.fuseAt + TIMEBOMB.resetMs;
      } else {
        if (nextPass > now) return;
        pass(s, nextPass, rng);
      }
    }
  },
  done: (s) => s.endedAt !== null,
  result(s) {
    const survivors = s.order.filter((id) => !s.eliminated.includes(id));
    const ranking = [...survivors, ...[...s.eliminated].reverse()].map((id) => [id]);
    return {
      ranking,
      scores: mapPlayers(s.order, (id) => {
        const out = s.eliminated.indexOf(id);
        return out < 0 ? s.order.length : out + 1;
      }),
      labels: mapPlayers(s.order, (id) => {
        const out = s.eliminated.indexOf(id);
        return out < 0 ? "last survivor" : `eliminated ${out + 1}${out === 0 ? "st" : out === 1 ? "nd" : out === 2 ? "rd" : "th"}`;
      }),
    };
  },
  view: (s) => ({
    order: s.order,
    startAt: s.startAt,
    holder: s.order[s.holder]!,
    holderSince: s.holderSince,
    passAllowedAt: s.holderSince + TIMEBOMB.passLockoutMs,
    eliminated: s.eliminated,
    exploded: s.exploded,
    resetAt: s.resetAt,
    endedAt: s.endedAt,
  }) satisfies TimebombView,
};
