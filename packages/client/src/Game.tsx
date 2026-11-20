import { useEffect, useState } from "react";
import type { ClientAction, MatchView } from "@pbg/protocol";
import type { ReceivedView } from "./App";
import { Board } from "./Board";
import { Showdown } from "./Showdown";
import { BossBattle } from "./BossBattle";
import { ChaosSpace } from "./ChaosSpace";
import { ChaosSpawnAnnouncement } from "./ChaosSpawnAnnouncement";
import { AuctionAnnouncement } from "./AuctionAnnouncement";
import { TrapTriggered } from "./TrapTriggered";
import { DeathAnnouncement } from "./DeathAnnouncement";
import { DecisionPanel } from "./DecisionPanel";
import { EventLog } from "./EventLog";
import { FloatieResults, ItemReveal } from "./ItemReveal";
import { LandingResults } from "./LandingResults";
import { Minigame } from "./Minigame";
import { Leaderboard } from "./Leaderboard";
import { Results } from "./Results";
import { EndGameResults } from "./EndGameResults";
import { RollSummary } from "./RollSummary";
import { ServerMinigame } from "./ServerMinigame";
import { MINIGAMES } from "@pbg/rules";

interface Props {
  received: ReceivedView;
  act: (action: ClientAction) => void;
  onLeave: () => void;
  playAgainLabel?: string;
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
    case "rollSummary":
      return "Movement roll results";
    case "itemReveal":
      return "Item uses";
    case "results":
      return "Minigame results";
    case "showdown":
      return match.step.battle ? "Battle" : "Final showdown";
    case "bossBattle":
      return "Final boss encounter";
    case "chaos":
      return "Absolute Chaos";
    case "chaosSpawn":
      return "Chaos space spawned";
    case "auctionAnnouncement":
      return "Auction opening";
    case "chaosBuffer":
      return "Chaos settles · Minigame soon";
    case "trap":
      return "Trap sprung!";
    case "death":
      return "Knockout";
    case "deciding":
      return match.phase.kind === "items"
        ? "Items: use one and buy one"
        : match.phase.kind === "move"
          ? "Move: choose a die and a path"
          : match.phase.kind === "battleInitiation"
            ? "Battle: challenge an opponent"
            : match.phase.kind === "battle"
              ? "Battle"
          : match.phase.kind === "boss"
            ? "Boss fight"
            : "Final showdown";
  }
}

