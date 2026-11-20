import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isValidLetterSwitchWord, LETTER_VALUES, type PlayerId } from "@pbg/rules";
import { Leaderboard, type GameProps } from "./common";

export function CountTheDots({ view, players, me, color, name, send, now }: GameProps<any>) {
  const [guess, setGuess] = useState("");
  const seconds = Math.max(0, Math.ceil(((view.phase === "count" ? view.countEndsAt : view.endAt) - now) / 1000));
  return <div className="new-game count-dots-game">
    <p className="count-dots-timer" role="timer">{view.phase === "count" ? "Count the dots" : "Guess the final count"} · <strong>{seconds}s</strong></p>
    {view.phase === "count" ? <>
      <div className="count-dots-board" aria-label={`${view.dots.length} dots`}>
        {view.dots.map((dot: any) => <button type="button" key={dot.id} className="count-dot"
          aria-label="Remove dot" title="Remove this dot" style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
          onClick={() => send({ kind: "remove", dotId: dot.id })}>•</button>)}
      </div>
      <button className="primary" type="button" onClick={() => send({ kind: "add" })}>Add a dot</button>
      <p className="muted">Adding or removing a dot has a 0.5-second cooldown.</p>
    </> : view.yourGuess == null ? <form className="new-game-form count-dots-answer" onSubmit={(event) => {
      event.preventDefault();
      if (guess.trim() !== "") send({ kind: "guess", count: Number(guess) });
    }}>
      <label>How many dots?
        <input autoFocus type="number" min={0} max={999} value={guess} onChange={(event) => setGuess(event.target.value)} />
      </label>
      <button className="primary" disabled={guess.trim() === ""}>Lock in guess</button>
    </form> : <p>Your guess: <strong>{view.yourGuess}</strong></p>}
    {view.phase === "guess" && view.actualCount != null && <p>Actual count: <strong>{view.actualCount}</strong></p>}
    <Leaderboard p={{ view, players, me, color, name, send, now, canPick: false, submitted: null, stage: "live" }}
      score={(id) => view.yourGuess != null && id === me ? `guessed ${view.yourGuess}` : "—"} caption="Guesses" />
  </div>;
}

export function HideAndSeek({ view, players, me, name, send, now }: GameProps<any>) {
  const [selected, setSelected] = useState<number | null>(null);
  const seconds = Math.max(0, Math.ceil((view.phaseEndsAt - now) / 1000));
  const isSeeker = me === view.seeker;
  const canChoose = view.phase === "hide" ? view.hiders.includes(me) : isSeeker && view.hiders.length > 0;
  const submit = (spotId: number) => {
    setSelected(spotId);
    send({ spotId });
  };
  return <div className="new-game hide-seek-game">
    <p>Round {view.round} · {view.phase === "hide"
      ? `Hiders choose spots · ${seconds}s`
      : view.ending ? `All hiders found · results in ${seconds}s`
        : `${name(view.seeker)} is searching · ${seconds}s`}</p>
    {canChoose && <p>{view.phase === "hide" ? "Choose a hiding spot." : "Choose a spot to search."}</p>}
    <div className="hide-seek-board">
      {view.spots.map((spot: any) => <button key={spot.id} type="button"
        className={`hide-spot${selected === spot.id ? " selected" : ""}${view.hiddenSpots && Object.values(view.hiddenSpots).includes(spot.id) ? " revealed" : ""}`}
        style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }}
        disabled={!canChoose}
        onClick={() => submit(spot.id)}>
        {view.hiddenSpots && Object.entries(view.hiddenSpots).find(([, hiddenSpot]) => hiddenSpot === spot.id)?.[0]
          ? "Hider" : `Spot ${spot.id + 1}`}
      </button>)}
    </div>
    <p>{isSeeker ? "You are the seeker." : `Seeker: ${name(view.seeker)}`}</p>
    {view.yourHiddenSpot != null && <p className="muted">You are hidden in Spot {view.yourHiddenSpot + 1}.</p>}
    {view.lastGuess != null && <p role="status"><strong>{view.lastFound?.length
      ? `${view.lastFound.map((id: PlayerId) => name(id)).join(", ")} ${view.lastFound.length === 1 ? "was" : "were"} found this round.`
      : "No one was found this round."}</strong></p>}
    <div className="hide-seek-players">{players.map((id: PlayerId) => {
      const eliminated = view.foundHiders?.includes(id);
      return <span key={id} className={`${id !== view.seeker ? "hider" : ""}${eliminated ? " eliminated" : ""}`}>
        {eliminated && <i className="hide-seek-eliminated-icon" aria-label="eliminated">×</i>}
        <strong>{name(id)}</strong>
        <small>{id === view.seeker ? "Seeker" : eliminated ? "Found by seeker" : "Hidden"}</small>
      </span>;
    })}</div>
  </div>;
}

