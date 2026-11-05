import { describe, expect, it, vi } from "vitest";
import { coachOutputSchema, type CoachTaskOutput } from "@e4s/ai";
import {
  coachInsufficientFollowUp, coachPracticeTurnGateReason, coachQuestionForPersona, isAcknowledgementOnly, isInsufficientCoachInput,
  normalizeCoachVocabularyUnlocks, runCoachWithPersonaRepair, validateCoachPersonaOutput
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
  it("uses the configured A1 minimum-word gate for brief answers", () => {
    expect(isAcknowledgementOnly("ok")).toBe(true);
    expect(isAcknowledgementOnly("I agree.")).toBe(false);
    expect(isInsufficientCoachInput("I agree.", "A1")).toBe(true);
    expect(isInsufficientCoachInput("I agree with that idea.", "A1")).toBe(false);
  });

  it("classifies fragments below the A1 word threshold as insufficient", () => {
    expect(isInsufficientCoachInput("Maybe room.")).toBe(true);
    expect(isInsufficientCoachInput("Room 302.")).toBe(true);
    expect(isInsufficientCoachInput("Where is room 302?")).toBe(true);
    expect(isInsufficientCoachInput("Where is room 302 today?")).toBe(false);
  });

  it("accepts professional Formal language and rejects contractions, slang, emoji, and exclamation marks", () => {
    expect(validateCoachPersonaOutput(output("I understand. Could you describe your role?", "Could you describe your role?"), "formal")).toEqual([]);
    expect(validateCoachPersonaOutput(output("Great! Thank you for the clear answer.", "Could you describe your role?"), "formal"))
      .toContain("Formal reply contains an exclamation mark.");
    expect(validateCoachPersonaOutput(output("That's great, dude! 😊", "What's next?"), "formal")).toEqual(expect.arrayContaining([
      expect.stringContaining("contraction"), expect.stringContaining("slang"),
      expect.stringContaining("emoji")
    ]));
  });

  it("accepts friendly Informal language with the configured contraction and emoji", () => {
    expect(validateCoachPersonaOutput(output("I'm interested in your role. What do you do next? 😊", "What do you do next?"), "informal")).toEqual([]);
  });

  it("rejects teacher narration and a meta next question in a Season turn", () => {
    const teacherTurn = output(
      "Your opening sounds natural. Great! Now, how do you ask your colleague about the project? 😊",
      "What could you say next in this workplace situation?"
    );

    expect(validateCoachPersonaOutput(teacherTurn, "informal")).toEqual(expect.arrayContaining([
      "Season reply contains teacher or examiner narration.",
      "Next question must be an in-character anchor included verbatim in the Season reply."
    ]));
  });

  it("rejects mixed Vietnamese and teacher copy before it can reach the learner conversation", () => {
    const mixedTeacherTurn = output(
      "Hi, I'm good, thanks! Bạn mở đầu rất tự nhiên. What would you say to your colleague about the project? 😊",
      "What would you say to your colleague about the project?"
    );

    expect(validateCoachPersonaOutput(mixedTeacherTurn, "informal")).toEqual(expect.arrayContaining([
      "Season reply must be English-only; Vietnamese belongs in seasonReplyTranslation.",
      "Season reply contains teacher or examiner narration.",
      "Next question must be an in-character anchor included verbatim in the Season reply."
    ]));
  });

  it("permits a Vietnamese learner name in an otherwise English direct roleplay greeting", () => {
    expect(validateCoachPersonaOutput(output(
      "Hi Yến! I'm glad we can talk about this. What do you think about the project? 😊",
      "What do you think about the project?"
    ), "informal")).toEqual([]);
  });

  it("QA Đợt 4 L-056 requires Informal to use a contraction and exactly one emoji", () => {
    expect(validateCoachPersonaOutput(output("That is clear.", "What do you do next?"), "informal"))
      .toEqual(expect.arrayContaining([
        "Informal reply must contain a contraction.",
        "Informal reply must contain exactly one emoji."
      ]));
    expect(validateCoachPersonaOutput(output("That's clear 😊😊", "What do you do next?"), "informal"))
      .toContain("Informal reply must contain exactly one emoji.");
    expect(validateCoachPersonaOutput(output("I'm interested in your role. What do you do next? 😊", "What do you do next?"), "informal")).toEqual([]);
  });

  it("QA Đợt 4 L-052 requires Season to answer in two to four sentences", () => {
    expect(validateCoachPersonaOutput(output("Thanks.", "What do you do next?"), "formal"))
      .toContain("Season reply must contain between two and four sentences.");
    expect(validateCoachPersonaOutput(output(
      "Thank you. Your report is clear. The timeline is realistic. The owner is identified. Please proceed.",
      "What do you do next?"
    ), "formal")).toContain("Season reply must contain between two and four sentences.");
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

  it("rejects an excessively long example before it reaches the learner card", () => {
    const verbose = {
      ...output("Thank you. That is clear.", "What would you say next?"),
      suggestedAnswer: {
        text: Array.from({ length: 41 }, () => "word").join(" "),
        translation: "Ví dụ quá dài."
      }
    };

    expect(validateCoachPersonaOutput(verbose, "formal"))
      .toContain("Suggested answer is too long.");
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

  it("only opens configured secret words that the learner actually used in a valid sentence", () => {
    const claimed = { ...output("Good answer.", "What happens next?"), usedWords: ["agenda", "deadline", "invented"] };
    expect(normalizeCoachVocabularyUnlocks(claimed, "I sent the agenda today.", [
      { word: "agenda", meaning: "chương trình họp", opened: false },
      { word: "deadline", meaning: "hạn chót", opened: false }
    ]).usedWords).toEqual(["agenda"]);

    expect(normalizeCoachVocabularyUnlocks({
      ...claimed,
      evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Lạc đề." }
    }, "Agenda is a word.", [{ word: "agenda", meaning: "chương trình họp", opened: false }]).usedWords).toEqual([]);
  });

  it("keeps an accepted compact roleplay turn when independent feedback fails", async () => {
    const firstInvalid = { seasonReply: "Thanks for explaining that. Could you tell me a little more about your role? 😊", learnerQuestion: "Could you tell me a little more about your role?", suggestedLearnerReply: "I work in customer support and help clients." };
    const metadata = {
      traceId: "trace-repair-unit", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "a".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: firstInvalid, metadata })
      .mockRejectedValueOnce(new Error("Feedback provider unavailable"));
    const input = {
      message: "I manage a small team.", cefr: "B1", persona: "formal",
      mode: "practice", scenario: "Team management", currentQuestion: "What do you do?", priorTurns: []
    };

    const repaired = await runCoachWithPersonaRepair({ runTask }, input, "System prompt", "formal", {
      learnerMessage: input.message
    });

    expect(repaired.output.seasonReply).toMatch(/Could you tell me a little more about your role/);
    expect(repaired.output.nextQuestion).toMatch(/Could you tell me a little more about your role/);
    expect(repaired.output.feedbackStatus).toBe("unavailable");
    expect(repaired.output.evaluation.status).toBe("insufficient");
    expect(repaired.output.evaluation.countsTowardGoal).toBe(false);
    expect(runTask).toHaveBeenCalledTimes(2);
    const secondCallOptions = runTask.mock.calls[1]?.[2];
    expect(runTask.mock.calls[0]?.[0]).toBe("coach_roleplay_turn");
    expect(secondCallOptions?.systemPrompt).toContain("FEEDBACK ONLY");
  });

  it("keeps valid grading and translations when ignored feedback dialogue fields do not match the persona", async () => {
    const acceptedTurn = output("I see the key numbers clearly. Could you explain the growth figure?", "Could you explain the growth figure?");
    const feedbackWithIrrelevantDialogue: CoachTaskOutput = {
      ...output("That's great! 😊 What do you do now?", "What is the next step?"),
      evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Câu trả lời đúng và tự nhiên." },
      rubric: {
        meaning: { score: 5, evidence: "Câu trả lời nêu rõ các số liệu chính.", improvement: "" },
        vocabulary: { score: 5, evidence: "Từ vựng phù hợp với tình huống.", improvement: "" },
        grammar: { score: 5, evidence: "Câu có chủ ngữ và động từ chính xác.", improvement: "" }
      }
    };
    const metadata = {
      traceId: "trace-independent-feedback", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "f".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: acceptedTurn, metadata })
      .mockResolvedValueOnce({ output: feedbackWithIrrelevantDialogue, metadata });
    expect(coachOutputSchema.safeParse(feedbackWithIrrelevantDialogue).success).toBe(true);

    const result = await runCoachWithPersonaRepair({ runTask }, {
      message: "The client will see the key numbers first, like revenue and growth.", cefr: "A2", persona: "formal",
      mode: "practice", scenario: "Handling Client Feedback Meetings", currentQuestion: "What will the client see first?", priorTurns: []
    }, "System prompt", "formal", { learnerMessage: "The client will see the key numbers first, like revenue and growth." });

    expect(runTask).toHaveBeenCalledTimes(2);
    expect(runTask.mock.calls[1]?.[0]).toBe("coach_dialogue");
    expect(runTask.mock.calls[1]?.[2]?.maxAttempts).toBe(2);
    expect(result.output.feedbackStatus).toBeUndefined();
    expect(result.output.evaluation.countsTowardGoal).toBe(true);
    expect(result.output.rubric.meaning.score).toBe(5);
    expect(result.output.seasonReply).toBe(acceptedTurn.seasonReply);
    expect(result.output.seasonReplyTranslation).toBe("Bản dịch.");
    expect(result.output.suggestedAnswer.translation).toBe("Tôi quản lý một nhóm nhỏ.");
  });

  it("returns a genuine correction and its Vietnamese translation for a graded incorrect answer", async () => {
    const acceptedTurn = output("I'm clear on those numbers now. Could you explain the growth figure? 😊", "Could you explain the growth figure?");
    const incorrectFeedback: CoachTaskOutput = {
      ...output("That's useful. What do you think? 😊", "What do you think?"),
      evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi: "Ý đúng; cần sửa cấu trúc câu." },
      rubric: {
        meaning: { score: 4, evidence: "Câu trả lời nêu đúng trọng tâm.", improvement: "Nêu rõ ai sẽ xem các số liệu." },
        vocabulary: { score: 4, evidence: "Từ vựng phù hợp.", improvement: "" },
        grammar: { score: 2, evidence: "Câu thiếu chủ ngữ và chia động từ.", improvement: "Thêm chủ ngữ và dùng sees." }
      },
      corrections: [{ original: "Client see number first.", corrected: "The client sees the key numbers first.", translation: "Khách hàng sẽ xem các số liệu chính trước.", reason: "Thêm chủ ngữ và chia động từ ở ngôi thứ ba số ít." }],
      correctedText: "The client sees the key numbers first.",
      seasonReplyTranslation: "Tôi hiểu các số liệu rồi. Bạn có thể giải thích con số tăng trưởng của báo cáo không?",
      suggestedAnswer: { text: "The client will see the key numbers first.", translation: "Khách hàng sẽ xem các số liệu chính trước." }
    };
    const metadata = {
      traceId: "trace-incorrect-feedback", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "1".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: acceptedTurn, metadata })
      .mockResolvedValueOnce({ output: incorrectFeedback, metadata });
    const learnerMessage = "Client see number first.";
    expect(coachOutputSchema.safeParse(incorrectFeedback).success).toBe(true);
    expect(validateCoachPersonaOutput(acceptedTurn, "informal", { learnerMessage })).toEqual([]);

    const result = await runCoachWithPersonaRepair({ runTask }, {
      message: learnerMessage, cefr: "A2", persona: "informal", mode: "practice",
      scenario: "Handling Client Feedback Meetings", currentQuestion: "What will the client see first?", priorTurns: []
    }, "System prompt", "informal", { learnerMessage });

    expect(result.output.feedbackStatus).toBeUndefined();
    expect(result.output.evaluation.result).toBe("partially_correct");
    expect(result.output.rubric.grammar.score).toBe(2);
    expect(result.output.corrections[0]).toMatchObject({ corrected: "The client sees the key numbers first.", translation: "Khách hàng sẽ xem các số liệu chính trước." });
    expect(result.output.seasonReplyTranslation).toContain("Tôi hiểu các số liệu rồi.");
    expect(result.output.suggestedAnswer.translation).toBe("Khách hàng sẽ xem các số liệu chính trước.");
  });

  it("keeps first-turn feedback independent from an informal persona's accepted reply", async () => {
    const acceptedTurn = output("I'm glad the client understood the chart. What would you highlight next? 😊", "What would you highlight next?");
    const irrelevantFormalFeedback = output("I appreciate the update. Would you add one more detail?", "A different unrelated question?");
    const metadata = {
      traceId: "trace-first-turn-feedback", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "2".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn()
      .mockResolvedValueOnce({ output: acceptedTurn, metadata })
      .mockResolvedValueOnce({ output: irrelevantFormalFeedback, metadata });
    const learnerMessage = "The client will see the key numbers first, like revenue and growth.";
    const result = await runCoachWithPersonaRepair({ runTask }, {
      message: learnerMessage, cefr: "A2", persona: "informal", mode: "practice",
      scenario: "Handling Client Feedback Meetings", currentQuestion: "What will the client see first?", priorTurns: []
    }, "System prompt", "informal", { learnerMessage, currentQuestion: "What will the client see first?", priorQuestions: [] });

    expect(result.output.seasonReply).toBe(acceptedTurn.seasonReply);
    expect(result.output.nextQuestion).toBe(acceptedTurn.nextQuestion);
    expect(result.output.feedbackStatus).toBeUndefined();
    expect(result.output.evaluation.countsTowardGoal).toBe(true);
    expect(result.output.seasonReplyTranslation).toBe("Bản dịch.");
    expect(result.output.rubric.meaning.score).toBe(4);
  });

  it("keeps missing-word attempts out of scored turns while preserving an in-character Vietnamese prompt", () => {
    const message = "ok";
    expect(coachPracticeTurnGateReason(message, "A2", [])).toMatch(/chưa đủ/iu);
    const followUp = coachInsufficientFollowUp(message, "What will the client see first?", "Handling Client Feedback Meetings", "formal", []);
    expect(followUp.seasonReply).toContain(followUp.nextQuestion);
    expect(followUp.seasonReplyTranslation).toBeTruthy();
    expect(followUp.nextQuestionTranslation).toBeTruthy();
  });

  it("derives the in-character anchor from the final spoken question when a provider repeats a teacher prompt", async () => {
    const metaTurn = output(
      "I'm concerned about the deadline too. What would you say to your colleague about the deadline? 😊",
      "What would you say to your colleague about the deadline?"
    );
    const metadata = {
      traceId: "trace-roleplay-enforce", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "b".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn().mockResolvedValue({ output: metaTurn, metadata });
    const repaired = await runCoachWithPersonaRepair({ runTask }, {
      message: "I work in customer support.", cefr: "A2", persona: "informal",
      mode: "practice", scenario: "Project update", currentQuestion: "Tell me about your job.", priorTurns: []
    }, "System prompt", "informal", { learnerMessage: "I work in customer support." });

    expect(repaired.output.seasonReply).toContain("What do you think about the deadline?");
    expect(repaired.output.nextQuestion).toBe("What do you think about the deadline?");
    expect(validateCoachPersonaOutput(repaired.output, "informal")).toEqual([]);
  });

  it("locally converts a provider's meta question addressed to Season into direct dialogue", async () => {
    const metaTurn = output(
      "Hi Yến! 😊 Thanks for your report, it's very clear. But slide 3 has a lot of text. What would you say to me about it?",
      "What would you say to me about it?"
    );
    const metadata = {
      traceId: "trace-season-addressed-meta", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "c".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn().mockResolvedValue({ output: metaTurn, metadata });
    const repaired = await runCoachWithPersonaRepair({ runTask }, {
      message: "I work in customer support.", cefr: "A2", persona: "informal",
      mode: "practice", scenario: "Project update", currentQuestion: "Tell me about your job.", priorTurns: []
    }, "System prompt", "informal", { learnerMessage: "I work in customer support." });

    expect(repaired.output.seasonReply).not.toMatch(/what would you say|your report/iu);
    expect(validateCoachPersonaOutput(repaired.output, "informal")).toEqual([]);
  });

  it("removes mixed-language teaching prose and preserves the remaining direct English roleplay", async () => {
    const mixedTurn = output(
      "Hi Yến! Bạn mở đầu tốt. Could you tell me more about your role? 😊",
      "Could you tell me more about your role?"
    );
    const metadata = {
      traceId: "trace-mixed-language-repair", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "d".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn().mockResolvedValue({ output: mixedTurn, metadata });
    const repaired = await runCoachWithPersonaRepair({ runTask }, {
      message: "I work in customer support.", cefr: "A2", persona: "informal",
      mode: "practice", scenario: "Project update", currentQuestion: "Tell me about your job.", priorTurns: []
    }, "System prompt", "informal", { learnerMessage: "I work in customer support." });

    expect(repaired.output.seasonReply).not.toMatch(/[\u00c0-\u024f\u1e00-\u1eff]/u);
    expect(repaired.output.seasonReply).toContain("Which project are you working on this week?");
    expect(validateCoachPersonaOutput(repaired.output, "informal")).toEqual([]);
  });

  it("falls back to a safe direct partner turn when no usable English dialogue remains", async () => {
    const unusableTurn = output(
      "Bạn đã trả lời tốt. What would you say to your colleague about the project? 😊",
      "What would you say to your colleague about the project?"
    );
    const metadata = {
      traceId: "trace-unusable-roleplay-repair", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "e".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const runTask = vi.fn().mockResolvedValue({ output: unusableTurn, metadata });
    const repaired = await runCoachWithPersonaRepair({ runTask }, {
      message: "I work in customer support.", cefr: "A2", persona: "informal",
      mode: "practice", scenario: "Project update", currentQuestion: "Tell me about your job.", priorTurns: []
    }, "System prompt", "informal", { learnerMessage: "I work in customer support." });

    expect(repaired.output.seasonReply).toMatch(/What do you think about the project\?|Could you tell me a little more about your role\?/);
    expect(repaired.output.seasonReply).not.toMatch(/what would you say|bạn đã trả lời/iu);
    expect(validateCoachPersonaOutput(repaired.output, "informal")).toEqual([]);
  });
});
