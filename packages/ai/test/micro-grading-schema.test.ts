import { describe, expect, it } from "vitest";
import { microGradingOutputSchema } from "../src/schemas.js";

describe("micro grading evidence contract", () => {
  it("requires an explicit cited error when feedback claims a learner error", () => {
    expect(microGradingOutputSchema.safeParse({
      correct: false,
      score: 3,
      feedback: "Use joined instead of join.",
      citedError: "join"
    }).success).toBe(true);
    expect(microGradingOutputSchema.safeParse({
      correct: false,
      score: 3,
      feedback: "Use joined instead of join."
    }).success).toBe(false);
  });

  it("accepts null evidence when feedback does not claim a specific error", () => {
    expect(microGradingOutputSchema.safeParse({
      correct: true,
      score: 10,
      feedback: "Clear and complete answer.",
      citedError: null
    }).success).toBe(true);
  });
});
