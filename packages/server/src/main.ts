import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { BOSS_TEST_PORT, BOSS_TEST_ROOM_NAME, DEFAULT_PORT, ROOM_NAME } from "@pbg/protocol";
import { BeachPartyRoom } from "./room";
import { BossTestRoom } from "./bossTestRoom";

const bossTestMode = process.argv.includes("--boss-test");
const port = Number(process.env.PORT ?? (bossTestMode ? BOSS_TEST_PORT : DEFAULT_PORT));
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    if (bossTestMode) app.get("/", (req, res, next) => {
      if (req.query.test !== "boss") res.redirect("/?test=boss");
      else next();
    });
    if (existsSync(clientDist)) app.use(express.static(clientDist));
    else app.get("/", (_req, res) => res.send("Client not built yet. Run `pnpm build`, or use the Vite dev server."));
  },
});

if (bossTestMode) server.define(BOSS_TEST_ROOM_NAME, BossTestRoom);
else server.define(ROOM_NAME, BeachPartyRoom);
await server.listen(port);
console.log(`Beach Party server listening on http://localhost:${port}`);
if (bossTestMode) console.log(`Standalone boss test: http://localhost:${port}/?test=boss`);
