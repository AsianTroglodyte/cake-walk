import { ITEMS } from "@pbg/rules";
import type { Step } from "@pbg/protocol";
import { seatColor } from "./colors";
import type { RoomView } from "@pbg/protocol";
import type { MatchEvent } from "@pbg/rules";
import { boardSpaceLabel } from "./spaceLabels";

type RevealStep = Extract<Step, { kind: "itemReveal" }>;

export function ItemReveal({ view, step }: { view: RoomView; step: RevealStep }) {
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  return (
    <section className="panel item-reveal">
      <h2>Item uses this round</h2>
      <ol className="item-plays">
        {step.plays.map((play, index) => {
          const cancelled = play.status !== "resolved";
          const detail = describe(play, name);
          return (
            <li
              key={`${play.playerId}-${play.kind}-${index}`}
              className={`item-play tier-${play.tier} ${cancelled ? "cancelled" : ""}`}
            >
              <span className="dot" style={{ background: seatColor(view, play.playerId) }} />
              <strong>{name(play.playerId)}</strong>
              <span className="item-name">{ITEMS[play.kind].name}</span>
              {detail && <span className="muted"> — {detail}</span>}
              {play.status === "blocked" && (
                <span className="tag warn">blocked{play.blockedBy ? ` by ${name(play.blockedBy)}` : ""}</span>
              )}
              {play.status === "refunded" && <span className="tag warn">refunded</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Passive Floaties trigger after movement, so report their saves alongside the movement results. */
export function FloatieResults({ view, events }: { view: RoomView; events: MatchEvent[] }) {
  const saves = events.filter((event): event is Extract<MatchEvent, { type: "floatieSaved" }> => event.type === "floatieSaved");
  if (saves.length === 0) return null;
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const board = view.match!.board;
  return (
    <section className="panel item-reveal floatie-results" aria-labelledby="floatie-results-heading">
      <h2 id="floatie-results-heading">Floaties triggered</h2>
      <ul>
        {saves.map((save, index) => (
          <li key={`${save.playerId}-${save.spaceId}-${index}`}>
            <strong>{name(save.playerId)}</strong>'s Floatie saved them from a collision at Space{" "}
            <strong>{boardSpaceLabel(board, save.spaceId)}</strong>.
          </li>
        ))}
      </ul>
    </section>
  );
}

function describe(
  play: RevealStep["plays"][number],
  name: (id: string) => string,
): string {
  const target = play.target !== undefined ? name(play.target) : null;
  switch (play.kind) {
    case "coinThief":
      return target ? `steals ${play.amount ?? 0} coins from ${target}` : "steals coins";
    case "shove":
      return target ? `shoves ${target} back ${play.amount ?? 0} spaces` : "shoves a player back";
    case "collision":
      return target ? `sends ${target} back to the last checkpoint` : "sends a player back";
    case "sandTrap":
      return "placed a trap";
    case "sandDie":
      return target ? `${target} rolls the sand die` : "rolls the sand die";
    case "weight":
      return target ? `${target} gets a weight on their roll` : "adds a weight";
    case "booster":
      return "adds 3 to their movement roll";
    case "extraDie":
      return "rolls an extra die";
    case "shield":
      return "blocks every item used on them";
    default:
      return ITEMS[play.kind].description;
  }
}
