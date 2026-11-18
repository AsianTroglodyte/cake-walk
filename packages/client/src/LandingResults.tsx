import type { MatchEvent, SpaceType } from "@pbg/rules";
import type { RoomView } from "@pbg/protocol";
import { ITEMS } from "@pbg/rules";

type EffectRow = { space: string; result: string };

export function LandingResults({ view, events }: { view: RoomView; events: MatchEvent[] }) {
  const playerId = view.youSeatId;
  if (!playerId) return null;
  const board = view.match!.board;
  const moves = events
    .filter((event): event is Extract<MatchEvent, { type: "moved" }> => event.type === "moved" && event.playerId === playerId)
    .sort((a, b) => (a.chain ?? 0) - (b.chain ?? 0));
  if (!moves.length) return null;
  const arrows = events
    .filter((event): event is Extract<MatchEvent, { type: "arrow" }> => event.type === "arrow" && event.playerId === playerId)
    .sort((a, b) => (a.chain ?? 0) - (b.chain ?? 0));
  const coins = events.filter(
    (event): event is Extract<MatchEvent, { type: "coinsChanged" }> =>
      event.type === "coinsChanged" && event.playerId === playerId && (event.reason === "blueSpace" || event.reason === "redSpace"),
  );
  const spaceEvents = events.filter((event): event is Extract<MatchEvent, { type: "spaceEffect" }> =>
    event.type === "spaceEffect" && event.playerId === playerId);
  const skippedItems = events.filter((event): event is Extract<MatchEvent, { type: "itemAwardSkipped" }> =>
    event.type === "itemAwardSkipped" && event.playerId === playerId);
  const chaosEvents = events.filter((event): event is Extract<MatchEvent, { type: "chaosOutcome" }> =>
    event.type === "chaosOutcome" && event.playerId === playerId);
  const pairedSpace = events.find((event): event is Extract<MatchEvent, { type: "pairEffect" }> =>
    event.type === "pairEffect" && event.playerId === playerId)?.spaceId;

  const rows: EffectRow[] = [];
  const visits = new Map<number, number>();
  let current = moves[0]!.path.at(-1)!;
  let moveIndex = 0;
  let arrowIndex = 0;
  let coinIndex = 0;
  let spaceEffectIndex = 0;
  let chaosIndex = 0;
  for (;;) {
    const space = board.spaces[current]!;
    const visit = visits.get(space.id) ?? 0;
    if (visit >= (space.id === pairedSpace ? 2 : 1)) break;
    visits.set(space.id, visit + 1);
    const pairRepeat = space.id === pairedSpace && visit === 0;
    switch (space.type) {
      case "blue":
      case "red": {
        const delta = coins[coinIndex++]?.delta ?? 0;
        rows.push({ space: SPACE_LABEL[space.type], result: `${delta > 0 ? "+" : ""}${delta} coins` });
        break;
      }
      case "green": {
        const effect = spaceEvents[spaceEffectIndex++];
        const skipped = skippedItems.shift();
        rows.push({
          space: "Green",
          result: effect?.item
            ? `Received ${ITEMS[effect.item.kind].name}: ${ITEMS[effect.item.kind].description}`
            : skipped ? `No room for ${ITEMS[skipped.kind].name}` : "Received a random item",
        });
        break;
      }
      case "orange":
      case "purple": {
        const arrow = arrows[arrowIndex++];
        const repeatedArrow = pairRepeat ? arrows[arrowIndex++] : undefined;
        rows.push({
          space: SPACE_LABEL[space.type],
          result: arrow ? `Moved ${arrow.direction} ${arrow.path.length + (repeatedArrow?.path.length ?? 0)} spaces${repeatedArrow ? " (twice)" : ""}` : "No movement",
        });
        const destination = repeatedArrow?.path.at(-1) ?? arrow?.path.at(-1);
        if (destination === undefined) break;
        current = destination;
        continue;
      }
      case "pink": {
        spaceEffectIndex++;
        moveIndex++;
        const extraMove = moves[moveIndex];
        const secondMove = pairRepeat ? moves[++moveIndex] : undefined;
        rows.push({ space: "Pink", result: extraMove ? `Rolled again${secondMove ? " twice" : ""} and moved ${extraMove.path.length + (secondMove?.path.length ?? 0)} spaces` : "Rolled again" });
        if (!extraMove?.path.length && !secondMove?.path.length) break;
        current = (secondMove?.path.at(-1) ?? extraMove?.path.at(-1))!;
        continue;
      }
      case "maroon":
        spaceEffectIndex++;
        rows.push({ space: "Maroon", result: pairRepeat ? "Will miss the next two moves" : "Will miss the next move" });
        break;
      case "monochromeChaos":
      case "rainbowChaos": {
        const chaos = chaosEvents[chaosIndex++];
        rows.push({
          space: SPACE_LABEL[space.type],
          result: "Chaos time!",
        });
        break;
      }
      case "white":
      case "checkpoint":
      case "finish":
      case "start":
        rows.push({ space: SPACE_LABEL[space.type], result: "No effect" });
        break;
      case "black":
        rows.push({ space: SPACE_LABEL[space.type], result: "You are dead." });
        break;
    }
    if (pairRepeat) continue;
    break;
  }

  return (
    <section className="panel landing-results" aria-live="polite">
      <h2>Space effects</h2>
      <div className="space-scoreboard" role="table" aria-label="Your landed space effects">
        <div className="space-scoreboard-row header" role="row">
          <strong role="columnheader">Space</strong>
          <strong role="columnheader">Effect</strong>
        </div>
        {rows.map((row, index) => (
          <div className="space-scoreboard-row" role="row" key={`${row.space}-${index}`}>
            <strong role="cell">{row.space}</strong>
            <span role="cell">{row.result}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const SPACE_LABEL: Record<SpaceType, string> = {
  start: "Start",
  checkpoint: "Checkpoint",
  finish: "Finish",
  white: "White",
  blue: "Blue",
  red: "Red",
  green: "Green",
  orange: "Orange",
  purple: "Purple",
  pink: "Pink",
  maroon: "Maroon",
  black: "Black",
  monochromeChaos: "Monochrome Chaos",
  rainbowChaos: "Rainbow Chaos",
};
