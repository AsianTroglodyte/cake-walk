import { useEffect, useRef, useState } from "react";
import type { ClientAction, RoomView, ShowdownStep } from "@pbg/protocol";
import { seatColor } from "./colors";

export function Showdown({ view, step, act }: {
  view: RoomView;
  step: ShowdownStep;
  act: (action: ClientAction) => void;
}) {
  const [die, setDie] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const choosing = step.stage === "choosing";
  const decision = view.match!.you?.decision;
  const options = decision?.kind === "showdown" ? decision.dice : [];
  const chosen = options.find((d) => d.id === die) ?? options[0];
  const locked = choosing && view.youSeatId !== null && step.selected[view.youSeatId] !== undefined;
  const round = choosing ? 0 : step.round;
  useEffect(() => {
    const input = dialog.current?.querySelector<HTMLInputElement>("input");
    (input ?? dialog.current)?.focus();
  }, [step.stage, locked, round]);

  const message = choosing ? "Choose your die. Highest roll wins the match."
    : step.stage === "rolling" ? `${name(step.currentPlayer)} rolled ${step.rolls[step.currentPlayer]}. Revealing the next roll…`
      : step.leaders.length === 1 ? `${name(step.leaders[0]!)} wins the match!`
        : `Tie—${step.leaders.map(name).join(", ")} roll again with the same dice.`;

  return (
    <div className="battle-intro showdown" role="dialog" aria-modal="true" aria-labelledby="showdown-heading" tabIndex={-1} ref={dialog}>
      <section className="battle-card showdown-card">
        <p className="battle-kicker">Final showdown</p>
        <h2 id="showdown-heading">{choosing ? "One last roll for the win!" : `Showdown · Round ${step.round}`}</h2>
        <p className="battle-rule">Free-for-all · Rolls revealed 2 seconds apart. Only tied-highest players reroll.</p>
        <p className={`showdown-announcement ${step.stage === "outcome" ? "resolved" : ""}`} role="status">{message}</p>
        <ul className="showdown-grid" aria-label="Showdown contenders">
          {step.contenders.map((id) => {
            const you = id === view.youSeatId;
            const out = !choosing && Object.hasOwn(step.eliminated, id);
            const leader = step.stage === "outcome" && step.leaders.includes(id);
            const winner = leader && step.stage === "outcome" && step.leaders.length === 1;
            const selected = choosing ? step.selected[id] : step.dice[id]?.sides;
            const value = choosing ? undefined : step.rolls[id] ?? step.eliminated[id];
            const status = choosing ? selected === undefined ? "Choosing…" : "Locked in"
              : out ? "Out" : winner ? "Winner!" : leader ? "Tied highest"
                : value === undefined ? "Waiting to roll" : "Rolled";
            return (
              <li key={id} className={`showdown-player ${you ? "you" : ""} ${out ? "out" : ""} ${leader ? "leader" : ""} ${winner ? "winner" : ""}`}>
                <h3>
                  <span className="dot" style={{ background: seatColor(view, id) }} />
                  {name(id)} {you && <span className="tag you">you</span>}
                </h3>
                <p className="showdown-die">{selected === undefined ? "Die not selected" : `d${selected}${!choosing && step.dice[id]?.saved ? " · saved" : ""}`}</p>
                <span className="showdown-roll-value" key={`${round}-${value ?? "pending"}`}
                  aria-label={`${name(id)}: ${value === undefined ? "roll pending" : `rolled ${value}`}`}>
                  {value ?? "?"}
                </span>
                <p className="showdown-player-status">{status}</p>
                {choosing && you && options.length > 0 && !locked && (
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (chosen) act({ type: "submitBattle", choice: { die: chosen.id } });
                  }}>
                    <fieldset className="showdown-dice">
                      <legend>Choose your die</legend>
                      {options.map((option) => (
                        <label key={option.id ?? "default"} className={chosen?.id === option.id ? "selected" : ""}>
                          <input type="radio" name="showdown-die" checked={chosen?.id === option.id} onChange={() => setDie(option.id)} />
                          d{option.sides} <small>{option.id === null ? "(default)" : "(saved)"}</small>
                        </label>
                      ))}
                    </fieldset>
                    {options.length === 1 && options[0]!.sides === 4 && (
                      <p className="small-text">Last-place penalty: use the d4. Saved dice wait.</p>
                    )}
                    <button className="primary" disabled={!chosen}>Roll {chosen ? `d${chosen.sides}` : "die"}</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
        {choosing && <p className="battle-rule">{locked ? "Your die is locked in. Waiting for the other contenders…" : "Bots take 1 second to choose. Spectators see the same reveal order."}</p>}
        {!choosing && Object.keys(step.eliminated).length > 0 && <p className="battle-rule">Eliminated players stay visible. Their last rolls do not count in the next round.</p>}
      </section>
    </div>
  );
}
