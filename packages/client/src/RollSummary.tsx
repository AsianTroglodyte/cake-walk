import type { MatchEvent, PlayerId, SpaceId } from "@pbg/rules";
import type { RoomView } from "@pbg/protocol";
import { boardSpaceLabel } from "./spaceLabels";

type Roll = Extract<MatchEvent, { type: "dieRolled" }>;
type Change = Extract<MatchEvent, { type: "rollChanged" }>;

export function RollSummary({ view, events }: { view: RoomView; events: MatchEvent[] }) {
  const match = view.match!;
  const rolls = events.filter(
    (event): event is Roll => event.type === "dieRolled" && event.playerId === view.youSeatId,
  );
  const changes = events.filter((event): event is Change => event.type === "rollChanged");
  const failedRevivals = events.filter(
    (event): event is Extract<MatchEvent, { type: "revivalFailed" }> => event.type === "revivalFailed",
  );
  const successfulRevivals = events.filter(
    (event): event is Extract<MatchEvent, { type: "playerRevived" }> => event.type === "playerRevived",
  );
  const moved = new Map(events.flatMap((event) => event.type === "moved" ? [[event.playerId, event.path] as const] : []));
  const arrows = new Map(events.flatMap((event) => event.type === "arrow" ? [[event.playerId, event] as const] : []));
  const setbacks = new Map<PlayerId, SpaceId>();
  for (const event of events) {
    if (event.type === "collision") for (const id of event.playerIds) setbacks.set(id, event.sentTo);
    if (event.type === "forcedBack") setbacks.set(event.playerId, event.sentTo);
  }
  const name = (id: PlayerId) => view.seats.find((seat) => seat.seatId === id)?.character ?? id;
  const space = (id: SpaceId) => `Space ${boardSpaceLabel(match.board, id)}`;
  const yourMoveSkipped = events.some((event) => event.type === "moveSkipped" && event.playerId === view.youSeatId);

  return (
    <section className="panel roll-summary" aria-labelledby="roll-summary-heading" role="status">
      <h2 id="roll-summary-heading">Movement roll results</h2>
      {yourMoveSkipped && (
        <p className="roll-summary-skipped" role="status">
          You can’t move this round because you landed on a Maroon space.
        </p>
      )}
      <div className="roll-summary-list">
        {rolls.map((roll) => {
          const playerChanges = changes.filter((change) => change.playerId === roll.playerId);
          const total = playerChanges.at(-1)?.to ?? roll.value;
          const path = moved.get(roll.playerId) ?? [];
          const arrow = arrows.get(roll.playerId);
          const setback = setbacks.get(roll.playerId);
          const revivalRequirement = failedRevivals.find(
            (event) => event.playerId === roll.playerId && roll.playerId === view.youSeatId,
          )?.requirement ?? null;
          const revivalResult = [...failedRevivals, ...successfulRevivals].find(
            (event) => event.playerId === roll.playerId && roll.playerId === view.youSeatId,
          );
          const successfulRevival = revivalResult?.type === "playerRevived" ? revivalResult : null;
          return (
            <article className="roll-summary-player" key={roll.playerId}>
              <h3>{name(roll.playerId)}</h3>
              <p className="roll-summary-die">
                {name(roll.playerId)} rolled {roll.saved ? "a saved " : "a "}d{roll.sides}: {roll.value}
                {roll.source && <> (Sand Die from {name(roll.source)})</>}
              </p>
              {roll.playerId === view.youSeatId && revivalRequirement !== null && (
                <p className="roll-summary-revival">
                  <strong>Revival roll: {revivalRequirement}+ required</strong>
                </p>
              )}
              {successfulRevival && (
                <p className="roll-summary-revival-result">
                  You revived and moved <strong>{successfulRevival.spaces}</strong> space{successfulRevival.spaces === 1 ? "" : "s"}.
                </p>
              )}
              <strong className="roll-summary-total" aria-label={`Total movement roll: ${total}`}>{total}</strong>
              <span className="roll-summary-total-label">total movement roll</span>
              <ul className="roll-summary-effects">
                {revivalResult?.type === "revivalFailed" && (
                  <li className="roll-summary-revival-result">
                    Modified roll: {revivalResult.rolled}; revival failed (needed {revivalResult.requirement}+), so moved 0 spaces.
                  </li>
                )}
                {playerChanges.map((change, index) => {
                  const why = change.kind === "weight" ? "Weight" : change.kind === "booster" ? "Booster" : "Extra Die";
                  return (
                    <li key={`${change.kind}-${index}`}>
                      {name(roll.playerId)}'s roll: {change.from} to {change.to} ({why}
                      {change.source ? <> from {name(change.source)}</> : null})
                    </li>
                  );
                })}
                <li>
                  {path.length > 0
                    ? `Moved ${path.length} space${path.length === 1 ? "" : "s"} (${space(path[path.length - 1]!)})`
                    : "Did not move"}
                </li>
                {arrow && (
                  <li>
                    {name(roll.playerId)} rode a {arrow.direction === "forward" ? "Green" : "Purple"} arrow {arrow.direction}
                    {" "}({space(arrow.path.at(-1)!)}).
                  </li>
                )}
                {setback !== undefined && <li>Collision sent {name(roll.playerId)} back ({space(setback)}).</li>}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
