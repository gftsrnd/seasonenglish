import { roundPointValues } from "@e4s/domain/engagement";

/** Points of one question for a round of `units` questions – the same whole numbers the score adds up. */
export function gamePointValues(units: number) {
  return roundPointValues(units);
}

/** The "Điểm" line of a game's tutorial, with the numbers of this round length (owner wording, 19/11). */
export function gameScoringLine(units: number): string {
  const { first, streak, assisted } = gamePointValues(units);
  const combo = units >= 3 ? ` · Từ câu thứ 3 đúng liên tiếp +${streak}` : "";
  return `Đúng ngay +${first}${combo} · Câu dùng gợi ý / thử lại +${assisted} · Sai: 0 · Tối đa 100.`;
}