const SHOOT_KEYS: Record<string, string> = {
  w: "up", a: "left", s: "down", d: "right", q: "up-left", e: "up-right", z: "down-left", c: "down-right",
};
export function RedLightGreenLight({ view, players, me, color, name, send, stage, now }: GameProps<any>) {
  const boardRef = useRef<HTMLDivElement>(null);
  const lastMoveAt = useRef(0);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const board = boardRef.current;
      if (!board || stage !== "live" || Date.now() - lastMoveAt.current < 50) return;
      lastMoveAt.current = Date.now();
      const rect = board.getBoundingClientRect();
      send({ kind: "move", x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    };
    const onKey = (event: KeyboardEvent) => {
      if (stage !== "live" || view.phase !== "red" || !SHOOT_KEYS[event.key.toLowerCase()]) return;
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|BUTTON)$/.test(event.target.tagName)) return;
      event.preventDefault();
      send({ kind: "shoot", direction: SHOOT_KEYS[event.key.toLowerCase()] });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [send, stage, view.phase]);
  const secondsRemaining = Math.max(0, Math.ceil((view.endAt - now) / 1000));
  return <div className="new-game red-light-game">
    <p className="red-light-clock" role="timer">{secondsRemaining}s remaining</p>
    <p className={`red-light-status ${view.phase}`}>{stage === "countdown" ? "GET READY" : `${view.phase.toUpperCase()} LIGHT`}</p>
    <p>Move your cursor toward the finish. On red, stop and use WASD/QEZC to fire.</p>
    <div className={`red-light-board ${view.phase}`} ref={boardRef}>
      <span className="red-light-finish">FINISH</span>
      {view.walls.map((wall: any, index: number) => <span key={index} className="red-light-wall"
        style={{ left: `${wall.x * 100}%`, top: `${wall.y * 100}%`, width: `${wall.width * 100}%`, height: `${wall.height * 100}%` }} />)}
      {Object.values(view.bullets).map((bullet: any) => <i key={bullet.id} className="red-light-bullet"
        style={{ left: `${bullet.x * 100}%`, top: `${bullet.y * 100}%` }} />)}
      {players.map((id: PlayerId) => {
        const point = view.positions[id];
        const finished = view.finishedAt[id] != null;
        return <span key={id} className={`red-light-player${view.alive.includes(id) ? "" : " out"}${id === me ? " is-you" : ""}`}
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: color(id) }}
          title={`${name(id)}${finished ? " · finished" : ""}`} aria-label={`${name(id)}${finished ? " finished" : ""}`}>
          {finished && <b className="red-light-star" aria-hidden="true">★</b>}
        </span>;
      })}
    </div>
  </div>;
}

