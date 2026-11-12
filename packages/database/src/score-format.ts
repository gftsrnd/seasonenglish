// Server-composed display text uses the same score format as the web UI
// (apps/web/src/app/shared/format-score.ts): at most one decimal, Vietnamese
// decimal comma, trailing zeros dropped. Stored values keep full precision.
export function formatDisplayScore(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 10) / 10;
  return String(Object.is(rounded, -0) ? 0 : rounded).replace(".", ",");
}
