import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PORT, MAX_NAME_LENGTH, MINIGAME_TEST_ROOM_NAME, SERVER_MESSAGES, CLIENT_ACTION, type MinigameTestOptions, type RoomView } from "@pbg/protocol";
import { MAX_PLAYERS, MINIGAMES, MINIGAME_KINDS, type MinigameKind } from "@pbg/rules";
import type { ReceivedView } from "./App";
import { Game } from "./Game";
import { savedName } from "./connection";

export function MinigameTest() {
  const [name, setName] = useState(savedName);
  const [game, setGame] = useState<MinigameKind>("reaction");
  const [bots, setBots] = useState(3);
  const [received, setReceived] = useState<ReceivedView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const title = document.title;
    document.title = "Minigame playtest · Beach Party";
    return () => {
      document.title = title;
      generation.current++;
      void roomRef.current?.leave();
      roomRef.current = null;
    };
  }, []);

  const stop = () => {
    generation.current++;
    const room = roomRef.current;
    roomRef.current = null;
    setReceived(null);
    setBusy(false);
    void room?.leave();
  };

  const launch = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !Number.isInteger(bots) || bots < 0 || bots > MAX_PLAYERS - 1) return;
    const run = ++generation.current;
    const previous = roomRef.current;
    roomRef.current = null;
    setBusy(true);
    setError(null);
    setReceived(null);
    try {
      await previous?.leave();
      const endpoint = import.meta.env.DEV ? `http://${location.hostname}:${DEFAULT_PORT}` : location.origin;
      const options: MinigameTestOptions = { name: trimmedName, game, bots };
      const room = await new Client(endpoint).create(MINIGAME_TEST_ROOM_NAME, options);
      if (generation.current !== run) {
        void room.leave();
        return;
      }
      localStorage.setItem("beachParty.name", trimmedName);
      roomRef.current = room;
      room.onMessage(SERVER_MESSAGES.view, (view: RoomView) => {
        if (generation.current === run) setReceived({ view, clockOffset: view.serverNow - Date.now() });
      });
      room.onMessage(SERVER_MESSAGES.error, (message: string) => {
        if (generation.current === run) setError(message);
      });
      room.onLeave(() => {
        if (generation.current !== run) return;
        roomRef.current = null;
        setReceived(null);
        setError("Playtest room disconnected. Start the test again.");
      });
    } catch (cause) {
      if (generation.current === run) setError(cause instanceof Error ? cause.message : "Could not start the minigame test.");
    } finally {
      if (generation.current === run) setBusy(false);
    }
  };

  const valid = name.trim().length > 0 && Number.isInteger(bots) && bots >= 0 && bots <= MAX_PLAYERS - 1;
  const match = received?.view.match;

  return (
    <>
      <main className="panel minigame-test-setup">
        <h1>Minigame playtest</h1>
        <p>Choose any minigame and how many bots to include. The test starts directly in the minigame; Ready starts another run.</p>
        <form onSubmit={(event) => { event.preventDefault(); if (valid && !busy) void launch(); }}>
          <div className="minigame-test-fields">
            <label className="field">
              Nickname
              <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              Minigame
              <select value={game} onChange={(event) => setGame(event.target.value as MinigameKind)}>
                {MINIGAME_KINDS.map((kind) => <option key={kind} value={kind}>{MINIGAMES[kind].name}</option>)}
              </select>
            </label>
            <label className="field">
              Bots (0–{MAX_PLAYERS - 1})
              <input type="number" min={0} max={MAX_PLAYERS - 1} step={1} value={Number.isNaN(bots) ? "" : bots}
                onChange={(event) => setBots(event.target.valueAsNumber)} />
            </label>
          </div>
          <div className="row">
            <button className="primary" disabled={!valid || busy}>{busy ? "Starting…" : "Start playtest"}</button>
            {received && <button type="button" onClick={stop}>End playtest</button>}
            <a className="minigame-test-back" href="/">Back to Beach Party</a>
          </div>
        </form>
        {error && <p role="alert" className="minigame-test-error">{error} Make sure the local dev server is running.</p>}
      </main>
      {match && <Game received={received!} act={(action) => roomRef.current?.send(CLIENT_ACTION, action)} onLeave={stop} playAgainLabel="Play another test" />}
    </>
  );
}
