/**
 * Shared 0–100 round score for all six mini games (RULE-DAU-TRUONG A.3, A.4).
 *
 * - first try: +10 for the 1st and 2nd answer of a streak, +15 from the 3rd in a row;
 * - hint or retry, then right: +5 and the streak breaks;
 * - wrong, skipped, timed out or not reached: 0 and the streak breaks.
 *
 * The denominator depends only on N, the number of units assigned when the round was
 * created, so ending early (lives lost, time up) never shrinks it.
 *
 * Shown points (owner, 19/11): each question is worth its raw value on the 100 scale, rounded
 * to a whole number (8 questions: +9 / +14 / +5). The round score is the sum of those shown
 * points, so the HUD, the tutorial line and the result always add up. A round that is right
 * first time throughout is exactly 100 (rounding would give 99–102; only a perfect round can).
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

/** A raw unit value on the 100 scale, rounded half-up in integers (no float drift at .5). */
function shown(rawPoints: number, rawMax: number): number {
  return rawMax > 0 ? Math.floor((200 * rawPoints + rawMax) / (2 * rawMax)) : 0;
}

/** The whole-number points shown for one question of an N-question round: right first time, in a streak, assisted. */
export function roundPointValues(units: number): { first: number; streak: number; assisted: number } {
  const rawMax = roundRawMax(units);
  return { first: shown(10, rawMax), streak: shown(15, rawMax), assisted: shown(5, rawMax) };
}

/** Shown points per question in play order; their sum is the round score. */
export function roundShownPoints(unitCount: number, answers: readonly RoundUnitOutcome[]): number[] {
  const rawMax = roundRawMax(unitCount);
  return roundUnitPoints(unitCount, answers).map((value) => shown(value, rawMax));
}

export function scoreRound(units: readonly unknown[] | number, answers: readonly RoundUnitOutcome[]): RoundScore {
  const count = typeof units === "number" ? Math.max(0, Math.trunc(units)) : units.length;
  const rawMax = roundRawMax(count);
  const raw = roundUnitPoints(count, answers).reduce((sum, value) => sum + value, 0);
  const perfect = count > 0 && Array.from({ length: count }, (_, index) => answers[index]).every((outcome) => outcome === "first_try");
  const sum = roundShownPoints(count, answers).reduce((total, value) => total + value, 0);
  const score = rawMax > 0 ? (perfect ? 100 : Math.min(100, sum)) : 0;
  return { raw, rawMax, score };
}
