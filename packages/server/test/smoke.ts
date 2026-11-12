import { Client } from "@colyseus/sdk";
import { CLIENT_ACTION, ROOM_NAME, SERVER_MESSAGES, type RoomView } from "@pbg/protocol";

const endpoint = process.env.ENDPOINT ?? "http://localhost:2567";
const latest = new Map<string, RoomView>();
const errors: string[] = [];

async function connect(name: string, code?: string) {
  const client = new Client(endpoint);
  const room = code ? await client.joinById(code, { name }) : await client.create(ROOM_NAME, { name });
  room.onMessage(SERVER_MESSAGES.view, (view: RoomView) => latest.set(name, view));
  room.onMessage(SERVER_MESSAGES.error, (message: string) => errors.push(`${name}: ${message}`));
  return room;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const host = await connect("Host");
await wait(300);
const code = latest.get("Host")!.code;
console.log("room code:", code);
const guest = await connect("Guest", code);
await wait(300);

guest.send(CLIENT_ACTION, { type: "addBot" });
for (let i = 0; i < 3; i++) host.send(CLIENT_ACTION, { type: "addBot" });
await wait(300);
console.log("seats:", latest.get("Host")!.seats.map((s) => `${s.name}/${s.character}/${s.kind}${s.isHost ? "/host" : ""}`).join(", "));

host.send(CLIENT_ACTION, { type: "start" });
await wait(300);
const hostView = latest.get("Host")!;
console.log("stage:", hostView.stage, "| step:", hostView.match?.step.kind, "| paths:", hostView.match?.board.paths);
console.log("host decision:", JSON.stringify(hostView.match?.you?.decision));

host.send(CLIENT_ACTION, { type: "submitMove", choice: { die: null, lane: 0 } });
await wait(200);
console.log("after host submits, still deciding (guest not ready):", latest.get("Host")!.match?.step.kind);
guest.send(CLIENT_ACTION, { type: "submitMove", choice: { die: null, lane: 0 } });
await wait(300);
const revealed = latest.get("Guest")!.match!;
console.log("after both submit:", revealed.step.kind, "| events:", revealed.events.map((e) => e.type).join(","));

console.log("errors (expected one for the guest adding a bot):", errors);
await host.leave();
await guest.leave();
process.exit(0);
