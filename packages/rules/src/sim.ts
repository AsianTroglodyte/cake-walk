import { botPhaseInput } from "./bots";
import { CHARACTERS } from "./characters";
import { createMatch, resolvePhase } from "./match";
import { createRng } from "./rng";
import type { BoardConfig, MatchEvent, MatchState, PlayerId, RuleConfig } from "./types";

export interface BotMatchOptions {
  playerCount: number;
  seed: number;
  /** Matches still running after this many rounds count as stalled. */
  maxRounds?: number;
  board?: Partial<BoardConfig>;
  rules?: Partial<RuleConfig>;
}

export interface BotMatchResult {
  state: MatchState;
  events: MatchEvent[];
  winner: PlayerId | null;
  rounds: number;
  stalled: boolean;
  /** Player-collisions: a collision between three players counts as three. */
  collisions: number;
  roundsWithCollision: number;
  bossFights: number;
}

export function runBotMatch(options: BotMatchOptions): BotMatchResult {
  const maxRounds = options.maxRounds ?? 300;
  const players = Array.from({ length: options.playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: CHARACTERS[i % CHARACTERS.length]!,
    isBot: true,
  }));
  let state = createMatch({ players, seed: options.seed, board: options.board, rules: options.rules });
  const botRng = createRng(options.seed ^ 0x9e3779b9);
  const events: MatchEvent[] = [];

  while (state.phase.kind !== "gameOver" && state.round <= maxRounds) {
    const result = resolvePhase(state, botPhaseInput(state, botRng));
    state = result.state;
    events.push(...result.events);
  }

  const winner = state.phase.kind === "gameOver" ? state.phase.winner : null;
  const collisionRounds = new Set<number>();
  let currentRound = 0;
  for (const event of events) {
    if (event.type === "roundStarted") currentRound = event.round;
    if (event.type === "collision") collisionRounds.add(currentRound);
  }

  return {
    state,
    events,
    winner,
    rounds: winner ? state.round : maxRounds,
    stalled: winner === null,
    collisions: events.reduce((n, e) => (e.type === "collision" ? n + e.playerIds.length : n), 0),
    roundsWithCollision: collisionRounds.size,
    bossFights: events.filter((e) => e.type === "bossFight").length,
  };
}
