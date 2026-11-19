import { describe, expect, it } from "vitest";
import { gamePointValues, gameScoringLine } from "./scoring-rule.js";

describe("tutorial scoring line", () => {
  it("prints each game's numbers for its round length", () => {
    expect(gamePointValues(8)).toEqual({ first: 9, streak: 14, assisted: 5 });
    expect(gamePointValues(10)).toEqual({ first: 7, streak: 11, assisted: 4 });
    expect(gamePointValues(11)).toEqual({ first: 6, streak: 10, assisted: 3 });
    expect(gamePointValues(12)).toEqual({ first: 6, streak: 9, assisted: 3 });
    expect(gameScoringLine(8)).toBe("Đúng ngay +9 · Từ câu thứ 3 đúng liên tiếp +14 · Câu dùng gợi ý / thử lại +5 · Sai: 0 · Tối đa 100.");
    expect(gameScoringLine(2)).toBe("Đúng ngay +50 · Câu dùng gợi ý / thử lại +25 · Sai: 0 · Tối đa 100.");
  });
});
