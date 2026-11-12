import type { RoomView } from "@pbg/protocol";
import type { SpaceType } from "@pbg/rules";
import { seatColor } from "./colors";

const LABELS: Record<SpaceType, string> = {
  start: "S",
  checkpoint: "CP",
  finish: "F",
  blue: "+",
  red: "−",
  greenArrow: "→",
  purpleArrow: "←",
};

const DESCRIPTIONS: Record<SpaceType, string> = {
  start: "Start (safe)",
  checkpoint: "Checkpoint (safe)",
  finish: "Finish: fight the boss",
  blue: "Blue: gain coins",
  red: "Red: lose coins",
  greenArrow: "Green arrow: move forward",
  purpleArrow: "Purple arrow: move back",
};

export function Board({ view }: { view: RoomView }) {
  const match = view.match!;
  const { board } = match;
  const length = board.spaces[board.start]!.distanceToFinish;
  const myTraps = new Set(match.you?.traps ?? []);

  return (
    <section className="board-scroll">
      <div
        className="board"
        style={{
          gridTemplateColumns: `repeat(${length + 1}, 64px)`,
          gridTemplateRows: `repeat(${board.paths}, 64px)`,
        }}
      >
        {board.spaces.map((space) => {
          const here = match.players.filter((p) => p.position === space.id);
          const column = length - space.distanceToFinish + 1;
          const row = space.lane === null ? `1 / span ${board.paths}` : `${space.lane + 1}`;
          const names = here.map((p) => view.seats.find((s) => s.seatId === p.seatId)?.character).join(", ");
          return (
            <div
              key={space.id}
              className={`space ${space.type} ${space.collisionFree && space.lane !== null ? "safe" : ""}`}
              style={{ gridColumn: column, gridRow: row }}
              title={`${DESCRIPTIONS[space.type]} · ${space.distanceToFinish} to go${myTraps.has(space.id) ? " · your trap" : ""}${names ? ` · ${names}` : ""}`}
            >
              <span className="label">{LABELS[space.type]}</span>
              {myTraps.has(space.id) && <span className="trap-mark">trap</span>}
              <span className="tokens">
                {here.map((p) => {
                  const seat = view.seats.find((s) => s.seatId === p.seatId);
                  return (
                    <span
                      key={p.seatId}
                      className={`token ${p.seatId === view.youSeatId ? "you" : ""}`}
                      style={{ background: seatColor(view, p.seatId) }}
                    >
                      {seat?.character.slice(0, 2)}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small-text">
        Faded spaces are the safe opening (no collisions). Landing on the same space as someone else sends you both back
        to the last checkpoint. Only you can see your own traps.
      </p>
    </section>
  );
}
