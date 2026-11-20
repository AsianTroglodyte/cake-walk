import type { RoomView, TrapStep } from "@pbg/protocol";
import { ITEMS } from "@pbg/rules";

export function TrapTriggered({ view, step }: { view: RoomView; step: TrapStep }) {
  if (!view.youSeatId || (!step.event.victims.includes(view.youSeatId) && !step.event.blocked?.includes(view.youSeatId))) return null;
  const savedByGhostFeet = step.ghostFeetSaves.some((save) => save.playerId === view.youSeatId);
  const protectedByItem = (step.event.blocked?.includes(view.youSeatId) ?? false) && !savedByGhostFeet;
  const name = (id: string) => {
    const seat = view.seats.find((candidate) => candidate.seatId === id);
    if (!seat) return id;
    return seat.kind === "bot" ? seat.name : `${seat.character} (${seat.name})`;
  };
  const owner = name(step.event.ownerId);
  const trapName = step.event.kind === "sandTrap" ? "Coin Trap" : step.event.kind === "itemTrap" ? "Item Trap" : "Death Trap";
  return (
    <div className="battle-intro trap-triggered" role="dialog" aria-modal="true" aria-labelledby="trap-heading">
      <section className="battle-card trap-card">
        <p className="battle-kicker">{trapName} · {step.index} of {step.total}</p>
        <div className="trap-alert-icon" aria-hidden="true">{savedByGhostFeet ? "👣" : protectedByItem ? "🛡" : "⚠"}</div>
        <h2 id="trap-heading">
          {savedByGhostFeet ? "Ghost Feet blocked the trap!" : protectedByItem ? "Your item protected you!" : "Trap sprung!"}
        </h2>
        {savedByGhostFeet && <p>Your Ghost Feet blocked the {trapName} you landed on and were consumed.</p>}
        {protectedByItem && <p>You were protected; the trap had no effect on you.</p>}
        <p className="trap-owner">Placed by <strong>{owner}</strong></p>
        <div className="trap-effect-list">
          {savedByGhostFeet && <p><strong>Ghost Feet</strong> blocked this trap when you landed here.</p>}
          {step.steals.map((steal) => (
            <p key={`${steal.from}-${steal.to}`}>
              <strong>{name(steal.from)}</strong> lost <strong>{steal.amount} coins</strong> to {owner}
            </p>
          ))}
          {step.stolenItems.filter((steal) => steal.from === view.youSeatId).map((steal) => (
            <p key={`${steal.from}-${steal.item.id}`}>
              You lost <strong>{ITEMS[steal.item.kind].name}</strong> to {owner}
            </p>
          ))}
          {step.knockouts.some((knockout) => knockout.playerId === view.youSeatId) && (
            <p>You were knocked out by the Death Trap.</p>
          )}
        </div>
        <p className="trap-location">Space {step.event.spaceId}</p>
      </section>
    </div>
  );
}
