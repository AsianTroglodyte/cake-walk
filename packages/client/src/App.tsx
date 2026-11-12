import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { SERVER_MESSAGES, type ClientAction, type RoomView } from "@pbg/protocol";
import { clearToken, rejoinSavedRoom, saveToken, sendAction, startClockSync } from "./connection";
import { Home } from "./Home";
import { Lobby } from "./Lobby";
import { Game } from "./Game";

export interface ReceivedView {
  view: RoomView;
  /** Server clock minus local clock: from clock sync, or roughly from the view's timestamp until that's done. */
  clockOffset: number;
}

export function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [received, setReceived] = useState<ReceivedView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejoining, setRejoining] = useState(true);
  const rejoinStarted = useRef(false);
  const syncedOffset = useRef<number | null>(null);

  const attach = useCallback((joined: Room) => {
    saveToken(joined);
    syncedOffset.current = null;
    joined.onMessage(SERVER_MESSAGES.view, (view: RoomView) => {
      setReceived({ view, clockOffset: syncedOffset.current ?? view.serverNow - Date.now() });
      const url = new URL(location.href);
      url.searchParams.set("code", view.code);
      history.replaceState(null, "", url);
    });
    joined.onMessage(SERVER_MESSAGES.error, (message: string) => setNotice(message));
    const resync = startClockSync(joined, (offset) => {
      syncedOffset.current = offset;
      setReceived((current) => current && { ...current, clockOffset: offset });
    });
    joined.onReconnect(() => {
      saveToken(joined);
      resync();
    });
    joined.onLeave((code) => {
      clearToken();
      setRoom(null);
      setReceived(null);
      if (code !== 4000) setNotice("You were disconnected from the room.");
    });
    setRoom(joined);
  }, []);

  useEffect(() => {
    if (rejoinStarted.current) return;
    rejoinStarted.current = true;
    rejoinSavedRoom()
      .then((joined) => joined && attach(joined))
      .finally(() => setRejoining(false));
  }, [attach]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const act = useCallback((action: ClientAction) => room && sendAction(room, action), [room]);
  const leave = useCallback(() => void room?.leave(), [room]);

  let screen;
  if (rejoining) screen = <p className="center muted">Connecting…</p>;
  else if (!room || !received) screen = <Home onJoined={attach} onError={setNotice} />;
  else if (received.view.stage === "lobby") screen = <Lobby view={received.view} act={act} onLeave={leave} />;
  else screen = <Game received={received} act={act} onLeave={leave} />;

  return (
    <>
      {screen}
      {notice && <div className="toast">{notice}</div>}
    </>
  );
}
