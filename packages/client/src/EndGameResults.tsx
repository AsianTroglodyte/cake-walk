import type { ClientAction, EndGameStats, RoomView } from "@pbg/protocol";
import { seatColor } from "./colors";

export function EndGameResults({
  view,
  stats,
  act,
  onLeave,
  playAgainLabel,
}: {
  view: RoomView;
  stats: EndGameStats;
  act: (action: ClientAction) => void;
  onLeave: () => void;
  playAgainLabel: string;
}) {
  const match = view.match!;
  const winnerId = match.phase.kind === "gameOver" ? match.phase.winner : null;
  const winner = view.seats.find((seat) => seat.seatId === winnerId);
  const playerLabel = (seat: typeof winner, fallback: string) => {
    if (!seat) return fallback;
    if (seat.kind === "bot" || !seat.name.trim()) return seat.character;
    return `${seat.character} (${seat.name})`;
  };
  const winnerLabel = playerLabel(winner, "Player");
  const ordered = stats.playerOrder.map((id) => ({
    id,
    seat: view.seats.find((seat) => seat.seatId === id),
    stats: stats.players[id]!,
    player: match.players.find((player) => player.seatId === id)!,
  }));
  const samePlace = (a: typeof ordered[number], b: typeof ordered[number]) =>
    (a.id === winnerId) === (b.id === winnerId) &&
    match.board.spaces[a.player.position]!.distanceToFinish ===
      match.board.spaces[b.player.position]!.distanceToFinish;
  let place = 1;
  const progress = stats.progress;
  const chartWidth = Math.max(760, 112 + Math.max(1, progress.length - 1) * 78);
  const chartHeight = 330;
  const x = (index: number) => progress.length <= 1
    ? chartWidth / 2
    : 56 + index * (chartWidth - 88) / (progress.length - 1);
  const y = (value: number) => 270 - Math.max(0, Math.min(100, value)) * 2.25;
  const isHost = view.seats.find((seat) => seat.seatId === view.youSeatId)?.isHost ?? false;

  return (
    <main className="end-game-screen">
      <header className="end-game-header">
        <p className="end-game-kicker">Beach Party · Match complete</p>
        <h1 className="end-game-winner" aria-label={`${winnerLabel} wins`}>
          <span aria-hidden="true">✦</span> {winnerLabel} wins! <span aria-hidden="true">✦</span>
        </h1>
        <p className="end-game-winner-name">takes the crown</p>
      </header>

      <section className="end-game-panel" aria-labelledby="end-stats-title">
        <h2 id="end-stats-title">Final standings &amp; match stats</h2>
        <div className="end-stats-scroll" role="region" aria-label="Final player statistics" tabIndex={0}>
          <table className="end-stats-table">
            <thead><tr>
            <th>Place</th><th>Player</th><th>Spaces from finish</th><th>Coins collected</th><th>Items collected</th>
              <th>Items used</th><th>Avg. minigame place</th><th>d12s used</th><th>d10s used</th>
              <th>d8s used</th><th>d4s used</th><th>Board 1st places</th><th>Kills</th><th>Deaths</th>
            </tr></thead>
            <tbody>{ordered.map((row, index) => {
              if (index > 0 && !samePlace(row, ordered[index - 1]!)) place = index + 1;
              return <tr key={row.id} className={row.id === winnerId ? "end-stats-winner-row" : ""}>
                <td>{place}</td>
                <th scope="row">
                  <span className="end-stats-player">
                    <i style={{ backgroundColor: seatColor(view, row.id) }} />
                    {playerLabel(row.seat, row.id)}
                  </span>
                </th>
                <td>{match.board.spaces[row.player.position]!.distanceToFinish}</td>
                <td>{row.stats.coinsCollected}</td><td>{row.stats.itemsCollected}</td><td>{row.stats.itemsUsed}</td>
                <td>{row.stats.averageMinigamePlacement?.toFixed(2) ?? "—"}</td>
                <td>{row.stats.d12sUsed}</td><td>{row.stats.d10sUsed}</td><td>{row.stats.d8sUsed}</td>
                <td>{row.stats.d4sUsed}</td><td>{row.stats.firstPlacesBeforeMinigame}</td>
                <td>{row.stats.kills}</td><td>{row.stats.deaths}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="end-game-panel" aria-labelledby="progress-title">
        <h2 id="progress-title">Board progress over time</h2>
        <p className="end-game-chart-caption">Progress toward the finish · 100% means the finish</p>
        <div className="end-chart-scroll" role="region" aria-label="Player progress line chart" tabIndex={0}>
          <svg className="end-progress-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            width={chartWidth} height={chartHeight} role="img" aria-labelledby="progress-title">
            {[0, 25, 50, 75, 100].map((value) => <g key={value}>
              <line x1="48" x2={chartWidth - 20} y1={y(value)} y2={y(value)} className="end-chart-grid" />
              <text x="40" y={y(value) + 4} textAnchor="end" className="end-chart-axis">{value}%</text>
            </g>)}
            {progress.map((point, index) => <text key={point.label + index} x={x(index)} y="300"
              textAnchor="middle" className="end-chart-axis">{point.label}</text>)}
            {ordered.map(({ id, seat }) => {
              const points = progress.map((point, index) => `${x(index)},${y(point.players[id] ?? 0)}`).join(" ");
              return <g key={id}>
                {progress.length > 1 && <polyline points={points} fill="none" stroke={seatColor(view, id)}
                  strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {progress.map((point, index) => <circle key={point.label + index}
                  cx={x(index)} cy={y(point.players[id] ?? 0)} r="4" fill={seatColor(view, id)}>
                  <title>{playerLabel(seat, id)}: {point.label}, {(point.players[id] ?? 0).toFixed(1)}%</title>
                </circle>)}
              </g>;
            })}
          </svg>
        </div>
        <div className="end-chart-legend" aria-label="Players">
          {ordered.map(({ id, seat }) => <span key={id}><i style={{ backgroundColor: seatColor(view, id) }} />
            {playerLabel(seat, id)}</span>)}
        </div>
      </section>

      <footer className="end-game-actions">
        {isHost
          ? <button className="primary" onClick={() => act({ type: "playAgain" })}>{playAgainLabel}</button>
          : <p className="muted">Waiting for the host to start another game…</p>}
        <button className="ghost" onClick={onLeave}>Leave room</button>
      </footer>
    </main>
  );
}
