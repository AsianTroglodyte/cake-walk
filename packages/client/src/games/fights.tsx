import { useEffect, useRef } from "react";
import type { LaserAction, LaserFightView, TimebombView } from "@pbg/rules";
import { PickedNote, roundLabel, Scores, Who, type GameProps } from "./common";

export function LaserFight(p: GameProps<LaserFightView>) {
  const { view: v } = p;
  const me = p.me;
  const targets = p.players.filter((id) => id !== me && v.lives[id]! > 0);
  const describe = (a: LaserAction | undefined) =>
    !a ? "" : a.kind === "attack" ? `shot ${p.name(a.target)}` : a.kind === "defend" ? "defended" : "refrained";

  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)}
      </p>
      {p.canPick && me && (
        <>
          <h3>Attack</h3>
          <div className="mg-options">
            {targets.map((id) => (
              <button key={id} className="mg-option" onClick={() => p.send({ kind: "attack", target: id })}>
                <Who id={id} p={p} />
              </button>
            ))}
          </div>
          <div className="mg-options">
            <button className="mg-option" disabled={v.defends[me]! === 0} onClick={() => p.send({ kind: "defend" })}>
              Defend ({v.defends[me]} left)
            </button>
            <button className="mg-option" disabled={v.refrainedLast[me]} onClick={() => p.send({ kind: "refrain" })}>
              Refrain
            </button>
          </div>
        </>
      )}
      <PickedNote p={p} text={describe(p.submitted as LaserAction | undefined)} />
      <Scores
        p={p}
        value={(id) => v.lives[id]! * 100 + (v.outRound[id] ?? 50)}
        label={(id) => (v.lives[id]! > 0 ? "♥".repeat(v.lives[id]!) : `out (round ${v.outRound[id]})`)}
        extra={(id) =>
          v.last?.actions[id] &&
          `${describe(v.last.actions[id])}${v.last.lost[id] ? `, lost ${v.last.lost[id]}` : ""}`
        }
      />
    </>
  );
}

export function Timebomb(p: GameProps<TimebombView>) {
  const { view: v } = p;
  const holding = v.holder === p.me && !v.exploded && p.now >= v.startAt;
  const sendRef = useRef(p.send);
  sendRef.current = p.send;
  const holdingRef = useRef(holding);
  holdingRef.current = holding;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat && holdingRef.current) sendRef.current("pass");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const end = v.endedAt ?? p.now;
  const held = (id: string) => v.held[id]! + (id === v.holder && !v.exploded ? Math.max(0, end - v.holderSince) : 0);
  const seconds = (ms: number) => (ms / 1000).toFixed(1);

  let padClass = "pad";
  let padText: string;
  if (v.exploded) {
    padClass += " wait";
    padText = `BOOM! ${p.name(v.exploded)} exploded`;
  } else if (holding) {
    padClass += " wait";
    padText = `PASS! (${seconds(Math.max(0, p.now - v.holderSince))}s)`;
  } else {
    padText = `${p.name(v.holder)} has the bomb`;
  }

  return (
    <>
      <button
        className={padClass}
        disabled={!holding}
        onPointerDown={(e) => {
          e.preventDefault();
          if (holding) p.send("pass");
        }}
      >
        {padText}
      </button>
      <p className="muted small-text">
        {holding
          ? `Click or press Space to pass. It passes by itself in ${Math.max(0, Math.ceil((v.autoPassAt - p.now) / 1000))}s.`
          : `Order: ${v.order.map(p.name).join(" → ")}`}
      </p>
      <Scores
        p={p}
        value={(id) => (id === v.exploded ? -1 : held(id))}
        label={(id) => (id === v.exploded ? "exploded" : `${seconds(held(id))}s`)}
        extra={(id) => id === v.holder && !v.exploded && "holding"}
      />
    </>
  );
}
