import { parseArgs } from "node:util";
import { ITEMS, runBotMatch, type MatchEvent, type MatchState, type SpaceId } from "../src/index";

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "6" },
    seed: { type: "string", default: String(Date.now() % 1_000_000) },
  },
});

const playerCount = Number(values.players);
const seed = Number(values.seed);
const result = runBotMatch({ playerCount, seed });
const { state } = result;

const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
const describe = (s: MatchState, id: SpaceId) => {
  const space = s.board.spaces[id]!;
  const lane = space.lane !== null && s.board.paths > 1 ? `, path ${space.lane + 1}` : "";
  return `space ${id} (${space.type}${lane}, ${space.distanceToFinish} to go)`;
};
const end = (path: SpaceId[]) => path[path.length - 1]!;

function format(e: MatchEvent): string {
  switch (e.type) {
    case "roundStarted":
      return `\n=== Round ${e.round} ===`;
    case "dieRolled":
      return `  ${name(e.playerId)} rolled ${e.saved ? "a saved " : ""}d${e.sides}: ${e.value}`;
    case "moved":
      return `    -> moved to ${describe(state, end(e.path))}`;
    case "coinsChanged":
      return `    ${name(e.playerId)} ${e.delta > 0 ? "+" : ""}${e.delta} coins (${e.reason})`;
    case "arrow":
      return `    ${name(e.playerId)} rode an arrow ${e.direction} to ${describe(state, end(e.path))}`;
    case "collision": {
      const saved = e.saved?.length ? ` (Floatie saved ${e.saved.map(name).join(", ")})` : "";
      return `  COLLISION on space ${e.spaceId}: ${e.playerIds.map(name).join(", ")}${saved} -> ${describe(state, e.sentTo)}`;
    }
    case "forcedBack":
      return `  ${name(e.playerId)} was forced back to ${describe(state, e.sentTo)}`;
    case "floatieSaved":
      return `    ${name(e.playerId)}'s Floatie saved them on space ${e.spaceId}`;
    case "bossFight": {
      const tries = e.attempts.map((a) => `${a.playerRoll} vs ${a.bossScore}`).join(", tie, ");
      return `  BOSS: ${name(e.playerId)} (${e.saved ? "saved " : ""}d${e.sides}) vs boss ${e.bossFixed}+d4: ${tries} -> ${e.won ? "WON" : "lost"}`;
    }
    case "knockedBack":
      return `    ${name(e.playerId)} knocked back ${e.spaces} spaces to ${describe(state, end(e.path))}`;
    case "bossWeakened":
      return `  The boss weakened: fixed number ${e.from} -> ${e.to}`;
    case "showdownRoll":
      return `  SHOWDOWN: ${Object.entries(e.rolls).map(([id, r]) => `${name(id)} d${r.sides}=${r.value}`).join(", ")}`;
    case "minigameResults":
      return `  Minigame: ${e.ranking.map((g) => g.map(name).join(" = ")).join(" > ")}`;
    case "dieAwarded":
      return `    ${name(e.playerId)} won a d${e.die.sides}`;
    case "defaultDieChanged":
      return `    ${name(e.playerId)} default die is now d${e.sides}`;
    case "matchWon":
      return `\n*** ${name(e.playerId)} wins in round ${e.round}! ***`;
    case "itemBought":
      return `  ${name(e.playerId)} bought a ${ITEMS[e.item.kind].name} for ${e.price}`;
    case "itemUsed":
      return `  ${name(e.playerId)} used ${ITEMS[e.kind].name}${e.target ? ` on ${name(e.target)}` : ""}`;
    case "itemBlocked":
      return `    ${name(e.target)}'s Shield blocked ${name(e.playerId)}'s ${ITEMS[e.kind].name}`;
    case "coinsStolen":
      return `    ${name(e.to)} took ${e.amount} coins from ${name(e.from)} (${e.reason})`;
    case "shoved":
      return `    ${name(e.playerId)} was shoved back ${e.path.length} spaces`;
    case "rollChanged":
      return `    ${name(e.playerId)} roll ${e.from} -> ${e.to} (${e.kind})`;
    case "trapPlaced":
      return `    ${name(e.playerId)} hid a trap on space ${e.spaceId}`;
    case "trapRefunded":
      return `    ${name(e.playerId)}'s trap on space ${e.spaceId} was refunded`;
    case "trapTriggered":
      return `  TRAP on space ${e.spaceId} (${name(e.ownerId)}): ${e.victims.map(name).join(", ")}`;
    case "itemAwarded":
      return `    ${name(e.playerId)} won a ${ITEMS[e.item.kind].name}`;
    case "itemAwardSkipped":
      return `    ${name(e.playerId)} would have won a ${ITEMS[e.kind].name}, but their items are full`;
  }
}

console.log(`Beach Party: ${playerCount} bots, seed ${seed}, ${state.board.paths} path(s), ${state.board.spaces[state.board.start]!.distanceToFinish} spaces to the finish`);
for (const event of result.events) {
  if (event.type === "coinsChanged" && event.reason === "minigame") continue;
  console.log(format(event));
}
if (result.stalled) console.log(`\nNo winner after ${result.rounds} rounds.`);
console.log(`\nCollisions: ${result.collisions} player-collisions. Boss fights: ${result.bossFights}.`);
