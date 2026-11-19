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
  /** Current server phase deadline, when available. */
  until?: number | null;
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

/** Shared compact minigame standings list. Supply ids in leaderboard order. */
export function Leaderboard({
  p,
  ids = p.players,
  score,
  detail,
  scoreHeading = "Score",
  detailHeading = "Details",
  caption = "Leaderboard",
  rank,
  rowClass,
}: {
  p: GameProps<unknown>;
  ids?: PlayerId[];
  score: (id: PlayerId) => ReactNode;
  detail?: (id: PlayerId) => ReactNode;
  scoreHeading?: string;
  detailHeading?: string;
  caption?: string;
  rank?: (id: PlayerId, index: number) => ReactNode;
  rowClass?: (id: PlayerId) => string | undefined;
}) {
  return (
    <section className="mg-leaderboard" aria-label={caption}>
      <h3 className="mg-leaderboard-title">{caption}</h3>
      <ol>
        {ids.map((id, index) => (
          <li key={id} className={[id === p.me ? "mine" : "", rowClass?.(id) ?? ""].filter(Boolean).join(" ")}>
            <span className="mg-rank">{rank ? rank(id, index) : index + 1}</span>
            <Who id={id} p={p} />
            <span className="mg-score"><span className="mg-visually-hidden">{scoreHeading}: </span>{score(id)}</span>
            {detail && <span className="mg-detail"><span className="mg-visually-hidden">{detailHeading}: </span>{detail(id) ?? "—"}</span>}
          </li>
        ))}
      </ol>
    </section>
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
  return <Leaderboard p={p} ids={sorted} score={label} detail={extra} />;
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
