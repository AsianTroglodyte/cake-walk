import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Leaderboard, leaderboardRows, leaderboardStatus } from "../src/Leaderboard";
import { fixture } from "./fixtures";

describe("leaderboard rankings", () => {
  it("ranks by progress without mutating the server's player order", () => {
    const match = fixture().match!;
    const space = (distance: number) => match.board.spaces.find((s) => s.distanceToFinish === distance)!.id;
    match.players[0]!.position = space(20);
    match.players[1]!.position = space(5);
    match.players[2]!.position = space(10);
    match.players[3]!.position = space(15);
    expect(leaderboardRows(match).map((r) => [r.player.seatId, r.place, r.distance])).toEqual([
      ["p2", 1, 5], ["p3", 2, 10], ["p4", 3, 15], ["p1", 4, 20],
    ]);
    expect(match.players.map((p) => p.seatId)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("shares ranks for equal distances across different paths; coins never break ties", () => {
    const match = fixture(7).match!;
    const spaces = match.board.spaces.filter((s) => s.distanceToFinish === 10);
    expect(spaces.length).toBeGreaterThan(1);
    match.players[0]!.position = spaces[0]!.id;
    match.players[1]!.position = spaces[1]!.id;
    match.players[0]!.coins = 1;
    match.players[1]!.coins = 99;
    const rows = leaderboardRows(match);
    expect(rows.slice(0, 2).map((r) => [r.player.seatId, r.place, r.tied])).toEqual([
      ["p1", 1, true], ["p2", 1, true],
    ]);
    expect(rows[2]!.place).toBe(3);
  });

  it.each([4, 7, 12])("shows everyone tied for first at the start of a %i-player game", (count) => {
    const rows = leaderboardRows(fixture(count).match!);
    expect(rows).toHaveLength(count);
    expect(rows.every((r) => r.place === 1 && r.tied)).toBe(true);
  });

  it("gives the declared winner sole first place after a showdown", () => {
    const match = fixture().match!;
    match.players[0]!.position = match.board.finish;
    match.players[1]!.position = match.board.finish;
    match.phase = { kind: "gameOver", winner: "p2" };
    match.step = { kind: "finished" };
    expect(leaderboardRows(match).slice(0, 2).map((r) => [r.player.seatId, r.place, r.tied, r.winner])).toEqual([
      ["p2", 1, false, true], ["p1", 2, false, false],
    ]);
  });
});

describe("leaderboard statuses", () => {
  it("distinguishes picking, locked-in choices, away players, and bot takeovers", () => {
    const view = fixture();
    const match = view.match!;
    const player = match.players[0]!;
    const seat = view.seats[0]!;
    expect(leaderboardStatus(match, player, seat)).toBe("Choosing move");
    match.phase = { kind: "items" };
    expect(leaderboardStatus(match, player, seat)).toBe("Choosing items");
    player.ready = true;
    expect(leaderboardStatus(match, player, seat)).toBe("Locked in");
    seat.connected = false;
    expect(leaderboardStatus(match, player, seat)).toBe("Away");
    seat.botControlled = true;
    expect(leaderboardStatus(match, player, seat)).toBe("Locked in");
  });

  it("shows showdown die selection and eliminations in leaderboard status", () => {
    const view = fixture();
    const match = view.match!;
    const player = match.players[0]!;
    const seat = view.seats[0]!;
    player.ready = true;
    match.step = { kind: "showdown", stage: "choosing", contenders: ["p1", "p2"], selected: {}, deadline: 10_000 };
    expect(leaderboardStatus(match, player, seat)).toBe("Choosing die");
    match.step.selected.p1 = 8;
    expect(leaderboardStatus(match, player, seat)).toBe("Die selected");
    match.step = { kind: "showdown", stage: "outcome", contenders: ["p1", "p2"], active: ["p1", "p2"], dice: { p1: { sides: 8, saved: true }, p2: { sides: 8, saved: true } }, rolls: { p1: 8, p2: 3 }, eliminated: { p2: 3 }, round: 1, currentPlayer: "p2", leaders: ["p1"], until: 10_000 };
    match.step.contenders = ["p2"];
    expect(leaderboardStatus(match, player, seat)).toBe("Watching");
  });

  it("shows minigame picks, results readiness, and the final winner", () => {
    const view = fixture();
    const match = view.match!;
    const player = match.players[0]!;
    const seat = view.seats[0]!;
    match.step = { kind: "minigame", mode: "server", game: "headsTails", stage: "choosing", round: 1, until: 10_000 };
    expect(leaderboardStatus(match, player, seat)).toBe("Choosing");
    player.ready = true;
    expect(leaderboardStatus(match, player, seat)).toBe("Picked");
    player.deciding = false;
    expect(leaderboardStatus(match, player, seat)).toBe("Watching");
    player.ready = false;
    match.step = { kind: "results", until: 10_000, ranking: [["p1"], ["p2"], ["p3"], ["p4"]], played: null, prizes: {} };
    expect(leaderboardStatus(match, player, seat)).toBe("Reviewing results");
    player.ready = true;
    expect(leaderboardStatus(match, player, seat)).toBe("Ready");
    match.phase = { kind: "gameOver", winner: "p1" };
    expect(leaderboardStatus(match, player, seat)).toBe("Winner");
  });
});

describe("leaderboard rendering", () => {
  it("renders labeled columns, tie labels, the current player, and the d4 penalty without leaking inventory", () => {
    const view = fixture(12);
    view.match!.players[0]!.defaultDie = 4;
    const html = renderToStaticMarkup(<Leaderboard view={view} />);
    for (const heading of ["Place", "Player", "Current space", "To finish", "Coins", "Default die", "Status"]) {
      expect(html).toContain(`<th scope="col"${heading === "Coins" ? ' class="leaderboard-number"' : ""}>${heading}</th>`);
    }
    expect(html.match(/scope="row"/g)).toHaveLength(12);
    expect(html).toContain('class="leaderboard-current-space"><strong>0</strong><span>Start</span>');
    expect(html).toContain('aria-label="Tied for place 1"');
    expect(html).toContain('class="mine leading ');
    expect(html).toContain('class="tag you">you');
    expect(html).toContain('class="leaderboard-die penalty"');
    expect(html).toContain("d4");
    expect(html).not.toContain("private-die");
    expect(html).not.toContain("private-item");
    expect(html).not.toContain("Booster");
    expect(html).not.toContain("d12");
  });

  it("shows winner and at-boss labels instead of treating a tied finish as two winners", () => {
    const view = fixture();
    const match = view.match!;
    match.players[0]!.position = match.board.finish;
    match.players[1]!.position = match.board.finish;
    match.phase = { kind: "gameOver", winner: "p1" };
    match.step = { kind: "finished" };
    const html = renderToStaticMarkup(<Leaderboard view={view} />);
    expect(html).toContain("At the boss");
    expect(html.match(/>Winner</g)).toHaveLength(1);
  });
});
