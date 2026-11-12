import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { DEFAULT_PORT, ROOM_NAME } from "@pbg/protocol";
import { BeachPartyRoom } from "./room";

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    if (existsSync(clientDist)) app.use(express.static(clientDist));
    else app.get("/", (_req, res) => res.send("Client not built yet. Run `pnpm build`, or use the Vite dev server."));
  },
});

server.define(ROOM_NAME, BeachPartyRoom);
await server.listen(port);
console.log(`Beach Party server listening on http://localhost:${port}`);
