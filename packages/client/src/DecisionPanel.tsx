import { useEffect, useState } from "react";
import { BOUGHT_ITEM, ITEM_KINDS, ITEMS, type ItemKind, type ItemUse, type SpaceId } from "@pbg/rules";
import type { ClientAction, RoomView } from "@pbg/protocol";

interface Props {
  view: RoomView;
  act: (action: ClientAction) => void;
}

export function DecisionPanel({ view, act }: Props) {
  const match = view.match!;
  const you = match.you;
  const decision = you?.decision ?? null;
  const [die, setDie] = useState<string | null>(null);
  const [lane, setLane] = useState(0);
  const [itemId, setItemId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [space, setSpace] = useState<SpaceId | null>(null);
  const [buy, setBuy] = useState<ItemKind | null>(null);

  const decisionKey = decision ? `${match.round}-${match.phase.kind}` : "none";
  useEffect(() => {
    setDie(null);
    setItemId(null);
    setTarget(null);
    setSpace(null);
    setBuy(null);
  }, [decisionKey]);

  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const spaceLabel = (id: SpaceId) => {
    const s = match.board.spaces[id]!;
    const path = s.lane !== null && match.board.paths > 1 ? `, path ${s.lane + 1}` : "";
    return `${s.distanceToFinish} to go${path}`;
  };

  const inventory = you ? (
    <div className="muted">
      <p>
        Saved dice: {you.dice.length ? you.dice.map((d) => `d${d.sides}`).join(", ") : "none"}
        <br />
        Items: {you.items.length ? you.items.map((i) => ITEMS[i.kind].name).join(", ") : "none"}
        {you.traps.length > 0 && (
          <>
            <br />
            Your hidden traps: {you.traps.map(spaceLabel).join("; ")}
          </>
        )}
      </p>
      <p className="small-text">Only you can see these.</p>
    </div>
  ) : null;

  if (!decision) {
    const waiting = match.step.kind === "deciding" ? "Waiting for other players…" : null;
    return (
      <section className="panel">
        <h2>You</h2>
        {waiting && <p>{waiting}</p>}
        {inventory}
      </section>
    );
  }

  const submitted = you?.submitted ?? null;

  if (decision.kind !== "move") {
    const title =
      decision.kind === "boss"
        ? `Boss fight! Roll higher than ${match.bossFixed} + d4 (${match.bossFixed + 1}–${match.bossFixed + 4})`
        : "Final showdown! Highest roll wins";
    return (
      <section className="panel decision">
        <h2>{title}</h2>
        <DiePicker options={decision.dice} die={die} setDie={setDie} />
        {decision.dice.length === 1 && decision.dice[0]!.sides === 4 && (you?.dice.length ?? 0) > 0 && <ForcedD4Note />}
        <button className="primary" onClick={() => act({ type: "submitBattle", choice: { die } })}>
          {submitted ? "Update choice" : "Roll!"}
        </button>
        {submitted && <p className="muted">Locked in. Waiting for the others…</p>}
        {inventory}
      </section>
    );
  }

  const coins = match.players.find((p) => p.seatId === decision.playerId)?.coins ?? 0;
  const usingBought = itemId === BOUGHT_ITEM && buy !== null;
  const item = usingBought ? { id: BOUGHT_ITEM, kind: buy! } : (decision.items.find((i) => i.id === itemId) ?? null);
  const needs = item ? ITEMS[item.kind].target : "none";
  const chosenTarget = target ?? decision.targets[0] ?? null;
  const chosenSpace = space ?? decision.trapSpaces[0] ?? null;
  const slotsAfterUse = decision.maxHeld - decision.items.length + (item ? 1 : 0);
  const canSubmit = (needs !== "player" || chosenTarget !== null) && (needs !== "space" || chosenSpace !== null);

  const submit = () => {
    let use: ItemUse | null = null;
    if (item) {
      use = { itemId: item.id };
      if (needs === "player") use.target = chosenTarget!;
      if (needs === "space") use.space = chosenSpace!;
    }
    act({ type: "submitMove", choice: { die, lane, use, buy } });
  };

  return (
    <section className="panel decision">
      <h2>Your move</h2>

      <h3>Die</h3>
      <DiePicker options={decision.dice} die={die} setDie={setDie} />
      {decision.dice.length === 1 && decision.dice[0]!.sides === 4 && (you?.dice.length ?? 0) > 0 && <ForcedD4Note />}

      {decision.lanes > 1 && (
        <>
          <h3>Path</h3>
          <div className="choices">
            {Array.from({ length: decision.lanes }, (_, i) => (
              <label key={i} className={`choice ${lane === i ? "selected" : ""}`}>
                <input type="radio" name="lane" checked={lane === i} onChange={() => setLane(i)} />
                Path {i + 1}
              </label>
            ))}
          </div>
          <p className="muted small-text">Your path only matters if you pass a fork this move.</p>
        </>
      )}

      {!decision.itemsAllowed && (
        <p className="muted small-text">Round 1 is just movement and a minigame. Items and the shop open next round.</p>
      )}

      {decision.itemsAllowed && (
        <>
          <h3>Shop ({coins} coins)</h3>
          <div className="item-list">
            <label className={`choice ${buy === null ? "selected" : ""}`}>
              <input
                type="radio"
                name="buy"
                checked={buy === null}
                onChange={() => {
                  setBuy(null);
                  if (itemId === BOUGHT_ITEM) setItemId(null);
                }}
              />
              Nothing
            </label>
            {ITEM_KINDS.map((kind) => {
              const price = decision.prices[kind];
              const disabled = price > coins || slotsAfterUse <= 0;
              return (
                <label
                  key={kind}
                  className={`choice ${buy === kind ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                  title={ITEMS[kind].description}
                >
                  <input type="radio" name="buy" disabled={disabled} checked={buy === kind} onChange={() => setBuy(kind)} />
                  {ITEMS[kind].name} <span className="muted">({price}c)</span>
                </label>
              );
            })}
          </div>
          <p className="muted small-text">
            You can use what you buy right away, or keep it. You can hold {decision.maxHeld} items.
          </p>

          <h3>Use an item (one per round)</h3>
          {decision.items.length === 0 && buy === null ? (
            <p className="muted small-text">You don't have any items. Buy one above to use it this round.</p>
          ) : (
            <div className="item-list">
              <label className={`choice ${item === null ? "selected" : ""}`}>
                <input type="radio" name="use" checked={item === null} onChange={() => setItemId(null)} />
                None
              </label>
              {decision.items.map((i) => (
                <label key={i.id} className={`choice ${itemId === i.id ? "selected" : ""}`} title={ITEMS[i.kind].description}>
                  <input type="radio" name="use" checked={itemId === i.id} onChange={() => setItemId(i.id)} />
                  {ITEMS[i.kind].name}
                  <span className="muted small-text"> {ITEMS[i.kind].description}</span>
                </label>
              ))}
              {buy !== null && (
                <label className={`choice ${usingBought ? "selected" : ""}`} title={ITEMS[buy].description}>
                  <input type="radio" name="use" checked={usingBought} onChange={() => setItemId(BOUGHT_ITEM)} />
                  {ITEMS[buy].name} <span className="tag">buying now</span>
                  <span className="muted small-text"> {ITEMS[buy].description}</span>
                </label>
              )}
            </div>
          )}
          {needs === "player" && (
            <label className="field">
              On
              <select value={chosenTarget ?? ""} onChange={(e) => setTarget(e.target.value)}>
                {decision.targets.map((id) => (
                  <option key={id} value={id}>
                    {name(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {needs === "space" &&
            (decision.trapSpaces.length === 0 ? (
              <p className="muted small-text">There's nowhere ahead of you to place a trap.</p>
            ) : (
              <label className="field">
                Space
                <select value={chosenSpace ?? ""} onChange={(e) => setSpace(Number(e.target.value))}>
                  {decision.trapSpaces.map((id) => (
                    <option key={id} value={id}>
                      {spaceLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </>
      )}

      <button className="primary" disabled={!canSubmit} onClick={submit}>
        {submitted ? "Update choice" : "Lock in"}
      </button>
      {submitted && <p className="muted">Locked in. Waiting for the others…</p>}
      {inventory}
    </section>
  );
}

function ForcedD4Note() {
  return <p className="muted small-text">You came last in the minigame, so this round you must roll the d4. Your saved dice wait.</p>;
}

function DiePicker({
  options,
  die,
  setDie,
}: {
  options: { id: string | null; sides: number }[];
  die: string | null;
  setDie: (id: string | null) => void;
}) {
  return (
    <div className="choices">
      {options.map((option) => (
        <label key={option.id ?? "default"} className={`choice ${die === option.id ? "selected" : ""}`}>
          <input type="radio" name="die" checked={die === option.id} onChange={() => setDie(option.id)} />
          d{option.sides}
          <span className="muted">{option.id === null ? " (default, free)" : " (saved, used up)"}</span>
        </label>
      ))}
    </div>
  );
}
