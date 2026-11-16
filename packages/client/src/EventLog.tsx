import type { ReactNode } from "react";
import type { RoomView } from "@pbg/protocol";
import { CLIENT_MINIGAMES, isClientMinigame, ITEMS, MINIGAMES, type MatchEvent, type SpaceId } from "@pbg/rules";

export function EventLog({ view }: { view: RoomView }) {
  const match = view.match!;
  const me = view.youSeatId;
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const chaosDescription = (description: string) => {
    const seats = view.seats.filter((seat) => seat.name.length > 0).sort((a, b) => b.name.length - a.name.length);
    return seats.reduce((text, seat) => text.replaceAll(seat.name, seat.character), description);
  };
  /** A character's name, bolded everywhere it appears. */
  const n = (id: string) => <strong>{name(id)}</strong>;
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
            {e.source ? <> (Sand Die from {n(e.source)})</> : null}
          </>
        );
      case "moved":
        return (
          <>
            {n(e.playerId)} moved {e.path.length} space{e.path.length === 1 ? "" : "s"} ({where(end(e.path))})
          </>
        );
      case "moveSkipped":
        return <>{n(e.playerId)} skipped this move</>;
      case "playerDied":
        return <>{n(e.playerId)} was knocked out{e.reason === "blackSpace" ? " by a Black space" : " by Rainbow Chaos"}</>;
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
        return (
          <>
            {n(e.playerId)} {e.delta > 0 ? "+" : ""}
            {e.delta} coins
          </>
        );
      case "itemBought":
        return `You bought a ${ITEMS[e.item.kind].name}`;
      case "itemUsed":
        return e.kind === "sandTrap" ? (
          <>
            {n(e.playerId)} hid a Sand Trap somewhere
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
            {n(e.target)}'s Shield blocked {n(e.playerId)}'s {ITEMS[e.kind].name}
          </>
        );
      case "coinsStolen":
        return e.reason === "trap" ? (
          <>
            {n(e.from)} lost {e.amount} coins to the trap
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
        const why = e.kind === "weight" ? "Weight" : e.kind === "booster" ? "Booster" : "Extra Die";
        return (
          <>
            {n(e.playerId)}'s roll: {e.from} to {e.to} ({why}
            {e.source ? <> from {n(e.source)}</> : null})
          </>
        );
      }
      case "trapPlaced":
        return `You hid a Sand Trap (${where(e.spaceId)})`;
      case "trapRefunded":
        return `Your Sand Trap couldn't go there (${where(e.spaceId)}), so you got it back`;
      case "trapTriggered":
        return (
          <>
            TRAP: {e.victims.map(n).flatMap((node, i) => (i === 0 ? [node] : [" & ", node]))} stopped on{" "}
            {n(e.ownerId)}'s Sand Trap ({where(e.spaceId)})
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
        const saved = e.saved?.length ? <> ({e.saved.map(n).flatMap((node, i) => (i === 0 ? [node] : [" & ", node]))} stayed with a Floatie)</> : null;
        return (
          <>
            COLLISION: {e.playerIds.map(n).flatMap((node, i) => (i === 0 ? [node] : [" & ", node]))}
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
            {n(e.playerId)}'s Floatie saved them
          </>
        );
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
            Showdown:{" "}
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
                <span key={gi}>{g.map(n).flatMap((node, i) => (i === 0 ? [node] : [" = ", node]))}</span>,
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
              <span key={gi}>{g.map((id) => label(id)).flatMap((node, i) => (i === 0 ? [node] : [" = ", node]))}</span>,
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
    }
  };

  /** Events where you are the player acting, the target, or otherwise involved. */
  const affectsYou = (e: MatchEvent): boolean => {
    if (!me) return false;
    switch (e.type) {
      case "roundStarted":
      case "bossWeakened":
      case "chaosSpacePlaced":
        return false;
      case "itemBlocked":
        return e.playerId === me || e.target === me;
      case "coinsStolen":
        return e.from === me || e.to === me;
      case "trapTriggered":
        return e.ownerId === me || e.victims.includes(me);
      case "collision":
        return e.playerIds.includes(me) || (e.saved?.includes(me) ?? false);
      case "showdownRoll":
        return me in e.rolls;
      case "chaosOutcome":
        return true;
      case "minigameResults":
        return e.ranking.flat().includes(me);
      default:
        return e.playerId === me;
    }
  };

  type Round = { round: number; lines: { node: ReactNode; yours: boolean }[] };
  const rounds: Round[] = [];
  for (const event of match.events) {
    if (event.type === "roundStarted") rounds.push({ round: event.round, lines: [] });
    if (rounds.length === 0) continue;
    const node = format(event);
    if (node !== null) rounds[rounds.length - 1]!.lines.push({ node, yours: affectsYou(event) });
  }

  const renderRounds = (onlyYours: boolean) => {
    const shown = rounds
      .map((group) => ({ round: group.round, lines: group.lines.filter((line) => !onlyYours || line.yours) }))
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
        {renderRounds(false)}
      </details>
    </section>
  );
}
