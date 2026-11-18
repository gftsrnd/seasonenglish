/**
 * Arena rating (XH) rules — RULE-DAU-TRUONG A.5, A.7, A.8.
 *
 * - Every learner starts each game, at each level and in each season, at 1 000.
 * - The base transfer comes from the 5-row table, using the ratings snapshotted when
 *   the match was accepted (the rating of the game being played, never the total).
 * - Meeting the same opponent again on the same Vietnam day (all six games, ranked only)
 *   scales the base: 100 % / 50 % / 25 % / 0 %.
 * - transfer = round half up(base × rate), capped at what the loser actually has
 *   (ratings never go below 0), so the winner gains exactly what the loser loses.
 */
import type { GameKey } from "./index.js";

export const ARENA_START_RATING = 1_000;
export const ARENA_GAMES: readonly GameKey[] = ["scramble", "crossword", "eggs", "mario", "sort", "typing"];
/** Ranked matches open per learner (posted and accepted together). */
export const ARENA_MAX_OPEN_RANKED = 3;
/** Hours an unaccepted challenge or invite stays open, and hours each side has to play. */
export const ARENA_ACCEPT_HOURS = 24;
export const ARENA_PLAY_HOURS = 24;
/** A season lasts three months. */
export const ARENA_SEASON_MONTHS = 3;
/** Fewest round units an arena set must deal. */
export const ARENA_MIN_ROUND_UNITS = 4;

export interface RatingBand {
  /** Points the learner gains when winning (before the repeat rate). */
  win: number;
  /** Points the learner loses when losing (before the repeat rate). */
  lose: number;
}

/**
 * The row of the 5-level table for a learner rated `own` against an opponent rated `opponent`.
 * Thresholds: a gap under 200 is even; 200–499 is one step; 500 or more is two steps.
 */
export function ratingBand(own: number, opponent: number): RatingBand {
  const gap = opponent - own;
  if (gap >= 500) return { win: 90, lose: 10 };
  if (gap >= 200) return { win: 75, lose: 25 };
  if (gap > -200) return { win: 50, lose: 50 };
  if (gap > -500) return { win: 25, lose: 75 };
  return { win: 10, lose: 90 };
}

/** Rate (percent) for the n-th ranked meeting of the same pair on one day. */
export function repeatDecay(meetingIndex: number): number {
  const index = Math.max(1, Math.trunc(meetingIndex));
  if (index === 1) return 100;
  if (index === 2) return 50;
  if (index === 3) return 25;
  return 0;
}

/** Integer round half up of base × percent / 100. */
export function decayedPoints(base: number, percent: number): number {
  return Math.floor((Math.max(0, base) * Math.max(0, percent) + 50) / 100);
}

export interface ArenaSettlement {
  base: number;
  percent: number;
  /** Points moved from the loser to the winner (0 for a draw). */
  transfer: number;
  winnerBefore: number;
  winnerAfter: number;
  loserBefore: number;
  loserAfter: number;
}

/**
 * Settles one decided ranked match. `winnerSnapshot`/`loserSnapshot` are the ratings
 * frozen at acceptance (they pick the table row); `winnerNow`/`loserNow` are the current
 * ratings the transfer is applied to (the loser can never go below 0).
 */
export function settle(input: {
  winnerSnapshot: number; loserSnapshot: number; meetingIndex: number;
  winnerNow: number; loserNow: number;
}): ArenaSettlement {
  const base = ratingBand(input.winnerSnapshot, input.loserSnapshot).win;
  const percent = repeatDecay(input.meetingIndex);
  const transfer = Math.min(Math.max(0, input.loserNow), decayedPoints(base, percent));
  return {
    base, percent, transfer,
    winnerBefore: input.winnerNow, winnerAfter: input.winnerNow + transfer,
    loserBefore: input.loserNow, loserAfter: input.loserNow - transfer
  };
}

export interface ArenaSideResult {
  /** Round score 0–100. */
  score: number;
  /** Valid active gameplay time, or null when it was missing or implausible. */
  gameplayMs: number | null;
}

export type ArenaDecision =
  | { winner: "a" | "b"; decidedBy: "score" | "time" }
  | { winner: null; decidedBy: "score" | "time" };

/**
 * A.5: the higher round score wins; on equal scores the shorter valid gameplay time wins,
 * but only when both played the same set; otherwise (or with equal times) it is a draw.
 */
export function decideOutcome(a: ArenaSideResult, b: ArenaSideResult, options: { sameSet: boolean }): ArenaDecision {
  if (a.score !== b.score) return { winner: a.score > b.score ? "a" : "b", decidedBy: "score" };
  if (options.sameSet && a.gameplayMs !== null && b.gameplayMs !== null && a.gameplayMs > 0 && b.gameplayMs > 0) {
    if (a.gameplayMs === b.gameplayMs) return { winner: null, decidedBy: "time" };
    return { winner: a.gameplayMs < b.gameplayMs ? "a" : "b", decidedBy: "time" };
  }
  return { winner: null, decidedBy: "score" };
}

/** Total of the six games of one level and season; a game not played yet counts 1 000. */
export function arenaTotal(ratings: Partial<Record<GameKey, number>>): number {
  return ARENA_GAMES.reduce((sum, game) => sum + (ratings[game] ?? ARENA_START_RATING), 0);
}
