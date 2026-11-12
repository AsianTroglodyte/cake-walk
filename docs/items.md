# Beach Party Prototype: Items

These are the 8 prototype items from the design doc. Names, numbers, prices, and edge-case rulings marked **(proposed)** have not been decided yet. Change anything before it gets built.

## How items work

- **Round 1 is just movement, then a minigame.** There's no item use and no shop until round 2.
- **When:** from round 2 on, players use and buy items in the same decision window as their die and path choice, and items resolve before anyone moves. Everyone picks secretly, and everything resolves together when the window ends.
- **One item per round (proposed).** Each player can use at most one item per round. This keeps resolution readable with 12 players.
- **Inventory limit: 3 items (proposed).** If you're full, you can't buy, and a minigame item reward is skipped (or you can discard one).
- **Private:** only you see your items. Using an item reveals it in the event log.
- **Resolution order:** defensive, then offensive (steals first), then self-only. Items in the same tier resolve simultaneously.
- **Roll changes** apply to your movement roll this round. They don't apply to boss fights or showdowns, because items never affect the boss.

## Item list

| # | Name (proposed) | Tier | Target | Effect | Price (proposed) |
|---|---|---|---|---|---|
| 1 | **Shield** | Defensive | You | Cancels every item used on you this round, including Coin Thief, Shove, Weight, and Sand Die. Doesn't stop traps. | 6 |
| 2 | **Coin Thief** | Offensive (steal) | 1 player | Steals 5 to 10 coins (random) from the target. You can't take more coins than they have. | 6 |
| 3 | **Weight** | Offensive | 1 player | The target's movement roll is reduced by 3 this round, but never below 0. Several Weights stack. | 5 |
| 4 | **Sand Die** | Offensive | 1 player | The target rolls a d3 for movement this round instead of the die they picked. A saved die they picked is **not** used up (proposed). | 7 |
| 5 | **Shove** | Offensive | 1 player | Sends the target back 5 spaces right away. It doesn't trigger a collision or the space they land on, and it **stops at the checkpoint behind them** (proposed, same as arrows). | 9 |
| 6 | **Booster** | Self-only | You | Adds 3 to your movement roll this round. | 5 |
| 7 | **Extra Die** | Self-only | You | Rolls an extra d6 and adds it to your movement roll this round. This is an item, so it doesn't break the one-die-per-round dice rule. | 8 |
| 8 | **Sand Trap** | Self-only (placement) | A space | Hides a trap on a space. See the trap rules below. | 6 |

## Combining items (proposed)

These cases come up when several items hit the same player:

- **Sand Die and Weight:** the d3 is rolled first, then each Weight takes off 3. For example, a d3 roll of 2 with one Weight moves 0 spaces.
- **Weight and Booster:** Weights resolve before the target's own Booster, because offensive items come before self-only items. The roll can't go below 0 at any step. For example, a roll of 2 with one Weight drops to 0, then the Booster raises it to 3.
- **Two Coin Thieves on one target:** they resolve simultaneously. If the target doesn't have enough coins for both, the coins are split as evenly as possible, and a random thief gets any leftover coin.
- **Shield against Shove or Coin Thief:** the attacker's item is still used up.
- **Using an item on yourself:** offensive items need another player as the target.
- **Being Shoved:** the Shove happens before you roll, and your item still resolves normally, because nobody dies in the prototype.

## Sand Trap rules (proposed)

- **Placing:** pick any non-safe space up to 10 spaces ahead of you, on any path. The start, checkpoints, and finish can't hold traps.
- **Triggering:** the next **other** player whose final position (after movement and arrows) is the trap's space loses 5 to 15 coins (random) to the player who placed it. The trap is then used up. Passing over a trap doesn't trigger it.
- **Your own trap:** landing on it does nothing, and the trap stays.
- **Several players landing at once:** each of them loses coins. The trap only hits that round and is then used up.
- **Visibility:** only the player who placed it can see it on the board. Everyone sees it in the event log once it triggers.
- **One trap per space.** If two players place a trap on the same space in the same round, one of them is chosen at random and the other player gets their item back.
- **Order with collisions:** traps trigger before collisions send players back. A player can lose coins and still be sent back.

## Shop (proposed)

- **Fixed prices**, shown in the item list above.
- **Stock:** every item is always available. There's no shared stock and no auctions.
- **Buying:** at most 1 item per round, during the Items and Shop phase. A bought item can be used starting **next** round, so a single round can't combine buying and using the same item.
- **Purchases are private.** Other players only see that your coins went down.

## Minigame item rewards (proposed)

- 1st place gets a random item from the 8 in the list, with equal odds.
- In "3 items up for grabs" minigames, 3 random items are shown, and the top 3 players pick in order.

## Bots (proposed)

- A bot buys a random affordable item about half the time.
- A bot uses an item about half the time, with these targets:
  - Coin Thief: the richest player.
  - Weight, Sand Die, and Shove: the leader.
  - Sand Trap: a random space ahead of the bot.
  - Shield: only used if the bot is in 1st or 2nd place.
