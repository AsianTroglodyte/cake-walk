import type { Client } from "@colyseus/core";
import { MINIGAME_KINDS, MAX_PLAYERS, type MinigameKind } from "@pbg/rules";
import type { MinigameTestOptions } from "@pbg/protocol";
import { BeachPartyRoom } from "./room";

export function parseMinigameTestOptions(raw: unknown): MinigameTestOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid minigame test options");
  const options = raw as Record<string, unknown>;
  if (!MINIGAME_KINDS.includes(options.game as MinigameKind)) throw new Error("Choose a valid minigame");
  if (!Number.isInteger(options.bots) || (options.bots as number) < 0 || (options.bots as number) > MAX_PLAYERS - 1) {
    throw new Error(`Choose between 0 and ${MAX_PLAYERS - 1} bots`);
  }
  return {
    game: options.game as MinigameKind,
    bots: options.bots as number,
    name: typeof options.name === "string" ? options.name : "Minigame tester",
  };
}

/** Isolated local test room that jumps directly to a chosen minigame. */
export class MinigameTestRoom extends BeachPartyRoom {
  maxClients = 1;

  protected sessionSettings(raw: unknown) {
    const options = parseMinigameTestOptions(raw);
    return { minigameTest: { game: options.game } };
  }

  onJoin(client: Client, options?: MinigameTestOptions): void {
    const config = parseMinigameTestOptions(options);
    super.onJoin(client, options);
    for (let i = 0; i < config.bots; i++) this.session.handle(client.sessionId, { type: "addBot" });
    this.session.handle(client.sessionId, { type: "start" });
  }
}
