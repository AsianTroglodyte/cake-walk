import {
  CELLS,
  RPS_PICKS,
  type FourCornersView,
  type HeadsTailsCall,
  type HeadsTailsView,
  type RpsView,
  type StairwayView,
  type ThreeCellsView,
} from "@pbg/rules";
import { Options, PickedNote, roundLabel, Scores, Who, type GameProps } from "./common";

const RPS_LABEL = { rock: "Rock", paper: "Paper", scissors: "Scissors" } as const;

export function Rps(p: GameProps<RpsView>) {
  const { view: v } = p;
  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)}
      </p>
      {p.canPick && <Options options={RPS_PICKS} label={(o) => RPS_LABEL[o]} onPick={p.send} />}
      <PickedNote p={p} text={RPS_LABEL[p.submitted as keyof typeof RPS_LABEL]} />
      <Scores
        p={p}
        value={(id) => v.points[id]!}
        label={(id) => `${v.points[id]} pts`}
        extra={(id) => v.last && `${RPS_LABEL[v.last.picks[id]!]} (+${v.last.gained[id]})`}
      />
    </>
  );
}

export function Stairway(p: GameProps<StairwayView>) {
  const { view: v } = p;
  const steps = Array.from({ length: v.maxStep }, (_, i) => i + 1);
  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)} · top is {v.top} stairs
      </p>
      {p.canPick && <Options options={steps} onPick={p.send} />}
      <PickedNote p={p} text={String(p.submitted)} />
      <ul className="mg-scores">
        {[...p.players]
          .sort((a, b) => v.heights[b]! - v.heights[a]!)
          .map((id) => (
            <li key={id}>
              <Who id={id} p={p} />
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.min(100, (v.heights[id]! / v.top) * 100)}%`, background: p.color(id) }} />
              </span>
              <span className="stat">{v.heights[id]}</span>
              {v.last && (
                <span className="stat">
                  picked {v.last.picks[id]}
                  {v.last.moved.includes(id) ? "" : " (blocked)"}
                </span>
              )}
            </li>
          ))}
      </ul>
    </>
  );
}

const CALL_LABEL: Record<HeadsTailsCall, string> = { stop: "Stop", heads: "Heads", tails: "Tails" };

export function HeadsTails(p: GameProps<HeadsTailsView>) {
  const { view: v } = p;
  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)}
        {v.last && ` · last flip: ${CALL_LABEL[v.last.flip]}`}
      </p>
      {p.canPick && (
        <Options
          options={["stop", "heads", "tails"] as const}
          label={(o) => (o === "stop" ? `Stop (keep ${v.points[p.me!]})` : CALL_LABEL[o])}
          onPick={p.send}
        />
      )}
      <PickedNote p={p} text={CALL_LABEL[p.submitted as HeadsTailsCall]} />
      <Scores
        p={p}
        value={(id) => v.points[id]!}
        label={(id) => `${v.points[id]} pts`}
        extra={(id) =>
          v.status[id] === "betting" ? (v.last?.calls[id] ? `called ${CALL_LABEL[v.last.calls[id]!]}` : "betting") : v.status[id]
        }
      />
    </>
  );
}

export function ThreeCells(p: GameProps<ThreeCellsView>) {
  const { view: v } = p;
  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)}
      </p>
      {p.canPick && <Options options={CELLS} label={(c) => `Cell ${c}`} onPick={p.send} />}
      <PickedNote p={p} text={`Cell ${p.submitted}`} />
      {v.last && (
        <div className="mg-cells">
          {CELLS.map((c) => (
            <div key={c} className={`mg-cell ${v.last!.fallen.includes(c) ? "fallen" : ""}`}>
              <strong>
                Cell {c}
                {v.last!.fallen.includes(c) && " fell!"}
              </strong>
              {p.players
                .filter((id) => v.last!.picks[id] === c)
                .map((id) => (
                  <div key={id}>
                    <Who id={id} p={p} />
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      <Scores
        p={p}
        value={(id) => v.points[id]!}
        label={(id) => `${v.points[id]} pts`}
        extra={(id) => v.last && `+${v.last.gained[id]}`}
      />
    </>
  );
}

export function FourCorners(p: GameProps<FourCornersView>) {
  const { view: v } = p;
  const rank = (id: string) => v.outRound[id] ?? 99;
  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)}
        {v.last && ` · corner ${v.last.chosen + 1} was chosen`}
      </p>
      {p.canPick && <Options options={v.corners} label={(c) => `Corner ${c + 1}`} onPick={p.send} />}
      <PickedNote p={p} text={`Corner ${Number(p.submitted) + 1}`} />
      <Scores
        p={p}
        value={rank}
        label={(id) => (v.outRound[id] === null ? "still in" : `out in round ${v.outRound[id]}`)}
        extra={(id) => v.last?.picks[id] !== undefined && `was in corner ${v.last.picks[id]! + 1}`}
      />
    </>
  );
}
