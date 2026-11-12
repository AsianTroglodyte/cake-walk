import { parseArgs } from "node:util";
import { pathsForPlayerCount, runBotMatch } from "../src/index";

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "4,6,7,9,10,12" },
    matches: { type: "string", default: "1000" },
    seed: { type: "string", default: "1" },
    "max-rounds": { type: "string", default: "300" },
  },
});

const playerCounts = values.players.split(",").map(Number);
const matches = Number(values.matches);
const baseSeed = Number(values.seed);
const maxRounds = Number(values["max-rounds"]);

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
const round1 = (n: number) => Math.round(n * 10) / 10;

const rows = playerCounts.map((playerCount) => {
  const rounds: number[] = [];
  let collisions = 0;
  let roundsWithCollision = 0;
  let totalRounds = 0;
  let playerRounds = 0;
  let bossFights = 0;
  let stalled = 0;

  for (let i = 0; i < matches; i++) {
    const result = runBotMatch({ playerCount, seed: baseSeed + i, maxRounds });
    rounds.push(result.rounds);
    collisions += result.collisions;
    roundsWithCollision += result.roundsWithCollision;
    totalRounds += result.rounds;
    playerRounds += playerCount * result.rounds;
    bossFights += result.bossFights;
    if (result.stalled) stalled++;
  }
  rounds.sort((a, b) => a - b);

  return {
    players: playerCount,
    paths: pathsForPlayerCount(playerCount),
    "avg rounds": round1(rounds.reduce((a, b) => a + b, 0) / matches),
    median: percentile(rounds, 0.5),
    p90: percentile(rounds, 0.9),
    max: rounds[rounds.length - 1],
    "collisions/player/round": Math.round((collisions / playerRounds) * 1000) / 1000,
    "rounds with a collision": `${Math.round((roundsWithCollision / totalRounds) * 100)}%`,
    "boss fights/match": round1(bossFights / matches),
    stalled,
  };
});

console.log(`${matches} bot matches per player count (seeds ${baseSeed}..${baseSeed + matches - 1})`);
console.table(rows);
