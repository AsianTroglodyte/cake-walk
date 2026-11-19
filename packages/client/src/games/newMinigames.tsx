import { useEffect, useRef, useState } from "react";
import { isValidSingleWord, onTheDotPoint, onTheDotProgress, type PlayerId } from "@pbg/rules";
import { Leaderboard, type GameProps } from "./common";

export function OnTheDot({ view, players, me, color, name, send, now, stage }: GameProps<any>) {
  const lastSent = useRef(0);
  const elapsed = Math.max(0, now - view.startAt);
  const progress = onTheDotProgress(elapsed, view.dotCycles, view.dotStartProgress);
  const dot = onTheDotPoint(view.shape, progress);
  const showingReveal = stage === "reveal";
  const pathHidden = elapsed >= 5_000 && !showingReveal;
  const othersHidden = elapsed >= 10_000 && !showingReveal;
  const pathPoints = Array.from({ length: 121 }, (_, i) => {
    const point = onTheDotPoint(view.shape, i / 120);
    return `${point.x * 100},${point.y * 100}`;
  }).join(" ");
  return (
    <div className="new-game on-the-dot">
      <div className="dot-orbit" onPointerMove={(event) => {
        if (showingReveal) return;
        const at = Date.now();
        if (at - lastSent.current < 30) return;
        lastSent.current = at;
        const bounds = event.currentTarget.getBoundingClientRect();
        send({ kind: "cursor", x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height });
      }}>
        {!pathHidden && <svg className="dot-orbit-path" viewBox="0 0 100 100" aria-hidden="true">
          <polyline points={pathPoints} />
        </svg>}
        {!pathHidden && <span className="orbit-dot" style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }} aria-label="Moving dot" />}
        {players.filter((id: PlayerId) => !othersHidden || id === me).map((id: PlayerId) => (
          <span key={id} className={`orbit-player${id === me ? " is-you" : ""}`}
            style={{ left: `${view.positions[id].x * 100}%`, top: `${view.positions[id].y * 100}%`, background: color(id) }}
            title={name(id)} aria-label={name(id)} />
        ))}
      </div>
      {showingReveal
        ? <p className="on-dot-reveal" role="status">Final reveal: <strong>{view.shape}</strong> path · final dot location shown above.</p>
        : <p className="muted">Path and dot disappear with 10 seconds left. Other players disappear with 5 seconds left.</p>}
      {!showingReveal && <p className="on-dot-timer" role="timer" aria-label={`${Math.max(0, Math.ceil((view.endAt - now) / 1000))} seconds remaining`}>
        <span>Time left</span>
        <strong>{Math.max(0, Math.ceil((view.endAt - now) / 1000))}</strong>
        <span>seconds</span>
      </p>}
    </div>
  );
}

export function DotCollector({ view, players, me, color, name, send, now }: GameProps<any>) {
  const boardRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const at = Date.now();
      const board = boardRef.current;
      if (!board || at - lastSent.current < 35) return;
      lastSent.current = at;
      const bounds = board.getBoundingClientRect();
      send({
        kind: "cursor",
        x: (event.clientX - bounds.left) / bounds.width * view.cols,
        y: (event.clientY - bounds.top) / bounds.height * view.rows,
      });
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [send, view.cols, view.rows]);
  return (
    <div className="new-game dot-collector">
      <div ref={boardRef} className="collector-board" style={{ gridTemplateColumns: `repeat(${view.cols}, 1fr)` }}>
        {Array.from({ length: view.cols * view.rows }, (_, cell) => <span key={cell} />)}
        {players.map((id: PlayerId) => {
          const home = view.homes[id];
          return <span key={`home-${id}`} className="collector-home" style={{
            left: `${home.x / view.cols * 100}%`, top: `${home.y / view.rows * 100}%`,
            background: color(id),
          }} title={`${name(id)}’s area: ${view.banked[id]} stars`} />;
        })}
        {view.stars.map((star: { id: number; x: number; y: number }) => (
          <span key={`star-${star.id}`} className="collector-star" style={{
            left: `${star.x / view.cols * 100}%`, top: `${star.y / view.rows * 100}%`,
          }} />
        ))}
        {players.map((id: PlayerId) => {
          const home = view.homes[id];
          return <span key={`home-count-${id}`} className="collector-home-count" style={{
            left: `${home.x / view.cols * 100}%`, top: `${home.y / view.rows * 100}%`,
            borderColor: color(id),
          }} aria-label={view.finishedAt[id] != null
            ? `${name(id)} finished`
            : `${name(id)} has ${view.banked[id]} stars in their area`}>
            {view.finishedAt[id] != null
              ? <strong className="collector-finished-star" aria-hidden="true">★</strong>
              : <><strong>{view.banked[id]}</strong><small>/6</small></>}
          </span>;
        })}
        {players.map((id: PlayerId) => {
          const home = view.homes[id];
          return <span key={`home-label-${id}`} className="collector-home-label" style={{
            left: `${home.x / view.cols * 100}%`,
            top: `${home.y / view.rows * 100}%`,
            borderColor: color(id),
          }} title={`${name(id)}’s area`}>{name(id)}</span>;
        })}
        {players.filter((id: PlayerId) => view.finishedAt[id] == null).map((id: PlayerId) => {
          const position = view.positions[id];
          const carrying = view.carrying[id] > 0;
          return <span key={`player-${id}`} className={`collector-player${id === me ? " is-you" : ""}${carrying ? " is-carrying" : ""}`}
            style={{ left: `${position.x / view.cols * 100}%`, top: `${position.y / view.rows * 100}%`, background: color(id) }}
            title={`${name(id)} · ${view.banked[id]} banked${carrying ? ", carrying a star" : ""}`}
            aria-label={`${name(id)}: ${view.banked[id]} banked, ${carrying ? "carrying a star" : "not carrying a star"}`} />;
        })}
      </div>
      <p role="timer">{Math.max(0, Math.ceil((view.endAt - now) / 1000))}s left · carry one star at a time to your colored home area to bank it.</p>
      <Leaderboard p={{ view, players, me, color, name, send, now, canPick: false, submitted: null, stage: "live" }}
        ids={[...players].sort((a, b) => {
          const aFinished = view.finishedAt[a] != null;
          const bFinished = view.finishedAt[b] != null;
          if (aFinished && bFinished) return view.finishedAt[a] - view.finishedAt[b];
          if (aFinished) return -1;
          if (bFinished) return 1;
          return view.banked[b] - view.banked[a];
        })}
        score={(id) => view.finishedAt[id] != null
          ? `${((view.finishedAt[id] - view.startAt) / 1000).toFixed(1)}s`
          : `${view.banked[id]} / 6`}
        detail={(id) => view.finishedAt[id] != null
          ? "finish time"
          : view.carrying[id] ? `${view.carrying[id]} carrying` : "in progress"}
        scoreHeading="Finish time" caption="Star Collector standings" />
    </div>
  );
}

