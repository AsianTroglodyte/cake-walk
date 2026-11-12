import { describe, expect, it } from "vitest";
import { resolveCollisions, type MatchEvent } from "../src/index";
import { firstSpace, makeMatch } from "./helpers";

function setup(playerCount = 6) {
  const state = makeMatch(playerCount);
  const contested = firstSpace(state, (s) => !s.collisionFree);
  const elsewhere = firstSpace(state, (s) => !s.collisionFree && s.id !== contested.id);
  return { state, contested, elsewhere };
}

describe("Beach Party collisions", () => {
  it("sends both players back to the checkpoint behind the space", () => {
    const { state, contested } = setup();
    state.players[0]!.position = contested.id;
    state.players[1]!.position = contested.id;
    const events: MatchEvent[] = [];

    resolveCollisions(state, new Set(), events);

    expect(state.players[0]!.position).toBe(contested.checkpointBehind);
    expect(state.players[1]!.position).toBe(contested.checkpointBehind);
    expect(events).toEqual([
      { type: "collision", spaceId: contested.id, playerIds: ["p1", "p2"], sentTo: contested.checkpointBehind },
    ]);
  });

  it("sends back everyone on a shared space, not just two players", () => {
    const { state, contested } = setup();
    for (const player of state.players.slice(0, 3)) player.position = contested.id;

    resolveCollisions(state, new Set(), []);

    for (const player of state.players.slice(0, 3)) expect(player.position).toBe(contested.checkpointBehind);
  });

  it("leaves players on different spaces alone", () => {
    const { state, contested, elsewhere } = setup();
    state.players[0]!.position = contested.id;
    state.players[1]!.position = elsewhere.id;
    const events: MatchEvent[] = [];

    resolveCollisions(state, new Set(), events);

    expect(state.players[0]!.position).toBe(contested.id);
    expect(state.players[1]!.position).toBe(elsewhere.id);
    expect(events).toEqual([]);
  });

  it.each(["checkpoint", "finish", "start"] as const)("lets players share the %s", (type) => {
    const state = makeMatch(6);
    const safe = firstSpace(state, (s) => s.type === type);
    for (const player of state.players) player.position = safe.id;

    resolveCollisions(state, new Set(), []);

    for (const player of state.players) expect(player.position).toBe(safe.id);
  });

  it("ignores collisions in the opening segment", () => {
    const state = makeMatch(6);
    const opening = firstSpace(state, (s) => s.segment === 0 && s.lane !== null);
    state.players[0]!.position = opening.id;
    state.players[1]!.position = opening.id;

    resolveCollisions(state, new Set(), []);

    expect(state.players[0]!.position).toBe(opening.id);
  });
});
