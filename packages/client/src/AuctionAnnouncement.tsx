import { ITEMS } from "@pbg/rules";
import type { AuctionAnnouncementStep } from "@pbg/protocol";

export function AuctionAnnouncement({ step }: { step: AuctionAnnouncementStep }) {
  return (
    <div className="battle-intro auction-announcement" role="dialog" aria-modal="true" aria-labelledby="auction-announcement-heading">
      <section className="battle-card">
        <p className="battle-kicker">Round {step.round} · Special event</p>
        <div className="battle-art" aria-hidden="true">🔨</div>
        <h2 id="auction-announcement-heading">The auction is open!</h2>
        <p className="battle-rule">Up for auction: <strong>{ITEMS[step.item].name}</strong></p>
        <p className="auction-announcement-effect">{ITEMS[step.item].description}</p>
      </section>
    </div>
  );
}
