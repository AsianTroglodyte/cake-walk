import { ITEMS } from "@pbg/rules";
import type { Step } from "@pbg/protocol";
import { seatColor } from "./colors";
import type { RoomView } from "@pbg/protocol";
import type { MatchEvent } from "@pbg/rules";
import { boardSpaceLabel } from "./spaceLabels";

type RevealStep = Extract<Step, { kind: "itemReveal" }>;

export function ItemReveal({ view, step }: { view: RoomView; step: RevealStep }) {
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const knockouts = step.knockoutEvents ?? [];
  return (
    <section className="panel item-reveal">
      <h2>Item uses this round</h2>
      <ol className="item-plays">
        {step.plays.map((play, index) => {
          const cancelled = play.status !== "resolved";
          const cancellationVisible = play.cancelledByCustom &&
            (play.cancelledByCustomPlayerId === view.youSeatId || play.playerId === view.youSeatId);
          const detail = describe(play, name);
          const affected = play.affectedPlayers?.map(name);
          const knockedOut = knockouts.some((event) =>
            event.sourcePlayerId === play.playerId && event.cause === play.kind,
          );
          const affectsYou = view.youSeatId !== null && (
            play.affectedPlayers?.includes(view.youSeatId) === true ||
            (play.status === "resolved" && play.playerId === view.youSeatId && (
              (ITEMS[play.kind].tier === "self" && ITEMS[play.kind].target === "none") ||
              play.kind === "shield"
            ))
          );
          return (
            <li
              key={`${play.playerId}-${play.kind}-${index}`}
              className={`item-play tier-${play.tier} ${cancelled || cancellationVisible ? "cancelled" : ""} ${affectsYou ? "affects-you" : ""}`}
            >
              <span className="dot" style={{ background: seatColor(view, play.playerId) }} />
              <strong>{name(play.playerId)}</strong>
              <span className="item-name">{ITEMS[play.kind].name}</span>
              {detail && <span className="muted"> — {detail}</span>}
              {knockedOut && <span className="item-knockout" title="This item knocked out a player">💀</span>}
              {affected && affected.length > 0 && (
                <span className="item-affected">Affects: {affected.join(", ")}</span>
              )}
              {play.status === "blocked" && (
                <span className="tag warn">blocked{play.blockedBy ? ` by ${name(play.blockedBy)}` : ""}</span>
              )}
              {play.status === "refunded" && <span className="tag warn">refunded</span>}
              {cancellationVisible && <span className="tag warn">cancelled by Custom Dice Roll</span>}
            </li>
          );
        })}
      </ol>
      {step.spiritEvents?.length ? (
        <section className="item-spirit-results" aria-label="Candy Spirit results">
          <h3>Candy Spirit results</h3>
          <ul>{step.spiritEvents.map((event, index) => <CandySpiritResult key={`${event.playerId}-${index}`} event={event} name={name} />)}</ul>
        </section>
      ) : null}
    </section>
  );
}

