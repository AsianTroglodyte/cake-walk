import { CLIENT_MINIGAMES, isClientMinigame, ITEMS, MINIGAMES, type MinigamePrize, type PlayerId } from "@pbg/rules";
import type { ClientAction, RoomView, Step } from "@pbg/protocol";
import { seatColor } from "./colors";

type ResultsStep = Extract<Step, { kind: "results" }>;

const ORDINALS = ["1st", "2nd", "3rd"];
const ordinal = (n: number) => ORDINALS[n - 1] ?? `${n}th`;

function prizeText(prize: MinigamePrize): string[] {
  const parts: string[] = [];
  if (prize.coins > 0) parts.push(`+${prize.coins} coins`);
  if (prize.die) parts.push(`d${prize.die}`);
  if (prize.item) parts.push(ITEMS[prize.item].name);
  if (prize.itemSkipped) parts.push(`${ITEMS[prize.itemSkipped].name} (no room)`);
  if (prize.d4) parts.push("d4 next round");
  return parts;
}

export function Results({ view, step, act }: { view: RoomView; step: ResultsStep; act: (action: ClientAction) => void }) {
  const match = view.match!;
  const name = (id: PlayerId) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const me = view.youSeatId;
  const ready = !!match.players.find((p) => p.seatId === me)?.ready;
  const played = step.played;
  const unit = played && isClientMinigame(played.game) ? ` ${CLIENT_MINIGAMES[played.game].unit}` : "";
  const result = (id: PlayerId) => {
    if (!played) return null;
    if (played.labels?.[id] !== undefined) return played.labels[id];
    const score = played.scores[id];
    return score === null || score === undefined ? "no result" : `${score}${unit}`;
  };

  let place = 1;
  const rows = step.ranking.map((group) => {
    const at = place;
    place += group.length;
    return { place: at, ids: group };
  });

  return (
    <section className="panel minigame results">
      <h2>{played ? `${MINIGAMES[played.game].name}: results` : "Minigame results"}</h2>
      <table className="results-table">
        <thead>
          <tr>
            <th>Place</th>
            <th>Player</th>
            <th>Result</th>
            <th>Prizes</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap(({ place: at, ids }) =>
            ids.map((id) => (
              <tr key={id} className={id === me ? "mine" : ""}>
                <td>
                  {ordinal(at)}
                  {ids.length > 1 && <span className="muted"> (tie)</span>}
                </td>
                <td>
                  <span className="dot" style={{ background: seatColor(view, id) }} />
                  {name(id)}
                  {id === me && <span className="tag you">you</span>}
                </td>
                <td>{result(id)}</td>
                <td>
                  {prizeText(step.prizes[id]!).map((text) => (
                    <span key={text} className={`prize ${text.startsWith("d4") ? "bad" : ""}`}>
                      {text}
                    </span>
                  ))}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      {me && (
        <button className="primary" disabled={ready} onClick={() => act({ type: "ready" })}>
          {ready ? "Waiting for the others…" : "Continue"}
        </button>
      )}
    </section>
  );
}
