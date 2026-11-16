# Beach Party

A multiplayer party board-game prototype: race to the finish, buy items, and play minigames.

## Setup

```bash
pnpm install
```

## Build, run, test

```bash
pnpm build          # build the client
pnpm start          # serve the game at http://localhost:2567
pnpm dev            # hot-reload client + server while developing
pnpm test           # run all unit tests
pnpm boss:test      # standalone boss-battle playtest at http://localhost:2568
```

## Boss encounter playtest

Run `pnpm boss:test` and open <http://localhost:2568/?test=boss>. This is a separate
server; the normal game and its full minigame rotation remain unchanged.

Pick a human, bot, win, loss, tie/reroll, or human-plus-bot preset, then **Start boss
test**. Showdown presets jump straight into a 2-, 4-, or 12-player free-for-all,
including a deterministic tie-and-elimination example. The encounter uses the real
server-controlled battle flow, including the 1-second bot choice buffer and
2-second roll reveals. After a boss loss it pauses on knockback instead of starting
a minigame. **Replay boss test** starts a fresh encounter with the selected settings
and seed.

## Simulations

```bash
pnpm play -- --players 6 --seed 1                 # print one bot match
pnpm sim -- --players 4,6,12 --matches 1000       # summarize many bot matches
```
