import { useEffect, useRef, useState } from "react";
import type { RoomView } from "@pbg/protocol";
import type { MatchEvent, PlayerId, SpaceId, SpaceType } from "@pbg/rules";
import { seatColor } from "./colors";
import { boardSpaceLabel } from "./spaceLabels";

const LABELS: Record<SpaceType, string> = {
  start: "S",
  checkpoint: "CP",
  finish: "F",
  white: "W",
  blue: "+",
  red: "−",
  green: "G",
  orange: "→",
  purple: "←",
  pink: "P",
  maroon: "M",
  black: "●",
  monochromeChaos: "C",
  rainbowChaos: "🌈",
};

const DESCRIPTIONS: Record<SpaceType, string> = {
  start: "Start (safe)",
  checkpoint: "Checkpoint (safe)",
  finish: "Finish: fight the boss",
  white: "White: no effect",
  blue: "Blue: gain coins",
  red: "Red: lose coins",
  green: "Green: gain a random item",
  orange: "Orange: move forward 2–4 spaces",
  purple: "Purple: move back 2–4 spaces",
  pink: "Pink: roll again and move",
  maroon: "Maroon: skip your next move",
  black: "Black: no effect for now",
  monochromeChaos: "Monochrome Chaos",
  rainbowChaos: "Rainbow Chaos",
};

/** Matches the server's Timing.spaceMs so tokens finish as the reveal ends. */
const SPACE_MS = 220;
const ARROW_PAUSE_MS = 1_000;
const COLLISION_BUFFER_MS = 2_000;

interface Move {
  playerId: PlayerId;
  path: SpaceId[];
}

interface AnimationAction {
  moves: Move[];
  collisionSpaces?: SpaceId[];
  floatieSaves?: { playerId: PlayerId; spaceId: SpaceId }[];
}

/** The board walks tokens one space at a time, in the same order the rules resolved them. */
function animationActions(events: MatchEvent[], step: "itemReveal" | "revealing"): AnimationAction[] {
  const lastRound = events.map((e) => e.type === "roundStarted").lastIndexOf(true);
  const round = events.slice(lastRound + 1);
  const moved = new Map<number, Move[]>();
  const arrows = new Map<number, Move[]>();
  const pushed: Move[] = [];
  const knocked: Move[] = [];
  const collisionSpaces: SpaceId[] = [];
  const floatieSaves: { playerId: PlayerId; spaceId: SpaceId }[] = [];

  for (const event of round) {
    switch (event.type) {
      case "moved":
        {
          const chain = event.chain ?? 0;
          const moves = moved.get(chain) ?? [];
          moves.push({ playerId: event.playerId, path: event.path });
          moved.set(chain, moves);
        }
        break;
      case "arrow":
        {
          const chain = event.chain ?? 0;
          const moves = arrows.get(chain) ?? [];
          moves.push({ playerId: event.playerId, path: event.path });
          arrows.set(chain, moves);
        }
        break;
      case "knockedBack":
        knocked.push({ playerId: event.playerId, path: event.path });
        break;
      case "forcedBack":
        collisionSpaces.push(event.spaceId);
        pushed.push({ playerId: event.playerId, path: [event.sentTo] });
        break;
      case "collision":
        collisionSpaces.push(event.spaceId);
        for (const id of event.saved ?? []) floatieSaves.push({ playerId: id, spaceId: event.spaceId });
        for (const id of event.playerIds) {
          if (!event.saved?.includes(id)) pushed.push({ playerId: id, path: [event.sentTo] });
        }
        break;
      case "shoved":
        if (step === "itemReveal") pushed.push({ playerId: event.playerId, path: event.path });
        break;
    }
  }

  if (step === "itemReveal") return pushed.length > 0 ? [{ moves: pushed }] : [];
  return [
    ...[...moved.entries()].sort(([a], [b]) => a - b).map(([, moves]) => ({ moves })),
    ...[...arrows.entries()].sort(([a], [b]) => a - b).map(([, moves]) => ({ moves })),
    ...(collisionSpaces.length > 0 ? [{ moves: [], collisionSpaces, floatieSaves }] : []),
    ...(pushed.length > 0 ? [{ moves: pushed }] : []),
    ...(knocked.length > 0 ? [{ moves: knocked }] : []),
  ];
}

