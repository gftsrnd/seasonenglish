import { roundRawMax } from "@e4s/domain/engagement";

/** Points of one question on the 100 scale for a round of `units` questions (rounded for display). */
export function gamePointValues(units: number) {
  const max = roundRawMax(units);
  if (max <= 0) return { first: 0, streak: 0, assisted: 0 };
  return { first: Math.round(1000 / max), streak: Math.round(1500 / max), assisted: Math.round(500 / max) };
}

/** The "Điểm" line of a game's tutorial, with the numbers of this round length (owner wording, 19/11). */
export function gameScoringLine(units: number): string {
  const { first, streak, assisted } = gamePointValues(units);
  const combo = units >= 3 ? ` · Từ câu thứ 3 đúng liên tiếp +${streak}` : "";
  return `Đúng ngay +${first}${combo} · Câu dùng gợi ý / thử lại +${assisted} · Sai: 0 · Tối đa 100.`;
}
