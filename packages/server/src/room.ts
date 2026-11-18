import { Room, type Client } from "@colyseus/core";
import {
  CLIENT_ACTION,
  CLIENT_PING,
  SERVER_MESSAGES,
  type ClientAction,
  type JoinOptions,
  type Ping,
  type Pong,
} from "@pbg/protocol";
import { MINIGAME_KINDS, type MinigameKind } from "@pbg/rules";
import { GameSession, SessionError, type SessionDeps } from "./session";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LOBBY_RECONNECT_SECONDS = 60;
const MATCH_RECONNECT_SECONDS = 30 * 60;

export function generateCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

/** For playtesting: MINIGAMES=rps,timebomb limits the rotation. Unknown names are ignored. */
function minigamesFromEnv(): MinigameKind[] | undefined {
  const picked = (process.env.MINIGAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is MinigameKind => MINIGAME_KINDS.includes(s as MinigameKind));
  return picked.length > 0 ? picked : undefined;
}

export class BeachPartyRoom extends Room {
  maxClients = 13;
  protected session!: GameSession;

  protected sessionSettings(options: unknown): Partial<Pick<SessionDeps, "seed" | "bossTest" | "minigameTest" | "chaosBoardTest" | "auctionTestCoins">> {
    const chaosBoardTest =
      process.env.PBG_ALL_CHAOS_SPACES === "1" ||
      (!!options && typeof options === "object" &&
        "chaosBoardTest" in options && options.chaosBoardTest === true);
    const auctionTestCoins =
      process.env.NODE_ENV !== "production" &&
      !!options && typeof options === "object" &&
      "auctionTestCoins" in options && options.auctionTestCoins === true;
    return { chaosBoardTest, auctionTestCoins };
  }

  onCreate(options?: unknown): void {
    this.roomId = generateCode();
    void this.setPrivate(true);

    this.session = new GameSession({
      code: this.roomId,
      seed: Math.floor(Math.random() * 2 ** 32),
      minigames: minigamesFromEnv(),
      ...this.sessionSettings(options),
      now: () => Date.now(),
      schedule: (ms, fn) => {
        const timer = this.clock.setTimeout(fn, ms);
        return () => timer.clear();
      },
      onChange: () => this.sendViews(),
    });

    this.onMessage(CLIENT_ACTION, (client: Client, action: ClientAction) => {
      try {
        this.session.handle(client.sessionId, action);
      } catch (error) {
        if (!(error instanceof SessionError)) throw error;
        client.send(SERVER_MESSAGES.error, error.message);
      }
    });

    this.onMessage(CLIENT_PING, (client: Client, ping: Ping) => {
      const pong: Pong = { clientTime: Number(ping?.clientTime), serverTime: Date.now() };
      client.send(SERVER_MESSAGES.pong, pong);
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    if (options?.spectator === true) {
      this.sendViews();
      return;
    }
    try {
      this.session.addHuman(client.sessionId, String(options?.name ?? ""));
    } catch (error) {
      if (error instanceof SessionError) throw new Error(error.message);
      throw error;
    }
  }

  onDrop(client: Client): void {
    this.session.drop(client.sessionId);
    const seconds = this.session.stage === "lobby" ? LOBBY_RECONNECT_SECONDS : MATCH_RECONNECT_SECONDS;
    this.allowReconnection(client, seconds);
  }

  onReconnect(client: Client): void {
    this.session.reconnect(client.sessionId);
  }

  onLeave(client: Client): void {
    this.session.removeHuman(client.sessionId);
  }

  onDispose(): void {
    this.session.dispose();
  }

  private sendViews(): void {
    // Keep private rooms joinable during a match so a read-only spectator can connect.
    // Non-spectators are still rejected by GameSession.addHuman once play has begun.
    void this.unlock();
    for (const client of this.clients) client.send(SERVER_MESSAGES.view, this.session.viewFor(client.sessionId));
  }
}
