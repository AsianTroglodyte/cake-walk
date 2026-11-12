import { Client, type Room } from "@colyseus/sdk";
import {
  CLIENT_ACTION,
  CLIENT_PING,
  DEFAULT_PORT,
  ROOM_NAME,
  SERVER_MESSAGES,
  type ClientAction,
  type JoinOptions,
  type Ping,
  type Pong,
} from "@pbg/protocol";

const endpoint = import.meta.env.DEV ? `http://${location.hostname}:${DEFAULT_PORT}` : location.origin;
const client = new Client(endpoint);

const TOKEN_KEY = "beachParty.reconnectionToken";
const NAME_KEY = "beachParty.name";

export const savedName = () => localStorage.getItem(NAME_KEY) ?? "";
export const saveToken = (room: Room) => localStorage.setItem(TOKEN_KEY, room.reconnectionToken);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function createRoom(name: string): Promise<Room> {
  localStorage.setItem(NAME_KEY, name);
  return client.create(ROOM_NAME, { name } satisfies JoinOptions);
}

export async function joinRoom(code: string, name: string): Promise<Room> {
  localStorage.setItem(NAME_KEY, name);
  return client.joinById(code.trim().toUpperCase(), { name } satisfies JoinOptions);
}

/** Rejoins the room this browser was last in, if it's still running. */
export async function rejoinSavedRoom(): Promise<Room | null> {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    return await client.reconnect(token);
  } catch {
    clearToken();
    return null;
  }
}

export function sendAction(room: Room, action: ClientAction): void {
  room.send(CLIENT_ACTION, action);
}

const PING_SAMPLES = 8;
const PING_SPACING_MS = 150;

/**
 * Estimates server clock minus local clock. The sample with the shortest round trip wins, since
 * its unknown split between the two directions is smallest. Returns a function to measure again.
 */
export function startClockSync(room: Room, onOffset: (offset: number) => void): () => void {
  let bestRoundTrip = Infinity;
  room.onMessage(SERVER_MESSAGES.pong, (pong: Pong) => {
    const now = Date.now();
    const roundTrip = now - pong.clientTime;
    if (roundTrip < 0 || roundTrip >= bestRoundTrip) return;
    bestRoundTrip = roundTrip;
    onOffset(pong.serverTime + roundTrip / 2 - now);
  });
  const measure = () => {
    bestRoundTrip = Infinity;
    for (let i = 0; i < PING_SAMPLES; i++) {
      setTimeout(() => room.send(CLIENT_PING, { clientTime: Date.now() } satisfies Ping), i * PING_SPACING_MS);
    }
  };
  measure();
  return measure;
}
