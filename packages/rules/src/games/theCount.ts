import { randInt } from "../rng";
import type { PlayerId } from "../types";
import { isInt, mapPlayers, rankByKeys, type RoundGame } from "./framework";

/** Words like "there", "them", and "other" are traps: only the standalone word counts. */
export const THE_PARAGRAPHS: readonly string[] = [
  "The tide rolled in over the sand while the gulls circled the pier. There was a crab under the dock, and the children chased it until their mother called them back. The other families gathered their towels as the sun dipped behind the lighthouse at the end of the bay.",
  "Theo packed the cooler with the sandwiches, then remembered the lemonade. The car was already hot, so he parked it in the shade of the old palm. The beach was crowded, but the spot by the rocks was empty, and there the waves were gentle enough for the toddlers.",
  "In the morning the market opened early. The fishermen brought the catch of the night, and the cooks bargained over the price of the shrimp. Thereafter the whole square smelled of salt and smoke, and the cats waited patiently beneath the tables for the scraps.",
  "The captain checked the map, then the compass, then the map again. The crew whispered that the island did not exist. Nevertheless, the ship sailed on through the fog, and at dawn the lookout shouted from the mast that he could see the cliffs.",
  "Nobody knew who built the sandcastle. It stood at the edge of the water with towers, a moat, and a bridge made from driftwood. The tourists took photos of it all afternoon. By evening the tide had taken the moat, and by midnight the rest was gone.",
  "The theme of the party was pirates, so the hosts hung a flag over the porch and buried the prizes in the yard. The guests dug with plastic shovels while the dog barked at them. Then thunder rumbled, and everyone ran inside with the treasure.",
  "There is a rule at the snack bar: the line forms by the sign, not by the window. The owner enforces it with a whistle. The regulars think the whistle is louder than the foghorn, and they might be right, though the owner insists otherwise.",
  "The volleyball bounced off the net and rolled toward the water. Three players dove for it at the same time. The ball escaped them all and floated out past the buoys, where a surprised swimmer threw it back to the cheering crowd on the shore.",
  "Breathe in, the instructor said, and the class breathed in. Breathe out, and the class breathed out. The waves kept the rhythm for them. At the end of the session the instructor rolled up the mats and thanked the ocean, as she always did.",
  "The lifeguard tower was painted the color of a lemon. From the top, the guard could see the entire stretch of coast, from the jetty to the cliffs. Thermos in hand, she watched the swimmers and counted the surfers, then counted them again.",
  "Every summer the town held a race along the boardwalk. The runners wore silly hats, and the winner received a trophy shaped like a seashell. The mayor fired the starting pistol, missed the cue, and fired it again while the runners laughed at the line.",
  "The museum by the harbor kept a whale skeleton in the main hall. The bones hung from the ceiling on thin wires. Children stood beneath the jaw and pretended to be swallowed. The guard told them, the same as every day, not to touch the ribs.",
  "A storm rolled in from the west. The umbrellas flipped inside out, the towels blew down the beach, and the ice cream truck drove off with its song still playing. Within the hour the clouds had cleared, and the sand was smooth and empty.",
  "The kite string snapped just as the kite reached the clouds. The boy watched it drift over the dunes, over the road, and over the parking lot. A woman at the far end caught it on her car antenna, then walked the whole way back to return it.",
  "They say the old hotel on the hill is haunted. The elevator stops on the fourth floor even when nobody presses the button. The staff leave a cup of tea by the stairs each night, and by morning the cup is always empty, though nobody admits to drinking it.",
  "The recipe called for the juice of three limes, the zest of one, and a pinch of salt. The chef added the chili last, tasted the sauce, and frowned. Then she added another pinch of salt, tasted it again, and finally smiled at the apprentice.",
  "On the last day of the trip the family walked to the end of the pier. The father bought popcorn, the mother bought postcards, and the twins bought matching sunglasses. They watched the boats come in until the lights along the shore flickered on.",
  "The surfboard had a crack along the fin, but the owner refused to replace it. He said the board had character. The other surfers said the board had a crack. Either way, it carried him through the biggest wave of the season without breaking.",
  "A sea turtle crawled up the beach in the moonlight. The volunteers kept the crowd back and turned off their flashlights. The turtle dug a nest in the soft sand above the tide line, laid her eggs, and slowly made her way back into the dark water.",
  "The band played on the bandstand while the sun set behind them. The drummer kept losing his sticks, and the singer kept forgetting the words, but the audience did not mind. When the last song ended, the whole crowd sang the chorus one more time.",
];

export function countThe(text: string): number {
  return text.match(/\bthe\b/gi)?.length ?? 0;
}

export const THE_MAX_GUESS = 999;

export interface TheCountState {
  players: PlayerId[];
  stage: "read" | "guess" | "done";
  text: string;
  answer: number;
  guesses: Record<PlayerId, number | null>;
}

export interface TheCountView {
  stage: TheCountState["stage"];
  /** Only while reading. */
  text: string | null;
  answer: number | null;
  guesses: Record<PlayerId, number | null> | null;
}

/** Reading: any input means "done reading". Guessing: a count, or null for no guess. */
export type TheCountChoice = number | null;

export const theCount: RoundGame<TheCountState, TheCountChoice> = {
  mode: "round",
  setup({ players, rng }) {
    const text = THE_PARAGRAPHS[randInt(rng, 0, THE_PARAGRAPHS.length - 1)]!;
    return { players, stage: "read", text, answer: countThe(text), guesses: mapPlayers(players, () => null) };
  },
  roundMs: (s) => (s.stage === "read" ? 20_000 : 12_000),
  revealMs: 1_000,
  deciders: (s) => (s.stage === "done" ? [] : s.players),
  parse: (s, _id, raw) => (s.stage === "read" || raw === null ? null : isInt(raw, 0, THE_MAX_GUESS) ? raw : undefined),
  fallback: () => null,
  bot: (s, _id, rng) => (s.stage === "read" ? null : Math.max(0, s.answer + randInt(rng, -4, 4))),
  resolve(s, choices) {
    if (s.stage === "read") {
      s.stage = "guess";
      return;
    }
    for (const [id, guess] of Object.entries(choices)) s.guesses[id] = guess;
    s.stage = "done";
  },
  done: (s) => s.stage === "done",
  result(s) {
    const off = (id: PlayerId) => (s.guesses[id] === null ? null : Math.abs(s.guesses[id]! - s.answer));
    return {
      ranking: rankByKeys(s.players, (id) => (off(id) === null ? [0] : [1, -off(id)!])),
      scores: { ...s.guesses },
      labels: mapPlayers(s.players, (id) =>
        s.guesses[id] === null ? "no guess" : `guessed ${s.guesses[id]}, off by ${off(id)}`,
      ),
    };
  },
  view: (s) =>
    ({
      stage: s.stage,
      text: s.stage === "read" ? s.text : null,
      answer: s.stage === "done" ? s.answer : null,
      guesses: s.stage === "done" ? s.guesses : null,
    }) satisfies TheCountView,
};
