# Minigames: First Batch

These are the 13 "easy fit" minigames from the Wild Temple doc, rewritten so they work with 4 to 12 players at once and finish in about 60 seconds. The rules were agreed on Nov 11, 2026, and **all 13 are built** and in the random rotation with Quick Draw and Mash Race (equal odds). Anything still marked **(proposed)** is my interpretation that you accepted as is.

**Timers to tune after playtests** (time to pick each round, then the results pause). A round ends early once every human has picked, so real games are usually shorter. The last results pause is always at least 3 seconds.

| Game | Pick | Results pause |
|---|---|---|
| Rock Paper Scissors, Heads or Tails, Three Cells, Four Corners | 8 s | 2.5 to 3 s |
| Stairway to Heaven, Higher or Lower, Clear The Numbers | 6 s | 1 to 1.5 s |
| Laser Fight | 7 s | 2 s |
| One Round Yahtzee | 12 s | 1.5 s |
| Group of Dice | 15 s | 4 s |
| Insert Coins | 20 s | 4 s |
| The | 20 s reading, 12 s guessing | 1 s |

To playtest specific games, start the server with `MINIGAMES=rps,timebomb pnpm start`. The names are `rps`, `stairway`, `groupDice`, `headsTails`, `insertCoins`, `threeCells`, `fourCorners`, `higherLower`, `theCount`, `yahtzee`, `shutBox`, `laserFight`, `timebomb`, `reaction`, and `mash`.

## How every minigame works (proposed)

- **Rounds with secret choices.** Each round, everyone picks secretly within a short timer, usually about 8 seconds. The round ends early once everyone is ready. Then everyone's choices are revealed together and scored.
- **Run by the server.** The server rolls all dice and flips all coins, so nobody can cheat by editing their browser.
- **Timeouts:** a player who doesn't pick gets a default choice, listed per game, or a random one.
- **Bots** play every game with simple strategies.
- **Results:** every game ends in a placement order, ties allowed. The existing rewards (coins, dice, an item for 1st, and a d4 for last) work unchanged.
- **Elimination games:** players are ranked by how long they lasted. Everyone still alive at the end shares the best remaining place, unless the game has a tiebreaker.
- **Quick Draw and Mash Race** stay in the rotation.

## 1. Rock Paper Scissors (about 40 s)

- 5 rounds. Each round, everyone picks Rock, Paper, or Scissors.
- You get **1 point for every player you beat** that round, so with 12 players one round can be worth up to 11 points.
- Most points after 5 rounds wins.
- Timeout: random.

## 2. Stairway to Heaven (about 60 s)

- Each round, everyone picks how many stairs to climb. Anyone whose number was also picked by someone else doesn't move.
- The first player to reach the top wins. If several reach it in the same round, the one who climbed highest wins, and equal heights tie.
- If nobody reaches the top, players are ranked by height.
- **Choices scale with player count**, so that if everyone spreads out as evenly as possible, at least one player is alone on a number and moves. That needs more choices than half the players: the choices go from 1 to (players ÷ 2, rounded down) + 1. That's 1 to 3 for 4 to 5 players, up to 1 to 7 for 12.
- **The top scales too:** 3 × the largest choice + 1 stairs. That's 10 stairs with 1 to 3, and 22 with 1 to 7.
- The game ends after 10 rounds.
- Timeout: random.

## 3. Group of Dice (about 20 s)

- A target between 20 and 60 is shown. Everyone secretly picks **any mix of up to 6 dice** from d4, d6, d8, d10, d12, and d20. For example, 2 d20s and a d4.
- Everyone's dice are rolled at once. The closest total **without going over** wins.
- Going over is a bust. Everyone who busts shares last place.
- Timeout: the number of dice whose average total is closest to the target without going over.

## 4. Heads or Tails (about 45 s)

- Everyone starts with 10 points. Up to 5 rounds.
- Each round, a player who's still betting either **stops**, which locks in their points, or **bets** by calling Heads or Tails.
- One shared coin is flipped each round. A correct call doubles your points. A wrong call drops your points to 0, and you're out of the betting.
- The game ends when nobody is betting anymore, or after 5 rounds. Most points wins.
- Timeout: stop.

