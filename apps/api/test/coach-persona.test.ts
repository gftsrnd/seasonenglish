import { describe, expect, it } from "vitest";
import type { CoachTaskOutput } from "@e4s/ai";
import { isAcknowledgementOnly, validateCoachPersonaOutput } from "../src/modules/coach/routes.js";

const output = (seasonReply: string, nextQuestion: string): CoachTaskOutput => ({
  evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Đúng trọng tâm." },
  seasonReply, seasonReplyTranslation: "Bản dịch.", nextQuestion, nextQuestionTranslation: "Bản dịch câu hỏi.",
  rubric: {
    meaning: { score: 4, evidence: "Evidence.", improvement: "Improve." },
    vocabulary: { score: 4, evidence: "Evidence.", improvement: "Improve." },
    grammar: { score: 4, evidence: "Evidence.", improvement: "Improve." }
  },
  corrections: [], correctedText: "",
  suggestedAnswer: { text: "I manage a small team.", translation: "Tôi quản lý một nhóm nhỏ." },
  usedWords: []
});

describe("Season persona output policy", () => {
  it("does not reject a short but meaningful A1 answer merely for brevity", () => {
    expect(isAcknowledgementOnly("ok")).toBe(true);
    expect(isAcknowledgementOnly("I agree.")).toBe(false);
  });

  it("accepts professional Formal language with ordinary emphasis and rejects contractions, slang, and emoji", () => {
    expect(validateCoachPersonaOutput(output("Great! Thank you for the clear answer.", "Could you describe your role?"), "formal")).toEqual([]);
    expect(validateCoachPersonaOutput(output("That's great, dude! 😊", "What's next?"), "formal")).toEqual(expect.arrayContaining([
      expect.stringContaining("contraction"), expect.stringContaining("slang"),
      expect.stringContaining("emoji")
    ]));
  });

  it("accepts friendly Informal language without requiring decorative punctuation", () => {
    expect(validateCoachPersonaOutput(output("That's clear 😊", "What do you do next?"), "informal")).toEqual([]);
    expect(validateCoachPersonaOutput(output("That is clear.", "What do you do next?"), "informal")).toEqual([]);
  });
});