function useAnimatedPositions(view: RoomView): {
  positions: Record<PlayerId, SpaceId> | null;
  collisionSpaces: SpaceId[];
  floatieSaves: { playerId: PlayerId; spaceId: SpaceId }[];
} {
  const match = view.match!;
  const actual = Object.fromEntries(match.players.map((p) => [p.seatId, p.position]));
  const actualKey = match.players.map((player) => `${player.seatId}:${player.position}`).join("|");
  const step = match.step;
  const animating = step.kind === "revealing" || step.kind === "itemReveal";
  const key = animating ? `${step.kind}-${step.until}` : null;
  const [display, setDisplay] = useState<Record<PlayerId, SpaceId> | null>(null);
  const [collisionSpaces, setCollisionSpaces] = useState<SpaceId[]>([]);
  const [floatieSaves, setFloatieSaves] = useState<{ playerId: PlayerId; spaceId: SpaceId }[]>([]);
  const settled = useRef(actual);

  // Between animations the tokens sit on the server's positions.
  useEffect(() => {
    if (!animating) {
      // The server resolves movement before presenting its roll summary. Keep the old
      // positions until the following reveal begins so tokens can animate from them.
      if (step.kind !== "rollSummary") {
        settled.current = actual;
        setDisplay(null);
        setCollisionSpaces([]);
        setFloatieSaves([]);
      }
    }
  }, [animating, step.kind, actualKey]);

  useEffect(() => {
    if (!key || !animating) return;
    const events = step.kind === "revealing" ? step.events ?? match.events : match.events;
    const actions = animationActions(events, step.kind === "itemReveal" ? "itemReveal" : "revealing");
    if (actions.length === 0) return;

    const start = { ...settled.current };
    setDisplay(start);
    setCollisionSpaces([]);
    setFloatieSaves([]);
    const timers: number[] = [];
    let at = 0;
    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const action = actions[actionIndex]!;
      if (action.collisionSpaces) {
        const highlighted = action.collisionSpaces;
        const saves = action.floatieSaves ?? [];
        timers.push(window.setTimeout(() => {
          setCollisionSpaces(highlighted);
          setFloatieSaves(saves);
        }, at));
        at += COLLISION_BUFFER_MS;
        timers.push(window.setTimeout(() => {
          setCollisionSpaces([]);
          setFloatieSaves([]);
        }, at));
        continue;
      }
      const moves = action.moves;
      const steps = Math.max(...moves.map((move) => move.path.length));
      for (let i = 0; i < steps; i++) {
        timers.push(
          window.setTimeout(() => {
            setDisplay((previous) => {
              const next = { ...(previous ?? start) };
              for (const move of moves) {
                const space = move.path[i];
                if (space !== undefined) next[move.playerId] = space;
              }
              return next;
            });
          }, at + i * SPACE_MS),
        );
      }
      at += Math.max(steps * SPACE_MS, 300);
      if (actionIndex === 0 && events.some((event) => event.type === "arrow")) {
        // Leave a visible beat between the die's movement and its landing arrow.
        at += ARROW_PAUSE_MS;
      }
    }
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
    // The reveal's identity is the key; match.events only changes with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    positions: display ?? (animating || step.kind === "rollSummary" ? settled.current : null),
    collisionSpaces,
    floatieSaves,
  };
}

