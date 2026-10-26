import { describe, expect, it } from "vitest";
import type { CoachTaskOutput } from "@e4s/ai";
import {
  coachQuestionForPersona, isAcknowledgementOnly, isInsufficientCoachInput, validateCoachPersonaOutput
} from "../src/modules/coach/routes.js";

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

  it("classifies sentence fragments with fewer than three words as insufficient", () => {
    expect(isInsufficientCoachInput("Maybe room.")).toBe(true);
    expect(isInsufficientCoachInput("Room 302.")).toBe(true);
    expect(isInsufficientCoachInput("Where is room 302?")).toBe(false);
    expect(isInsufficientCoachInput("I agree.")).toBe(false);
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

  it("rejects a suggested answer that re-asks the quoted question instead of replying", () => {
    const inconsistent = {
      ...output(
        "Thank you for your answer.",
        'The colleague asks, "Do you know where the lift is?" How would you reply?'
      ),
      suggestedAnswer: {
        text: "Thank you. Could you tell me where the lift is?",
        translation: "Cảm ơn. Bạn có thể cho tôi biết thang máy ở đâu không?"
      }
    };

    expect(validateCoachPersonaOutput(inconsistent, "formal"))
      .toContain("Suggested answer re-asks the quoted question instead of replying to it.");
  });

  it("rejects grading the exact previous suggested answer as off-topic", () => {
    const wronglyRejected: CoachTaskOutput = {
      ...output("That does not answer the question.", "What do you do in the product team?"),
      evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Chưa đúng câu hỏi." },
      rubric: {
        ...output("x", "y").rubric,
        meaning: { score: 0, evidence: "Off topic.", improvement: "Answer the question." }
      },
      usedWords: []
    };

    expect(validateCoachPersonaOutput(wronglyRejected, "informal", {
      learnerMessage: "I manage a small team.", previousSuggestedAnswer: "I manage a small team."
    })).toContain("The learner used the exact previous suggested answer, so it cannot be graded off-topic or insufficient.");
  });

  it("expands contractions in the active question for the Formal persona", () => {
    expect(coachQuestionForPersona("Let's practise. What's your answer? 😊", "formal"))
      .toBe("Let us practise. What is your answer?");
  });
});
