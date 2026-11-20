import { createRng, randInt, type Rng } from "./rng";
import type { MinigameRanking, PlayerId } from "./types";

/** Played in each browser, which reports a score. */
export type ClientMinigameKind = "reaction" | "mash" | "stopwatch";
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
  | "battleship"
  | "calculator"
  | "singleWord"
  | "brawldle"
  | "diceFleet"
  | "unstableMath"
  | "letterSwitch";
/** Played on the server in real time. */
export type RealtimeMinigameKind =
  | "timebomb" | "minefield" | "colorPlatforms" | "colorCode" | "painter" | "onTheDot" | "dotCollector" | "gridQuiz"
  | "countTheDots" | "hideAndSeek" | "redLightGreenLight" | "hangman" | "conquest" | "snake";
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
    instructions: "Start with 10 points. Each round, stop to keep your points, or wager 1 up to your current points on heads or tails. Right: +wager. Wrong: −wager. You are out at 0 points.",
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
    instructions: "Read the paragraph, then guess how many times the word \"the\" appears. Closest guess wins; equally accurate answers are ranked by answer speed.",
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
    instructions: "Pass the bomb before its hidden 5–10 second total fuse runs out. No automatic passing; you must hold it for at least 0.25s. The holder is eliminated on explosion. After a 2s reset, a random survivor gets a new bomb. Last survivor wins.",
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
    instructions: "Hide 4 mines, then race to the top row. Move in 8 directions using the on-screen arrows, arrow keys or WASD (Q/E/Z/C for diagonals). Step on someone else's mine and you go back to the start. Your own mines are safe.",
  },
  battleship: {
    name: "Battleship",
    instructions: "Hide ships of 5, 3, and 2 on one shared sea. Each round, fire 2 shots (3 from round 8). Hits are public, but you only learn whose ship it was when it sinks. Last fleet afloat wins.",
  },
  stopwatch: {
    name: "Stopwatch",
    instructions: "A random target between 10 and 20 seconds is chosen. Watch the stopwatch, then stop it as close to the target as possible.",
  },
  colorPlatforms: {
    name: "Color Platforms",
    instructions: "Move with WASD to the called color before time runs out. Each round has one fewer platform of that color than surviving players; anyone not standing on it is eliminated. Last player standing wins.",
  },
  colorCode: {
    name: "Color Code",
    instructions: "Crack the shared hidden 4-color code using 6 colors. Each color in the code is used only once. After each guess, you'll learn how many colors are in the correct positions. Solve it within 60 seconds.",
  },
  calculator: {
    name: "Calculator",
    instructions: "Take turns choosing one of your values and adding it to an opponent's value. A value reaching 5 is eliminated; values over 5 wrap around by subtracting 5. Last player with a value wins.",
  },
  singleWord: {
    name: "Single Word",
    instructions: "Three rounds: enter a valid 5-letter word. Score its letter values; letters used by enough players score 0. Highest total wins.",
  },
  onTheDot: {
    name: "On The Dot",
    instructions: "Move your marker with the cursor and try to stay closest to the moving dot. The path and dot vanish after 5 seconds; other players vanish after 10 seconds. Closest wins after 15 seconds.",
  },
  dotCollector: {
    name: "Star Collector",
    instructions: "Move with your cursor to collect center stars one at a time, then return each to your area. You can also steal stars from other areas. Finish by banking 6 stars; players continue until only one has yet to finish.",
  },
  brawldle: {
    name: "Brawldle",
    instructions: "Choose a secret 5-letter word. Take turns guessing: when it is your turn, you have 30 seconds to enter a word. Each guess is checked against every player's secret (including yours); exact matches knock out those players. The shared player boards show everyone's latest four color clues. Last player standing wins.",
  },
  diceFleet: {
    name: "Dice Fleet",
    instructions: "You have 10 HP. Each round, roll a d4 and choose an opponent to attack for that much damage. Survive longer than everyone else.",
  },
  gridQuiz: {
    name: "Grid Quiz",
    instructions: "Memorize each color grid for 8 seconds, then guess the count of the requested color in 10 seconds. Answers stay private until the 5-second reveal after guessing closes. Three rounds; perfect guesses earn 15 points.",
  },
  countTheDots: {
    name: "Count The Dots",
    instructions: "For 30 seconds, add dots or click one to remove it (0.5-second cooldown). Then guess the final count in 10 seconds. Closest wins.",
  },
  hideAndSeek: {
    name: "Hide and Seek",
    instructions: "One seeker searches for everyone else. Hiders choose separate spots in 10 seconds; the seeker has 7 seconds to guess. Wrong spots disappear. The seeker wins by finding everyone; remaining hiders win if one spot is left.",
  },
  redLightGreenLight: {
    name: "Red Fight, Green Light",
    instructions: "Move your marker toward the finish during green lights. During red lights, stop moving and fire in a direction with WASD/QEZC. You have a one-second grace period; bullets or moving afterward knock you out.",
  },
  unstableMath: {
    name: "Unstable Math",
    instructions: "Five simultaneous rounds. The saboteur secretly cycles one number or operation while everyone else solves the equation. All players have 30 seconds; answers are revealed for 6 seconds after each round.",
  },
  hangman: {
    name: "Hangman",
    instructions: "Solve the shared word before time runs out. You have six lives and must wait three seconds between letter guesses. Faster solves rank higher.",
  },
  letterSwitch: {
    name: "Letter Switch",
    instructions: "Change exactly one letter of the shared CVCV word to make a new word. Score the letter values; invalid or previously used words score zero.",
  },
  conquest: {
    name: "Conquest",
    instructions: "Move your cursor to areas and stay for three seconds to claim them. Claimed areas score points every second. Most points after 60 seconds wins.",
  },
  snake: {
    name: "Snake",
    instructions: "Steer your snake with the arrow keys or WASD and eat apples to grow. Avoid walls and snakes. When a player is eliminated, surviving snakes grow.",
  },
  painter: {
    name: "Painter",
    instructions: "Move with WASD to paint the grid. Claim as many cells as possible in 20 seconds.",
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
  stopwatch: { durationMs: 22_000, higherIsBetter: false, unit: "ms from target", minScore: 0, maxScore: 22_000 },
};

export const CLIENT_MINIGAME_KINDS = Object.keys(CLIENT_MINIGAMES) as ClientMinigameKind[];

export function isClientMinigame(kind: MinigameKind): kind is ClientMinigameKind {
  return kind in CLIENT_MINIGAMES;
}

/** Quick Draw: how long after the start GO appears. Every browser derives the same value from the seed. */
export function reactionGoDelay(seed: number): number {
  return randInt(createRng(seed), 1_500, 4_000);
}

/** Seeded so every player receives the same hidden stopwatch target. */
export function stopwatchTarget(seed: number): number {
  return randInt(createRng(seed), 10_000, 20_000);
}

export function isPlausibleScore(kind: ClientMinigameKind, score: number): boolean {
  const rules = CLIENT_MINIGAMES[kind];
  return Number.isFinite(score) && score >= rules.minScore && score <= rules.maxScore;
}

export function botMinigameScore(kind: ClientMinigameKind, rng: Rng): number {
  if (kind === "reaction") return randInt(rng, 190, 450);
  if (kind === "stopwatch") return randInt(rng, 50, 500);
  return randInt(rng, 25, 60);
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
