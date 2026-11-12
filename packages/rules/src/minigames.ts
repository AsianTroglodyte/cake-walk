import { createRng, randInt, type Rng } from "./rng";
import type { MinigameRanking, PlayerId } from "./types";

/** Played in each browser, which reports a score. */
export type ClientMinigameKind = "reaction" | "mash";
/** Played on the server in rounds of secret, simultaneous choices. */
export type RoundMinigameKind =
  | "rps"
  | "stairway"
  | "groupDice"
  | "headsTails"
  | "insertCoins"
  | "threeCells"
  | "fourCorners"
  | "higherLower"
  | "theCount"
  | "yahtzee"
  | "shutBox"
  | "laserFight"
  | "blastZone"
  | "plates"
  | "battleship";
/** Played on the server in real time. */
export type RealtimeMinigameKind = "timebomb" | "minefield";
export type ServerMinigameKind = RoundMinigameKind | RealtimeMinigameKind;
export type MinigameKind = ClientMinigameKind | ServerMinigameKind;

export interface MinigameInfo {
  name: string;
  instructions: string;
}

export const MINIGAMES: Record<MinigameKind, MinigameInfo> = {
  reaction: {
    name: "Quick Draw",
    instructions: "Wait for GO, then click or press Space as fast as you can. Go too early and you place last.",
  },
  mash: {
    name: "Mash Race",
    instructions: "Click or press Space as many times as you can before time runs out.",
  },
  rps: {
    name: "Rock Paper Scissors",
    instructions: "5 rounds. Pick rock, paper, or scissors. Every player you beat is worth 1 point.",
  },
  stairway: {
    name: "Stairway to Heaven",
    instructions: "Pick how many stairs to climb. If anyone else picks the same number, neither of you moves. First to the top wins.",
  },
  groupDice: {
    name: "Group of Dice",
    instructions: "Pick up to 6 dice. Your total must get as close to the target as possible without going over.",
  },
  headsTails: {
    name: "Heads or Tails",
    instructions: "Start with 10 points. Each round, stop to keep your points, or call the flip: right doubles them, wrong drops you to 0.",
  },
  insertCoins: {
    name: "Insert Coins",
    instructions: "Put your 10 coins into at least 2 boxes (yours counts). Your box total must get closest to the target without going over.",
  },
  threeCells: {
    name: "Three Cells",
    instructions: "5 rounds. Pick a cell. The most crowded cell falls. Everyone else scores the fallen cell's size minus their own cell's size.",
  },
  fourCorners: {
    name: "Four Corners",
    instructions: "Pick a corner. One corner is chosen at random and everyone in it is out. Survive 3 rounds.",
  },
  higherLower: {
    name: "Higher or Lower",
    instructions: "Guess the secret number from 1 to 100. After each guess you'll see higher or lower. Find it in the fewest rounds.",
  },
  theCount: {
    name: "The",
    instructions: "Read the paragraph, then guess how many times the word \"the\" appears. Closest guess wins.",
  },
  yahtzee: {
    name: "One Round Yahtzee",
    instructions: "Roll 5 dice up to 3 times, keeping any you like. Score the sum plus your best bonus: sets doubled, straights times 4, Yahtzee +100.",
  },
  shutBox: {
    name: "Clear The Numbers",
    instructions: "Flip down open tiles that add up to your roll. When you can't, the tiles left open are your score. Lowest wins.",
  },
  laserFight: {
    name: "Laser Fight",
    instructions: "3 lives. Each round, attack a player, defend (bounces attacks back, 3 uses), or refrain (not twice in a row). Last one standing wins.",
  },
  timebomb: {
    name: "Timebomb",
    instructions: "Hot potato! Hold the bomb as long as you dare, then press Pass. Every second held scores, but whoever holds it when it explodes places last.",
  },
  blastZone: {
    name: "Blast Zone",
    instructions: "5 lives, 8 rounds. Each round, pick a step (or stay) and a cell within 3 to bomb. Bombs land on target half the time, otherwise next to it. A direct hit costs 2 lives, the cells around it 1.",
  },
  plates: {
    name: "Disappearing Plates",
    instructions: "Each round, step to a neighboring plate that is empty right now (you must move) and pick a plate to remove. You can end up sharing a plate if you and someone else both go there. The plate you leave crumbles, and a few missing plates come back each round. No free plate next to you and you fall. Last one standing wins.",
  },
  minefield: {
    name: "Minefield Trek",
    instructions: "Hide 4 mines, then race to the top row with the arrow keys or WASD. Step on someone else's mine and you go back to the start. Your own mines are safe.",
  },
  battleship: {
    name: "Battleship",
    instructions: "Hide ships of 5, 3, and 2 on one shared sea. Each round, fire 2 shots (3 from round 8). Hits are public, but you only learn whose ship it was when it sinks. Last fleet afloat wins.",
  },
};

export const MINIGAME_KINDS = Object.keys(MINIGAMES) as MinigameKind[];

export interface ClientMinigameRules {
  /** From the shared start time until the game is over for everyone. */
  durationMs: number;
  higherIsBetter: boolean;
  unit: string;
  /** Scores outside this range can't come from a real player and count as no result. */
  minScore: number;
  maxScore: number;
}

export const CLIENT_MINIGAMES: Record<ClientMinigameKind, ClientMinigameRules> = {
  reaction: { durationMs: 6_500, higherIsBetter: false, unit: "ms", minScore: 100, maxScore: 2_500 },
  // About 20 taps a second is beyond what people manage.
  mash: { durationMs: 5_000, higherIsBetter: true, unit: "taps", minScore: 0, maxScore: 100 },
};

export const CLIENT_MINIGAME_KINDS = Object.keys(CLIENT_MINIGAMES) as ClientMinigameKind[];

export function isClientMinigame(kind: MinigameKind): kind is ClientMinigameKind {
  return kind in CLIENT_MINIGAMES;
}

/** Quick Draw: how long after the start GO appears. Every browser derives the same value from the seed. */
export function reactionGoDelay(seed: number): number {
  return randInt(createRng(seed), 1_500, 4_000);
}

export function isPlausibleScore(kind: ClientMinigameKind, score: number): boolean {
  const rules = CLIENT_MINIGAMES[kind];
  return Number.isFinite(score) && score >= rules.minScore && score <= rules.maxScore;
}

export function botMinigameScore(kind: ClientMinigameKind, rng: Rng): number {
  return kind === "reaction" ? randInt(rng, 190, 450) : randInt(rng, 25, 60);
}

/** Best first; equal scores tie; players without a valid score share last place. */
export function rankScores(kind: ClientMinigameKind, scores: Record<PlayerId, number | null>): MinigameRanking {
  const sign = CLIENT_MINIGAMES[kind].higherIsBetter ? -1 : 1;
  const scored = Object.entries(scores)
    .filter((entry): entry is [PlayerId, number] => entry[1] !== null)
    .sort((a, b) => sign * (a[1] - b[1]));
  const ranking: MinigameRanking = [];
  let previous: number | null = null;
  for (const [id, score] of scored) {
    if (score === previous) ranking[ranking.length - 1]!.push(id);
    else ranking.push([id]);
    previous = score;
  }
  const missing = Object.entries(scores)
    .filter(([, score]) => score === null)
    .map(([id]) => id);
  if (missing.length > 0) ranking.push(missing);
  return ranking;
}
