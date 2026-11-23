import { useEffect, useRef, useState } from "react";
import { COLOR_CODE_COLORS, isValidSingleWord, LETTER_VALUES, type PlayerId } from "@pbg/rules";
import { Leaderboard, Scores, type GameProps } from "./common";

const keyDirection = (key: string) => ({
  w: "up", arrowup: "up", s: "down", arrowdown: "down",
  a: "left", arrowleft: "left", d: "right", arrowright: "right",
}[key.toLowerCase()]);

function stepGuessColor(current: string[], slot: number, direction: -1 | 1): string[] {
  const currentIndex = COLOR_CODE_COLORS.indexOf(current[slot] as typeof COLOR_CODE_COLORS[number]);
  const next = COLOR_CODE_COLORS[(currentIndex + direction + COLOR_CODE_COLORS.length) % COLOR_CODE_COLORS.length]!;
  return current.map((color, index) => index === slot ? next : color);
}

export function Calculator(p: GameProps<any>) {
  const { view, me, players, name, canPick, submitted, send } = p;
  const values = view.values as Record<PlayerId, number[]>;
  const [source, setSource] = useState<number | null>(null);
  useEffect(() => setSource(null), [view.turn]);
  const active = (id: PlayerId) => values[id]?.some((value: number) => value > 0) ?? false;
  const canChoose = canPick && submitted == null && !!me;
  const sectionOrder = (view.turnOrder as PlayerId[] | undefined) ?? players;
  const ownValues = me ? values[me] ?? [] : [];
  const activeSources = ownValues.map((value: number, index: number) => value > 0 ? index : -1).filter((index: number) => index >= 0);
  const needsSourceChoice = activeSources.length > 1;
  const sourceSlot = source ?? (needsSourceChoice ? null : activeSources[0] ?? null);
  return (
    <div className="new-game calculator-game">
      <p>Turn {view.turn}: <strong>{name(view.current)}</strong></p>
      {canChoose && <p className="muted calculator-hint">
        {needsSourceChoice && sourceSlot === null
          ? "Choose one of your values, then choose an opponent’s value."
          : "Choose an opponent’s value to add to."}
      </p>}
      <div className="calculator-board">
        {sectionOrder.map((id) => {
          const mine = id === me;
          const playerActive = active(id);
          return (
            <section className={`calculator-player${!playerActive ? " eliminated" : ""}${id === view.current ? " current" : ""}`} key={id}>
              <h3>{name(id)}{id === me ? " (you)" : ""}</h3>
              <div className="calculator-value-buttons">
                {values[id]?.map((value: number, index: number) => {
                  const isOwnSource = canChoose && mine && needsSourceChoice;
                  const isOpponentTarget = canChoose && !mine && sourceSlot !== null;
                  const disabled = value === 0 || (!isOwnSource && !isOpponentTarget);
                  return (
                    <button key={index} type="button" className={`calculator-value${value === 0 ? " value-out" : ""}${mine && source === index ? " selected" : ""}`}
                      disabled={disabled}
                      aria-label={`${name(id)} value ${index + 1}: ${value || "X"}`}
                      onClick={() => {
                        if (mine && needsSourceChoice) setSource(source === index ? null : index);
                        else if (!mine && sourceSlot !== null) send({ source: sourceSlot, target: id, slot: index });
                      }}>
                      {value || "X"}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {submitted != null && <p className="muted">Turn locked in.</p>}
    </div>
  );
}

export function SingleWord(p: GameProps<any>) {
  const { view, players, canPick, submitted, send, stage } = p;
  const [word, setWord] = useState("");
  const validWord = isValidSingleWord(word);
  const letterGroups = Object.entries(LETTER_VALUES).reduce<Record<number, string[]>>((groups, [letter, value]) => {
    (groups[value] ??= []).push(letter);
    return groups;
  }, {});
  const scoreboard = [...players].sort((a, b) => view.scores[b] - view.scores[a]);
  const letterUsage = new Map<string, number>();
  for (const id of players) {
    const latestWord = view.words[id]?.at(-1) as string | undefined;
    if (!latestWord) continue;
    for (const letter of new Set(latestWord)) letterUsage.set(letter, (letterUsage.get(letter) ?? 0) + 1);
  }
  const invalidLetters = new Set([...letterUsage].filter(([, uses]) => uses >= view.sharedThreshold).map(([letter]) => letter));
  return (
    <div className="new-game">
      <p>Round {view.round + (stage === "choosing" ? 1 : 0)} of 3 · shared-letter threshold: {view.sharedThreshold} players</p>
      {stage === "choosing" && canPick && !submitted && (
        <form className="new-game-form" onSubmit={(event) => {
          event.preventDefault();
          if (!validWord) return;
          send({ word });
          setWord("");
        }}>
          <label>Your 5-letter word
            <input autoComplete="off" maxLength={5} minLength={5} pattern="[A-Za-z]{5}" value={word}
              onChange={(event) => setWord(event.target.value.toUpperCase())} />
          </label>
          <button className="primary" disabled={!validWord}>Submit word</button>
          <small>Use a valid five-letter dictionary word. Offensive words are not allowed.</small>
          {word.length === 5 && !validWord && <p className="word-input-warning" role="alert">That isn’t an accepted word. Try another dictionary word.</p>}
        </form>
      )}
      {submitted != null && <p className="muted">Word locked in.</p>}
      <section className="word-points-legend" aria-label="Letter point values">
        <h3>Letter values</h3>
        <div className="word-points-groups">{Object.entries(letterGroups).map(([value, letters]) => (
          <div className="word-points-group" key={value}>
            <strong>{value} {Number(value) === 1 ? "point" : "points"}</strong>
            <span>{letters.join(" · ")}</span>
          </div>
        ))}</div>
      </section>
      <div className="word-scoreboard-scroll">
        <Leaderboard p={p} ids={scoreboard} caption="Points leaderboard" scoreHeading="Total points"
          detailHeading="Latest word · round points" score={(id) => view.scores[id]}
          detail={(id) => view.words[id]?.length ? <>
            {[...view.words[id].at(-1)!].map((letter: string, letterIndex: number) => (
              <span className={`word-score-letter${invalidLetters.has(letter) ? " word-invalid-letter" : ""}`} key={`${letter}-${letterIndex}`}>{letter}</span>
            ))}
            {" · "}+{view.lastScores[id]}
          </> : "—"}
        />
        <p className="word-scoreboard-note">Bold red letters were shared by at least {view.sharedThreshold} players and scored zero this round.</p>
      </div>
    </div>
  );
}

export function ColorCode(p: GameProps<any>) {
  const { view, me, players, now, send, stage } = p;
  const [guess, setGuess] = useState<string[]>(["red", "orange", "yellow", "green"]);
  const mine = me ? view.yours?.guesses ?? [] : [];
  const solved = !!(me && view.solved?.[me]);
  const leaderboard = [...players].sort((a, b) => {
    const aSolved = !!view.solved?.[a];
    const bSolved = !!view.solved?.[b];
    if (aSolved !== bSolved) return aSolved ? -1 : 1;
    if (aSolved) return view.solvedAt[a] - view.solvedAt[b];
    return 0;
  });
  const secondsLeft = Math.max(0, Math.ceil((view.endAt - now) / 1000));
  const timeLabel = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  return (
    <div className="new-game color-code-game">
      <p className="color-code-timer" role="timer" aria-label={`${secondsLeft} seconds remaining`}>Time remaining: <strong>{timeLabel}</strong></p>
      <p>Your guesses: {mine.length}</p>
      {!solved && stage === "live" && now < view.endAt && (
        <form className="new-game-form" onSubmit={(event) => { event.preventDefault(); send({ kind: "guess", colors: guess }); }}>
          <div className="code-slots" aria-label="Your four-color guess">
            {guess.map((color, index) => (
              <div key={index} className="code-slot-controls">
                <button type="button" className="code-slot-adjust" aria-label={`Previous color for slot ${index + 1}`}
                  onClick={() => setGuess((current) => stepGuessColor(current, index, -1))}>▲</button>
                <span title={`Slot ${index + 1}: ${color}`} aria-label={`Slot ${index + 1}: ${color}`}
                  className={`code-slot-button color-${color}`}>{index + 1}</span>
                <button type="button" className="code-slot-adjust" aria-label={`Next color for slot ${index + 1}`}
                  onClick={() => setGuess((current) => stepGuessColor(current, index, 1))}>▼</button>
              </div>
            ))}
          </div>
          <small>Use the arrows above and below each slot to choose its color.</small>
          <button className="primary">Check guess</button>
        </form>
      )}
      {solved && <strong>You cracked the code!</strong>}
      <ol className="code-guesses">{mine.map((entry: any, index: number) => (
        <li key={index}>{entry.colors.map((color: string, i: number) => <span key={i} className={`color-chip color-${color}`} />)} — {entry.correct} in the correct position</li>
      ))}</ol>
      <Leaderboard p={p} ids={leaderboard} caption="Codebreaker leaderboard"
        scoreHeading="Finish time" detailHeading="Status"
        rank={(id) => view.solved?.[id]
          ? 1 + players.filter((other) => view.solved?.[other] && view.solvedAt[other] < view.solvedAt[id]).length
          : "—"}
        score={(id) => view.solved?.[id] ? `${((view.solvedAt[id] - view.startAt) / 1000).toFixed(2)}s` : "—"}
        detail={(id) => view.solved?.[id] ? "Cracked" : "Searching"}
        rowClass={(id) => view.solved?.[id] ? "code-solved" : undefined}
      />
    </div>
  );

}

export function ColorPlatforms({ view, color, send, now, me, name }: GameProps<any>) {
  const lastSent = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const direction = keyDirection(event.key);
      if (!direction || view.phase !== "live") return;
      event.preventDefault();
      const current = Date.now();
      if (current - lastSent.current < 90) return;
      lastSent.current = current;
      sendRef.current({ kind: "move", direction });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view.phase]);
  const positions: Record<PlayerId, number> = view.positions;
  const alive = new Set<PlayerId>(view.alive);
  return (
    <div className="new-game">
      <p>
        Round {view.round} · {view.phase === "buffer" ? "Next round starting…" : `round ends in ${Math.max(0, Math.ceil((view.deadline - now) / 1000))}s`}
        {" "}· called color: <strong className={`called-color color-${view.target}`}>{view.target}</strong>
        {" "}({view.targetSpots} platform{view.targetSpots === 1 ? "" : "s"} for {alive.size} player{alive.size === 1 ? "" : "s"})
      </p>
      {me && <p className="platform-you-legend"><span className="platform-you-symbol" aria-hidden="true">★</span> Your character: <strong>{name(me)}</strong></p>}
      <div className="platform-grid" style={{ gridTemplateColumns: `repeat(${view.cols}, 2.4rem)` }}>
        {view.colors.map((tile: string, cell: number) => {
          const occupants = Object.keys(positions).filter((id) => positions[id] === cell && alive.has(id));
          return <div key={cell} className={`platform-tile color-${tile}${occupants.includes(me ?? "") ? " platform-tile-you" : ""}`} title={tile}>
            {occupants.map((id) => <span
              key={id}
              className={`platform-player${id === me ? " platform-player-you" : ""}`}
              style={{ background: color(id) }}
              title={id === me ? `${name(id)} (you)` : name(id)}
              aria-label={id === me ? `Your character, ${name(id)}` : name(id)}
            />)}
          </div>;
        })}
      </div>
      <p className="muted">Use WASD or the arrow keys. Eliminated: {Object.keys(positions).filter((id) => !alive.has(id)).length}</p>
      {view.eliminatedThisRound?.length > 0 && (
        <p className="platform-eliminated" role="status">
          Eliminated this round: {view.eliminatedThisRound.map((id: PlayerId, index: number) => (
            <span key={id}>{index > 0 ? ", " : ""}<strong>{name(id)}</strong></span>
          ))}
        </p>
      )}
    </div>
  );
}

export function Painter(p: GameProps<any>) {
  const { view, players, me, color, name, send, now } = p;
  const lastSent = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  const grid: (PlayerId | null)[] = view.grid;
  const secondsLeft = Math.max(0, Math.ceil((view.endAt - now) / 1000));
  const timeLabel = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  return (
    <div className="new-game">
      <p className="painter-timer" role="timer" aria-label={`${secondsLeft} seconds remaining`}>Time remaining: <strong>{timeLabel}</strong></p>
      <p>Move your cursor over the board. Cells claimed: {view.scores[me ?? ""] ?? 0}</p>
      <div
        className="painter-grid"
        style={{ gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))` }}
        onPointerMove={(event) => {
          const current = Date.now();
          if (current - lastSent.current < 25) return;
          lastSent.current = current;
          const rect = event.currentTarget.getBoundingClientRect();
          sendRef.current({
            kind: "cursor",
            x: ((event.clientX - rect.left) / rect.width) * view.cols,
            y: ((event.clientY - rect.top) / rect.height) * view.rows,
          });
        }}
      >
        {grid.map((owner, cell) => <span key={cell} style={{ background: owner ? color(owner) : undefined }} />)}
        {players.map((id) => {
          const position = view.positions[id];
          const x = position.x;
          const y = position.y;
          const gap = 2;
          const leftOffset = gap * (x / view.cols - 0.5);
          const topOffset = gap * (y / view.rows - 0.5);
          return <i key={id} className="painter-avatar" style={{
            background: color(id),
            left: `calc(${(x / view.cols) * 100}% + ${leftOffset}px)`,
            top: `calc(${(y / view.rows) * 100}% + ${topOffset}px)`,
          }} title={name(id)} aria-label={name(id)} />;
        })}
      </div>
      <Scores p={p} value={(id) => view.scores[id]} label={(id) => `${view.scores[id]} cells`} />
    </div>
  );
}
