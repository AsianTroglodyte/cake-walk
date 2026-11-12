import { useState } from "react";
import { scoreYahtzee, SHUT_BOX_TILES, YAHTZEE_ROLLS, type ShutBoxView, type YahtzeeView } from "@pbg/rules";
import { PickedNote, plural, Scores, type GameProps } from "./common";

const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function Yahtzee(p: GameProps<YahtzeeView>) {
  const { view: v } = p;
  const [keep, setKeep] = useState<number[]>([]);
  const mine = p.me ? v.dice[p.me] : undefined;
  const toggle = (i: number) => setKeep(keep.includes(i) ? keep.filter((k) => k !== i) : [...keep, i]);
  const score = (id: string) => scoreYahtzee(v.dice[id]!);

  return (
    <>
      {mine && (
        <>
          <div className="mg-dice">
            {mine.map((d, i) => (
              <button
                key={i}
                className={`die-face ${keep.includes(i) ? "kept" : ""}`}
                disabled={!p.canPick}
                onClick={() => toggle(i)}
              >
                {FACES[d]}
              </button>
            ))}
          </div>
          <p className="muted">
            {score(p.me!).score} points{score(p.me!).bonus ? ` (${score(p.me!).bonus})` : ""} ·{" "}
            {plural(YAHTZEE_ROLLS - v.rolls[p.me!]!, "roll")} left
            {v.stopped[p.me!] && " · you stopped"}
          </p>
        </>
      )}
      {p.canPick && (
        <div className="row">
          <button className="primary" disabled={keep.length === 5} onClick={() => p.send(keep)}>
            Reroll the others
          </button>
          <button onClick={() => p.send([0, 1, 2, 3, 4])}>Keep all and stop</button>
        </div>
      )}
      {p.canPick && <p className="muted small-text">Click dice to keep them.</p>}
      <PickedNote p={p} />
      <Scores
        p={p}
        value={(id) => score(id).score}
        label={(id) => `${score(id).score}${score(id).bonus ? ` (${score(id).bonus})` : ""}`}
        extra={(id) => `${v.dice[id]!.join(" ")}${v.stopped[id] || v.rolls[id] === YAHTZEE_ROLLS ? " · done" : ""}`}
      />
    </>
  );
}

export function ShutBox(p: GameProps<ShutBoxView>) {
  const { view: v } = p;
  const [chosen, setChosen] = useState<number[]>([]);
  const open = p.me ? v.open[p.me] : undefined;
  const roll = p.me ? v.roll[p.me] : null;
  const target = roll ? roll[0] + roll[1] : 0;
  const sum = chosen.reduce((a, b) => a + b, 0);
  const left = (id: string) => v.open[id]!.reduce((a, b) => a + b, 0);
  const toggle = (t: number) => setChosen(chosen.includes(t) ? chosen.filter((c) => c !== t) : [...chosen, t]);

  return (
    <>
      {open && (
        <>
          <p className="mg-big">
            {roll ? `Roll: ${FACES[roll[0]]} ${FACES[roll[1]]} = ${target}` : open.length === 0 ? "You cleared every tile!" : "No move: you're done."}
          </p>
          <div className="tiles">
            {Array.from({ length: SHUT_BOX_TILES }, (_, i) => i + 1).map((t) => (
              <button
                key={t}
                className={`tile ${open.includes(t) ? "" : "shut"} ${chosen.includes(t) ? "kept" : ""}`}
                disabled={!p.canPick || !open.includes(t)}
                onClick={() => toggle(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}
      {p.canPick && (
        <button className="primary" disabled={sum !== target} onClick={() => p.send(chosen)}>
          Flip {chosen.length ? [...chosen].sort((a, b) => a - b).join(" + ") : "tiles"} ({sum} of {target})
        </button>
      )}
      <PickedNote p={p} />
      <Scores
        p={p}
        value={(id) => -left(id)}
        label={(id) => `${left(id)} left`}
        extra={(id) => (v.roll[id] ? "playing" : "done")}
      />
    </>
  );
}
