import { createMatch } from "@pbg/rules";
import type { RoomView } from "@pbg/protocol";

export function fixture(count = 4): RoomView {
  const players = Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, isBot: i > 0 }));
  const state = createMatch({ players, seed: 1 });
  return {
    code: "TEST01",
    stage: "playing",
    serverNow: 0,
    seats: players.map((p, i) => ({
      seatId: p.id, name: p.name, character: `Character ${i + 1}`,
      kind: p.isBot ? "bot" : "human", connected: true, botControlled: false, isHost: i === 0,
    })),
    youSeatId: "p1",
    takenCharacters: [],
    match: {
      board: state.board,
      round: 1,
      phase: state.phase,
      step: { kind: "deciding", deadline: 15_000 },
      bossFixed: state.bossFixed,
      auction: null,
      players: state.players.map((p) => ({
        seatId: p.id, position: p.position, coins: p.coins, defaultDie: p.defaultDie, dead: p.dead,
        deciding: true, ready: false,
      })),
      events: [],
      minigame: null,
      endStats: null,
      you: {
        dice: [{ id: "private-die", sides: 12 }],
        items: [{ id: "private-item", kind: "booster" }],
        traps: [], decision: null, submitted: null, minigameSubmitted: false,
        dead: state.players[0]!.dead,
        reviveRequirement: state.players[0]!.reviveRequirement,
      },
    },
  };
}
