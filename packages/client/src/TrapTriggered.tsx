import type { RoomView, TrapStep } from "@pbg/protocol";

export function TrapTriggered({ view, step }: { view: RoomView; step: TrapStep }) {
  if (!view.youSeatId || !step.event.victims.includes(view.youSeatId)) return null;
  const name = (id: string) => {
    const seat = view.seats.find((candidate) => candidate.seatId === id);
    if (!seat) return id;
    return seat.kind === "bot" ? seat.name : `${seat.character} (${seat.name})`;
  };
  const owner = name(step.event.ownerId);
  return (
    <div className="battle-intro trap-triggered" role="dialog" aria-modal="true" aria-labelledby="trap-heading">
      <section className="battle-card trap-card">
        <p className="battle-kicker">Sand Trap · {step.index} of {step.total}</p>
        <div className="trap-alert-icon" aria-hidden="true">⚠</div>
        <h2 id="trap-heading">Trap sprung!</h2>
        <p className="trap-owner">Placed by <strong>{owner}</strong></p>
        <div className="trap-effect-list">
          {step.steals.map((steal) => (
            <p key={`${steal.from}-${steal.to}`}>
              <strong>{name(steal.from)}</strong> lost <strong>{steal.amount} coins</strong> to {owner}
            </p>
          ))}
        </div>
        <p className="trap-location">Space {step.event.spaceId}</p>
      </section>
    </div>
  );
}
