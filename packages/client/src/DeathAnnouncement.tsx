import { ITEMS } from "@pbg/rules";
import type { DeathStep, RoomView } from "@pbg/protocol";

export function DeathAnnouncement({ step, view }: { step: DeathStep; view: RoomView }) {
  const name = (id: string) => view.seats.find((seat) => seat.seatId === id)?.character ?? id;
  const sourceLabel = (event: DeathStep["events"][number]) => {
    if (event.reason === "battle") {
      return event.cause === "jellyBoxingGloves" ? "Battle (Jelly Boxing Gloves)" : "Battle";
    }
    if (event.cause) return ITEMS[event.cause].name;
    switch (event.reason) {
      case "blackSpace": return "Black space";
      case "rainbowChaos": return "Rainbow Chaos";
      case "item": return "Item effect";
    }
  };
  const source = step.events[0];
  return (
    <div className="battle-intro death-announcement" role="dialog" aria-modal="true" aria-labelledby="death-heading">
      <section className="battle-card death-card">
        <p className="battle-kicker">Knockout</p>
        <div className="death-icon" aria-hidden="true">☠</div>
        <h2 id="death-heading" className="death-title">You were knocked out!</h2>
        {source && (
          <div className="death-details">
            <p className="death-detail">
              <span className="death-label">Cause</span>
              <strong className="death-value">{sourceLabel(source)}</strong>
              {source.cause && (source.reason !== "battle" || source.cause === "jellyBoxingGloves") && (
                <span className="death-description">{ITEMS[source.cause].description}</span>
              )}
            </p>
            {source.reason !== "blackSpace" && source.reason !== "rainbowChaos" && source.sourcePlayerId && (
              <p className="death-detail">
                <span className="death-label">Caused by</span>
                <strong className="death-value">{name(source.sourcePlayerId)}</strong>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
