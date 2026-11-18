import type { ChaosStep, RoomView } from "@pbg/protocol";
import { ITEMS } from "@pbg/rules";
import { boardSpaceLabel } from "./spaceLabels";

export function ChaosSpace({ view, step }: { view: RoomView; step: ChaosStep }) {
  const name = (id: string | undefined) => {
    if (!id) return "Unknown player";
    const seat = view.seats.find((candidate) => candidate.seatId === id);
    if (!seat) return id;
    return seat.kind === "bot" ? seat.name : `${seat.character} (${seat.name})`;
  };
  const description = [...view.seats]
    .filter((seat) => seat.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length)
    .reduce(
      (text, seat) => text.replaceAll(seat.name, seat.kind === "bot" ? seat.name : `${seat.character} (${seat.name})`),
      step.event.description,
    );
  const rainbow = step.event.spaceType === "rainbowChaos";
  const initiatorStage = step.stage === "initiator";
  const targetStage = step.stage === "targetSpin";
  const rainbowIntro = step.stage === "rainbowIntro";
  const effectStage = step.stage === "effectSpin";
  const heading = rainbow ? "Rainbow Chaos!" : "Monochrome Chaos!";

  return (
    <div className={`battle-intro chaos ${rainbow ? "rainbow" : "monochrome"}`} role="dialog" aria-modal="true" aria-labelledby="chaos-heading">
      <section className="battle-card chaos-card">
        <p className="battle-kicker">Absolute Chaos · {step.index} of {step.total}</p>
        <div className="battle-art" aria-hidden="true">{rainbow ? "🌈" : "◐"}</div>
        <h2 id="chaos-heading">{heading}</h2>
        {initiatorStage && (
          <>
            <p className="muted">Chaos activated by</p>
            <div className="chaos-tension">{name(step.event.playerId)}</div>
          </>
        )}
        {targetStage && (
          <>
            <p className="muted">The chosen player is…</p>
            <div className="chaos-tension spinning" aria-label={`Chosen player: ${name(step.event.targetPlayerId)}`}>
              {name(step.event.targetPlayerId)}
            </div>
          </>
        )}
        {rainbowIntro && (
          <>
            <p className="chaos-initiator">Triggered by {name(step.event.playerId)}</p>
            <p className="chaos-initiator">Everyone is affected!</p>
            <div className="chaos-tension">Preparing Rainbow Chaos…</div>
          </>
        )}
        {effectStage && (
          <>
            <p className="chaos-initiator">{rainbow ? `Triggered by ${name(step.event.playerId)} · Everyone is affected!` : `${name(step.event.playerId)} and ${name(step.event.targetPlayerId)}`}</p>
            <p className="muted">Chaos time!</p>
            <p className="chaos-effect-line" role="status">
              {description}
            </p>
            {!rainbow && step.event.teleports?.map((teleport) => (
              <p className="chaos-teleport-route" key={teleport.playerId}>
                ({boardSpaceLabel(view.match!.board, teleport.from)} → {boardSpaceLabel(view.match!.board, teleport.to)})
              </p>
            ))}
            {step.event.coinTransfers?.some((transfer) => transfer.given < transfer.requested) && (
              <ul className="chaos-coin-transfers">
                {step.event.coinTransfers.filter((transfer) => transfer.given < transfer.requested).map((transfer, index) => (
                  <li key={`${transfer.giver}-${transfer.receiver}-${index}`}>
                    {transfer.given} coins were given.
                  </li>
                ))}
              </ul>
            )}
            {step.event.itemTransfers?.length ? (
              <ul className="chaos-item-transfers">
                {step.event.itemTransfers.map((transfer, index) => (
                  <li key={`${transfer.giver}-${transfer.receiver ?? "lost"}-${index}`}>
                    {name(transfer.giver)} {transfer.receiver ? `gave to ${name(transfer.receiver)}` : "lost"}:{" "}
                    {transfer.items.map((kind) => ITEMS[kind].name).join(", ")}.
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