## 5. Insert Coins (about 30 s)

- Every player has a box. In one secret round, each player puts all 10 of their coins into **at least 2 boxes**, which can include their own.
- **Your total** is every coin in your box, whoever put it there.
- The closest total to the target **without going over** wins. Everyone over the target shares last place.
- **Target: 13 at every player count.** In bot simulations, the average box always holds 10 coins, because each player adds 10 coins and 1 box, and about 70% of boxes end up at 13 or less whether there are 4 players or 12. The target is one setting, so it's easy to tune after playtests.
- Timeout: 5 coins in your own box and 5 in a random other box.

## 6. Three Cells (about 30 s)

- 3 rounds. Each round, everyone picks cell A, B, or C.
- The cell with the most players **falls**. Everyone else scores the number of players in the fallen cell minus the number in their own cell. For example, if 5 are in the fallen cell and 2 are in yours, you score 3.
- Players in the fallen cell **score 0 that round and keep playing**.
- If cells tie for the most players, they all fall.
- After 3 rounds, the most points wins.
- Timeout: random cell.

## 7. Four Corners (about 30 s)

- Everyone picks one of 4 corners. One corner is chosen **at random**, and everyone standing in it is out. That corner also disappears, so the next round has 3 corners, then 2.
- 3 rounds. Survivors share 1st place. Everyone else is ranked by the round they went out.
- Timeout: random corner.

## 8. Timebomb (real time, about 20 to 50 s)

- **Hot potato.** One bomb with a hidden fuse is passed between players in a random order, looping around.
- Whoever holds the bomb chooses when to press **Pass**. Every second you hold it counts toward your score.
- When the fuse runs out, whoever is holding the bomb **explodes and places last**. Everyone else is ranked by total time held, longest first.
- **Fuse:** a random length between 2 and 4 seconds per player. That's 8 to 16 seconds with 4 players and 24 to 48 with 12.
- To stop an away player from stalling the game, the bomb passes automatically after 10 seconds.

## 9. Higher or Lower (about 45 s)

- A secret number from 1 to 100 is chosen.
- Each round, everyone guesses at the same time, and each player privately sees "higher" or "lower" for their own guess.
- Players are ranked by the round they hit the number exactly; same round ties. After 8 rounds, anyone who hasn't found it is ranked by how close their last guess was.
- Timeout: repeat your last guess. Your first guess defaults to 50.

## 10. The (about 40 s)

- A paragraph full of "the"s appears for 20 seconds. Then everyone guesses how many times "the" appears.
- **(proposed)** No ChatGPT at runtime. I'll write a pool of about 20 paragraphs ahead of time, and each match picks one at random. Only the standalone word "the" counts, in any capitalization; words like "there" or "them" don't.
- The closest guess wins, and equal distances tie.
- Timeout: no guess, which means last place.

## 11. One Round Yahtzee (about 45 s)

- Everyone plays their own dice at the same time: 5 dice, up to 3 rolls, keeping any dice between rolls.
- **Score:** the sum of all 5 dice, plus the best single bonus that applies:
  - **3 of a kind, 4 of a kind, or a full house:** the dice used are doubled. Example: 5 5 5 3 2 scores (5 + 5 + 5) × 2 + 3 + 2 = 35. A full house uses all 5 dice, so all 5 are doubled.
  - **Small straight (4 in a row) or large straight (5 in a row):** the dice used are multiplied by 4.
  - **Yahtzee (5 of a kind):** 100 points added to the sum.
- **(proposed)** Only the best single bonus applies.
- Highest score wins.
- Timeout: keep what you have.

## 12. Clear The Numbers (Shut the Box, about 60 s)

- Everyone has their own tiles numbered 1 to 12. Each turn, roll 2d6, then flip down any open tiles that add up exactly to the roll.
- When you can't make the roll, you're done, and your score is the sum of the tiles still open. **Lower is better**, so clearing every tile wins outright.
- Everyone plays their own box at the same time, with about 8 seconds per roll.
- Timeout: the game flips a valid set of tiles for you.

## 13. Laser Fight (about 60 s)

