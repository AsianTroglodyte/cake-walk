import { createMatch, type MatchState, type Space } from "../src/index";

export function makeMatch(playerCount: number, seed = 1): MatchState {
  return createMatch({
    players: Array.from({ length: playerCount }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, isBot: false })),
    seed,
  });
}

export function firstSpace(state: MatchState, predicate: (space: Space) => boolean): Space {
  const space = state.board.spaces.find(predicate);
  if (!space) throw new Error("No space matches");
  return space;
}

export function singletonRanking(state: MatchState): string[][] {
  return state.players.map((p) => [p.id]);
}