export function Game({ received, act, onLeave, playAgainLabel = "Back to lobby" }: Props) {
  const { view, clockOffset } = received;
  const match = view.match!;
  const step = match.step;
  const you = match.players.find((player) => player.seatId === view.youSeatId);
  const watchingOtherPlayersTrap =
    step.kind === "trap" &&
    !step.event.victims.includes(view.youSeatId ?? "") &&
    !(step.event.blocked?.includes(view.youSeatId ?? "") ?? false);
  const showingDeath = step.kind === "death" && step.events.length > 0;
  const modalActive =
    step.kind === "bossBattle" || step.kind === "showdown" || step.kind === "chaos" ||
    step.kind === "chaosSpawn" || showingDeath ||
    step.kind === "auctionAnnouncement" ||
    (step.kind === "trap" && !watchingOtherPlayersTrap);
  // Minigames show their own countdowns.
  const until =
    step.kind === "bossBattle" || step.kind === "showdown"
      ? step.stage === "choosing" ? step.deadline : step.until
      : step.kind === "deciding"
      ? step.deadline
      : step.kind === "chaos" || step.kind === "chaosSpawn" || step.kind === "auctionAnnouncement" ||
        step.kind === "chaosBuffer" || step.kind === "trap" || showingDeath || step.kind === "revealing" || step.kind === "rollSummary" || step.kind === "results" || step.kind === "itemReveal"
        ? watchingOtherPlayersTrap ? null : step.until
        : null;
  const secondsLeft = useSecondsLeft(until, clockOffset);
  const seatName = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const isHost = view.seats.find((s) => s.seatId === view.youSeatId)?.isHost ?? false;

  if (step.kind === "finished" && match.phase.kind === "gameOver" && match.endStats) {
    return <EndGameResults
      view={view}
      stats={match.endStats}
      act={act}
      onLeave={onLeave}
      playAgainLabel={playAgainLabel}
    />;
  }

  if (step.kind === "minigame") {
    return (
      <main className="minigame-standalone">
        <header className="minigame-standalone-header">
          <strong>{MINIGAMES[step.game].name}</strong>
          <span>{step.mode === "server" ? step.stage === "choosing" ? "Choose now" : step.stage : "Minigame"}</span>
          <button className="ghost" onClick={onLeave}>Leave</button>
        </header>
        {step.mode === "server" ? (
          step.stage === "ready" ? (
            <section className="panel minigame">
              <h2>Minigame: {MINIGAMES[step.game].name}</h2>
              <p><strong>{MINIGAMES[step.game].instructions}</strong></p>
              {you?.ready
                ? <p className="muted">Waiting for everyone to be ready…</p>
                : <button className="primary" onClick={() => act({ type: "ready" })}>Ready — start the minigame</button>}
            </section>
          ) : <ServerMinigame
            view={view}
            step={{ ...step, stage: step.stage as Exclude<typeof step.stage, "ready"> }}
            clockOffset={clockOffset}
            act={act}
          />
        ) : (
          <Minigame
            key={step.seed}
            step={step}
            clockOffset={clockOffset}
            submitted={match.you?.minigameSubmitted ?? false}
            act={act}
          />
        )}
      </main>
    );
  }

  return (
    <main className="game">
      {step.kind === "bossBattle" && <BossBattle key={`boss-${match.round}`} view={view} step={step} act={act} />}
      {step.kind === "showdown" && <Showdown key={`showdown-${match.round}`} view={view} step={step} act={act} />}
      {step.kind === "chaos" && <ChaosSpace view={view} step={step} />}
      {step.kind === "chaosSpawn" && <ChaosSpawnAnnouncement view={view} step={step} />}
      {step.kind === "auctionAnnouncement" && <AuctionAnnouncement step={step} />}
      {step.kind === "trap" && !watchingOtherPlayersTrap && <TrapTriggered view={view} step={step} />}
      {step.kind === "death" && step.events.length > 0 && <DeathAnnouncement step={step} view={view} />}
      {step.kind === "chaosBuffer" && (
        <section className="panel chaos-buffer" aria-live="polite">
          <strong>Chaos settles…</strong>
          <span>The minigame begins in {secondsLeft ?? 0}s</span>
        </section>
      )}
      <div inert={modalActive} aria-hidden={modalActive ? true : undefined}>
      <header className="bar">
        <h1>Round {match.round}</h1>
        <span className="phase">{watchingOtherPlayersTrap ? "Board results" : phaseLabel(match)}</span>
        <div className="header-stats">
          {secondsLeft !== null && <span className="timer">{secondsLeft}s</span>}
          {you && <span className="coin-count">Coins: {you.coins}</span>}
        </div>
        <span className="muted">
          Boss: {match.bossFixed} + d4 · Room {view.code}
        </span>
        <button className="ghost" onClick={onLeave}>
          Leave
        </button>
      </header>

      {step.kind === "revealing" && step.events?.some((event) => event.type === "moved") && (
        <LandingResults key={step.until} view={view} events={step.events} />
      )}

      {step.kind === "finished" && match.phase.kind === "gameOver" && (
        <section className="panel winner">
          <h2>{seatName(match.phase.winner)} wins!</h2>
          {isHost ? (
            <button className="primary" onClick={() => act({ type: "playAgain" })}>
              {playAgainLabel}
            </button>
          ) : (
            <p className="muted">Waiting for the host…</p>
          )}
        </section>
      )}

      {step.kind === "results" && <Results view={view} step={step} act={act} />}

      {step.kind === "itemReveal" && <ItemReveal view={view} step={step} />}
      {step.kind === "revealing" && <FloatieResults view={view} events={step.events ?? []} />}
      {step.kind === "rollSummary" && <RollSummary view={view} events={step.events} />}

      <Board view={view} />

      <div className="columns">
        <DecisionPanel view={view} act={act} secondsLeft={secondsLeft} clockOffset={clockOffset} />
        <Leaderboard view={view} />
        <EventLog view={view} />
      </div>
      </div>
    </main>
  );
}