- Everyone has 3 lives. Each round, everyone secretly picks one action:
  - **Attack** a player. They lose 1 life, unless they defend.
  - **Defend:** every attack aimed at you this round bounces back to its attacker. You can defend 3 times per game.
  - **Refrain:** do nothing. **(proposed)** You can't refrain two rounds in a row.
- **(proposed)** Everything resolves at once, so two players can knock each other out in the same round.
- The last player standing wins. After 10 rounds, the game ends, and players are ranked by lives left. Everyone else is ranked by the round they were knocked out.
- Timeout: refrain if allowed, otherwise attack a random player.

## 14. Blast Zone (about 60 s)

Formerly "Bombs" in the Wild Temple doc. Renamed so it isn't confused with Timebomb.

- 5 lives. 8 rounds. Shared grid: 6×6 for 4–6 players, 7×7 for 7–9, 8×8 for 10–12.
- Each round, secretly pick a step (one of the 8 neighbors, or stay) and a bomb target within 3 cells of where you'll end up.
- Moves resolve first, then all bombs land. A bomb lands on its target 50% of the time; otherwise it scatters to one of the 4 orthogonal neighbors that are still on the grid.
- A direct hit costs 2 lives. A bomb in one of the 8 cells around you costs 1. Hits stack, and you can hit yourself.
- **UI:** when aiming, hover a target to preview splash neighbors in yellow (separate from the orange target highlight).
- Survivors are ranked by lives left. Players blown up in the same round tie.
- Timeout: stay put and throw at a random cell in range that won't splash you if possible.

## 15. Disappearing Plates (until one remains)

- Shared grid: **9×9 for 4–6 players, 10×10 for 7–9, 11×11 for 10–12** (larger than Blast Zone because plates crumble every round).
- Each round, step to a neighboring plate (you must move; sharing a plate is allowed) and pick a plate to remove.
- Moves happen first, then removals. A removal aimed at an occupied plate goes to a random empty plate instead.
- **Every round, the plate you leave is removed** unless another player steps onto it that same round.
- Stall break: if nothing crumbled or was removed (e.g. two players swapping onto each other's plates), one empty plate is forced to fall; if none are empty, an occupied one falls.
- Mass-wipe rule: if everyone still alive would be eliminated in the same round, one player is spared (best landing after the move; random among ties) so the lobby doesn't all share 1st.
- No round limit. You're out when you have no neighboring plate left (or your plate is gone). Last one standing wins; players who fall in the same round tie, broken by how open their landing was.
- Timeout: a random valid step and a random empty plate.

## 16. Minefield Trek (about 53 s)

- 10-second secret placement: hide 4 mines anywhere except the start row. Then a 3-second get-ready, then a 40-second real-time race.
- The field is 10 rows deep and `players + 4` columns wide. Players start spread across the bottom row.
- Race with arrow keys or WASD. The server owns positions and mines. One step every 0.25 seconds in any of the 4 directions.
- Your own mines are visible to you and harmless. Stepping on someone else's mine sends you back to the start, frozen for 1 second. That mine is revealed only to you and stays armed for everyone else.
- Finishers are ranked by arrival time. Everyone else is ranked by the row they're on when time runs out.
- Timeout on placement: random mines.

## 17. Battleship (until one fleet remains)

- 15-second placement: hide ships of 5, 3, and 2 tiles, horizontal or vertical. Ships from different players may overlap; one shot hits every ship on that cell.
- Each firing round, secretly pick 2 cells (3 from firing round 8 on). You can't fire at your own ships or a cell that's already been fired on.
- Hits and misses are public. The owner of a ship is revealed only once it sinks.
- You're out when all three of your ships are sunk. No round limit. Last fleet afloat wins.
- Board: about 10×10 for 4 players up to 17×17 for 12.
- Timeout: random legal placement or random unfired cells.

## Not in this batch

- **Grid games still deferred:** Color Platforms, Lights Out, Checkers, Color Path.
- **Word and social games:** Hangman, The Impostor, Brawldle, and Code Cracker.
- **Too vague:** Hide and Seek.
- **Already covered:** Random.org, since random placement is what the minigames just replaced.