export function Brawldle({ view, me, players, name, color, canPick, submitted, send, stage, now, until }: GameProps<any>) {
  const [word, setWord] = useState("");
  const valid = isValidSingleWord(word);
  const alive = new Set<PlayerId>(view.alive);
  const canSubmit = canPick && submitted == null && alive.has(me ?? "");
  const eliminatedOrder = [...players].filter((id) => !alive.has(id))
    .sort((a, b) => view.outRound[b] - view.outRound[a]);
  const boardPlayers = [
    ...(view.turnOrder ?? players).filter((id: PlayerId) => alive.has(id)),
    ...eliminatedOrder,
  ];
  const placement = new Map(eliminatedOrder.map((id, index) => [id, alive.size + index + 1]));
  const secondsLeft = until == null ? null : Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <div className="new-game brawldle-game">
      <p>{view.phase === "secrets"
        ? "Choose a secret word"
        : `${name(view.currentTurn)}’s turn · ${alive.size} players remain · 30 seconds to guess`}</p>
      {secondsLeft != null && <p className="brawldle-timer" role="timer">
        {view.phase === "secrets" ? "Secret word time" : stage === "reveal" ? "Next turn in" : "Time to guess"}:
        {" "}<strong>{secondsLeft}</strong>s
      </p>}
      {canSubmit && <form className="new-game-form" onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        send({ word });
        setWord("");
      }}>
        <label>{view.phase === "secrets" ? "Your secret 5-letter word" : "Your 5-letter guess"}
          <input autoComplete="off" maxLength={5} minLength={5} pattern="[A-Za-z]{5}" value={word}
            onChange={(event) => setWord(event.target.value.toUpperCase())} />
        </label>
        <button className="primary" disabled={!valid}>{view.phase === "secrets" ? "Lock secret" : "Submit guess"}</button>
      </form>}
      {view.phase === "guess" && view.yourSecret && <p>Your secret is locked in. Guess it yourself at your own risk!</p>}
      {submitted != null && <p className="muted">Guess locked in.</p>}
      {view.last && <p role="status">{view.last.eliminated.length
        ? `${name(view.last.guesser)} guessed ${view.last.guess}; ${view.last.eliminated.map((id: PlayerId) => name(id)).join(", ")} ${view.last.eliminated.length === 1 ? "is" : "are"} out.`
        : `${name(view.last.guesser)} guessed ${view.last.guess}.`}</p>}
      <div className="brawldle-players">
        {boardPlayers.map((id: PlayerId) => {
          const history = view.boards?.[id] ?? [];
          return <section key={id} className={`brawldle-player-board${alive.has(id) ? "" : " out"}${view.currentTurn === id ? " is-turn" : ""}`} style={{ borderColor: color(id) }}>
            <h3>{name(id)}{id === me ? " (you)" : ""}{view.currentTurn === id ? " · guessing" : ""}{alive.has(id) ? "" : ` · place ${placement.get(id)}`}</h3>
            {!alive.has(id) && view.revealedSecrets?.[id]
              ? <div className="brawldle-revealed-word" aria-label={`${name(id)}'s word was ${view.revealedSecrets[id]}`}>
                  {view.revealedSecrets[id]}
                </div>
              : <div className="brawldle-history" aria-label={`${name(id)}'s last four guess results`}>
                  {history.map((entry: any, index: number) => <div className="brawldle-row" key={`${entry.word}-${index}`} aria-label={`${entry.word}: ${entry.feedback.join(", ")}`}>
                    {entry.word.split("").map((letter: string, i: number) => <span key={i} className={`brawldle-tile ${entry.feedback[i]}`}>{letter}</span>)}
                  </div>)}
                  {history.length === 0 && <p className="muted">No guesses yet</p>}
                </div>}
          </section>;
        })}
      </div>
      {stage === "reveal" && <p className="muted">Next round begins shortly.</p>}
    </div>
  );
}

