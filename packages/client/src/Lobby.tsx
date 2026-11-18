import { useState } from "react";
import { CHARACTERS, MAX_PLAYERS, MIN_PLAYERS, pathsForPlayerCount, type BoardSize } from "@pbg/rules";
import type { ClientAction, RoomView } from "@pbg/protocol";
import { SeatTags } from "./SeatTags";

interface Props {
  view: RoomView;
  act: (action: ClientAction) => void;
  onLeave: () => void;
}

export function Lobby({ view, act, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const [botsToAdd, setBotsToAdd] = useState(1);
  const [boardSize, setBoardSize] = useState<BoardSize>("short");
  const you = view.seats.find((s) => s.seatId === view.youSeatId);
  const isHost = you?.isHost ?? false;
  const count = view.seats.length;
  const availableSeats = MAX_PLAYERS - count;
  const link = `${location.origin}${location.pathname}?code=${view.code}`;

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <main className="lobby">
      <header className="bar">
        <h1>
          Room <span className="code">{view.code}</span>
        </h1>
        <button onClick={() => void copy()}>{copied ? "Copied!" : "Copy invite link"}</button>
        <button className="ghost" onClick={onLeave}>
          Leave
        </button>
      </header>

      <section className="panel">
        <h2>
          Players {count}/{MAX_PLAYERS}
          <span className="muted"> · {pathsForPlayerCount(Math.max(count, MIN_PLAYERS))} path(s)</span>
        </h2>
        <ul className="seats">
          {view.seats.map((seat) => (
            <li key={seat.seatId}>
              <strong>{seat.character}</strong>
              {seat.kind === "human" && <span> ({seat.name})</span>}
              <SeatTags seat={seat} you={seat.seatId === view.youSeatId} />
              {isHost && seat.kind === "bot" && (
                <button className="small ghost" onClick={() => act({ type: "removeBot", seatId: seat.seatId })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {isHost ? (
          <div className="lobby-actions">
            <div className="row">
              <label htmlFor="bots-to-add">Bots to add</label>
              <select
                id="bots-to-add"
                value={Math.min(botsToAdd, Math.max(1, availableSeats))}
                disabled={availableSeats === 0}
                onChange={(event) => setBotsToAdd(Number(event.target.value))}
              >
                {Array.from({ length: Math.max(1, availableSeats) }, (_, index) => index + 1).map((amount) => (
                  <option key={amount} value={amount}>{amount}</option>
                ))}
              </select>
              <button
                disabled={availableSeats === 0}
                onClick={() => {
                  const amount = Math.min(botsToAdd, availableSeats);
                  for (let i = 0; i < amount; i++) act({ type: "addBot" });
                }}
              >
                Add selected bots
              </button>
              <button
                className="ghost"
                disabled={availableSeats === 0}
                onClick={() => {
                  for (let i = 0; i < availableSeats; i++) act({ type: "addBot" });
                }}
              >
                Fill with bots
              </button>
            </div>
            <div className="row board-size-setting">
              <label htmlFor="board-size">Board size</label>
              <select
                id="board-size"
                value={boardSize}
                onChange={(event) => setBoardSize(event.target.value as BoardSize)}
              >
                <option value="short">Short · 45 spaces · checkpoints 15, 30</option>
                <option value="medium">Medium · 60 spaces · checkpoints 15, 30, 45</option>
                <option value="large">Large · 75 spaces · checkpoints 15, 30, 45, 60</option>
              </select>
            </div>
            <button
              className="primary"
              disabled={count < MIN_PLAYERS}
              onClick={() => act({ type: "start", boardSize })}
            >
              {count < MIN_PLAYERS ? `Need ${MIN_PLAYERS - count} more` : "Start match"}
            </button>
          </div>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
      </section>

      <section className="panel">
        <h2>Pick your character</h2>
        <div className="characters">
          {CHARACTERS.map((name) => {
            const mine = you?.character === name;
            const taken = !mine && view.takenCharacters.includes(name);
            return (
              <button
                key={name}
                className={`character ${mine ? "mine" : ""}`}
                disabled={taken}
                onClick={() => act({ type: "pickCharacter", character: name })}
              >
                {name}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
