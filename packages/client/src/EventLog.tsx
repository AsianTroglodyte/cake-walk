import { useState, type ReactNode } from "react";
import type { RoomView } from "@pbg/protocol";
import { CLIENT_MINIGAMES, isClientMinigame, ITEMS, MINIGAMES, type MatchEvent, type SpaceId } from "@pbg/rules";

export function EventLog({ view }: { view: RoomView }) {
  const match = view.match!;
  const me = view.youSeatId;
  const [playerFilter, setPlayerFilter] = useState("all");
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const chaosDescription = (description: string) => {
    const seats = view.seats.filter((seat) => seat.name.length > 0).sort((a, b) => b.name.length - a.name.length);
    return seats.reduce((text, seat) => text.replaceAll(seat.name, seat.character), description);
  };
  /** A character's name, bolded everywhere it appears. */
  const n = (id: string) => <strong>{name(id)}</strong>;
  const joinedNames = (ids: string[], separator: string) =>
    ids.map((id, index) => <span key={`${id}-${index}`}>{index > 0 ? separator : null}{n(id)}</span>);
  const where = (id: SpaceId) => `${match.board.spaces[id]!.distanceToFinish} to go`;
  const end = (path: SpaceId[]) => path[path.length - 1]!;

  const format = (e: MatchEvent): ReactNode | null => {
    switch (e.type) {
      case "roundStarted":
        return null;
      case "dieRolled":
        return (
          <>
            {n(e.playerId)} rolled {e.saved ? "a saved " : ""}d{e.sides}: {e.value}
            {e.source ? <> (Foul Sugar Cube from {n(e.source)})</> : null}
          </>
        );
      case "moved":
        return (
          <>
            {n(e.playerId)} moved {e.path.length} space{e.path.length === 1 ? "" : "s"} ({where(end(e.path))})
          </>
        );
      case "moveSkipped":
        return (
          <>
            {n(e.playerId)} skipped this move because {e.reasons.map((reason) => {
              switch (reason) {
                case "maroonSpace": return "of a Maroon space";
                case "stickyCandy": return "of Sticky Candy";
                case "moonwalkRing": return "of Moonwalk Ring";
              }
            }).join(" and ")}
          </>
        );
      case "playerDied":
        return <>{n(e.playerId)} was knocked out{
          e.cause ? ` by ${ITEMS[e.cause].name}` :
            e.reason === "blackSpace" ? " by a Black space" :
              e.reason === "battle" ? " in a battle" :
                e.reason === "rainbowChaos" ? " by Rainbow Chaos" : " by an item"
        }{e.sourcePlayerId ? <> ({n(e.sourcePlayerId)})</> : null}</>;
      case "revivalFailed":
        return <>{n(e.playerId)}'s modified roll was {e.rolled}; needs {e.requirement}+ to revive and will need {e.nextRequirement}+ next round</>;
      case "playerRevived":
        return <>{n(e.playerId)} revived with a modified roll of {e.rolled} and moved {e.spaces} space{e.spaces === 1 ? "" : "s"}</>;
      case "spaceEffect":
        if (e.effect === "item") return <>{n(e.playerId)} received a {ITEMS[e.item!.kind].name} from a Green space</>;
        if (e.effect === "skip") return <>{n(e.playerId)} will miss their next move</>;
        return <>{n(e.playerId)} landed on a Pink space and rolled again</>;
      case "chaosSpacePlaced":
        return `${e.spaceType === "monochromeChaos" ? "Monochrome" : "Rainbow"} Chaos appeared at ${where(e.spaceId)}`;
      case "chaosOutcome":
        return chaosDescription(e.description);
      case "coinsChanged":
        if (e.reason === "minigame") return null;
        if (e.reason === "shop") {
          return (
            <>
              {n(e.playerId)} spent {-e.delta} coins at the shop
            </>
          );
        }
        if (e.reason === "auction") return <>{n(e.playerId)} paid {-e.delta} coins in the auction</>;
        return (
          <>
            {n(e.playerId)} {e.delta > 0 ? "+" : ""}
            {e.delta} coins
          </>
        );
      case "itemBought":
        return <>{n(e.playerId)} bought a {ITEMS[e.item.kind].name}</>;
      case "auctionWon":
        return <>{n(e.playerId)} won {ITEMS[e.item.kind].name} for {e.bid} coins</>;
      case "itemStolen":
        return <>{n(e.to)} stole {ITEMS[e.item.kind].name} from {n(e.from)}</>;
      case "candySpiritTriggered":
        return e.knockedOut
          ? <>{n(e.playerId)}'s Candy Spirit revived them and knocked out {n(e.knockedOut)} 💀</>
          : <>{n(e.playerId)}'s Candy Spirit revived them; {n(e.target)} was protected by their own Candy Spirit</>;
      case "itemUsed":
        return e.kind === "sandTrap" || e.kind === "itemTrap" || e.kind === "deathTrap" ? (
          <>
            {n(e.playerId)} hid a {ITEMS[e.kind].name} somewhere
          </>
        ) : (
          <>
            {n(e.playerId)} used {ITEMS[e.kind].name}
            {e.target ? <> on {n(e.target)}</> : null}
          </>
        );
      case "itemBlocked":
        return (
          <>
            {n(e.target)}'s Hard Candy Shell blocked {n(e.playerId)}'s {ITEMS[e.kind].name}
          </>
        );
      case "coinsStolen":
        return e.reason === "trap" ? (
          <>
            {n(e.from)} lost {e.amount} coins to {n(e.to)}'s Coin Trap
          </>
        ) : (
          <>
            {n(e.to)} stole {e.amount} coins from {n(e.from)}
          </>
        );
      case "shoved":
        return e.path.length > 0 ? (
          <>
            {n(e.playerId)} was shoved back {e.path.length} spaces
          </>
        ) : (
          <>
            {n(e.playerId)} was shoved but held on at the checkpoint
          </>
        );
      case "rollChanged": {
        const why = ITEMS[e.kind].name;
        return (
          <>
            {n(e.playerId)}'s roll: {e.from} to {e.to} ({why}
            {e.source ? <> from {n(e.source)}</> : null})
          </>
        );
      }
      case "trapPlaced":
        return `You hid a ${ITEMS[e.kind].name} (${where(e.spaceId)})`;
      case "trapRefunded":
        return `Your ${ITEMS[e.kind].name} couldn't go there (${where(e.spaceId)}), so you got it back`;
      case "trapTriggered":
        return (
          <>
            {e.victims.length ? <>{joinedNames(e.victims, " & ")} stopped on </> : null}
            {n(e.ownerId)}'s {ITEMS[e.kind].name} ({where(e.spaceId)})
            {e.blocked?.length ? <> — {e.blocked.map(name).join(", ")} were protected</> : null}
          </>
        );
      case "itemAwarded":
        return (
          <>
            {n(e.playerId)} won a {ITEMS[e.item.kind].name}
          </>
        );
      case "itemAwardSkipped":
        return (
          <>
            {n(e.playerId)} would have won a {ITEMS[e.kind].name}, but their items are full
          </>
        );
      case "arrow":
        return (
          <>
            {n(e.playerId)} rode an arrow {e.direction} ({where(end(e.path))})
          </>
        );
      case "collision": {
        const saved = e.saved?.length ? <> ({joinedNames(e.saved, " & ")} stayed with a Life Ring)</> : null;
        return (
          <>
            COLLISION: {joinedNames(e.playerIds, " & ")}
            {saved}
          </>
        );
      }
      case "forcedBack":
        return (
          <>
            {n(e.playerId)} was forced back to the checkpoint
          </>
        );
      case "floatieSaved":
        return (
          <>
            {n(e.playerId)}'s Life Ring saved them
          </>
        );
      case "ghostFeetSaved":
        return <>{n(e.playerId)}'s Ghost Feet blocked a {ITEMS[e.trapKind].name}</>;
      case "bossFight": {
        const tries = e.attempts.map((a) => `${a.playerRoll} vs ${a.bossScore}`).join(", tie, ");
        return (
          <>
            BOSS: {n(e.playerId)} rolled a d{e.sides}: {tries}, {e.won ? "and WON" : "and lost"}
          </>
        );
      }
      case "knockedBack":
        return (
          <>
            {n(e.playerId)} was knocked back {e.spaces} spaces
          </>
        );
      case "bossWeakened":
        return `The boss weakened: ${e.from} + d4 is now ${e.to} + d4`;
      case "showdownRoll":
        return (
          <>
            {e.battle ? "Battle" : "Showdown"}:{" "}
            {Object.entries(e.rolls).flatMap(([id, r], i) => [
              i === 0 ? null : ", ",
              <span key={id}>
                {n(id)} {r.value}
              </span>,
            ])}
          </>
        );
      case "minigameResults": {
        if (!e.played) {
          return (
            <>
              Minigame:{" "}
              {e.ranking.flatMap((g, gi) => [
                gi === 0 ? null : " > ",
                <span key={gi}>{joinedNames(g, " = ")}</span>,
              ])}
            </>
          );
        }
        const { game, scores, labels } = e.played;
        const unit = isClientMinigame(game) ? ` ${CLIENT_MINIGAMES[game].unit}` : "";
        const label = (id: string) => (
          <>
            {n(id)}{" "}
            {labels?.[id] !== undefined ? labels[id] : scores[id] === null ? "(no result)" : `${scores[id]}${unit}`}
          </>
        );
        return (
          <>
            {MINIGAMES[game].name}:{" "}
            {e.ranking.flatMap((g, gi) => [
              gi === 0 ? null : " > ",
              <span key={gi}>{g.map((id, i) => <span key={id}>{i > 0 ? " = " : null}{label(id)}</span>)}</span>,
            ])}
          </>
        );
      }
      case "dieAwarded":
        return (
          <>
            {n(e.playerId)} won a d{e.die.sides}
          </>
        );
      case "defaultDieChanged":
        return e.sides === 4 ? (
          <>
            {n(e.playerId)} came last and rolls a d4 next round
          </>
        ) : null;
      case "matchWon":
        return (
          <>
            {n(e.playerId)} wins!
          </>
        );
      case "battleFinished":
        return <>{n(e.winner)} won a battle{e.losers.length > 0 ? `; ${e.losers.length} opponent${e.losers.length === 1 ? " was" : "s were"} knocked out` : ""}</>;
      case "pairEffect":
        return <>{n(e.playerId)}'s Pair of Candy doubled the effect at {where(e.spaceId)}</>;
    }
  };

  const involvesPlayer = (e: MatchEvent, playerId: string): boolean => {
    switch (e.type) {
      case "roundStarted":
      case "bossWeakened":
      case "chaosSpacePlaced":
        return false;
      case "chaosOutcome":
        return e.playerId === playerId ||
          e.targetPlayerId === playerId ||
          (e.coinTransfers?.some((transfer) => transfer.giver === playerId || transfer.receiver === playerId) ?? false) ||
          (e.itemTransfers?.some((transfer) => transfer.giver === playerId || transfer.receiver === playerId) ?? false) ||
          (e.teleports?.some((teleport) => teleport.playerId === playerId) ?? false);
      case "battleFinished":
        return e.winner === playerId || e.losers.includes(playerId);
      case "itemBlocked":
        return e.playerId === playerId || e.target === playerId;
      case "itemUsed":
        return e.playerId === playerId || e.target === playerId;
      case "playerDied":
        return e.playerId === playerId || e.sourcePlayerId === playerId;
      case "coinsStolen":
        return e.from === playerId || e.to === playerId;
      case "trapTriggered":
        return e.ownerId === playerId || e.victims.includes(playerId) || (e.blocked?.includes(playerId) ?? false);
      case "collision":
        return e.playerIds.includes(playerId) || (e.saved?.includes(playerId) ?? false);
      case "showdownRoll":
        return playerId in e.rolls;
      case "itemStolen":
        return e.from === playerId || e.to === playerId;
      case "candySpiritTriggered":
        return e.playerId === playerId || e.target === playerId || e.knockedOut === playerId;
      case "minigameResults":
        return e.ranking.flat().includes(playerId);
      default:
        return "playerId" in e && e.playerId === playerId;
    }
  };
  /** Events where you are the player acting, the target, or otherwise involved. */
  const affectsYou = (e: MatchEvent): boolean =>
    !!me && (e.type === "chaosOutcome" || involvesPlayer(e, me));

  type Round = { round: number; lines: { node: ReactNode; event: MatchEvent; yours: boolean }[] };
  const rounds: Round[] = [];
  for (const event of match.events) {
    if (event.type === "roundStarted") rounds.push({ round: event.round, lines: [] });
    if (rounds.length === 0) continue;
    const node = format(event);
    if (node !== null) rounds[rounds.length - 1]!.lines.push({ node, event, yours: affectsYou(event) });
  }

  const renderRounds = (onlyYours: boolean, playerId: string | null = null) => {
    const shown = rounds
      .map((group) => ({
        round: group.round,
        lines: group.lines.filter((line) =>
          (!onlyYours || line.yours) &&
          (playerId === null || involvesPlayer(line.event, playerId)),
        ),
      }))
      .filter((group) => group.lines.length > 0)
      .reverse();
    if (shown.length === 0) return <p className="muted small-text">{onlyYours ? "Nothing has affected you yet." : "Nothing yet."}</p>;
    return shown.map((group) => (
      <div key={group.round}>
        <h3>Round {group.round}</h3>
        <ul>
          {group.lines.map((line, i) => (
            <li key={i}>{line.node}</li>
          ))}
        </ul>
      </div>
    ));
  };

  return (
      <section className="panel log">
        <h2>What happened</h2>
        <h3 className="log-section">Affects you</h3>
        {renderRounds(true)}
      <details className="all-events">
        <summary>All events</summary>
        <label className="log-player-filter">
          Filter by player
          <select value={playerFilter} onChange={(event) => setPlayerFilter(event.target.value)}>
            <option value="all">All players</option>
            {view.seats.map((seat) => <option key={seat.seatId} value={seat.seatId}>{name(seat.seatId)}</option>)}
          </select>
        </label>
        {renderRounds(false, playerFilter === "all" ? null : playerFilter)}
      </details>
    </section>
  );
}
