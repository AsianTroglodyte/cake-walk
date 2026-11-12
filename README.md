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
```

## Simulations

```bash
pnpm play -- --players 6 --seed 1                 # print one bot match
pnpm sim -- --players 4,6,12 --matches 1000       # summarize many bot matches
```
