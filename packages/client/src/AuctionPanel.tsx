import { useEffect, useState } from "react";
import { ITEMS } from "@pbg/rules";
import type { AuctionView, ClientAction, RoomView } from "@pbg/protocol";

function useAuctionSeconds(deadline: number, clockOffset: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((deadline - (now + clockOffset)) / 1000));
}

export function AuctionPanel({
  view,
  auction,
  clockOffset,
  act,
}: {
  view: RoomView;
  auction: AuctionView;
  clockOffset: number;
  act: (action: ClientAction) => void;
}) {
  const match = view.match!;
  const [bid, setBid] = useState("");
  const [open, setOpen] = useState(false);
  const seconds = useAuctionSeconds(auction.deadline, clockOffset);
  const me = auction.me;
  const myPlayer = match.players.find((player) => player.seatId === view.youSeatId);
  const myCoins = myPlayer?.coins ?? 0;
  const name = (id: string) => {
    const seat = view.seats.find((candidate) => candidate.seatId === id);
    if (!seat) return id;
    return seat.kind === "bot" ? seat.character : `${seat.character} (${seat.name})`;
  };
  const highBidder = auction.bidderId ? name(auction.bidderId) : null;
  const winning = auction.bidderId === view.youSeatId;
  const bidAmount = Number(bid);
  const canBid = auction.status === "open" &&
    !!me?.participating &&
    me.lock !== "shop" &&
    Number.isInteger(bidAmount) &&
    bidAmount > auction.currentBid &&
    bidAmount <= myCoins;

  return (
    <>
      <button
        type="button"
        className="auction-open-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>{auction.status === "open" ? "Open auction" : "Auction results"}</span>
        <strong>
          {auction.status === "open"
            ? auction.bidderId
              ? `${auction.currentBid} coins`
              : "Item for sale"
            : auction.winnerId
              ? "Sold!"
              : "No sale"}
        </strong>
      </button>
      {open && (
      <div className="shop-overlay auction-overlay" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
      <section className="panel auction-panel" role="dialog" aria-modal="true" aria-label="Auction" aria-live="polite">
      <header className="auction-header">
        <div>
          <p className="auction-kicker">Round {match.round}</p>
          <h2>{auction.status === "open" ? "Auction open!" : "Auction results"}</h2>
        </div>
        <div className="auction-header-actions">
          {auction.status === "open" && <strong className="auction-timer">{seconds}s</strong>}
          <button type="button" className="ghost" onClick={() => setOpen(false)} aria-label="Close auction">✕</button>
        </div>
      </header>
      <div className="auction-item">
        <strong>{ITEMS[auction.item].name}</strong>
        <p>{ITEMS[auction.item].description}</p>
      </div>

      {auction.status === "closed" ? (
        auction.winnerId && auction.winningBid !== null ? (
          <p className="auction-sold">Sold to {name(auction.winnerId)} for {auction.winningBid} coins!</p>
        ) : (
          <p className="muted">No bids — the item goes unsold.</p>
        )
      ) : (
        <>
          <p className="auction-current-bid">
            {highBidder
              ? <>Current bid: <strong>{auction.currentBid} coins</strong> by {highBidder}</>
              : "Starting bid: 0 coins"}
          </p>
          {me && (
            <div className="auction-controls">
              {me.lock === "shop" ? (
                <p className="muted">You bought from the shop. You can watch, but can’t bid.</p>
              ) : !me.participating ? (
                <button
                  className="secondary"
                  disabled={myCoins <= auction.currentBid}
                  onClick={() => act({ type: "joinAuction" })}
                >
                  Join auction
                </button>
              ) : (
                <>
                  {!winning && (
                    <button className="ghost" onClick={() => act({ type: "leaveAuction" })}>
                      Leave auction
                    </button>
                  )}
                  {winning && <strong className="auction-leading">You’re currently winning.</strong>}
                  <label className="auction-bid-entry">
                    Your bid (you have {myCoins} coins)
                    <input
                      type="number"
                      min={auction.currentBid + 1}
                      max={myCoins}
                      step={1}
                      value={bid}
                      onChange={(event) => setBid(event.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={!canBid}
                    onClick={() => {
                      act({ type: "auctionBid", amount: bidAmount });
                      setBid("");
                    }}
                  >
                    Bid
                  </button>
                </>
              )}
              {me.lock === "bid" && (
                <p className="auction-lock-note" role="status">
                  You bid this round and can’t buy from the shop.
                </p>
              )}
            </div>
          )}
          {!me && <p className="muted">You’re watching this auction.</p>}
        </>
      )}

      <h3>Auction floor</h3>
      {auction.participants.length === 0 ? (
        <p className="muted">No players have joined yet.</p>
      ) : (
      <ul className="auction-players">
        {match.players.filter((player) => auction.participants.includes(player.seatId)).map((player) => {
          const isLeader = player.seatId === auction.bidderId;
          const status = isLeader
            ? "High bidder"
            : "Joined";
          return (
            <li key={player.seatId} className={isLeader ? "auction-player-leading" : ""}>
              <span>{name(player.seatId)}</span>
              <strong>{player.coins} coins</strong>
              <span className="muted">{status}</span>
            </li>
          );
        })}
      </ul>
      )}
      </section>
      </div>
      )}
    </>
  );
}
