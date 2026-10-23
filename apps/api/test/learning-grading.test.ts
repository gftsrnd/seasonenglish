import { describe, expect, it } from "vitest";
import { gradeMicroAttempt } from "../src/modules/learning/routes.js";

describe("micro lesson grading policy", () => {
  it("rejects a one-word self-writing answer before AI grading", () => {
    expect(gradeMicroAttempt({ type: "write", answer: "Okay", expected: "I confirm the meeting.", aiAvailable: true }))
      .toEqual({ status: "invalid", correct: false, reason: "minimum_two_words" });
  });

  it("normalizes punctuation for closed answers and queues open answers when AI is unavailable", () => {
    expect(gradeMicroAttempt({ type: "fill", answer: "  YES, please! ", expected: "Yes please", aiAvailable: false }))
      .toEqual({ status: "correct", correct: true });
    expect(gradeMicroAttempt({ type: "write", answer: "I can join Friday.", expected: "I can join on Friday.", aiAvailable: false }))
      .toEqual({ status: "manual_review", correct: null });
  });
});