export function UnstableMath({ view, players, me, name, color, canPick, submitted, send, now, until, stage }: GameProps<any>) {
  const [guess, setGuess] = useState("");
  const [draft, setDraft] = useState({ ...view.equation });
  const [changedPart, setChangedPart] = useState<string | null>(null);
  const seconds = until == null ? null : Math.max(0, Math.ceil((until - now) / 1000));
  const equation = view.equation;
  const isSaboteur = me === view.saboteur;
  useEffect(() => {
    setDraft({ ...view.equation });
    setChangedPart(null);
    setGuess("");
  }, [view.round, equation.left, equation.operator, equation.right]);
  const range = view.round <= 2 ? [1, 9] : [10, 99];
  const cycleNumber = (side: "left" | "right", digitIndex?: number) => {
    const key = digitIndex == null ? side : `${side}-${digitIndex}`;
    if (changedPart && changedPart !== key) return;
    if (digitIndex == null) {
      const [min, max] = range;
      setDraft((current: any) => ({ ...current, [side]: current[side] >= max ? min : current[side] + 1 }));
    } else {
      setDraft((current: any) => {
        const digits = String(current[side]).split("");
        let next = (Number(digits[digitIndex]) + 1) % 10;
        if (digitIndex === 0 && next === 0) next = 1;
        digits[digitIndex] = String(next);
        return { ...current, [side]: Number(digits.join("")) };
      });
    }
    setChangedPart(key);
  };
  const cycleOperator = () => {
    if (changedPart && changedPart !== "operator") return;
    const operators = ["+", "-", "*", "/"];
    setDraft((current: any) => ({ ...current,
      operator: operators[(operators.indexOf(current.operator) + 1) % operators.length] }));
    setChangedPart("operator");
  };
  const numberButtons = (side: "left" | "right") => view.round <= 2
    ? <button type="button" aria-label={`Change ${side} number, currently ${draft[side]}`}
        disabled={!!changedPart && changedPart !== side}
        onClick={() => cycleNumber(side)}>{draft[side]}</button>
    : String(draft[side]).split("").map((digit, index) => {
        const key = `${side}-${index}`;
        return <button type="button" key={key} aria-label={`Change ${side} ${index === 0 ? "tens" : "ones"} digit, currently ${digit}`}
          disabled={!!changedPart && changedPart !== key}
          onClick={() => cycleNumber(side, index)}>{digit}</button>;
      });
  const resetDraft = () => {
    setDraft({ ...equation });
    setChangedPart(null);
  };
  const equationDisplay = (value: any) => <strong>{value.left} {value.operator} {value.right}</strong>;
  const equationAnswer = (value: any, className = "unstable-equation-value") => {
    const exact = value.operator === "+" ? value.left + value.right
      : value.operator === "-" ? value.left - value.right
        : value.operator === "*" ? value.left * value.right
          : value.left / value.right;
    const rounded = Math.round(exact);
    return <strong className={className}>
      {Number.isInteger(exact) ? exact : <>{exact.toFixed(2)} <b className="unstable-rounded-answer">({rounded})</b></>}
    </strong>;
  };
  const p = { view, players, me, color, name, send, now, canPick, submitted, stage: "live" as const };
  return <div className={`new-game unstable-math ${stage === "reveal" ? "revealing" : ""}`}>
    <p className="unstable-phase">
      {stage === "reveal" && view.last
        ? `Round ${view.last.round} results`
        : `Round ${view.round} of 5 · ${isSaboteur ? "Change the equation while everyone solves" : `${name(view.saboteur)} is the saboteur`}`}
      {seconds != null && stage !== "reveal" ? ` · ${seconds}s` : ""}
    </p>
    {stage === "reveal" && view.last ? <>
      <div className="unstable-equation-comparison">
        <p>Unmodified equation: <span className="unstable-equation">{equationDisplay(view.last.originalEquation)}</span>
          <span className="unstable-equation-value"><span className="unstable-result-equals">= </span>{equationAnswer(view.last.originalEquation)}</span></p>
        <p>Changed equation: <span className="unstable-equation">{equationDisplay(view.last.equation)}</span>
          <span className="unstable-result-equals"> = </span>
          {equationAnswer(view.last.equation, "unstable-equation-value")}</p>
      </div>
      <div className="unstable-answers" aria-label="Player answers">
        {[...players]
          .sort((a: PlayerId, b: PlayerId) => view.last.points[b] - view.last.points[a])
          .map((id: PlayerId) =>
            <p key={id}><strong>{name(id)}</strong>: {id === view.last.saboteur
              ? "Saboteur" : view.last.guesses[id] ?? "no answer"}
              <span> · <strong>{view.last.points[id]} pts gained</strong></span></p>)}
      </div>
    </> : <>
      <div className="unstable-equation" aria-label={`${equation.left} ${equation.operator} ${equation.right}`}>
        {isSaboteur && submitted == null ? <strong>
          {numberButtons("left")}{" "}
          <button type="button" aria-label={`Change operation, currently ${draft.operator}`}
            disabled={!!changedPart && changedPart !== "operator"} onClick={cycleOperator}>{draft.operator}</button>{" "}
          {numberButtons("right")}
        </strong> : equationDisplay(equation)}
        {!isSaboteur && <>
          <span> = </span>{equationAnswer(equation, "unstable-original-answer")}
        </>}
      </div>
      <p className="muted">{isSaboteur
        ? "Click one number or symbol to cycle it, then submit. Everyone acts at the same time."
        : "This is the unmodified answer. The saboteur may change the equation, so your final answer may be different."}</p>
      {canPick && submitted == null && isSaboteur && <div className="unstable-saboteur-actions">
      <button className="unstable-reset" type="button" onClick={resetDraft}>Reset changes</button>
      <button className="primary unstable-submit" type="button" onClick={() => {
        if (!changedPart) send({ kind: "none" });
        else if (changedPart === "operator") {
          if (draft.operator === equation.operator) send({ kind: "none" });
          else send({ kind: "operator", value: draft.operator });
        }
        else {
          const side = changedPart.startsWith("left") ? "left" : "right";
          if (draft[side] === equation[side]) send({ kind: "none" });
          else send({ kind: "number", side, value: draft[side] });
        }
      }}>Submit change</button>
      </div>}
      {canPick && submitted == null && !isSaboteur &&
        <form className="new-game-form" onSubmit={(event) => {
          event.preventDefault();
          if (guess.trim()) send({ value: Number(guess) });
        }}>
          <label>Your answer<input type="number" value={guess} onChange={(event) => setGuess(event.target.value)} /></label>
          <button className="primary" disabled={guess.trim() === ""}>Submit</button>
        </form>}
      {submitted != null && <p className="muted">Your response is locked in. Waiting for everyone else…</p>}
    </>}
    <Leaderboard p={{ ...p, stage }}
      ids={[...players].sort((a: PlayerId, b: PlayerId) => view.scores[b] - view.scores[a])}
      score={(id) => `${Math.round(view.scores[id])} pts`} caption="Math scores"
      rowClass={(id) => stage === "reveal" && id === me ? "unstable-player-highlight" : undefined} />
  </div>;
}

