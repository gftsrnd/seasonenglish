// Shared display formatting for points, scores and percentages.
// Stored/computed values keep full precision; only the rendered text is rounded
// to at most two decimals, Vietnamese decimal comma, trailing zeros dropped
// (16.176470588235297 → "16,18", 25 → "25", 18.77 → "18,77", 4.4 → "4,4").

type ScoreInput = number | string | null | undefined;

function toFiniteNumber(value: ScoreInput): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return Number.isFinite(value) ? value : null;
}

/** Rounds half away from zero to two decimals, avoiding binary drift (e.g. 1.005 → 1.01). */
export function roundScore(value: number): number {
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Formats a score for display: at most two decimals, decimal comma, no trailing zeros. Non-numeric strings pass through; empty input returns the fallback. */
export function formatScore(value: ScoreInput, fallback = "—"): string {
  const number = toFiniteNumber(value);
  if (number === null) return typeof value === "string" && value.trim() ? value : fallback;
  return String(roundScore(number)).replace(".", ",");
}

/** "earned/max" with both sides formatted, e.g. formatScoreOutOf(4.41, 16.176) → "4,41/16,18". */
export function formatScoreOutOf(earned: ScoreInput, max: ScoreInput, fallback = "—"): string {
  return `${formatScore(earned, fallback)}/${formatScore(max, fallback)}`;
}

/** Percentage text with the same rounding, e.g. 66.666 → "66,67%". */
export function formatPercent(value: ScoreInput, fallback = "—"): string {
  const number = toFiniteNumber(value);
  return number === null ? fallback : `${formatScore(number)}%`;
}

/** Machine-friendly number for CSV/text exports: same two-decimal rounding, dot separator, no grouping. */
export function formatScoreForExport(value: ScoreInput): string {
  const number = toFiniteNumber(value);
  if (number === null) return typeof value === "string" ? value : "";
  return String(roundScore(number));
}