/** Passive Life Rings trigger after movement, so report their saves alongside the movement results. */
export function FloatieResults({ view, events }: { view: RoomView; events: MatchEvent[] }) {
  const saves = events.filter((event): event is Extract<MatchEvent, { type: "floatieSaved" }> => event.type === "floatieSaved");
  const ghostFeetSaves = events.filter((event): event is Extract<MatchEvent, { type: "ghostFeetSaved" }> => event.type === "ghostFeetSaved");
  const knockbacks = events.filter((event): event is Extract<MatchEvent, { type: "forcedBack" }> => event.type === "forcedBack");
  const spirits = events.filter((event): event is Extract<MatchEvent, { type: "candySpiritTriggered" }> => event.type === "candySpiritTriggered");
  if (saves.length === 0 && ghostFeetSaves.length === 0 && knockbacks.length === 0 && spirits.length === 0) return null;
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const board = view.match!.board;
  return (
    <section className="panel item-reveal floatie-results" aria-labelledby="floatie-results-heading">
      <h2 id="floatie-results-heading">Movement item results</h2>
      <ul>
        {saves.map((save, index) => (
          <li key={`${save.playerId}-${save.spaceId}-${index}`}>
            <strong>{name(save.playerId)}</strong>'s Life Ring saved them from a collision at Space{" "}
            <strong>{boardSpaceLabel(board, save.spaceId)}</strong>.
          </li>
        ))}
        {ghostFeetSaves.map((save, index) => (
          <li key={`ghost-feet-${save.playerId}-${index}`}>
            <strong>{name(save.playerId)}</strong>'s Ghost Feet blocked a {ITEMS[save.trapKind].name} at Space{" "}
            <strong>{boardSpaceLabel(board, save.spaceId)}</strong> and were consumed.
          </li>
        ))}
        {knockbacks.map((event, index) => (
          <li key={`gobstopper-${event.playerId}-${index}`}>
            Hooked Gobstopper sent <strong>{name(event.playerId)}</strong> back to the last checkpoint at Space{" "}
            <strong>{boardSpaceLabel(board, event.sentTo)}</strong>.
          </li>
        ))}
        {spirits.map((event, index) => (
          <CandySpiritResult key={`spirit-${event.playerId}-${index}`} event={event} name={name} />
        ))}
      </ul>
    </section>
  );
}

function CandySpiritResult({
  event,
  name,
}: {
  event: Extract<MatchEvent, { type: "candySpiritTriggered" }>;
  name: (id: string) => string;
}) {
  return (
    <li>
      {event.knockedOut
        ? <><strong>{name(event.playerId)}</strong>'s Candy Spirit saved them from being knocked out and knocked out{" "}
          <strong>{name(event.knockedOut)}</strong> instead. <span className="item-knockout" aria-label="knockout">💀</span></>
        : event.target
          ? <><strong>{name(event.playerId)}</strong>'s Candy Spirit saved them from being knocked out and revived them;{" "}
            <strong>{name(event.target)}</strong> was protected by their own Candy Spirit.</>
          : <><strong>{name(event.playerId)}</strong>'s Candy Spirit saved them from being knocked out and revived them; no player caused the knockout.</>}
    </li>
  );
}

function describe(play: RevealStep["plays"][number], name: (id: string) => string): string {
  switch (play.kind) {
    case "coinThief":
      return `steals ${play.amount ?? 0} coins`;
    case "shove":
      return `shoves back ${play.amount ?? 0} spaces`;
    case "collision":
      return "sends a player back to the last checkpoint";
    case "sandTrap":
    case "itemTrap":
    case "deathTrap":
      return "placed a trap";
    case "sandDie":
      return "forces a d3 movement roll";
    case "weight":
      return "reduces a movement roll by 3";
    case "booster":
      return "adds 3 to their movement roll";
    case "extraDie":
      return "rolls an extra die";
    case "chocolateCoinMachine":
      return `spends ${play.amount ?? 0} coins for extra movement`;
    case "infiniteItemBag":
      return `spends ${play.amount ?? 0} coins to draw extra items`;
    case "chocolateCoinBag":
      return `gained ${play.amount ?? 0} coins`;
    case "candyExplosion":
      return play.outcome === "success"
        ? `targeted ${play.target ? name(play.target) : "unknown player"} — success, the explosion hit the target area`
        : play.outcome === "backfire"
          ? `targeted ${play.target ? name(play.target) : "unknown player"} — backfire, the explosion hit the user’s area`
          : ITEMS[play.kind].description;
    case "candyGun":
      return play.outcome === "success"
        ? "success — hit the target"
        : play.outcome === "failure"
          ? "failed — the target was not knocked out"
          : ITEMS[play.kind].description;
    case "powerCreep":
      return `gains 1 movement for every 3 spaces behind first place; gained ${play.amount ?? 0} movement`;
    case "mimic":
    case "trainedMimic":
      return play.stolenItem
        ? `stole ${ITEMS[play.stolenItem].name}`
        : "failed to steal an item";
    case "shield":
      return "protects you from item effects and traps this round";
    default:
      return ITEMS[play.kind].description;
  }
}
