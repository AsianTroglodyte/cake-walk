import type { DeathStep } from "@pbg/protocol";

export function DeathAnnouncement({ step }: { step: DeathStep }) {
  const sourceLabel = (reason: DeathStep["events"][number]["reason"]) => {
    switch (reason) {
      case "blackSpace": return "Black space";
      case "rainbowChaos": return "Rainbow Chaos";
    }
  };
  const source = step.events[0];
  return (
    <div className="battle-intro death-announcement" role="dialog" aria-modal="true" aria-labelledby="death-heading">
      <section className="battle-card death-card">
        <p className="battle-kicker">Knockout</p>
        <div className="death-icon" aria-hidden="true">☠</div>
        <h2 id="death-heading">Knocked out!</h2>
        <p className="death-cause">Cause: {source ? sourceLabel(source.reason) : "Unknown source"}</p>
      </section>
    </div>
  );
}
