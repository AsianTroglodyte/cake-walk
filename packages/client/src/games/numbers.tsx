import { useState } from "react";
import {
  dicePickAverage,
  GROUP_DICE_MAX,
  GROUP_DICE_SIDES,
  HIGHER_LOWER_MAX,
  INSERT_COINS_EACH,
  rollTotal,
  type DicePick,
  type GroupDiceView,
  type HigherLowerView,
  type InsertCoinsView,
  type TheCountView,
} from "@pbg/rules";
import { PickedNote, plural, roundLabel, Scores, Who, type GameProps } from "./common";

function Counter({ value, onChange, min, max, label }: { value: number; onChange: (n: number) => void; min: number; max: number; label: React.ReactNode }) {
  return (
    <div className="counter">
      <span className="counter-label">{label}</span>
      <button className="small" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <strong>{value}</strong>
      <button className="small" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export function GroupDice(p: GameProps<GroupDiceView>) {
  const { view: v } = p;
  const [dice, setDice] = useState<DicePick>({});
  const count = Object.values(dice).reduce((a, b) => a + b, 0);
  const describe = (pick: DicePick) =>
    Object.entries(pick)
      .filter(([, n]) => n > 0)
      .map(([sides, n]) => `${n}d${sides}`)
      .join(" + ");

  return (
    <>
      <p className="mg-big">Target: {v.target}</p>
      {p.canPick && (
        <>
          <div className="counters">
            {GROUP_DICE_SIDES.map((sides) => (
              <Counter
                key={sides}
                label={`d${sides}`}
                value={dice[sides] ?? 0}
                min={0}
                max={(dice[sides] ?? 0) + GROUP_DICE_MAX - count}
                onChange={(n) => setDice({ ...dice, [sides]: n })}
              />
            ))}
          </div>
          <p className="muted">
            {plural(count, "die", "dice")} of {GROUP_DICE_MAX} · average total {dicePickAverage(dice).toFixed(1)}
          </p>
          <button className="primary" disabled={count === 0} onClick={() => p.send(dice)}>
            Roll these
          </button>
        </>
      )}
      <PickedNote p={p} text={p.submitted ? describe(p.submitted as DicePick) : undefined} />
      {v.rolls && (
        <Scores
          p={p}
          value={(id) => (rollTotal(v.rolls![id]!) <= v.target ? rollTotal(v.rolls![id]!) : -1)}
          label={(id) => `${rollTotal(v.rolls![id]!)}${rollTotal(v.rolls![id]!) > v.target ? " BUST" : ""}`}
          extra={(id) => v.rolls![id]!.map((r) => `d${r.sides}:${r.value}`).join(" ")}
        />
      )}
    </>
  );
}

export function InsertCoins(p: GameProps<InsertCoinsView>) {
  const { view: v } = p;
  const [drop, setDrop] = useState<Record<string, number>>({});
  const used = Object.values(drop).reduce((a, b) => a + b, 0);
  const boxes = Object.values(drop).filter((n) => n > 0).length;
  const ready = used === INSERT_COINS_EACH && boxes >= 2;

  return (
    <>
      <p className="mg-big">Target: {v.target} or less</p>
      {p.canPick && (
        <>
          <div className="counters">
            {p.players.map((id) => (
              <Counter
                key={id}
                label={<Who id={id} p={p} />}
                value={drop[id] ?? 0}
                min={0}
                max={(drop[id] ?? 0) + INSERT_COINS_EACH - used}
                onChange={(n) => setDrop({ ...drop, [id]: n })}
              />
            ))}
          </div>
          <p className="muted">
            {INSERT_COINS_EACH - used} coins left · {plural(boxes, "box", "boxes")} (at least 2)
          </p>
          <button className="primary" disabled={!ready} onClick={() => p.send(drop)}>
            Insert coins
          </button>
        </>
      )}
      <PickedNote p={p} />
      {v.boxes && v.drops && (
        <Scores
          p={p}
          value={(id) => (v.boxes![id]! <= v.target ? v.boxes![id]! : -1)}
          label={(id) => `${v.boxes![id]} coins${v.boxes![id]! > v.target ? " OVER" : ""}`}
          extra={(id) =>
            p.players
              .filter((from) => v.drops![from]![id])
              .map((from) => `${p.name(from)} ${v.drops![from]![id]}`)
              .join(", ")
          }
        />
      )}
    </>
  );
}

export function HigherLower(p: GameProps<HigherLowerView>) {
  const { view: v } = p;
  const [guess, setGuess] = useState("");
  const value = Number(guess);
  const valid = Number.isInteger(value) && value >= 1 && value <= HIGHER_LOWER_MAX;
  const found = p.players.filter((id) => v.found[id] !== null);

  return (
    <>
      <p>
        {roundLabel(p, v.round, v.rounds)}
        {v.secret !== null && ` · the number was ${v.secret}`}
      </p>
      {p.canPick && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) p.send(value);
          }}
        >
          <input autoFocus type="number" min={1} max={HIGHER_LOWER_MAX} value={guess} onChange={(e) => setGuess(e.target.value)} />
          <button className="primary" disabled={!valid}>
            Guess
          </button>
        </form>
      )}
      <PickedNote p={p} text={String(p.submitted)} />
      {v.you && v.you.guesses.length > 0 && (
        <p className="mg-history">
          {v.you.guesses.map((g, i) => (
            <span key={i} className={`hint ${v.you!.hints[i]}`}>
              {g} {v.you!.hints[i] === "higher" ? "↑ higher" : v.you!.hints[i] === "lower" ? "↓ lower" : "✓ found it"}
            </span>
          ))}
        </p>
      )}
      <p className="muted">
        {found.length ? `Found it: ${found.map((id) => `${p.name(id)} (round ${v.found[id]})`).join(", ")}` : "Nobody has found it yet."}
      </p>
      {v.guesses && (
        <Scores p={p} value={(id) => -(v.found[id] ?? 99)} label={(id) => v.guesses![id]!.join(", ")} />
      )}
    </>
  );
}

export function TheCount(p: GameProps<TheCountView>) {
  const { view: v } = p;
  const [guess, setGuess] = useState("");
  const value = Number(guess);
  const valid = guess !== "" && Number.isInteger(value) && value >= 0;

  if (v.stage === "read") {
    return (
      <>
        <p className="mg-paragraph">{v.text}</p>
        {p.canPick && (
          <button className="primary" onClick={() => p.send(null)}>
            Done reading
          </button>
        )}
        <PickedNote p={p} />
      </>
    );
  }
  return (
    <>
      {p.canPick && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) p.send(value);
          }}
        >
          <label>
            How many times did "the" appear?{" "}
            <input autoFocus type="number" min={0} value={guess} onChange={(e) => setGuess(e.target.value)} />
          </label>
          <button className="primary" disabled={!valid}>
            Guess
          </button>
        </form>
      )}
      <PickedNote p={p} text={String(p.submitted)} />
      {v.answer !== null && v.guesses && (
        <>
          <p className="mg-big">The answer: {v.answer}</p>
          <Scores
            p={p}
            value={(id) => (v.guesses![id] === null ? -999 : -Math.abs(v.guesses![id]! - v.answer!))}
            label={(id) => (v.guesses![id] === null ? "no guess" : `guessed ${v.guesses![id]}`)}
          />
        </>
      )}
    </>
  );
}
