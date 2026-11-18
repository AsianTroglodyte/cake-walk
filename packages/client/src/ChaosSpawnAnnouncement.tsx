import type { ChaosSpawnStep, RoomView } from "@pbg/protocol";
import { boardSpaceLabel } from "./spaceLabels";

export function ChaosSpawnAnnouncement({ view, step }: { view: RoomView; step: ChaosSpawnStep }) {
  const space = view.match!.board.spaces[step.event.spaceId]!;
  const rainbow = step.event.spaceType === "rainbowChaos";
  return (
    <div className={`battle-intro chaos-spawn ${rainbow ? "rainbow" : "monochrome"}`} role="dialog" aria-modal="true" aria-labelledby="chaos-spawn-heading">
      <section className="battle-card chaos-card">
        <p className="battle-kicker">Round {step.event.round}</p>
        <div className="battle-art" aria-hidden="true">{rainbow ? "🌈" : "◐"}</div>
        <h2 id="chaos-spawn-heading">A Chaos Space has spawned!</h2>
        <p className="chaos-spawn-kind">{rainbow ? "Rainbow Chaos" : "Monochrome Chaos"}</p>
        <p>Space {boardSpaceLabel(view.match!.board, space.id)} · {space.distanceToFinish} spaces from the boss</p>
      </section>
    </div>
  );
}
