import type { RealtimeMinigameKind, RoundMinigameKind } from "../minigames";
import type { RealtimeGame, RoundGame } from "./framework";
import { battleship } from "./battleship";
import { blastZone } from "./blastZone";
import { fourCorners } from "./fourCorners";
import { groupDice } from "./groupDice";
import { headsTails } from "./headsTails";
import { higherLower } from "./higherLower";
import { insertCoins } from "./insertCoins";
import { laserFight } from "./laserFight";
import { minefield } from "./minefield";
import { plates } from "./plates";
import { rps } from "./rps";
import { shutBox } from "./shutBox";
import { stairway } from "./stairway";
import { theCount } from "./theCount";
import { threeCells } from "./threeCells";
import { timebomb } from "./timebomb";
import { yahtzee } from "./yahtzee";

export const ROUND_GAMES: Record<RoundMinigameKind, RoundGame> = {
  rps,
  stairway,
  groupDice,
  headsTails,
  insertCoins,
  threeCells,
  fourCorners,
  higherLower,
  theCount,
  yahtzee,
  shutBox,
  laserFight,
  blastZone,
  plates,
  battleship,
};

export const REALTIME_GAMES: Record<RealtimeMinigameKind, RealtimeGame> = { timebomb, minefield };

export * from "./framework";
export * from "./rps";
export * from "./stairway";
export * from "./groupDice";
export * from "./headsTails";
export * from "./insertCoins";
export * from "./threeCells";
export * from "./fourCorners";
export * from "./higherLower";
export * from "./theCount";
export * from "./yahtzee";
export * from "./shutBox";
export * from "./laserFight";
export * from "./timebomb";
export * from "./grid";
export * from "./blastZone";
export * from "./plates";
export * from "./minefield";
export * from "./battleship";