export function DiceFleet({ view, me, players, name, color, canPick, submitted, send }: GameProps<any>) {
  const opponents = players.filter((id) => id !== me && view.hp[id] > 0);
  return (
    <div className="new-game dice-fleet">
      <p className="dice-roll">Round {view.round} · attacks are simultaneous · your roll: <strong>{view.yourRoll ?? "—"}</strong> damage</p>
      <div className="dice-fleet-players">
        {(view.turnOrder ?? players).map((id: PlayerId) => {
          const isEliminated = view.outRound[id] != null;
          const eliminatedThisRound = view.last?.eliminated?.includes(id);
          return <button key={id} type="button" disabled={!canPick || submitted != null || id === me || view.hp[id] <= 0}
            className={`${isEliminated ? "is-eliminated" : ""}${eliminatedThisRound ? " eliminated-this-round" : ""}`}
            onClick={() => send({ target: id })} style={{ borderColor: color(id) }}>
            <strong>{name(id)}{id === me ? " (you)" : ""}</strong>
            <span className="dice-fleet-hp"><strong>{view.hp[id]}</strong><small>HP</small></span>
            {eliminatedThisRound && <small className="dice-fleet-eliminated">Eliminated this round</small>}
          </button>;
        })}
      </div>
      {canPick && submitted == null && opponents.length > 0 && <p>Select an opponent to attack.</p>}
      {submitted != null && <p className="muted">Attack locked in.</p>}
      {view.last && <section className="dice-fleet-log" aria-label="Battle log">
        <h3>Battle log · Round {view.round}</h3>
        {Object.entries(view.last.attacks).map(([attacker, attack]: [string, any]) =>
          <p key={attacker}>{name(attacker)} hit {name(attack.target)} for {attack.damage}</p>)}
        {view.last.eliminated?.length > 0 && <p className="dice-fleet-eliminated" role="status">
          Eliminated this round: {view.last.eliminated.map((id: PlayerId) => name(id)).join(", ")}
        </p>}
      </section>}
    </div>
  );
}

export function GridQuiz({ view, players, me, name, color, canPick, submitted, send, now }: GameProps<any>) {
  const [guess, setGuess] = useState("");
  const secondsLeft = Math.max(0, Math.ceil((view.phaseEndsAt - now) / 1000));
  return (
    <div className="new-game grid-quiz">
      <p>Round {view.round} of 3 · {view.phase === "show"
        ? `Memorize the grid · ${secondsLeft}s`
        : view.phase === "guess"
          ? `How many ${view.target} tiles? · ${secondsLeft}s`
          : `Answers revealed · ${secondsLeft}s`}</p>
      {view.phase === "show" && <div className="quiz-grid" style={{ gridTemplateColumns: `repeat(${Math.sqrt(view.grid.length)}, 1fr)` }}>
        {view.grid.map((tile: string, i: number) => <span key={i} className={`color-${tile}`} />)}
      </div>}
      {view.phase === "guess" && <div className="quiz-target"><span className={`color-chip color-${view.target}`} /> Count of <strong>{view.target}</strong></div>}
      {view.phase === "guess" && view.yourGuess == null && <form className="new-game-form grid-quiz-answer-form" onSubmit={(event) => {
        event.preventDefault();
        const count = Number(guess);
        if (Number.isInteger(count) && count >= 0) send({ count });
      }}>
        <label>How many?
          <input autoComplete="off" type="number" min={0} max={121} value={guess} onChange={(event) => setGuess(event.target.value)} />
        </label>
        <button className="primary" disabled={guess.trim() === ""}>Submit count</button>
      </form>}
      {view.phase === "guess" && view.yourGuess != null && <p className="muted">Your answer ({view.yourGuess}) is locked in.</p>}
      {view.phase === "reveal" && view.last && <p className="quiz-correct-answer">
        Correct answer: <strong>{view.last.count}</strong>
      </p>}
      {view.phase === "reveal" && view.last?.guesses && <section className="grid-quiz-answer-reveal" aria-label="Player answers">
        <h3>Answers</h3>
        {players.map((id) => <p key={id}><strong>{name(id)}:</strong> {view.last.guesses[id] ?? "no answer"}</p>)}
      </section>}
      <Leaderboard p={{ view, players, me, color, name, send, now, canPick, submitted, stage: "live" }}
        ids={[...players].sort((a, b) => view.scores[b] - view.scores[a])}
        score={(id) => `${view.scores[id]} pts`} caption="Quiz scores" />
    </div>
  );
}
