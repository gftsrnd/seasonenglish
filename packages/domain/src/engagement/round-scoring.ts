/**
 * Shared 0–100 round score for all six mini games (RULE-DAU-TRUONG A.3, A.4).
 *
 * - first try: +10 for the 1st and 2nd answer of a streak, +15 from the 3rd in a row;
 * - hint or retry, then right: +5 and the streak breaks;
 * - wrong, skipped, timed out or not reached: 0 and the streak breaks.
 *
 * The denominator depends only on N, the number of units assigned when the round was
 * created, so ending early (lives lost, time up) never shrinks it.
 */
export const GAME_RULES_VERSION = 2;

export type RoundUnitOutcome = "first_try" | "assisted" | "wrong" | "skipped" | "timeout" | "unanswered";

export interface RoundScore {
  raw: number;
  rawMax: number;
  score: number;
}

/** Raw maximum when every one of the N units is right first time. */
export function roundRawMax(units: number): number {
  const count = Math.max(0, Math.trunc(units));
  if (count <= 0) return 0;
  return count === 1 ? 10 : 20 + 15 * (count - 2);
}

/** Points per unit in play order (index i ↔ units[i]); a missing answer is `unanswered`. */
export function roundUnitPoints(unitCount: number, answers: readonly RoundUnitOutcome[]): number[] {
  const points: number[] = [];
  let streak = 0;
  for (let index = 0; index < unitCount; index += 1) {
    const outcome = answers[index] ?? "unanswered";
    if (outcome === "first_try") {
      streak += 1;
      points.push(streak >= 3 ? 15 : 10);
    } else {
      streak = 0;
      points.push(outcome === "assisted" ? 5 : 0);
    }
  }
  return points;
}

/** Number of first-try answers in a row at the end of `answers` (the HUD combo). */
export function roundStreak(answers: readonly RoundUnitOutcome[]): number {
  let streak = 0;
  for (let index = answers.length - 1; index >= 0 && answers[index] === "first_try"; index -= 1) streak += 1;
  return streak;
}

export function scoreRound(units: readonly unknown[] | number, answers: readonly RoundUnitOutcome[]): RoundScore {
  const count = typeof units === "number" ? Math.max(0, Math.trunc(units)) : units.length;
  const rawMax = roundRawMax(count);
  const raw = roundUnitPoints(count, answers).reduce((sum, value) => sum + value, 0);
  // Integer half-up rounding: floor((200·raw + rawMax) / (2·rawMax)) avoids float drift at .5.
  const score = rawMax > 0 ? Math.min(100, Math.floor((200 * raw + rawMax) / (2 * rawMax))) : 0;
  return { raw, rawMax, score };
}
