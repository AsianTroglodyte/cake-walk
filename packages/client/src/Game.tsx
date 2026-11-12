import { useEffect, useState } from "react";
import type { ClientAction, MatchView, RoomView } from "@pbg/protocol";
import type { ReceivedView } from "./App";
import { Board } from "./Board";
import { DecisionPanel } from "./DecisionPanel";
import { EventLog } from "./EventLog";
import { Minigame } from "./Minigame";
import { ServerMinigame } from "./ServerMinigame";
import { MINIGAMES } from "@pbg/rules";
import { SeatTags } from "./SeatTags";
import { seatColor } from "./colors";

interface Props {
  received: ReceivedView;
  act: (action: ClientAction) => void;
  onLeave: () => void;
}

function useSecondsLeft(until: number | null, clockOffset: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  if (until === null) return null;
  return Math.max(0, Math.ceil((until - (now + clockOffset)) / 1000));
}

function phaseLabel(match: MatchView): string {
  switch (match.step.kind) {
    case "finished":
      return "Match over";
    case "minigame":
      return `Minigame: ${MINIGAMES[match.step.game].name}`;
    case "revealing":
      return "Results";
    case "deciding":
      return match.phase.kind === "move"
        ? match.round === 1
          ? "Move: choose a die and a path"
          : "Move: items, shop, die, and path"
        : match.phase.kind === "boss"
          ? "Boss fight"
          : "Final showdown";
  }
}

export function Game({ received, act, onLeave }: Props) {
  const { view, clockOffset } = received;
  const match = view.match!;
  const step = match.step;
  // Minigames show their own countdowns.
  const until = step.kind === "deciding" ? step.deadline : step.kind === "revealing" ? step.until : null;
  const secondsLeft = useSecondsLeft(until, clockOffset);
  const seatName = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const isHost = view.seats.find((s) => s.seatId === view.youSeatId)?.isHost ?? false;

  return (
    <main className="game">
      <header className="bar">
        <h1>Round {match.round}</h1>
        <span className="phase">{phaseLabel(match)}</span>
        {secondsLeft !== null && <span className="timer">{secondsLeft}s</span>}
        <span className="muted">
          Boss: {match.bossFixed} + d4 · Room {view.code}
        </span>
        <button className="ghost" onClick={onLeave}>
          Leave
        </button>
      </header>

      {step.kind === "finished" && match.phase.kind === "gameOver" && (
        <section className="panel winner">
          <h2>{seatName(match.phase.winner)} wins!</h2>
          {isHost ? (
            <button className="primary" onClick={() => act({ type: "playAgain" })}>
              Back to lobby
            </button>
          ) : (
            <p className="muted">Waiting for the host…</p>
          )}
        </section>
      )}

      {step.kind === "minigame" && step.mode === "server" && (
        <ServerMinigame view={view} step={step} clockOffset={clockOffset} act={act} />
      )}

      {step.kind === "minigame" && step.mode === "client" && (
        <Minigame
          key={step.seed}
          step={step}
          clockOffset={clockOffset}
          submitted={match.you?.minigameSubmitted ?? false}
          act={act}
        />
      )}

      <Board view={view} />

      <div className="columns">
        <DecisionPanel view={view} act={act} />
        <Standings view={view} />
        <EventLog view={view} />
      </div>
    </main>
  );
}

function Standings({ view }: { view: RoomView }) {
  const match = view.match!;
  const ranked = [...match.players].sort(
    (a, b) => match.board.spaces[a.position]!.distanceToFinish - match.board.spaces[b.position]!.distanceToFinish,
  );
  return (
    <section className="panel">
      <h2>Standings</h2>
      <ol className="standings">
        {ranked.map((p) => {
          const seat = view.seats.find((s) => s.seatId === p.seatId)!;
          return (
            <li key={p.seatId}>
              <span className="dot" style={{ background: seatColor(view, p.seatId) }} />
              <strong>{seat.character}</strong>
              {seat.kind === "human" && <span className="muted"> {seat.name}</span>}
              <SeatTags seat={seat} you={seat.seatId === view.youSeatId} />
              <span className="stat">{match.board.spaces[p.position]!.distanceToFinish} to go</span>
              <span className="stat">{p.coins}c</span>
              {p.defaultDie === 4 && <span className="tag warn">d4</span>}
              {p.deciding && (
                <span className="stat">
                  {match.step.kind === "minigame"
                    ? match.step.mode === "client"
                      ? p.ready
                        ? "done"
                        : "playing…"
                      : p.ready
                        ? "picked"
                        : "picking…"
                    : p.ready
                      ? "ready"
                      : "deciding…"}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
