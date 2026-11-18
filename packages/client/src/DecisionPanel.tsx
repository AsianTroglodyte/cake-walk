import { useEffect, useState } from "react";
import { boardDistance, candyGunSuccessChance, ITEMS, type ItemKind, type ItemUse, type SpaceId } from "@pbg/rules";
import type { ClientAction, RoomView } from "@pbg/protocol";
import { boardSpaceLabel } from "./spaceLabels";
import { AuctionPanel } from "./AuctionPanel";

interface Props {
  view: RoomView;
  act: (action: ClientAction) => void;
  secondsLeft?: number | null;
  clockOffset?: number;
}

export function DecisionPanel({ view, act, secondsLeft, clockOffset = 0 }: Props) {
  const match = view.match!;
  const you = match.you;
  const decision = you?.decision ?? null;
  const [die, setDie] = useState<string | null>(null);
  const [lane, setLane] = useState(0);
  const [itemId, setItemId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [space, setSpace] = useState<SpaceId | null>(null);
  const [buy, setBuy] = useState<ItemKind | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [spendAmount, setSpendAmount] = useState(0);
  const [bagItemCount, setBagItemCount] = useState(1);
  const [customSpaces, setCustomSpaces] = useState(0);

  const decisionKey = decision
    ? `${match.round}-${match.phase.kind}-${match.auction?.winnerId === view.youSeatId ? "auction-won" : ""}`
    : "none";
  useEffect(() => {
    setDie(null);
    setItemId(null);
    setTarget(null);
    setSpace(null);
    setBuy(null);
    setShopOpen(false);
    setSpendAmount(0);
    setBagItemCount(1);
    setCustomSpaces(0);
  }, [decisionKey]);

  const name = (id: string) => view.seats.find((s) => s.seatId === id)?.character ?? id;
  const spaceLabel = (id: SpaceId) => {
    const s = match.board.spaces[id]!;
    return `Space ${boardSpaceLabel(match.board, id)} · ${s.distanceToFinish} to go`;
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
        {match.auction && (
          <AuctionPanel view={view} auction={match.auction} clockOffset={clockOffset} act={act} />
        )}
      </section>
    );
  }

  const submitted = you?.submitted ?? null;

  // Full-screen encounters own their die pickers and roll sequences.
  if (decision.kind === "boss" || decision.kind === "showdown" || decision.kind === "battle") return null;

  if (decision.kind === "battleInitiation") {
    return (
      <section className="panel decision">
        <h2>Battle?</h2>
        <p className="muted small-text">You share this space with other players. Choose an opponent to challenge, or sit this battle out.</p>
        <div className="choices">
          <label className={`choice ${target === null ? "selected" : ""}`}>
            <input type="radio" name="battle-target" checked={target === null} onChange={() => setTarget(null)} />
            No battle
          </label>
          {decision.targets.map((id) => (
            <label key={id} className={`choice ${target === id ? "selected" : ""}`}>
              <input type="radio" name="battle-target" checked={target === id} onChange={() => setTarget(id)} />
              Challenge {name(id)}
            </label>
          ))}
        </div>
        <button className="primary" onClick={() => act({
          type: "submitBattleInitiation",
          choice: { target: decision.targets.includes(target ?? "") ? target : null },
        })}>
          {submitted ? "Update choice" : "Lock in choice"}
        </button>
        {submitted && <p className="muted">Locked in. Waiting for the others…</p>}
        {inventory}
      </section>
    );
  }

  if (decision.kind === "items") {
    const coins = match.players.find((p) => p.seatId === decision.playerId)?.coins ?? 0;
    const item = decision.items.find((i) => i.id === itemId) ?? null;
    const needs = item ? ITEMS[item.kind].target : "none";
    const itemTargets = item?.kind === "jellyBoxingGloves"
      ? decision.targets.filter((id) => match.players.find((player) => player.seatId === id)?.position !== match.board.finish)
      : decision.targets;
    const chosenTarget = (itemTargets.includes(target ?? "") ? target : itemTargets[0]) ?? null;
    const chosenSpace = space ?? decision.trapSpaces[0] ?? null;
    const slotsAfterUse = decision.maxHeld - decision.items.length + (item ? 1 : 0);
    const yourPublicPlayer = match.players.find((p) => p.seatId === view.youSeatId);
    const hasBid = match.auction?.me?.lock === "bid";
    const auctionReserve = match.auction?.status === "open" && match.auction.bidderId === view.youSeatId
      ? match.auction.currentBid
      : 0;
    const availableCoins = Math.max(0, coins - auctionReserve - (buy ? decision.prices[buy] ?? 0 : 0));
    const bagCapacity = decision.maxHeld - decision.items.length + (item ? 1 : 0);
    const maxBagItemCount = Math.max(1, Math.min(Math.floor(availableCoins / 15) + 1, bagCapacity));
    const bagItemCountForBudget = Math.min(bagItemCount, maxBagItemCount);
    const bagPrice = Math.max(0, bagItemCountForBudget - 1) * 15;
    const canSubmit =
      (needs !== "player" || chosenTarget !== null) &&
      (needs !== "space" || chosenSpace !== null) &&
      (needs !== "amount" || (item?.kind === "infiniteItemBag"
        ? bagCapacity > 0 && bagPrice <= availableCoins
        : Number.isInteger(spendAmount) && spendAmount >= 0 && spendAmount <= availableCoins)) &&
      (item?.kind !== "holySugarDust" || !!yourPublicPlayer?.dead) &&
      !(needs === "space" && decision.trapSpaces.length === 0);

    const buildUse = (): ItemUse | null => {
      let use: ItemUse | null = null;
      if (item) {
        use = { itemId: item.id };
        if (needs === "player") use.target = chosenTarget!;
        if (needs === "space") use.space = chosenSpace!;
        if (needs === "amount") use.amount = item.kind === "infiniteItemBag" ? bagPrice : spendAmount;
      }
      return use;
    };
    const submit = () => act({ type: "submitItems", choice: { use: buildUse(), buy: null } });
    const purchaseDisabled = !buy ||
      (decision.prices[buy] ?? 0) > coins ||
      slotsAfterUse <= 0 ||
      hasBid ||
      (decision.items.length >= decision.maxHeld && !canSubmit);

    return (
      <section className="panel decision">
        <h2>Items</h2>
        <p className="muted small-text">
          Use one item before the dice are rolled. You can use what you buy right away.
        </p>

        <button
          type="button"
          className="shop-button"
          aria-expanded={shopOpen}
          onClick={() => setShopOpen((open) => !open)}
        >
          {shopOpen ? "Close shop" : `Shop · ${coins} coins`}
        </button>
        {match.auction && (
          <AuctionPanel view={view} auction={match.auction} clockOffset={clockOffset} act={act} />
        )}
        {shopOpen && (
          <div className="shop-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShopOpen(false);
          }}>
          <section className="shop-screen" role="dialog" aria-modal="true" aria-label="Shop">
            <header className="shop-screen-header">
              <div>
                <p className="battle-kicker">Round {match.round} · Shop</p>
                <h2>Choose your item</h2>
                <p className="shop-coins">Coins <strong>{coins}</strong></p>
              </div>
              <div className="shop-header-actions">
                <span className="shop-timer" aria-label={`${secondsLeft ?? 0} seconds remaining`}>
                  {secondsLeft ?? 0}s
                </span>
                <button type="button" className="ghost" onClick={() => setShopOpen(false)} aria-label="Close shop">✕</button>
              </div>
            </header>
            {decision.shop.map((kind) => {
              const price = decision.prices[kind] ?? 0;
              const disabled = price > coins || slotsAfterUse <= 0 || hasBid;
              return (
                <label
                  key={kind}
                  className={`choice shop-choice ${buy === kind ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                  title={ITEMS[kind].description}
                >
                  <input type="radio" name="buy" disabled={disabled} checked={buy === kind} onChange={() => setBuy(kind)} />
                  <span className="shop-item-copy">
                    <span className="shop-item-title">
                      {ITEMS[kind].name} <span className="muted">({price}c)</span>
                      {ITEMS[kind].passive && <span className="tag">passive</span>}
                    </span>
                    <span className="muted small-text">{ITEMS[kind].description}</span>
                  </span>
                </label>
              );
            })}
            <button
              type="button"
              className="primary shop-confirm-button"
              disabled={purchaseDisabled}
              onClick={() => {
                if (!buy || purchaseDisabled) return;
                act({ type: "buyShopItem", kind: buy, use: canSubmit ? buildUse() : null });
                setBuy(null);
                setShopOpen(false);
              }}
            >
              {buy ? `Confirm purchase · ${ITEMS[buy].name}` : "Select an item to purchase"}
            </button>
            <label className={`choice ${buy === null ? "selected" : ""}`}>
              <input
                type="radio"
                name="buy"
                checked={buy === null}
                onChange={() => setBuy(null)}
              />
              Don’t buy
            </label>
            <p className="muted small-text">
              Same {decision.shop.length} items for everyone. Hold up to {decision.maxHeld}. Purchases stay private.
            </p>
            {hasBid && <p className="muted small-text">You bid in the auction, so you can’t shop this round.</p>}
          </section>
          </div>
        )}

        <h3>Use an item (one per round)</h3>
        {yourPublicPlayer?.dead && decision.items.some((owned) => owned.kind === "jellyBoxingGloves") && (
          <p className="muted small-text">Jelly Boxing Gloves can’t be used while you’re knocked out.</p>
        )}
        {decision.items.filter((i) => !ITEMS[i.kind].passive).length === 0 ? (
          <p className="muted small-text">
            Nothing to use
            {decision.items.some((i) => ITEMS[i.kind].passive)
              ? ` (Passive items work automatically: ${decision.items.filter((i) => ITEMS[i.kind].passive).map((i) => ITEMS[i.kind].name).join(", ")})`
              : ""}.
          </p>
        ) : (
          <div className="item-list">
            <label className={`choice ${item === null ? "selected" : ""}`}>
              <input type="radio" name="use" checked={item === null} onChange={() => setItemId(null)} />
              None
            </label>
            {decision.items
              .filter((i) =>
                !ITEMS[i.kind].passive &&
                (i.kind !== "holySugarDust" || yourPublicPlayer?.dead) &&
                (i.kind !== "jellyBoxingGloves" || !yourPublicPlayer?.dead)
              )
              .map((i) => (
                <label key={i.id} className={`choice ${itemId === i.id ? "selected" : ""}`} title={ITEMS[i.kind].description}>
                  <input type="radio" name="use" checked={itemId === i.id} onChange={() => setItemId(i.id)} />
                  {ITEMS[i.kind].name}
                  <span className="muted small-text"> {ITEMS[i.kind].description}</span>
                </label>
              ))}
          </div>
        )}
        {decision.items.some((i) => ITEMS[i.kind].passive) && (
          <p className="muted small-text">
            Holding: {decision.items.filter((i) => ITEMS[i.kind].passive).map((i) => ITEMS[i.kind].name).join(", ")} (works on its own).
          </p>
        )}
        {needs === "player" && (
          itemTargets.length > 0 ? (
            <label className="field">
              On
              <select value={chosenTarget ?? ""} onChange={(e) => setTarget(e.target.value)}>
                {itemTargets.map((id) => (
                  <option key={id} value={id}>
                    {name(id)}
                    {item?.kind === "candyGun" && yourPublicPlayer
                      ? ` — ${Math.round(candyGunSuccessChance(boardDistance(
                          match.board,
                          yourPublicPlayer.position,
                          match.players.find((player) => player.seatId === id)!.position,
                        )) * 100)}% chance`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : <p className="muted small-text">There are no eligible opponents outside the final boss space.</p>
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
        {needs === "amount" && item?.kind === "infiniteItemBag" && (
          <label className="field">
            Items to obtain
            <input
              type="number"
              min={1}
              max={maxBagItemCount}
              step={1}
              value={bagItemCountForBudget}
              onChange={(event) => setBagItemCount(Math.max(1, Math.min(maxBagItemCount, Number(event.target.value))))}
            />
            <span className="muted small-text">
              {bagItemCountForBudget} random {bagItemCountForBudget === 1 ? "item" : "items"} · costs {bagPrice} coins
              {bagItemCountForBudget === 1 ? " (first item is free)" : " (15 coins per extra item)"}.
            </span>
          </label>
        )}
        {needs === "amount" && item?.kind !== "infiniteItemBag" && (
          <label className="field">
            Coins to spend (you have {coins})
            <input
              type="number"
              min={0}
              max={coins}
              step={1}
              value={spendAmount}
              onChange={(event) => setSpendAmount(Math.max(0, Math.min(coins, Number(event.target.value))))}
            />
          </label>
        )}

        <button className="primary" disabled={!canSubmit} onClick={submit}>
          {submitted ? "Update choice" : "Lock in items"}
        </button>
        {submitted && <p className="muted">Locked in. Waiting for the others…</p>}
        {inventory}
      </section>
    );
  }

  if (decision.kind !== "move") return null;

  const moveEffects = [
    ...(decision.mods.forcedSides ? [`Magic Sugar Dice forces you to roll a d${decision.mods.forcedSides}`] :
      decision.mods.sandDie ? [`Foul Sugar Cube from ${decision.mods.sandDieSource ? name(decision.mods.sandDieSource) : "another player"} replaces your chosen die with a d3`] : []),
    ...decision.mods.weightSources.map((source) => `Poisoned Candy from ${name(source)}: −3`),
    ...(decision.mods.booster ? ["Your Refreshing Candy: +3"] : []),
    ...decision.mods.rollBonuses.map((bonus) => `${ITEMS[bonus.kind].name}${bonus.source ? ` from ${name(bonus.source)}` : ""}: ${bonus.amount > 0 ? "+" : ""}${bonus.amount}`),
    ...((decision.mods.extraDice || decision.mods.extraDie) ? [`Your Sugar Cube: roll ${Math.max(decision.mods.extraDice, Number(decision.mods.extraDie)) > 1 ? `${Math.max(decision.mods.extraDice, Number(decision.mods.extraDie))} extra d6s` : "an extra d6"}`] : []),
    ...(decision.mods.hyperCandy ? ["Hyper Candy doubles your modified roll; over 10 knocks you out."] : []),
    ...(decision.mods.moveBackwards ? ["Moonwalk Ring: move backward instead of forward."] : []),
    ...(decision.mods.customRoll ? ["Custom Dice Roll: choose your exact movement distance below."] : []),
  ];
  const yourPlayer = match.players.find((player) => player.seatId === view.youSeatId);

  return (
    <section className="panel decision">
      <h2>{yourPlayer?.dead ? "Try to revive" : "Your move"}</h2>
      <p className="muted small-text">
        {yourPlayer?.dead
          ? <strong>Roll at least <u>{you?.reviveRequirement ?? 6}+</u> to revive. On success, you move the roll minus {you?.reviveRequirement ?? 6} spaces.</strong>
          : "Item uses are already locked in. Pick a die and a path."}
      </p>
      <section className="move-roll-effects" aria-label="Items affecting your movement roll">
        <h3>Items affecting your roll</h3>
        {moveEffects.length > 0 ? (
          <ul>{moveEffects.map((effect, index) => <li key={`${index}-${effect}`}>{effect}</li>)}</ul>
        ) : (
          <p className="muted small-text">No items are affecting your roll.</p>
        )}
      </section>

      <h3>Die</h3>
      <DiePicker options={decision.dice} die={die} setDie={setDie} />
      {decision.mods.customRoll && (
        <label className="field">
          Spaces to move
          <select value={customSpaces} onChange={(event) => setCustomSpaces(Number(event.target.value))}>
            {Array.from({ length: (decision.dice.find((option) => option.id === die)?.sides ?? decision.dice[0]?.sides ?? 6) + 1 }, (_, value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      )}
      {decision.dice.length === 1 && decision.dice[0]!.sides === 4 && (you?.dice.length ?? 0) > 0 && <ForcedD4Note />}

      {decision.lanes > 1 && (
        <>
          <h3>Path</h3>
          <div className="choices">
            {Array.from({ length: decision.lanes }, (_, i) => (
              <label key={i} className={`choice ${lane === i ? "selected" : ""}`}>
                <input type="radio" name="lane" checked={lane === i} onChange={() => setLane(i)} />
                {String.fromCharCode(65 + i)}
              </label>
            ))}
          </div>
          <p className="muted small-text">Your path only matters if you pass a fork this move.</p>
        </>
      )}

      <button className="primary" onClick={() => act({ type: "submitMove", choice: { die, lane, ...(decision.mods.customRoll ? { customSpaces } : {}) } })}>
        {submitted ? "Update choice" : "Lock in move"}
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