export function Hangman({ view, players, me, name, color, send, now }: GameProps<any>) {
  const seconds = Math.max(0, Math.ceil((view.endAt - now) / 1000));
  const disabled = view.solvedAt[me ?? ""] != null || view.failedAt[me ?? ""] != null ||
    now < view.nextGuessAt;
  return <div className="new-game hangman-game">
    <p role="timer">Solve the word · {seconds}s left · <strong className="hangman-lives">{view.lives} LIVES LEFT</strong></p>
    <div className="hangman-word" aria-label={`${view.wordLength} letter word`}>
      {view.pattern.map((char: string | null, i: number) => <span key={i}>{char ?? "_"}</span>)}
    </div>
    <p>Wrong letters: {view.wrong.join(" ") || "none"} · 3-second guess cooldown</p>
    {view.revealedWord && <p className="hangman-reveal" role="status">The word was <strong>{view.revealedWord}</strong>.</p>}
    <div className="hangman-keyboard">{[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((char) =>
      <button key={char} type="button" disabled={disabled || view.guessed.includes(char) || view.wrong.includes(char)}
        className={view.guessed.includes(char) ? "correct" : view.wrong.includes(char) ? "wrong" : ""}
        onClick={() => send({ letter: char })}>{char}</button>)}</div>
    <Leaderboard p={{ view, players, me, color, name, send, now, canPick: false, submitted: null, stage: "live" }}
      ids={[...players].sort((a, b) => {
        const aSolved = view.solvedAt[a] != null;
        const bSolved = view.solvedAt[b] != null;
        return aSolved !== bSolved ? (aSolved ? -1 : 1) : (view.solvedAt[a] ?? Infinity) - (view.solvedAt[b] ?? Infinity);
      })}
      score={(id) => view.solvedAt[id] != null
        ? `${((view.solvedAt[id] - (view.endAt - 75_000)) / 1000).toFixed(1)}s`
        : view.failedAt[id] != null ? "failed" : "playing"} caption="Hangman standings" />
  </div>;
}

const SWITCH_CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";
const SWITCH_VOWELS = "AEIOU";
export function LetterSwitch({ view, players, me, name, color, canPick, submitted, send, now, until }: GameProps<any>) {
  const [word, setWord] = useState(view.baseWord ?? "");
  const [changedIndex, setChangedIndex] = useState<number | null>(null);
  const [submissionResult, setSubmissionResult] = useState<{ word: string; valid: boolean; points: number } | null>(null);
  const [hidePreviousResult, setHidePreviousResult] = useState(false);
  const seconds = until == null ? null : Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    setWord(view.baseWord ?? "");
    setChangedIndex(null);
  }, [view.round, view.baseWord]);
  const cycleLetter = (index: number) => {
    if (changedIndex !== null && changedIndex !== index) return;
    setSubmissionResult(null);
    const alphabet = index % 2 === 0 ? SWITCH_CONSONANTS : SWITCH_VOWELS;
    const current = word[index]!;
    const next = alphabet[(alphabet.indexOf(current) + 1) % alphabet.length]!;
    const updated = word.slice(0, index) + next + word.slice(index + 1);
    setWord(updated);
    setChangedIndex(updated === view.baseWord ? null : index);
  };
  const canSubmitWord = typeof view.baseWord === "string" && word.length === 4 && word !== view.baseWord &&
    [...word].filter((letter, index) => letter !== view.baseWord[index]).length === 1;
  const previousWord = me ? view.words?.[me] : null;
  const previousPoints = me ? view.lastScores?.[me] : null;
  const result = submissionResult ??
    (!hidePreviousResult && typeof previousWord === "string" && typeof previousPoints === "number"
      ? { word: previousWord, valid: previousPoints > 0, points: previousPoints }
      : null);
  return <div className="new-game letter-switch">
    <p>Round {view.round} of 5{seconds == null ? "" : ` · ${seconds}s`}</p>
    <p className="letter-switch-base">Your word: <strong>{view.baseWord}</strong></p>
    <p className="muted">Click one letter to cycle through valid consonants or vowels.</p>
    <div className="letter-switch-tiles" aria-label="Choose a word">
      {[...(word || "----")].map((letter: string, index: number) =>
        <button key={index} type="button" aria-label={`Letter ${index + 1}: ${letter}, click to cycle`}
          disabled={!canPick || submitted != null || (changedIndex !== null && changedIndex !== index)}
          className={changedIndex === index ? "changed" : ""}
          onClick={() => { setHidePreviousResult(true); cycleLetter(index); }}>{letter}</button>)}
    </div>
    {result &&
      <p className={result.valid ? "letter-switch-valid" : "letter-switch-invalid"} role="status">
        {result.valid
          ? `${result.word} is valid · You gained ${result.points} points`
          : `${result.word} is not valid · You gained 0 points`}
      </p>}
    {canPick && submitted == null && <form className="new-game-form letter-switch-submit" onSubmit={(event) => {
      event.preventDefault();
      if (canSubmitWord && typeof view.baseWord === "string") {
        const valid = isValidLetterSwitchWord(word, view.baseWord, me ? view.used?.[me] ?? [] : []);
        const points = [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] ?? 1), 0);
        setSubmissionResult({ word, valid, points });
        send({ word });
      }
    }}>
      <button className="primary" disabled={!canSubmitWord}>Submit {word}</button>
      <button type="button" className="ghost" disabled={word === view.baseWord}
        onClick={() => { setHidePreviousResult(true); setSubmissionResult(null); setWord(view.baseWord ?? ""); setChangedIndex(null); }}>
        Reset
      </button>
    </form>}
    {submitted != null && <p className="muted">Your word is locked in.</p>}
    <section className="letter-switch-legend" aria-label="Point legend">
      <strong>Point legend</strong>
      <span>1: A E H I N O R S T D</span>
      <span>2: C F G L M U</span>
      <span>4: P Y</span>
      <span>6: B W</span>
      <span>8: K V</span>
      <span>10: J X</span>
      <span>15: Q Z</span>
    </section>
    <Leaderboard p={{ view, players, me, color, name, send, now, canPick, submitted, stage: "live" }}
      ids={[...players].sort((a, b) => view.scores[b] - view.scores[a])}
      score={(id) => `${view.scores[id]} pts`} detail={(id) => view.words[id] ?? "—"} caption="Letter scores" />
  </div>;
}

