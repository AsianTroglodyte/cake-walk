import type { MatchView, PlayerPublicView, RoomView, SeatView } from "@pbg/protocol";
import { SeatTags } from "./SeatTags";
import { seatColor } from "./colors";
import { boardSpaceLabel } from "./spaceLabels";

const SPACE_TYPES: Record<string, string> = {
  start: "Start",
  checkpoint: "Checkpoint",
  finish: "Finish",
  white: "White",
  blue: "Blue",
  red: "Red",
  green: "Green",
  orange: "Orange arrow",
  purple: "Purple arrow",
  pink: "Pink",
  maroon: "Maroon",
  black: "Black",
  monochromeChaos: "Monochrome Chaos",
  rainbowChaos: "Rainbow Chaos",
};

/** Board progress only: coins never break a position tie. The declared match winner is first. */
export function leaderboardRows(match: MatchView) {
  const winner = match.phase.kind === "gameOver" ? match.phase.winner : null;
  const distance = (player: PlayerPublicView) => match.board.spaces[player.position]!.distanceToFinish;
  const sorted = [...match.players].sort((a, b) =>
    Number(b.seatId === winner) - Number(a.seatId === winner) || distance(a) - distance(b),
  );
  const samePlace = (a: PlayerPublicView, b: PlayerPublicView) =>
    (a.seatId === winner) === (b.seatId === winner) && distance(a) === distance(b);
  let place = 1;
  return sorted.map((player, index) => {
    if (index === 0 || !samePlace(player, sorted[index - 1]!)) place = index + 1;
    const tied = (index > 0 && samePlace(player, sorted[index - 1]!)) ||
      (index + 1 < sorted.length && samePlace(player, sorted[index + 1]!));
    return { player, place, tied, distance: distance(player), winner: player.seatId === winner };
  });
}

export function leaderboardStatus(match: MatchView, player: PlayerPublicView, seat: SeatView): string {
  if (match.phase.kind === "gameOver") return match.phase.winner === player.seatId ? "Winner" : "Finished";
  if (player.dead) return "Knocked out";
  if (seat.kind === "human" && !seat.connected && !seat.botControlled) return "Away";
  const step = match.step;
  switch (step.kind) {
    case "bossBattle":
      if (step.stage === "choosing") {
        return step.contenders.includes(player.seatId)
          ? step.selected[player.seatId] !== undefined ? "Die selected" : "Choosing die"
          : "Watching boss";
      }
      return step.playerId === player.seatId ? "Fighting boss" : "Watching boss";
    case "showdown":
      if (step.stage === "choosing") return step.contenders.includes(player.seatId)
        ? step.selected[player.seatId] !== undefined ? "Die selected" : "Choosing die" : "Watching";
      return Object.hasOwn(step.eliminated, player.seatId) ? "Out"
        : step.contenders.includes(player.seatId) ? step.battle ? "In battle" : "In showdown" : "Watching";
    case "chaos": return "Absolute Chaos";
    case "chaosSpawn": return "Chaos space spawned";
    case "auctionAnnouncement": return "Auction opening";
    case "chaosBuffer": return "Chaos settles";
    case "trap": return "Trap sprung!";
    case "death": return "Knockout";
    case "deciding":
      if (!player.deciding) return "Waiting";
      if (player.ready) return "Locked in";
      return match.phase.kind === "items" ? "Choosing items"
        : match.phase.kind === "move" ? "Choosing move"
          : match.phase.kind === "battleInitiation" ? "Choosing battle"
            : match.phase.kind === "battle" ? "Choosing battle die" : "Choosing die";
    case "itemReveal": return "Item reveal";
    case "revealing": return "Board results";
    case "rollSummary": return "Roll results";
    case "results":
      return player.ready || seat.kind === "bot" || seat.botControlled ? "Ready" : "Reviewing results";
    case "minigame":
      if (step.mode === "client") return player.ready ? "Done" : "In minigame";
      if (step.stage === "countdown") return "Get ready";
      if (step.stage === "reveal") return "Round results";
      if (step.stage === "live") return "In minigame";
      return player.deciding ? player.ready ? "Picked" : "Choosing" : "Watching";
    case "finished": return "Finished";
  }
}

export function Leaderboard({ view }: { view: RoomView }) {
  const match = view.match!;
  const length = match.board.spaces[match.board.start]!.distanceToFinish;
  return (
    <section className="panel leaderboard" aria-labelledby="leaderboard-heading">
      <div className="leaderboard-header">
        <h2 id="leaderboard-heading">Leaderboard</h2>
        <span className="muted small-text">Round {match.round} · {match.players.length} players</span>
      </div>
      <p className="muted small-text" id="leaderboard-help">
        Ranked by distance to the finish. Equal progress shares a place; coins do not break ties.
        {" "}Default die only; saved dice and items stay private.
      </p>
      <div className="leaderboard-scroll" role="region" aria-label="Leaderboard table" tabIndex={0}>
        <table className="leaderboard-table" aria-describedby="leaderboard-help">
          <thead>
            <tr>
              <th scope="col">Place</th>
              <th scope="col">Player</th>
              <th scope="col">Current space</th>
              <th scope="col">To finish</th>
              <th scope="col" className="leaderboard-number">Coins</th>
              <th scope="col">Default die</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardRows(match).map(({ player, place, tied, distance, winner }) => {
              const seat = view.seats.find((s) => s.seatId === player.seatId)!;
              const you = player.seatId === view.youSeatId;
              const progress = Math.max(0, Math.min(100, length > 0 ? (length - distance) / length * 100 : 100));
              const space = match.board.spaces[player.position]!;
              return (
                  <tr key={player.seatId} className={`${you ? "mine" : ""} ${place === 1 ? "leading" : ""} ${winner ? "won" : ""} ${player.dead ? "dead" : ""}`}>
                  <td className="leaderboard-place">
                    <span aria-label={`${tied ? "Tied for " : ""}place ${place}`}>{tied ? "=" : ""}{place}</span>
                  </td>
                  <th scope="row" className="leaderboard-player">
                    <div className="leaderboard-identity">
                      <span className="dot" style={{ background: seatColor(view, player.seatId) }} />
                      <strong>{seat.character}</strong>
                      <SeatTags seat={seat} you={you} />
                    </div>
                    {seat.kind === "human" && <span className="leaderboard-nickname muted">{seat.name}</span>}
                  </th>
                  <td className="leaderboard-current-space">
                    <strong>{boardSpaceLabel(match.board, player.position)}</strong>
                    <span>{SPACE_TYPES[space.type] ?? space.type}</span>
                  </td>
                  <td className="leaderboard-progress">
                    <span>{distance === 0 ? winner ? "Finished" : "At the boss" : `${distance} spaces`}</span>
                    <span className="leaderboard-track" aria-hidden="true">
                      <span style={{ width: `${progress}%`, background: seatColor(view, player.seatId) }} />
                    </span>
                  </td>
                  <td className="leaderboard-number">{player.coins}</td>
                  <td>
                    <span className={`leaderboard-die ${player.defaultDie === 4 ? "penalty" : ""}`}
                      title={player.defaultDie === 4 ? "Last-place penalty: default d4 this round" : "Default d6"}>
                      d{player.defaultDie}
                    </span>
                  </td>
                  <td><span className={`leaderboard-status ${winner ? "winner" : player.ready ? "ready" : ""}`}>
                    {leaderboardStatus(match, player, seat)}
                  </span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
