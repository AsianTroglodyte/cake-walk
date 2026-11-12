import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MINEFIELD,
  MINEFIELD_DIRECTIONS,
  SHIP_LENGTHS,
  blastSteps,
  blastTargets,
  fleetCells,
  plateSteps,
  shipCells,
  square,
  xOf,
  yOf,
  type BattleshipView,
  type BlastZoneView,
  type MinefieldDirection,
  type MinefieldView,
  type PlatesView,
  type PlayerId,
  type ShipDirection,
  type ShipPlacement,
} from "@pbg/rules";
import { PickedNote, Scores, plural, type GameProps } from "./common";

function Cell({
  cols,
  cell,
  className = "",
  onClick,
  disabled,
  title,
  children,
}: {
  cols: number;
  cell: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children?: ReactNode;
}) {
  const style = { gridColumn: (cell % cols) + 1, gridRow: Math.floor(cell / cols) + 1 };
  if (onClick) {
    return (
      <button type="button" className={`arena-cell ${className}`} style={style} disabled={disabled} title={title} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <div className={`arena-cell ${className}`} style={style} title={title}>
      {children}
    </div>
  );
}

function Arena({ cols, rows, className = "", children }: { cols: number; rows: number; className?: string; children: ReactNode }) {
  return (
    <div className={`arena ${className}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {children}
    </div>
  );
}

function tokensInCell(positions: Record<PlayerId, number>, players: PlayerId[], cell: number): PlayerId[] {
  return players.filter((id) => positions[id] === cell);
}

export function BlastZone(p: GameProps<BlastZoneView>) {
  const v = p.view;
  const me = p.me;
  const g = square(v.size);
  const [to, setTo] = useState<number | null>(null);
  const alive = p.players.filter((id) => v.lives[id]! > 0);
  const steps = me && p.canPick ? blastSteps(v, me) : [];
  const targets = to !== null ? blastTargets(v, to) : [];

  useEffect(() => setTo(null), [v.round, p.canPick]);

  return (
    <>
      <p>
        Round {Math.min(v.round + (p.stage === "choosing" ? 1 : 0), v.rounds) || 1} of {v.rounds}
        {p.canPick && (to === null ? " · pick where to step" : " · pick where to bomb")}
      </p>
      <Arena cols={v.size} rows={v.size} className="blast">
        {Array.from({ length: v.size * v.size }, (_, cell) => {
          const here = tokensInCell(v.positions, alive, cell);
          const stepHere = steps.includes(cell);
          const targetHere = targets.includes(cell);
          const landed = v.last ? Object.values(v.last.landed).includes(cell) : false;
          let className = "";
          if (landed) className += " bombed";
          if (to === cell) className += " selected";
          if (stepHere && to === null) className += " choice";
          if (targetHere && to !== null) className += " choice bomb-choice";
          return (
            <Cell
              key={cell}
              cols={v.size}
              cell={cell}
              className={className}
              disabled={!p.canPick || (to === null ? !stepHere : !targetHere)}
              onClick={
                p.canPick
                  ? () => {
                      if (to === null) setTo(cell);
                      else p.send({ to, target: cell });
                    }
                  : undefined
              }
              title={`(${xOf(g, cell)}, ${yOf(g, cell)})`}
            >
              {here.map((id) => (
                <span key={id} className="arena-token" style={{ background: p.color(id) }} title={p.name(id)} />
              ))}
            </Cell>
          );
        })}
      </Arena>
      {p.canPick && to !== null && (
        <button className="ghost small" onClick={() => setTo(null)}>
          Change step
        </button>
      )}
      <PickedNote p={p} text={p.submitted ? "step and bomb locked in" : undefined} />
      <Scores
        p={p}
        value={(id) => v.lives[id]! * 100 + (v.outRound[id] ?? 50)}
        label={(id) => (v.lives[id]! > 0 ? "♥".repeat(v.lives[id]!) : `blown up in round ${v.outRound[id]}`)}
        extra={(id) => (v.last?.lost[id] ? `−${v.last.lost[id]}` : null)}
      />
    </>
  );
}

export function Plates(p: GameProps<PlatesView>) {
  const v = p.view;
  const me = p.me;
  const [to, setTo] = useState<number | null>(null);
  const alive = p.players.filter((id) => v.outRound[id] === null);
  const steps = me && p.canPick ? plateSteps(v, me) : [];

  useEffect(() => setTo(null), [v.round, p.canPick]);

  return (
    <>
      <p>
        Round {v.round + (p.stage === "choosing" ? 1 : 0) || 1}
        {v.round >= 8 ? " · plates crumble behind you" : ""}
        {p.canPick && (to === null ? " · pick a step" : " · pick a plate to remove")}
      </p>
      <Arena cols={v.size} rows={v.size} className="plates">
        {Array.from({ length: v.size * v.size }, (_, cell) => {
          const present = v.plates[cell];
          const here = tokensInCell(v.positions, alive, cell);
          const stepHere = steps.includes(cell);
          const removed = v.last && Object.values(v.last.removed).includes(cell);
          const crumbled = v.last?.crumbled.includes(cell);
          let className = present ? "" : " gone";
          if (to === cell) className += " selected";
          if (stepHere && to === null) className += " choice";
          if (to !== null && present && p.canPick) className += " choice remove-choice";
          if (removed || crumbled) className += " removed";
          return (
            <Cell
              key={cell}
              cols={v.size}
              cell={cell}
              className={className}
              disabled={!p.canPick || !present || (to === null ? !stepHere : false)}
              onClick={
                p.canPick && present
                  ? () => {
                      if (to === null) {
                        if (stepHere) setTo(cell);
                      } else p.send({ to, remove: cell });
                    }
                  : undefined
              }
            >
              {here.map((id) => (
                <span key={id} className="arena-token" style={{ background: p.color(id) }} title={p.name(id)} />
              ))}
            </Cell>
          );
        })}
      </Arena>
      {p.canPick && to !== null && (
        <button className="ghost small" onClick={() => setTo(null)}>
          Change step
        </button>
      )}
      <PickedNote p={p} />
      <Scores
        p={p}
        value={(id) => (v.outRound[id] === null ? 100 : v.outRound[id]!)}
        label={(id) => (v.outRound[id] === null ? "standing" : `fell in round ${v.outRound[id]}`)}
      />
    </>
  );
}

export function Minefield(p: GameProps<MinefieldView>) {
  const v = p.view;
  const me = p.me;
  const sendRef = useRef(p.send);
  sendRef.current = p.send;
  const [draft, setDraft] = useState<number[]>([]);

  const placing = v.phase === "placing";
  const racing = v.phase === "racing" && p.now >= v.raceStartAt && p.now < v.raceEndAt;
  const frozen = me ? p.now < v.frozenUntil[me]! : false;
  const finished = me ? v.finishedAt[me] !== null : false;
  const canStep = racing && !!me && !frozen && !finished && p.stage === "live";
  // Real-time games stay in the "live" stage, including mine placement.
  const canPlace = placing && p.stage === "live" && !!me && !v.locked[me!];

  useEffect(() => setDraft([]), [v.phase, p.stage]);

  useEffect(() => {
    if (!canStep) return;
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, MinefieldDirection> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        KeyW: "up",
        KeyS: "down",
        KeyA: "left",
        KeyD: "right",
      };
      const dir = map[e.code];
      if (!dir || !MINEFIELD_DIRECTIONS.includes(dir)) return;
      e.preventDefault();
      if (!e.repeat) sendRef.current({ kind: "step", dir });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canStep]);

  const toggleMine = (cell: number) => {
    if (!canPlace) return;
    setDraft((prev) => {
      if (prev.includes(cell)) return prev.filter((c) => c !== cell);
      if (prev.length >= MINEFIELD.minesPerPlayer) return prev;
      return [...prev, cell];
    });
  };

  const yourMines = new Set(v.yourMines);
  const known = new Set(v.known);
  const countdown = placing
    ? Math.max(0, Math.ceil((v.placeEndAt - p.now) / 1000))
    : p.now < v.raceStartAt
      ? Math.max(0, Math.ceil((v.raceStartAt - p.now) / 1000))
      : Math.max(0, Math.ceil((v.raceEndAt - p.now) / 1000));

  let status: string;
  if (v.phase === "over") status = "Race over";
  else if (placing) status = canPlace ? `Place ${MINEFIELD.minesPerPlayer} mines · ${countdown}s` : `Waiting · ${countdown}s`;
  else if (p.now < v.raceStartAt) status = `GO in ${countdown}`;
  else if (finished) status = "You finished!";
  else if (frozen) status = "Mine! Back to the start…";
  else status = `Race! ${countdown}s left`;

  return (
    <>
      <p>{status}</p>
      <Arena cols={v.cols} rows={v.rows} className="minefield">
        {Array.from({ length: v.cols * v.rows }, (_, cell) => {
          const y = Math.floor(cell / v.cols);
          const startRow = y === v.rows - 1;
          const finishRow = y === 0;
          const here = tokensInCell(v.positions, p.players, cell);
          const mineHere = draft.includes(cell) || yourMines.has(cell);
          const knownHere = known.has(cell);
          let className = "";
          if (startRow) className += " start-row";
          if (finishRow) className += " finish-row";
          if (mineHere) className += " mine";
          if (knownHere) className += " known-mine";
          if (canPlace && !startRow) className += " choice";
          return (
            <Cell
              key={cell}
              cols={v.cols}
              cell={cell}
              className={className}
              disabled={!canPlace || startRow}
              onClick={canPlace && !startRow ? () => toggleMine(cell) : undefined}
            >
              {mineHere && <span className="mine-mark">M</span>}
              {knownHere && !mineHere && <span className="mine-mark known">!</span>}
              {here.map((id) => (
                <span key={id} className="arena-token" style={{ background: p.color(id) }} title={p.name(id)} />
              ))}
            </Cell>
          );
        })}
      </Arena>
      {canPlace && (
        <button className="primary" disabled={draft.length !== MINEFIELD.minesPerPlayer} onClick={() => p.send({ kind: "mines", cells: draft })}>
          Lock mines ({draft.length}/{MINEFIELD.minesPerPlayer})
        </button>
      )}
      {placing && me && v.locked[me] && <p className="muted">Mines locked in. Waiting for the others…</p>}
      {canStep && <p className="muted small-text">Arrow keys or WASD to move. One step every 0.25s.</p>}
      <Scores
        p={p}
        value={(id) =>
          v.finishedAt[id] !== null ? 1000 - (v.finishedAt[id]! - v.raceStartAt) : v.rows - 1 - Math.floor(v.positions[id]! / v.cols)
        }
        label={(id) =>
          v.finishedAt[id] !== null
            ? `finished in ${((v.finishedAt[id]! - v.raceStartAt) / 1000).toFixed(1)}s`
            : `row ${v.rows - Math.floor(v.positions[id]! / v.cols)}`
        }
        extra={(id) => (v.hits[id] ? plural(v.hits[id]!, "mine hit") : null)}
      />
    </>
  );
}

function canAddShip(g: ReturnType<typeof square>, ships: ShipPlacement[], next: ShipPlacement, length: number): boolean {
  const cells = shipCells(g, length, next);
  if (!cells) return false;
  const used = new Set<number>();
  for (let i = 0; i < ships.length; i++) {
    const part = shipCells(g, SHIP_LENGTHS[i]!, ships[i]!);
    if (!part) return false;
    for (const c of part) used.add(c);
  }
  return cells.every((c) => !used.has(c));
}

export function Battleship(p: GameProps<BattleshipView>) {
  const v = p.view;
  const me = p.me;
  const g = square(v.size);
  const [dir, setDir] = useState<ShipDirection>("h");
  const [ships, setShips] = useState<ShipPlacement[]>([]);
  const [shots, setShots] = useState<number[]>([]);

  useEffect(() => {
    setShips([]);
    setShots([]);
  }, [v.round, v.placed, p.canPick]);

  const placing = !v.placed;
  const nextLength = SHIP_LENGTHS[ships.length];
  const ownCells = useMemo(() => new Set((v.yours ?? []).flatMap((ship) => ship.cells)), [v.yours]);
  const sunkCells = useMemo(() => new Map(v.sunk.flatMap((ship) => ship.cells.map((c) => [c, ship.owner] as const))), [v.sunk]);
  const draftCells = useMemo(() => {
    const cells = new Set<number>();
    ships.forEach((ship, i) => {
      const part = shipCells(g, SHIP_LENGTHS[i]!, ship);
      if (part) for (const c of part) cells.add(c);
    });
    return cells;
  }, [ships, g]);
  const fireable = useMemo(() => {
    if (!me || placing || !p.canPick) return new Set<number>();
    return new Set(v.shots.flatMap((shot, c) => (shot === null && !ownCells.has(c) ? [c] : [])));
  }, [me, placing, p.canPick, v.shots, ownCells]);

  const tryPlace = (cell: number) => {
    if (!placing || !p.canPick || nextLength === undefined) return;
    const nextShip = { cell, dir };
    if (!canAddShip(g, ships, nextShip, nextLength)) return;
    const next = [...ships, nextShip];
    setShips(next);
    if (next.length === SHIP_LENGTHS.length && fleetCells(g, next)) p.send({ kind: "place", ships: next });
  };

  const toggleShot = (cell: number) => {
    if (!p.canPick || placing || !fireable.has(cell)) return;
    setShots((prev) => {
      if (prev.includes(cell)) return prev.filter((c) => c !== cell);
      if (prev.length >= v.shotsPerRound) return prev;
      const next = [...prev, cell];
      if (next.length === v.shotsPerRound) p.send({ kind: "fire", cells: next });
      return next;
    });
  };

  return (
    <>
      <p>
        {placing
          ? p.canPick
            ? `Place ship ${ships.length + 1} of ${SHIP_LENGTHS.length} (${nextLength ?? "done"} tiles)`
            : "Waiting for fleets…"
          : p.canPick
            ? `Fire ${v.shotsPerRound} shots · ${shots.length}/${v.shotsPerRound}`
            : `Firing round ${v.round}`}
      </p>
      {placing && p.canPick && (
        <div className="mg-options">
          <button className={`mg-option ${dir === "h" ? "kept" : ""}`} onClick={() => setDir("h")}>
            Horizontal
          </button>
          <button className={`mg-option ${dir === "v" ? "kept" : ""}`} onClick={() => setDir("v")}>
            Vertical
          </button>
          {ships.length > 0 && (
            <button className="ghost" onClick={() => setShips((s) => s.slice(0, -1))}>
              Undo
            </button>
          )}
        </div>
      )}
      <Arena cols={v.size} rows={v.size} className="battleship">
        {Array.from({ length: v.size * v.size }, (_, cell) => {
          const shot = v.shots[cell];
          const mine = ownCells.has(cell) || draftCells.has(cell);
          const sunkOwner = sunkCells.get(cell);
          let className = "";
          if (mine) className += " ship";
          if (shot === "hit") className += " hit";
          if (shot === "miss") className += " miss";
          if (sunkOwner) className += " sunk";
          if (shots.includes(cell)) className += " selected";
          if (placing && p.canPick) className += " choice";
          if (!placing && fireable.has(cell)) className += " choice";
          return (
            <Cell
              key={cell}
              cols={v.size}
              cell={cell}
              className={className}
              disabled={placing ? !p.canPick : !fireable.has(cell)}
              onClick={placing ? () => tryPlace(cell) : () => toggleShot(cell)}
              title={sunkOwner ? `sunk: ${p.name(sunkOwner)}` : undefined}
            >
              {shot === "hit" ? "×" : shot === "miss" ? "·" : mine ? "■" : null}
            </Cell>
          );
        })}
      </Arena>
      <PickedNote p={p} />
      <Scores
        p={p}
        value={(id) => (v.outRound[id] === null ? v.shipsLeft[id]! + 10 : v.outRound[id]!)}
        label={(id) => (v.outRound[id] === null ? plural(v.shipsLeft[id]!, "ship") : `sunk in round ${v.outRound[id]}`)}
      />
      {v.last?.sunk.length ? (
        <p className="muted small-text">Sunk this round: {v.last.sunk.map((ship) => p.name(ship.owner)).join(", ")}</p>
      ) : null}
    </>
  );
}
