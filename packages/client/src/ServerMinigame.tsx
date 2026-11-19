import { lazy, Suspense, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import { MINIGAMES, type ServerMinigameKind } from "@pbg/rules";
import type { ClientAction, RoomView, Step } from "@pbg/protocol";
import { seatColor } from "./colors";
import type { GameProps } from "./games/common";

type ServerStep = Extract<Step, { kind: "minigame"; mode: "server" }>;

type GamePanel = ComponentType<GameProps<any>>;
type LazyGamePanel = LazyExoticComponent<GamePanel>;
function lazyPanel(
  loader: () => Promise<Record<string, GamePanel>>,
  exportName: string,
): LazyGamePanel {
  return lazy(async () => ({ default: (await loader())[exportName]! }));
}

const PANELS: Record<ServerMinigameKind, LazyGamePanel> = {
  rps: lazyPanel(() => import("./games/picks"), "Rps"),
  stairway: lazyPanel(() => import("./games/picks"), "Stairway"),
  groupDice: lazyPanel(() => import("./games/numbers"), "GroupDice"),
  headsTails: lazyPanel(() => import("./games/picks"), "HeadsTails"),
  insertCoins: lazyPanel(() => import("./games/numbers"), "InsertCoins"),
  threeCells: lazyPanel(() => import("./games/picks"), "ThreeCells"),
  fourCorners: lazyPanel(() => import("./games/picks"), "FourCorners"),
  higherLower: lazyPanel(() => import("./games/numbers"), "HigherLower"),
  theCount: lazyPanel(() => import("./games/numbers"), "TheCount"),
  yahtzee: lazyPanel(() => import("./games/dice"), "Yahtzee"),
  shutBox: lazyPanel(() => import("./games/dice"), "ShutBox"),
  laserFight: lazyPanel(() => import("./games/fights"), "LaserFight"),
  timebomb: lazyPanel(() => import("./games/fights"), "Timebomb"),
  blastZone: lazyPanel(() => import("./games/grids"), "BlastZone"),
  plates: lazyPanel(() => import("./games/grids"), "Plates"),
  minefield: lazyPanel(() => import("./games/grids"), "Minefield"),
  battleship: lazyPanel(() => import("./games/grids"), "Battleship"),
  calculator: lazyPanel(() => import("./games/new"), "Calculator"),
  singleWord: lazyPanel(() => import("./games/new"), "SingleWord"),
  colorPlatforms: lazyPanel(() => import("./games/new"), "ColorPlatforms"),
  colorCode: lazyPanel(() => import("./games/new"), "ColorCode"),
  painter: lazyPanel(() => import("./games/new"), "Painter"),
  onTheDot: lazyPanel(() => import("./games/newMinigames"), "OnTheDot"),
  dotCollector: lazyPanel(() => import("./games/newMinigames"), "DotCollector"),
  gridQuiz: lazyPanel(() => import("./games/newMinigames"), "GridQuiz"),
  brawldle: lazyPanel(() => import("./games/newMinigames"), "Brawldle"),
  diceFleet: lazyPanel(() => import("./games/newMinigames"), "DiceFleet"),
  countTheDots: lazyPanel(() => import("./games/moreMinigames"), "CountTheDots"),
  hideAndSeek: lazyPanel(() => import("./games/moreMinigames"), "HideAndSeek"),
  redLightGreenLight: lazyPanel(() => import("./games/moreMinigames"), "RedLightGreenLight"),
  unstableMath: lazyPanel(() => import("./games/moreMinigames"), "UnstableMath"),
  hangman: lazyPanel(() => import("./games/moreMinigames"), "Hangman"),
  letterSwitch: lazyPanel(() => import("./games/moreMinigames"), "LetterSwitch"),
  conquest: lazyPanel(() => import("./games/moreMinigames"), "Conquest"),
  snake: lazyPanel(() => import("./games/moreMinigames"), "Snake"),
};

interface Props {
  view: RoomView;
  step: ServerStep;
  clockOffset: number;
  act: (action: ClientAction) => void;
}

/** Real-time games need a fast tick for their timers; round games only a countdown. */
function useServerNow(clockOffset: number, fast: boolean): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), fast ? 50 : 250);
    return () => clearInterval(timer);
  }, [fast]);
  // Read on every render, so a view that just arrived is never compared with a stale clock.
  return Date.now() + clockOffset;
}

export function ServerMinigame({ view, step, clockOffset, act }: Props) {
  const match = view.match!;
  const minigame = match.minigame;
  const info = MINIGAMES[step.game];
  const now = useServerNow(clockOffset, [
    "timebomb", "minefield", "colorPlatforms", "colorCode", "painter", "onTheDot", "dotCollector", "gridQuiz",
    "countTheDots", "hideAndSeek", "redLightGreenLight", "hangman", "conquest", "snake",
  ].includes(step.game));
  if (!minigame) return null;

  const me = view.youSeatId;
  const canPick = step.stage === "choosing" && !!me && minigame.deciders.includes(me) && minigame.submitted === null;
  const secondsLeft = step.until === null ? null : Math.max(0, Math.ceil((step.until - now) / 1000));
  const Panel = PANELS[step.game];
  const props: GameProps<unknown> = {
    view: minigame.view,
    me,
    players: match.players.map((p) => p.seatId),
    name: (id) => view.seats.find((s) => s.seatId === id)?.character ?? id,
    color: (id) => seatColor(view, id),
    canPick,
    submitted: minigame.submitted,
    stage: step.stage,
    send: (move) => act({ type: "minigameMove", move }),
    now,
    until: step.until,
  };

  let status: string;
  switch (step.stage) {
    case "countdown":
      status = `Starts in ${secondsLeft}`;
      break;
    case "choosing":
      status = canPick ? `Your pick! ${secondsLeft}s` : minigame.submitted !== null ? `${secondsLeft}s` : `Watching · ${secondsLeft}s`;
      break;
    case "reveal":
      status = "Results";
      break;
    case "live":
      status = "Live!";
      break;
  }

  return (
    <section className="panel minigame server-minigame">
      <h2>
        Minigame: {info.name} <span className="mg-status">{status}</span>
      </h2>
      <p><strong>{info.instructions}</strong></p>
      {(step.stage !== "countdown" || step.game === "redLightGreenLight" || step.game === "snake") &&
        <Suspense fallback={<p className="mg-panel-loading" role="status">Loading minigame…</p>}>
          <Panel key={`${step.game}-${step.round}`} {...props} />
        </Suspense>}
    </section>
  );
}