export function Conquest({ view, players, me, color, name, send, now }: GameProps<any>) {
  const boardRef = useRef<HTMLDivElement>(null);
  const lastMoveAt = useRef(0);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const board = boardRef.current;
      if (!board || Date.now() - lastMoveAt.current < 40) return;
      lastMoveAt.current = Date.now();
      const rect = board.getBoundingClientRect();
      send({ kind: "cursor", x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [send]);
  const seconds = Math.max(0, Math.ceil((view.endAt - now) / 1000));
  return <div className="new-game conquest-game">
    <p role="timer">{seconds}s remaining · stay in an area for 3 seconds to claim it.</p>
    <div ref={boardRef} className="conquest-board">
      {view.areas.map((area: any) => <span key={area.id} className={`conquest-area value-${area.value}${area.contested ? " contested" : ""}`}
        style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, background: area.owner && !area.contested ? color(area.owner) : undefined }}
        title={`${area.value} points per second${area.contested ? " · contested" : area.owner ? ` · ${name(area.owner)}` : ""}`}>
        <strong>{area.value}</strong>
        {area.contested && <b className="conquest-contested-label">!</b>}
        {view.claimProgress[area.id] > 0 &&
          <i style={{ "--progress": view.claimProgress[area.id] } as CSSProperties} />}
      </span>)}
      {players.map((id: PlayerId) => <span key={id} className={`conquest-player${id === me ? " is-you" : ""}`}
        style={{ left: `${view.positions[id].x * 100}%`, top: `${view.positions[id].y * 100}%`, background: color(id) }}
        title={name(id)} />)}
    </div>
    <Leaderboard p={{ view, players, me, color, name, send, now, canPick: false, submitted: null, stage: "live" }}
      ids={[...players].sort((a, b) => view.scores[b] - view.scores[a])}
      score={(id) => `${view.scores[id].toFixed(1)} pts`} caption="Territory scores" />
  </div>;
}

