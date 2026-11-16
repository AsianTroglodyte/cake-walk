import type { Client } from "@colyseus/core";
import type { BossTestOptions } from "@pbg/protocol";
import { BeachPartyRoom } from "./room";

export function parseBossTestOptions(raw: unknown): BossTestOptions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid boss test options");
  const options = raw as Record<string, unknown>;
  if (!["you", "bot", "both"].includes(options.challenger as string)) throw new Error("Choose you, bot, or both");
  if (!Number.isInteger(options.bossFixed) || (options.bossFixed as number) < 1 || (options.bossFixed as number) > 12) {
    throw new Error("Boss strength must be an integer from 1 to 12");
  }
  if (options.defaultDie !== 4 && options.defaultDie !== 6) throw new Error("Default die must be d4 or d6");
  if (!Number.isInteger(options.seed) || (options.seed as number) < 0 || (options.seed as number) > 0xffff_ffff) {
    throw new Error("Seed must be an integer from 0 to 4294967295");
  }
  if (options.mode !== undefined && options.mode !== "boss" && options.mode !== "showdown") throw new Error("Choose boss or showdown mode");
  if (options.contenders !== undefined &&
    (!Number.isInteger(options.contenders) || (options.contenders as number) < 2 || (options.contenders as number) > 12)) {
    throw new Error("Showdown contenders must be an integer from 2 to 12");
  }
  return {
    name: typeof options.name === "string" ? options.name : "Boss tester",
    challenger: options.challenger as BossTestOptions["challenger"],
    bossFixed: options.bossFixed as number,
    defaultDie: options.defaultDie,
    seed: options.seed as number,
    ...(options.mode !== undefined ? { mode: options.mode as BossTestOptions["mode"] } : {}),
    ...(options.contenders !== undefined ? { contenders: options.contenders as number } : {}),
  };
}

/** Registered only by `pnpm boss:test`, on its own server/port. */
export class BossTestRoom extends BeachPartyRoom {
  maxClients = 1;

  protected sessionSettings(raw: unknown) {
    const options = parseBossTestOptions(raw);
    return {
      seed: options.seed,
      bossTest: {
        challenger: options.challenger, bossFixed: options.bossFixed, defaultDie: options.defaultDie,
        mode: options.mode, contenders: options.contenders,
      },
    };
  }

  onJoin(client: Client, options?: BossTestOptions): void {
    super.onJoin(client, options);
    const players = options?.mode === "showdown" ? Math.max(4, options.contenders ?? 4) : 4;
    for (let i = 1; i < players; i++) this.session.handle(client.sessionId, { type: "addBot" });
    this.session.handle(client.sessionId, { type: "start" });
  }
}