export function Board({ view }: { view: RoomView }) {
  const match = view.match!;
  const { board } = match;
  const length = board.spaces[board.start]!.distanceToFinish;
  const myTraps = new Set(match.you?.traps ?? []);
  const testTraps = new Map((match.testTraps ?? []).map((trap) => [trap.spaceId, trap]));
  const animated = useAnimatedPositions(view);
  const collisionSpaces = new Set(animated.collisionSpaces);
  const floatieSaves = new Set(animated.floatieSaves.map((save) => `${save.playerId}:${save.spaceId}`));
  const teleportSpaces = new Set(
    match.step.kind === "chaos" ? match.step.event.teleports?.map((teleport) => teleport.to) ?? [] : [],
  );
  const positionOf = (player: { seatId: PlayerId; position: SpaceId }) => animated.positions?.[player.seatId] ?? player.position;

  return (
    <section className="board-scroll">
      <div
        className="board"
        style={{
          gridTemplateColumns: `repeat(${length + 1}, 112px)`,
          gridTemplateRows: `repeat(${board.paths}, 96px)`,
        }}
      >
        {board.spaces.map((space) => {
          const here = match.players.filter((p) => positionOf(p) === space.id);
          const testTrap = testTraps.get(space.id);
          const trapOwner = testTrap && view.seats.find((seat) => seat.seatId === testTrap.ownerId);
          const column = length - space.distanceToFinish + 1;
          const row = space.lane === null ? `1 / span ${board.paths}` : `${space.lane + 1}`;
          const names = here.map((p) => view.seats.find((s) => s.seatId === p.seatId)?.character).join(", ");
          return (
            <div
              key={space.id}
              className={`space ${space.type} ${space.collisionFree && space.lane !== null ? "safe" : ""} ${collisionSpaces.has(space.id) ? "collision-highlight" : ""} ${teleportSpaces.has(space.id) ? "chaos-teleport-highlight" : ""}`}
              style={{ gridColumn: column, gridRow: row }}
              title={`Space ${boardSpaceLabel(board, space.id)} · ${DESCRIPTIONS[space.type]} · ${space.distanceToFinish} to go${testTrap ? ` · ${testTrap.kind} owned by ${trapOwner?.character ?? testTrap.ownerId}` : myTraps.has(space.id) ? " · your trap" : ""}${names ? ` · ${names}` : ""}`}
            >
              <span className="space-number">{boardSpaceLabel(board, space.id)}</span>
              <span className="label">{LABELS[space.type]}</span>
              {testTrap
                ? <span className={`trap-mark test-trap-mark trap-${testTrap.kind}`}>
                    {testTrap.kind === "sandTrap" ? "SAND" : testTrap.kind === "itemTrap" ? "ITEM" : "DEATH"}
                    {trapOwner ? ` · ${trapOwner.character.slice(0, 2)}` : ""}
                  </span>
                : myTraps.has(space.id) && <span className="trap-mark">trap</span>}
              <span className="tokens">
                {here.map((p) => {
                  const seat = view.seats.find((s) => s.seatId === p.seatId);
                  const tokenScale = here.length <= 2 ? 1.25 : here.length <= 4 ? 1 : here.length <= 6 ? 0.85 : here.length <= 9 ? 0.72 : 0.6;
                  return (
                    <span
                      key={p.seatId}
                      className={`token ${p.seatId === view.youSeatId ? "you" : ""} ${p.dead ? "dead" : ""}`}
                      title={p.dead ? `${seat?.character ?? p.seatId} is dead` : seat?.character}
                      style={{
                        background: seatColor(view, p.seatId),
                        fontSize: `${0.82 * tokenScale}rem`,
                        padding: `${2 * tokenScale}px ${6 * tokenScale}px`,
                      }}
                    >
                      {seat?.character.slice(0, 2)}
                      {floatieSaves.has(`${p.seatId}:${space.id}`) && (
                        <span className="floatie-save-marker" role="img" aria-label="Life Ring protected this player from the collision" title="Life Ring saved them from the collision">
                          🛟
                        </span>
                      )}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small-text">
        Space numbers show progress from the start; A/B/C mark parallel routes. Faded spaces are the safe opening (no collisions). Landing on the same space as someone else sends you both back
        to the last checkpoint. {match.testTraps ? "Trap test: remaining trap markers show their type and owner." : "Only you can see your own traps."}
      </p>
    </section>
  );
}