export function Snake({ view, players, me, color, name, send, now }: GameProps<any>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const directions: Record<string, string> = {
        arrowup: "up", w: "up", arrowdown: "down", s: "down",
        arrowleft: "left", a: "left", arrowright: "right", d: "right",
      };
      if (!directions[key] || (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName))) return;
      event.preventDefault();
      send({ direction: directions[key] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send]);
  const bodyAt = new Map<string, PlayerId>();
  for (const id of players) for (const part of view.snakes[id] ?? []) bodyAt.set(`${part.x},${part.y}`, id);
  const seconds = Math.max(0, Math.ceil((view.endAt - now) / 1000));
  return <div className="new-game snake-game">
    <p role="timer">Survive and collect apples · {seconds}s remaining</p>
    <div className="snake-board" style={{ gridTemplateColumns: `repeat(${view.width}, 1fr)` }}>
      {Array.from({ length: view.width * view.height }, (_, index) => {
        const x = index % view.width;
        const y = Math.floor(index / view.width);
        const id = bodyAt.get(`${x},${y}`);
        const isHead = id != null && view.snakes[id]?.[0]?.x === x && view.snakes[id]?.[0]?.y === y;
        const apple = view.apples.some((cell: any) => cell.x === x && cell.y === y);
        return <span key={index} className={`${x === 0 || y === 0 || x === view.width - 1 || y === view.height - 1 ? "wall" : ""}${id ? ` snake-cell${isHead ? " head" : ""}` : ""}${apple ? " apple" : ""}`}
          style={id ? { background: color(id) } : undefined} />;
      })}
    </div>
    <div className="snake-controls">
      {(["up", "left", "down", "right"] as const).map((direction) =>
        <button key={direction} type="button" onClick={() => send({ direction })}>{direction}</button>)}
    </div>
    <Leaderboard p={{ view, players, me, color, name, send, now, canPick: false, submitted: null, stage: "live" }}
      ids={[...players].sort((a, b) => {
        const aliveOrder = view.alive.indexOf(b) - view.alive.indexOf(a);
        return aliveOrder || view.snakes[b].length - view.snakes[a].length;
      })}
      score={(id) => `${view.snakes[id].length} sections`}
      detail={(id) => view.alive.includes(id) ? "alive" : "out"} caption="Snake standings" />
  </div>;
}
