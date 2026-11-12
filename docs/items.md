# Beach Party Prototype: Items

These are the 10 prototype items. Agreed rules for Floatie, Collision, prices, and the rotating shop are from Nov 12, 2026.

## How items work

- **Round 1 is just movement, then a minigame.** There's no item use and no shop until round 2.
- **When:** from round 2 on, players use and buy items in the same decision window as their die and path choice, and items resolve before anyone moves. Everyone picks secretly, and everything resolves together when the window ends.
- **One item per round.** Each player can use at most one item per round. Passive items (Floatie) don't count as a use.
- **Inventory limit: 3 items.** If you're full, you can't buy, and a minigame item reward is skipped.
- **Buy and use:** you can buy an item and use it in the same round.
- **Private inventory:** only you see your items. Using an item reveals it in the event log. The shop itself is public.
- **Resolution order:** defensive, then offensive (steals first), then self-only. Items in the same tier resolve simultaneously. Collisions (and Collision items) resolve after movement and traps.
- **Roll changes** apply to your movement roll this round. They don't apply to boss fights or showdowns.

## Item list

| # | Name | Tier | Target | Effect | Price |
|---|---|---|---|---|---|
| 1 | **Shield** | Defensive | You | Cancels every item used on you this round, including Coin Thief, Shove, Weight, Sand Die, and Collision. Doesn't stop traps. | 30 |
| 2 | **Coin Thief** | Offensive (steal) | 1 player | Steals 10 to 20 coins (random) from the target. You can't take more coins than they have. | 10 |
| 3 | **Weight** | Offensive | 1 player | The target's movement roll is reduced by 3 this round, but never below 0. Several Weights stack. | 7 |
| 4 | **Sand Die** | Offensive | 1 player | The target rolls a d3 for movement this round instead of the die they picked. A saved die they picked is **not** used up. | 12 |
| 5 | **Shove** | Offensive | 1 player | Sends the target back 5 spaces right away. It doesn't trigger a collision or the space they land on, and it **stops at the checkpoint behind them**. | 15 |
| 6 | **Collision** | Offensive | 1 player | After movement and traps, the target is sent back to the last checkpoint, even if nobody else is on their space. Reaching the finish doesn't protect them. | 20 |
| 7 | **Booster** | Self-only | You | Adds 3 to your movement roll this round. | 7 |
| 8 | **Extra Die** | Self-only | You | Rolls an extra d6 and adds it to your movement roll this round. | 15 |
| 9 | **Sand Trap** | Self-only (placement) | A space | Hides a trap on a space. See the trap rules below. | 10 |
| 10 | **Floatie** | Passive | You | While you hold it, the first time you would be sent back by a collision or a Collision item this round, you stay put and the Floatie is used up. Takes an inventory slot. | 15 |

## Combining items

- **Sand Die and Weight:** the d3 is rolled first, then each Weight takes off 3.
- **Weight and Booster:** Weights resolve before the target's own Booster. The roll can't go below 0 at any step.
- **Two Coin Thieves on one target:** they resolve simultaneously from a coin snapshot.
- **Shield against Shove, Coin Thief, or Collision:** the attacker's item is still used up.
- **Floatie against a real collision:** only the Floatie holder stays. Everyone else on that space still goes back.
- **Floatie against Collision:** Floatie saves you and is used up. One Floatie covers both a natural collision and a Collision item in the same round (consumed on the first save).
- **Using an item on yourself:** offensive items need another player as the target.

## Sand Trap rules

- **Placing:** pick any non-safe space up to 10 spaces ahead of you, on any path. The start, checkpoints, and finish can't hold traps.
- **Triggering:** the next **other** player whose final position (after movement and arrows) is the trap's space loses 5 to 15 coins (random) to the player who placed it. The trap is then used up. Passing over a trap doesn't trigger it.
- **Your own trap:** landing on it does nothing, and the trap stays.
- **Several players landing at once:** each of them loses coins. The trap only hits that round and is then used up.
- **Visibility:** only the player who placed it can see it on the board. Everyone sees it in the event log once it triggers.
- **One trap per space.** If two players place a trap on the same space in the same round, one of them is chosen at random and the other player gets their item back.
- **Order with collisions:** traps trigger before collisions send players back. A player can lose coins and still be sent back.

## Shop

- **5 items for sale each round,** the same list for everyone, unlimited stock (any number of players can buy the same item).
- **Always in the shop:** Booster, Weight, Floatie, Collision.
- **5th slot:** one random item from Shield, Coin Thief, Sand Die, Shove, Extra Die, and Sand Trap. The item in the 5th slot this round cannot be in the 5th slot next round.
- **Buying:** at most 1 item per round. You can use what you buy right away.
- **Purchases are private.** Other players only see that your coins went down. Everyone can see which 5 items are for sale.

## Minigame item rewards

- 1st place gets a random item from all 10, with equal odds.
- In "3 items up for grabs" minigames, 3 random items are shown, and the top 3 players pick in order.

## Bots

- A bot buys a random affordable shop item about half the time.
- A bot uses an item about half the time, with these targets:
  - Coin Thief: the richest player.
  - Weight, Sand Die, Shove, and Collision: the leader.
  - Sand Trap: a random space ahead of the bot.
  - Shield: only used if the bot is in 1st or 2nd place.
  - Floatie: never "used"; it works on its own.
