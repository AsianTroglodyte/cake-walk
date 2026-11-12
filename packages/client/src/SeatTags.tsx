import type { SeatView } from "@pbg/protocol";

export function SeatTags({ seat, you }: { seat: SeatView; you: boolean }) {
  return (
    <>
      {you && <span className="tag you">you</span>}
      {seat.isHost && <span className="tag">host</span>}
      {seat.kind === "bot" && <span className="tag">bot</span>}
      {seat.kind === "human" && seat.botControlled && <span className="tag warn">bot playing</span>}
      {seat.kind === "human" && !seat.connected && !seat.botControlled && <span className="tag warn">away</span>}
    </>
  );
}
