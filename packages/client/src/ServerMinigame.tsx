import { useEffect, useState, type ComponentType } from "react";
import { MINIGAMES, type ServerMinigameKind } from "@pbg/rules";
import type { ClientAction, RoomView, Step } from "@pbg/protocol";
import { seatColor } from "./colors";
import type { GameProps } from "./games/common";
import { Yahtzee, ShutBox } from "./games/dice";
import { LaserFight, Timebomb } from "./games/fights";
import { GroupDice, HigherLower, InsertCoins, TheCount } from "./games/numbers";
import { FourCorners, HeadsTails, Rps, Stairway, ThreeCells } from "./games/picks";

type ServerStep = Extract<Step, { kind: "minigame"; mode: "server" }>;

const PANELS: Record<ServerMinigameKind, ComponentType<GameProps<any>>> = {
  rps: Rps,
  stairway: Stairway,
  groupDice: GroupDice,
  headsTails: HeadsTails,
  insertCoins: InsertCoins,
  threeCells: ThreeCells,
  fourCorners: FourCorners,
  higherLower: HigherLower,
  theCount: TheCount,
  yahtzee: Yahtzee,
  shutBox: ShutBox,
  laserFight: LaserFight,
  timebomb: Timebomb,
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
  const now = useServerNow(clockOffset, step.game === "timebomb");
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
      <p>{info.instructions}</p>
      {step.stage !== "countdown" && <Panel key={`${step.game}-${step.round}`} {...props} />}
    </section>
  );
}
