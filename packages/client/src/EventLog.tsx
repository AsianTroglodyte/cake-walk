import type { RoomView } from "@pbg/protocol";
import { CLIENT_MINIGAMES, isClientMinigame, ITEMS, MINIGAMES, type MatchEvent, type SpaceId } from "@pbg/rules";

export function EventLog({ view }: { view: RoomView }) {
  const match = view.match!;
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const where = (id: SpaceId) => `${match.board.spaces[id]!.distanceToFinish} to go`;
  const end = (path: SpaceId[]) => path[path.length - 1]!;

  const format = (e: MatchEvent): string | null => {
    switch (e.type) {
      case "roundStarted":
      case "moved":
        return null;
      case "dieRolled":
        return `${name(e.playerId)} rolled ${e.saved ? "a saved " : ""}d${e.sides}: ${e.value}`;
      case "coinsChanged":
        if (e.reason === "minigame") return null;
        if (e.reason === "shop") return `${name(e.playerId)} spent ${-e.delta} coins at the shop`;
        return `${name(e.playerId)} ${e.delta > 0 ? "+" : ""}${e.delta} coins`;
      case "itemBought":
        return `You bought a ${ITEMS[e.item.kind].name}`;
      case "itemUsed":
        return e.kind === "sandTrap"
          ? `${name(e.playerId)} hid a Sand Trap somewhere`
          : `${name(e.playerId)} used ${ITEMS[e.kind].name}${e.target ? ` on ${name(e.target)}` : ""}`;
      case "itemBlocked":
        return `${name(e.target)}'s Shield blocked ${name(e.playerId)}'s ${ITEMS[e.kind].name}`;
      case "coinsStolen":
        return e.reason === "trap"
          ? `${name(e.from)} lost ${e.amount} coins to the trap`
          : `${name(e.to)} stole ${e.amount} coins from ${name(e.from)}`;
      case "shoved":
        return e.path.length > 0
          ? `${name(e.playerId)} was shoved back ${e.path.length} spaces`
          : `${name(e.playerId)} was shoved but held on at the checkpoint`;
      case "rollChanged": {
        const why = e.kind === "weight" ? "Weight" : e.kind === "booster" ? "Booster" : "Extra Die";
        return `${name(e.playerId)}'s roll: ${e.from} to ${e.to} (${why})`;
      }
      case "trapPlaced":
        return `You hid a Sand Trap (${where(e.spaceId)})`;
      case "trapRefunded":
        return `Your Sand Trap couldn't go there (${where(e.spaceId)}), so you got it back`;
      case "trapTriggered":
        return `TRAP: ${e.victims.map(name).join(" & ")} stopped on ${name(e.ownerId)}'s Sand Trap (${where(e.spaceId)})`;
      case "itemAwarded":
        return `${name(e.playerId)} won a ${ITEMS[e.item.kind].name}`;
      case "itemAwardSkipped":
        return `${name(e.playerId)} would have won a ${ITEMS[e.kind].name}, but their items are full`;
      case "arrow":
        return `${name(e.playerId)} rode an arrow ${e.direction} (${where(end(e.path))})`;
      case "collision": {
        const saved = e.saved?.length ? ` (${e.saved.map(name).join(" & ")} stayed with a Floatie)` : "";
        return `COLLISION: ${e.playerIds.map(name).join(" & ")}${saved}`;
      }
      case "forcedBack":
        return `${name(e.playerId)} was forced back to the checkpoint`;
      case "floatieSaved":
        return `${name(e.playerId)}'s Floatie saved them`;
      case "bossFight": {
        const tries = e.attempts.map((a) => `${a.playerRoll} vs ${a.bossScore}`).join(", tie, ");
        return `BOSS: ${name(e.playerId)} rolled a d${e.sides}: ${tries}, ${e.won ? "and WON" : "and lost"}`;
      }
      case "knockedBack":
        return `${name(e.playerId)} was knocked back ${e.spaces} spaces`;
      case "bossWeakened":
        return `The boss weakened: ${e.from} + d4 is now ${e.to} + d4`;
      case "showdownRoll":
        return `Showdown: ${Object.entries(e.rolls).map(([id, r]) => `${name(id)} ${r.value}`).join(", ")}`;
      case "minigameResults": {
        if (!e.played) return `Minigame: ${e.ranking.map((g) => g.map(name).join(" = ")).join(" > ")}`;
        const { game, scores, labels } = e.played;
        const unit = isClientMinigame(game) ? ` ${CLIENT_MINIGAMES[game].unit}` : "";
        const label = (id: string) =>
          labels?.[id] !== undefined
            ? `${name(id)} ${labels[id]}`
            : scores[id] === null
              ? `${name(id)} (no result)`
              : `${name(id)} ${scores[id]}${unit}`;
        return `${MINIGAMES[game].name}: ${e.ranking.map((g) => g.map(label).join(" = ")).join(" > ")}`;
      }
      case "dieAwarded":
        return `${name(e.playerId)} won a d${e.die.sides}`;
      case "defaultDieChanged":
        return e.sides === 4 ? `${name(e.playerId)} came last and rolls a d4 next round` : null;
      case "matchWon":
        return `${name(e.playerId)} wins!`;
    }
  };

  const rounds: { round: number; lines: string[] }[] = [];
  for (const event of match.events) {
    if (event.type === "roundStarted") rounds.push({ round: event.round, lines: [] });
    if (rounds.length === 0) continue;
    const line = format(event);
    if (line) rounds[rounds.length - 1]!.lines.push(line);
  }

  return (
    <section className="panel log">
      <h2>What happened</h2>
      {[...rounds].reverse().map((group) => (
        <div key={group.round}>
          <h3>Round {group.round}</h3>
          <ul>
            {group.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
