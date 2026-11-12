import { useEffect, useRef, useState } from "react";
import { CLIENT_MINIGAMES, MINIGAMES, reactionGoDelay } from "@pbg/rules";
import type { ClientAction, Step } from "@pbg/protocol";

type MinigameStep = Extract<Step, { kind: "minigame"; mode: "client" }>;

interface Props {
  step: MinigameStep;
  clockOffset: number;
  /** The server already has this player's result (for example, after a page reload). */
  submitted: boolean;
  act: (action: ClientAction) => void;
}

type Outcome = { kind: "score"; score: number } | { kind: "falseStart" } | { kind: "tooSlow" };

/** Mount with `key={step.seed}` so every minigame starts fresh. */
export function Minigame({ step, clockOffset, submitted, act }: Props) {
  const info = MINIGAMES[step.game];
  const goAt = step.game === "reaction" ? step.startAt + reactionGoDelay(step.seed) : null;

  const offset = useRef(clockOffset);
  offset.current = clockOffset;
  const actRef = useRef(act);
  actRef.current = act;
  const serverNow = () => Date.now() + offset.current;

  const [now, setNow] = useState(serverNow);
  const [taps, setTaps] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const tapCount = useRef(0);
  const goShownAt = useRef<number | null>(null);
  const sent = useRef(submitted);

  const send = (score: number | null, result: Outcome) => {
    if (sent.current) return;
    sent.current = true;
    setOutcome(result);
    actRef.current({ type: "submitMinigame", score });
  };

  const press = () => {
    const t = serverNow();
    if (sent.current || t < step.startAt) return;
    if (step.game === "mash") {
      if (t < step.endAt) setTaps(++tapCount.current);
      return;
    }
    if (goShownAt.current === null) {
      send(null, { kind: "falseStart" });
    } else {
      const score = Math.round(performance.now() - goShownAt.current);
      send(score, { kind: "score", score });
    }
  };
  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const t = serverNow();
      setNow(t);
      // Reaction time is measured on this browser's own high-resolution clock, from the frame GO appears.
      if (goAt !== null && t >= goAt && goShownAt.current === null) goShownAt.current = performance.now();
      if (!sent.current && t >= step.endAt) {
        if (step.game === "mash") send(tapCount.current, { kind: "score", score: tapCount.current });
        else send(null, { kind: "tooSlow" });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (!e.repeat) pressRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const done = sent.current || submitted;
  const secondsTo = (t: number) => Math.max(0, Math.ceil((t - now) / 1000));

  let padClass = "pad";
  let padText: string;
  if (done) {
    padClass += " done";
    padText = describeOutcome(outcome, CLIENT_MINIGAMES[step.game].unit);
  } else if (now < step.startAt) {
    padText = `Starts in ${secondsTo(step.startAt)}`;
  } else if (step.game === "mash") {
    padClass += " go";
    padText = `TAP! ${taps}`;
  } else if (goAt !== null && now >= goAt) {
    padClass += " go";
    padText = "GO!";
  } else {
    padClass += " wait";
    padText = "Wait for it…";
  }

  return (
    <section className="panel minigame">
      <h2>Minigame: {info.name}</h2>
      <p>{info.instructions}</p>
      <button className={padClass} onPointerDown={(e) => (e.preventDefault(), press())}>
        {padText}
      </button>
      <p className="muted small-text">
        {done
          ? "Waiting for the others…"
          : step.game === "mash" && now >= step.startAt
            ? `${secondsTo(step.endAt)}s left`
            : "Click the big button or press Space."}
      </p>
    </section>
  );
}

function describeOutcome(outcome: Outcome | null, unit: string): string {
  if (!outcome) return "Result sent";
  switch (outcome.kind) {
    case "score":
      return `${outcome.score} ${unit}`;
    case "falseStart":
      return "Too early! You place last.";
    case "tooSlow":
      return "Too slow! No result.";
  }
}
