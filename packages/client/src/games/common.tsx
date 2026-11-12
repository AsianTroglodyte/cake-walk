import type { ReactNode } from "react";
import type { PlayerId } from "@pbg/rules";

export interface GameProps<V> {
  view: V;
  me: PlayerId | null;
  players: PlayerId[];
  name: (id: PlayerId) => string;
  color: (id: PlayerId) => string;
  /** This player picks this round and hasn't yet. */
  canPick: boolean;
  submitted: unknown;
  stage: "countdown" | "choosing" | "reveal" | "live";
  send: (move: unknown) => void;
  /** Server clock. */
  now: number;
}

export function Who({ id, p }: { id: PlayerId; p: GameProps<unknown> }) {
  return (
    <span className="who">
      <span className="dot" style={{ background: p.color(id) }} />
      {p.name(id)}
      {id === p.me && <span className="tag you">you</span>}
    </span>
  );
}

/** One row per player, best first. */
export function Scores({
  p,
  value,
  label,
  extra,
}: {
  p: GameProps<unknown>;
  value: (id: PlayerId) => number;
  label: (id: PlayerId) => ReactNode;
  extra?: (id: PlayerId) => ReactNode;
}) {
  const sorted = [...p.players].sort((a, b) => value(b) - value(a));
  return (
    <ul className="mg-scores">
      {sorted.map((id) => (
        <li key={id}>
          <Who id={id} p={p} />
          <span className="stat">{label(id)}</span>
          {extra && <span className="stat">{extra(id)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Options<T extends string | number>({
  options,
  label,
  onPick,
  disabled,
}: {
  options: readonly T[];
  label?: (o: T) => ReactNode;
  onPick: (o: T) => void;
  disabled?: (o: T) => boolean;
}) {
  return (
    <div className="mg-options">
      {options.map((o) => (
        <button key={o} className="mg-option" disabled={disabled?.(o)} onClick={() => onPick(o)}>
          {label ? label(o) : o}
        </button>
      ))}
    </div>
  );
}

export function PickedNote({ p, text }: { p: GameProps<unknown>; text?: ReactNode }) {
  if (p.submitted === null || p.submitted === undefined || p.stage !== "choosing") return null;
  return <p className="muted">Locked in{text ? <>: {text}</> : null}. Waiting for the others…</p>;
}

/** `played` counts finished rounds, so while picking the current round is one more. */
export function roundLabel(p: GameProps<unknown>, played: number, total: number): string {
  return p.stage === "choosing" ? `Round ${played + 1} of ${total}` : `Round ${Math.max(1, played)} of ${total}`;
}

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
