import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { gameResultInput, gameResultValidationError, MAX_GAME_COMBO } from "../src/modules/engagement/result-input.js";

const answers = (combos: number[]) => combos.map((combo, index) => ({ wordId: `w${index}`, answer: "noun", attempts: 1, usedHint: false, combo }));

describe("game result validation", () => {
  it("accepts combos up to the shared maximum", () => {
    expect(gameResultInput.safeParse({ requestId: randomUUID(), answers: answers([1, 2, 3, 4, 5, 5, 5]) }).success).toBe(true);
  });

  it("names the combo range when a client sends an unclamped streak", () => {
    const parsed = gameResultInput.safeParse({ requestId: randomUUID(), answers: answers([1, 2, 3, 4, 5, 6]) });
    expect(parsed.success).toBe(false);
    const error = gameResultValidationError(parsed.error!);
    expect(error.code).toBe("INVALID_GAME_RESULT");
    expect(error.message).toBe(`answers[].combo must be an integer from 1 to ${MAX_GAME_COMBO}.`);
    expect(error.issues[0]?.path).toBe("answers.5.combo");
  });

  it("reports the first failing field for other invalid bodies", () => {
    const parsed = gameResultInput.safeParse({ requestId: "not-a-uuid", answers: answers([1]) });
    expect(gameResultValidationError(parsed.error!).message).toMatch(/^Invalid game result at requestId:/);
  });
});
