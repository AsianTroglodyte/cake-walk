import { useEffect, useRef, useState } from "react";
import type { BossBattleStep, ClientAction, RoomView } from "@pbg/protocol";
import { seatColor } from "./colors";

export function BossBattle({ view, step, act }: {
  view: RoomView;
  step: BossBattleStep;
  act: (action: ClientAction) => void;
}) {
  const match = view.match!;
  const [die, setDie] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const decision = match.you?.decision;
  const choosing = step.stage === "choosing";
  const yourTurn = choosing && decision?.kind === "boss";
  const locked = choosing && view.youSeatId !== null && step.selected[view.youSeatId] !== undefined;
  const options = decision?.kind === "boss" ? decision.dice : [];
  const chosen = options.find((d) => d.id === die) ?? options[0];
  const outcome = step.stage === "outcome" ? step : null;
  const playerName = choosing ? "" : name(step.playerId);
  useEffect(() => {
    const firstInput = dialog.current?.querySelector<HTMLInputElement>("input");
    (firstInput ?? dialog.current)?.focus();
  }, [step.stage, locked]);

  return (
    <div className="battle-intro boss" role="dialog" aria-modal="true" aria-labelledby="boss-heading" tabIndex={-1} ref={dialog}>
      <section className="battle-card boss-card">
        <p className="battle-kicker">Final boss</p>
        <div className="battle-art" aria-hidden="true">🦈</div>
        <h2 id="boss-heading">{choosing ? "The boss blocks the finish!" : `${playerName} vs the boss`}</h2>
        {choosing ? (
          <>
            <p className="battle-rule">
              Choose a die to fight. Your roll must beat {match.bossFixed} + d4.
              {" "}You roll first; the boss rolls 2 seconds later. Ties reroll.
            </p>
            <ul className="battle-contenders">
              {step.contenders.map((id) => (
                <li key={id} className={step.selected[id] !== undefined ? "ready" : ""}>
                  <span className="dot" style={{ background: seatColor(view, id) }} />
                  <strong>{name(id)}</strong>
                  <span>{step.selected[id] !== undefined ? `d${step.selected[id]} selected` : "choosing a die…"}</span>
                </li>
              ))}
            </ul>
            {yourTurn && !locked ? (
              <form onSubmit={(e) => {
                e.preventDefault();
                if (chosen) act({ type: "submitBattle", choice: { die: chosen.id } });
              }}>
                <fieldset className="boss-dice">
                  <legend>Choose your battle die</legend>
                  {options.map((option) => (
                    <label key={option.id ?? "default"} className={`boss-die-option ${chosen?.id === option.id ? "selected" : ""}`}>
                      <input type="radio" name="boss-die" value={option.id ?? "default"} checked={chosen?.id === option.id}
                        onChange={() => setDie(option.id)} />
                      <strong>d{option.sides}</strong>
                      <span>{option.id === null ? "Default · free" : "Saved · used up"}</span>
                    </label>
                  ))}
                </fieldset>
                {options.length === 1 && options[0]!.sides === 4 && (
                  <p className="battle-rule">Last-place penalty: you must use the d4 this round. Saved dice wait.</p>
                )}
                <button className="primary battle-continue" disabled={!chosen}>Roll {chosen ? `d${chosen.sides}` : "die"}</button>
              </form>
            ) : (
              <p className="boss-message" role="status">
                {locked ? "Die locked in. Waiting for the other challengers…" : "Watch the challengers choose their dice…"}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="battle-rule">Encounter {step.encounter} of {step.encounters} · Roll {step.attempt}</p>
            <div className="boss-rolls">
              <div className="boss-roll">
                <h3>{playerName}</h3>
                <span className="boss-roll-value" key={`${step.playerId}-${step.attempt}`}>{step.playerRoll}</span>
                <span>{step.saved ? "Saved " : ""}d{step.sides}</span>
              </div>
              <span className="boss-versus" aria-hidden="true">{outcome ? step.playerRoll === outcome.bossScore ? "=" : step.playerRoll > outcome.bossScore ? ">" : "<" : "vs"}</span>
              <div className={`boss-roll ${outcome ? "" : "pending"}`}>
                <h3>Final boss</h3>
                <span className="boss-roll-value" key={outcome ? `${step.playerId}-${step.attempt}-boss` : "pending"}
                  aria-label={outcome ? `Boss total ${outcome.bossScore}` : "Boss roll pending"}>
                  {outcome ? outcome.bossScore : "?"}
                </span>
                <span>{outcome ? `${outcome.bossFixed} + d4 roll ${outcome.bossRoll} = ${outcome.bossScore}` : `${match.bossFixed} + d4`}</span>
              </div>
            </div>
            <div className={`boss-message ${outcome?.result ?? ""}`} role="status">
              {!outcome ? <p>{playerName} rolled {step.playerRoll}. The boss rolls in 2 seconds…</p>
                : outcome.result === "tie" ? <><h3>A tie!</h3><p>Both sides roll again with the same dice.</p></>
                  : outcome.result === "won" ? <><h3>Boss defeated!</h3><p>{playerName} wins the fight!</p></>
                    : <><h3>The boss wins this fight.</h3><p>{playerName} is knocked back {outcome.knockback} spaces. The match continues.</p></>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
