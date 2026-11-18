import { useState, type FormEvent } from "react";
import type { Room } from "@colyseus/sdk";
import { MAX_NAME_LENGTH } from "@pbg/protocol";
import { MINIGAMES } from "@pbg/rules";
import { createRoom, joinRoom, savedName } from "./connection";

interface Props {
  onJoined: (room: Room) => void;
  onError: (message: string) => void;
}

export function Home({ onJoined, onError }: Props) {
  const [name, setName] = useState(savedName);
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get("code") ?? "");
  const [busy, setBusy] = useState(false);

  async function run(connect: () => Promise<Room>) {
    if (!name.trim()) return onError("Enter a nickname first.");
    setBusy(true);
    try {
      onJoined(await connect());
    } catch (error) {
      onError(error instanceof Error ? error.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return onError("Enter a room code.");
    void run(() => joinRoom(code, name.trim()));
  };

  return (
    <main className="home">
      <h1>Beach Party</h1>
      <p className="muted">A prototype: the board, items, bots, and {Object.keys(MINIGAMES).length} minigames.</p>

      <label className="field">
        Nickname
        <input value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>

      <button className="primary" disabled={busy} onClick={() => void run(() => createRoom(name.trim()))}>
        Create a room
      </button>

      <form onSubmit={join} className="join">
        <input
          value={code}
          placeholder="Room code"
          maxLength={6}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button disabled={busy}>Join</button>
      </form>
      {import.meta.env.DEV && <a className="home-test-link" href="/?test=minigame">Open minigame playtest</a>}
    </main>
  );
}
