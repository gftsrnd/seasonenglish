import { describe, expect, it, vi } from "vitest";
import { coachOutputSchema, type CoachTaskOutput } from "@e4s/ai";
import {
  coachInsufficientFollowUp, coachPracticeTurnGateReason, coachQuestionForPersona, isAcknowledgementOnly, isInsufficientCoachInput,
  normalizeCoachVocabularyUnlocks, runCoachWithPersonaRepair, validateCoachPersonaOutput,
  containsVietnameseLearnerText, countCoachWords, isBlockingRoleplayViolation, logRoleplayDiagnostics,
  repeatCurrentQuestionForOffTopic, coachCurrentQuestion, coachQuestionKey, finalizeCoachEvaluation, informalRegisterMarkers,
  COACH_FEEDBACK_MAX_OUTPUT_TOKENS
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

  it("keeps valid grading but drops a feedback translation that describes a different Season turn", async () => {
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
    // The feedback call translated its own reply, not the accepted turn.
    expect(result.output.seasonReplyTranslation).toBe("");
    expect(result.output.nextQuestionTranslation).toBe("");
    // The example text matches the accepted turn, so its translation stays.
    expect(result.output.suggestedAnswer.translation).toBe("Tôi quản lý một nhóm nhỏ.");
  });

  it("returns a genuine correction and its Vietnamese translation for a graded incorrect answer", async () => {
    const acceptedTurn = {
      ...output("I'm clear on those numbers now. Could you explain the growth figure? 😊", "Could you explain the growth figure?"),
      suggestedAnswer: { text: "The client will see the key numbers first.", translation: "Khách hàng sẽ xem các số liệu chính trước." }
    };
    const incorrectFeedback: CoachTaskOutput = {
      // FEEDBACK ONLY asks the evaluator to copy the accepted turn verbatim.
      ...output(acceptedTurn.seasonReply, acceptedTurn.nextQuestion),
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
    expect(result.output.seasonReplyTranslation).toBe("");
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

    expect(repaired.output.seasonReply).not.toMatch(/what would you say/iu);
    expect(repaired.output.seasonReply).toContain("What do you think about it?");
    expect(repaired.output.nextQuestion).toBe("What do you think about it?");
    expect(repaired.roleplay.fallbackViolations).toBeUndefined();
    expect(validateCoachPersonaOutput(repaired.output, "informal").filter(isBlockingRoleplayViolation)).toEqual([]);
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

    // Only the greeting name may carry Vietnamese letters; the prose is gone.
    expect(repaired.output.seasonReply.replace(/^Hi Yến!\s*/u, "")).not.toMatch(/[\u00c0-\u024f\u1e00-\u1eff]/u);
    expect(repaired.output.seasonReply).not.toContain("Bạn mở đầu");
    expect(repaired.output.seasonReply).toContain("Could you tell me more about your role?");
    expect(repaired.output.seasonReply).not.toContain("That's clear");
    expect(repaired.roleplay.fallbackViolations).toBeUndefined();
    expect(validateCoachPersonaOutput(repaired.output, "informal").filter(isBlockingRoleplayViolation)).toEqual([]);
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
    expect(validateCoachPersonaOutput(repaired.output, "informal").filter(isBlockingRoleplayViolation)).toEqual([]);
  });

  describe("WP4 Season/Coach fixes", () => {
    const metadata = {
      traceId: "trace-wp4", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "9".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const baseInput = (message: string, persona: "informal" | "formal") => ({
      message, cefr: "A2", persona, mode: "practice", scenario: "Project update", currentQuestion: "How is the project going?", priorTurns: []
    });
    const roleplay = (seasonReply: string, learnerQuestion: string) => ({
      seasonReply, learnerQuestion, suggestedLearnerReply: "We finished the design and we will test it on Friday."
    });

    it("(a) keeps an Informal turn without a contraction and never adds a canned prefix", async () => {
      const turn = roleplay("That is good news about the design. When will the team start testing it?", "When will the team start testing it?");
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(new Error("feedback down"));
      const learnerMessage = "We finished the new design for the client yesterday.";
      const result = await runCoachWithPersonaRepair({ runTask }, baseInput(learnerMessage, "informal"), "System prompt", "informal", { learnerMessage });

      expect(result.output.seasonReply).toBe("That is good news about the design. When will the team start testing it? 😊");
      expect(result.output.seasonReply).not.toMatch(/That's clear/u);
      expect(result.output.nextQuestion).toBe("When will the team start testing it?");
      expect(result.roleplay.fallbackViolations).toBeUndefined();
      expect(result.roleplay.warnings).toContain("Informal reply must contain a contraction.");
      expect(runTask).toHaveBeenCalledTimes(2);
    });

    it("(a) normalises Formal style findings locally instead of falling back", async () => {
      const turn = roleplay("Great! That's a clear plan. When can you share the test results?", "When can you share the test results?");
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(new Error("feedback down"));
      const learnerMessage = "We will test the new feature with two clients next week.";
      const result = await runCoachWithPersonaRepair({ runTask }, baseInput(learnerMessage, "formal"), "System prompt", "formal", { learnerMessage });

      expect(result.output.seasonReply).toBe("Great. That is a clear plan. When can you share the test results?");
      expect(result.roleplay.fallbackViolations).toBeUndefined();
      expect(result.roleplay.modelViolations).toEqual(expect.arrayContaining([
        "Formal reply contains a contraction.", "Formal reply contains an exclamation mark."
      ]));
    });

    it("(a) still falls back on a blocking violation such as a repeated question", async () => {
      const turn = roleplay("Thanks for the update on the design. How is the project going?", "How is the project going?");
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(new Error("feedback down"));
      const learnerMessage = "We finished the new design for the client yesterday.";
      // "How is the project going?" was asked and answered earlier; the open
      // question is a different one, so asking it again is a genuine repeat.
      const result = await runCoachWithPersonaRepair({ runTask }, baseInput(learnerMessage, "formal"), "System prompt", "formal", {
        learnerMessage, currentQuestion: "What did the client say about the design?", topic: "Project update",
        priorQuestions: ["How is the project going?", "What did the client say about the design?"]
      });

      expect(result.output.seasonReply).not.toContain("How is the project going?");
      expect(result.roleplay.fallbackViolations).toEqual(["Season repeated a question already asked in this month's topic."]);
    });

    it("(b) trims a long Season reply to four sentences and keeps the final question", async () => {
      const turn = roleplay(
        "Thanks for the update. The design looks clean. The client liked the colours. The layout is simple. The team is happy. When can we test it with real users?",
        "When can we test it with real users?"
      );
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(new Error("feedback down"));
      const learnerMessage = "We finished the new design for the client yesterday.";
      const result = await runCoachWithPersonaRepair({ runTask }, baseInput(learnerMessage, "formal"), "System prompt", "formal", { learnerMessage });

      expect(result.output.seasonReply).toBe("Thanks for the update. The design looks clean. The client liked the colours. When can we test it with real users?");
      expect(result.output.nextQuestion).toBe("When can we test it with real users?");
      expect(validateCoachPersonaOutput(result.output, "formal")).not.toContain("Season reply must contain between two and four sentences.");
      expect(result.roleplay.fallbackViolations).toBeUndefined();
    });

    it("(c) gives a fallback turn its own translations and asks feedback to translate only the accepted turn", async () => {
      const turn = roleplay("Thanks for the update on the design. How is the project going?", "How is the project going?");
      const feedback: CoachTaskOutput = {
        ...output("A different reply. What else?", "What else?"),
        seasonReplyTranslation: "Bản dịch của một câu khác.", nextQuestionTranslation: "Còn gì nữa?"
      };
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockResolvedValueOnce({ output: feedback, metadata });
      const learnerMessage = "We finished the new design for the client yesterday.";
      const context = {
        learnerMessage, currentQuestion: "What did the client say about the design?", topic: "Project update",
        priorQuestions: ["How is the project going?", "What did the client say about the design?"]
      };
      const result = await runCoachWithPersonaRepair({ runTask }, baseInput(learnerMessage, "formal"), "System prompt", "formal", context);
      const expected = coachInsufficientFollowUp(learnerMessage, context.currentQuestion, context.topic, "formal", context.priorQuestions);

      expect(result.output.seasonReply).toBe(expected.seasonReply);
      expect(result.output.seasonReplyTranslation).toBe(expected.seasonReplyTranslation);
      expect(result.output.nextQuestionTranslation).toBe(expected.nextQuestionTranslation);
      expect(result.output.suggestedAnswer.translation).toMatch(/Tôi sẽ chia sẻ/u);
      expect(result.output.evaluation.countsTowardGoal).toBe(true);
      const feedbackPrompt = String(runTask.mock.calls[1]?.[2]?.systemPrompt);
      expect(feedbackPrompt).toContain("seasonReply copied verbatim from ACCEPTED TURN.seasonReply");
      expect(feedbackPrompt).toContain("faithful Vietnamese translations of exactly those copied texts");
      expect(feedbackPrompt).not.toContain("will be ignored");
    });

    it("(e) rejects a learner answer that mixes in Vietnamese and never builds the follow-up on a Vietnamese word", () => {
      const message = "The design ready vào thứ Sáu, em gửi anh nhé.";
      expect(containsVietnameseLearnerText(message)).toBe(true);
      expect(coachPracticeTurnGateReason(message, "A2", [])).toMatch(/tiếng Việt/u);
      expect(containsVietnameseLearnerText("My manager Lê reviews the design plan with José today.")).toBe(false);
      expect(coachPracticeTurnGateReason("My manager Lê reviews the design plan with José today.", "A2", [])).toBeUndefined();
      const followUp = coachInsufficientFollowUp(message, "When is the design ready?", "Project update", "formal", []);
      expect(followUp.seasonReply).not.toMatch(/nhé|anh|gửi/u);
      expect(countCoachWords("I would ask the client which part of the plan needs work.")).toBe(12);
    });

    it("(f) does not append the current question when an off-topic reply already ends with a question", () => {
      const offTopic: CoachTaskOutput = {
        ...output("Let us return to the design. Could you tell me when the new design will be ready? 😊", "Could you tell me when the new design will be ready?"),
        evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Lạc đề." }
      };
      const repeated = repeatCurrentQuestionForOffTopic(offTopic, "Good morning, Lan. When will the new design be ready?");
      expect(repeated.seasonReply).toBe(offTopic.seasonReply);
      expect(repeated.nextQuestion).toBe("Could you tell me when the new design will be ready?");
      const noQuestion = repeatCurrentQuestionForOffTopic({ ...offTopic, seasonReply: "Let us return to the design." }, "When will it be ready?");
      expect(noQuestion.seasonReply).toBe("Let us return to the design. When will it be ready?");
      expect(noQuestion.nextQuestion).toBe("When will it be ready?");
    });

    it("(h) logs the blocking violations of every fallback turn as structured data", () => {
      const log = { warn: vi.fn(), info: vi.fn() };
      logRoleplayDiagnostics(log, "req-1", "practice", {
        modelViolations: ["Season repeated a question already asked in this month's topic."], warnings: [],
        fallbackViolations: ["Season repeated a question already asked in this month's topic."]
      });
      expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({
        code: "SEASON_ROLEPLAY_FALLBACK", requestId: "req-1", mode: "practice",
        violations: ["Season repeated a question already asked in this month's topic."]
      }), expect.any(String));
      logRoleplayDiagnostics(log, "req-2", "practice", { modelViolations: ["Informal reply must contain a contraction."], warnings: ["Informal reply must contain a contraction."] });
      expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ code: "SEASON_ROLEPLAY_REPAIRED", requestId: "req-2" }), expect.any(String));
      logRoleplayDiagnostics(log, "req-3", "practice", { modelViolations: [], warnings: [] });
      expect(log.warn).toHaveBeenCalledTimes(1);
      expect(log.info).toHaveBeenCalledTimes(1);
    });
  });

  // Samples below are copied from .artifacts/ai-quality-remeasure-2026-11-11/out.
  describe("Round-2 Season/Coach fixes (re-measure samples)", () => {
    const metadata = {
      traceId: "trace-round2", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 10, inputHash: "7".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    };
    const input = (message: string, persona: "informal" | "formal", cefr: string, currentQuestion: string) => ({
      message, cefr, persona, mode: "practice", scenario: "Handling Client Feedback Meetings", currentQuestion, priorTurns: []
    });
    const opening = "Good morning. Let us practise \"Handling Client Feedback Meetings\". A client has concerns about your latest update. What would you say to understand their feedback?";
    const feedbackDown = Object.assign(new Error("feedback down"), { code: "AI_PROVIDER_UNAVAILABLE" });

    it("1: re-asking the still-open current question is not a repeated question (conv-A1 turn 2)", async () => {
      const currentQuestion = "Could you tell me when we can expect the final report?";
      const learnerMessage = "The client wants a new colour for the button.";
      const turn = {
        seasonReply: "Thank you for your feedback. I will note the new colour for the button. Could you tell me when we can expect the final report?",
        learnerQuestion: currentQuestion,
        suggestedLearnerReply: "We can expect the final report on Friday."
      };
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(feedbackDown);
      const result = await runCoachWithPersonaRepair({ runTask }, input(learnerMessage, "formal", "A1", currentQuestion), "System prompt", "formal", {
        learnerMessage, currentQuestion, topic: "Handling Client Feedback Meetings", priorQuestions: [opening, currentQuestion]
      });

      expect(result.roleplay.fallbackViolations).toBeUndefined();
      expect(result.output.seasonReply).toBe(turn.seasonReply);
      expect(result.output.seasonReply).not.toContain("next step for");
    });

    it("1: compares the core question, ignoring a lead-in clause, contractions and please (conv-B1 turns 3-5)", async () => {
      expect(coachQuestionKey("Before we agree on an extra week, could you explain which part of the timeline you think is unrealistic?"))
        .toBe(coachQuestionKey("Could you please explain which part of the timeline you think is unrealistic?"));
      expect(coachQuestionKey("What's the next step?")).toBe(coachQuestionKey("What is the next step"));
      expect(coachQuestionKey("Could you tell me which milestone you believe is unrealistic?"))
        .not.toBe(coachQuestionKey("Could you tell me which milestone on the timeline you believe is unrealistic?"));

      const currentQuestion = "Could you tell me which milestone you believe is unrealistic, and what evidence supports that view?";
      const learnerMessage = "I would explain that a rushed release could cause more bugs and delay the project even longer.";
      const turn = {
        seasonReply: "Thank you for your reply. A rushed release is a fair concern, and I would like to understand your view better. Could you tell me which milestone you believe is unrealistic, and what evidence supports that view?",
        learnerQuestion: currentQuestion,
        suggestedLearnerReply: "I think the testing milestone is unrealistic because our last release needed three weeks of bug fixes."
      };
      const priorQuestions = [
        opening,
        "Before we agree on an extra week, could you explain which part of the timeline you think is unrealistic?",
        "Could you tell me which milestone on the timeline you believe is unrealistic, and what evidence supports that view?",
        currentQuestion
      ];
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(feedbackDown);
      const kept = await runCoachWithPersonaRepair({ runTask }, input(learnerMessage, "formal", "B1", currentQuestion), "System prompt", "formal", {
        learnerMessage, currentQuestion, topic: "Handling Client Feedback Meetings", priorQuestions
      });
      expect(kept.roleplay.fallbackViolations).toBeUndefined();
      expect(kept.output.seasonReply).toBe(turn.seasonReply);

      // A genuine repeat of an earlier, already answered question still falls back.
      const repeat = { ...turn, seasonReply: "Thank you. Could you please explain which part of the timeline you think is unrealistic?", learnerQuestion: "Could you please explain which part of the timeline you think is unrealistic?" };
      const repeatTask = vi.fn().mockResolvedValueOnce({ output: repeat, metadata }).mockRejectedValueOnce(feedbackDown);
      const replaced = await runCoachWithPersonaRepair({ runTask: repeatTask }, input(learnerMessage, "formal", "B1", currentQuestion), "System prompt", "formal", {
        learnerMessage, currentQuestion, topic: "Handling Client Feedback Meetings", priorQuestions
      });
      expect(replaced.roleplay.fallbackViolations).toEqual(["Season repeated a question already asked in this month's topic."]);
    });

    it("1: the fallback question never leaks a stray quote into the next turn (conv-A1 turn 2 -> 3)", () => {
      const followUp = coachInsufficientFollowUp("The client wants a new colour for the button.", "Could you tell me when we can expect the final report?",
        "Handling Client Feedback Meetings", "formal", []);
      expect(followUp.seasonReply).toBe("I hear you mention “button”. What is the next step for “button”?");
      const offTopic: CoachTaskOutput = {
        ...output(followUp.seasonReply, followUp.nextQuestion),
        evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Lạc đề." },
        rubric: { ...output("a", "b").rubric, meaning: { score: 0, evidence: "Lạc đề.", improvement: "" } }
      };
      const stored = repeatCurrentQuestionForOffTopic(offTopic, "Could you tell me when we can expect the final report?");
      expect(stored.nextQuestion).toBe("What is the next step for “button”?");
      // Turns already stored with the broken anchor are cleaned when read back.
      expect(coachCurrentQuestion([{ speaker: "coach", text: "x", feedback: { nextQuestion: "” What is the next step for “button”?" } }], "fallback"))
        .toBe("What is the next step for “button”?");
      // A time word is not a useful focus ("the next step for “day”").
      expect(coachInsufficientFollowUp("My team checks the file every day.", "What will you do after lunch?", "Topic", "formal", []).nextQuestion)
        .toBe("What is the next step for “file”?");
    });

    it("1: an in-character question about a third party is a valid anchor (coach-A1 offtopic-informal)", async () => {
      const currentQuestion = "Hi! The client says the report is late. What do you tell the client?";
      const learnerMessage = "I like to eat pho with my family on Sunday.";
      const turn = {
        seasonReply: "Oh, that sounds lovely! 😊 Now, back to our meeting: the report is late, and the client is upset. What do you say to the client?",
        learnerQuestion: "What do you say to the client?",
        suggestedLearnerReply: "I am sorry. The report is late. I will send it today."
      };
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(feedbackDown);
      const result = await runCoachWithPersonaRepair({ runTask }, input(learnerMessage, "informal", "A1", currentQuestion), "System prompt", "informal", {
        learnerMessage, currentQuestion, topic: "Handling Client Feedback Meetings", priorQuestions: [currentQuestion]
      });
      expect(result.roleplay.fallbackViolations).toBeUndefined();
      expect(result.output.seasonReply).toContain("What do you say to the client?");
      expect(result.output.nextQuestion).toBe("What do you say to the client?");
      // An unaddressed "What do you say?" stays a meta prompt.
      expect(validateCoachPersonaOutput(output("I see. What do you say?", "What do you say?"), "formal"))
        .toContain("Next question must be an in-character anchor included verbatim in the Season reply.");
    });

    it("2: slang in an on-topic Formal answer counts and only lowers the meaning score (coach-B1 register-formal)", async () => {
      const currentQuestion = "Thank you for joining. How would you like to handle the client's request for an earlier deadline?";
      const learnerMessage = "Hey, gimme the file and we just do it faster lol, no big deal.";
      const turn = {
        seasonReply: "I appreciate your quick response, but I would like to be careful with this request. Before we agree to an earlier deadline, we should first check the project plan and the team's current progress. Could you tell me how you would like to handle the client's request for an earlier deadline?",
        learnerQuestion: "Could you tell me how you would like to handle the client's request for an earlier deadline?",
        suggestedLearnerReply: "I would review the plan with the team and propose a realistic date to the client."
      };
      const offTopicFeedback: CoachTaskOutput = {
        ...output(turn.seasonReply, turn.learnerQuestion),
        evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Câu trả lời mang tính thông tin chung chung, không trả lời câu hỏi về cách xử lý yêu cầu rút ngắn thời hạn của khách hàng." },
        rubric: {
          meaning: { score: 0, evidence: "Không trả lời câu hỏi.", improvement: "Trả lời đúng câu hỏi." },
          vocabulary: { score: 1, evidence: "Từ lóng.", improvement: "Dùng từ trang trọng." },
          grammar: { score: 2, evidence: "Câu đơn giản.", improvement: "" }
        }
      };
      expect(coachOutputSchema.safeParse(offTopicFeedback).success).toBe(true);
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockResolvedValueOnce({ output: offTopicFeedback, metadata });
      const result = await runCoachWithPersonaRepair({ runTask }, input(learnerMessage, "formal", "B1", currentQuestion), "System prompt", "formal", {
        learnerMessage, currentQuestion, topic: "Handling Client Feedback Meetings", priorQuestions: [currentQuestion]
      });

      expect(result.output.evaluation).toMatchObject({ status: "valid", result: "partially_correct", countsTowardGoal: true });
      expect(result.output.rubric.meaning.score).toBeGreaterThanOrEqual(2);
      expect(result.output.rubric.meaning.score).toBeLessThanOrEqual(3);
      expect(result.output.evaluation.noteVi).toMatch(/được tính lượt/u);
      expect(result.output.evaluation.noteVi).toContain("“gimme”");
      // The graded evaluation stays schema-consistent (valid <=> counts, result matches status).
      expect(coachOutputSchema.safeParse({ ...result.output, suggestedAnswer: { ...result.output.suggestedAnswer, translation: "Bản dịch." } }).success).toBe(true);
    });

    it("2: the register rule also keeps C1 slang on topic but leaves real off-topic and Informal turns alone", () => {
      const offTopic = (noteVi: string): CoachTaskOutput => ({
        ...output("Thank you. Could you explain which point we should address first?", "Could you explain which point we should address first?"),
        evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi },
        rubric: { ...output("a", "b").rubric, meaning: { score: 0, evidence: "Lạc đề.", improvement: "" } }
      });
      const c1 = "Honestly mate, they're being a pain, just tell 'em no and move on, we've got way better stuff to do lol.";
      expect(informalRegisterMarkers(c1)).toEqual(expect.arrayContaining(["mate", "'em", "lol"]));
      const context = { learnerMessage: c1, currentQuestion: "What worries you most about the feedback we received, and how should we respond?", topic: "Handling Client Feedback Meetings" };
      expect(finalizeCoachEvaluation(offTopic("Giọng điệu không phù hợp."), "formal", context).evaluation.countsTowardGoal).toBe(true);
      // Same slang in an Informal chat is not a register problem.
      expect(finalizeCoachEvaluation(offTopic("Lạc đề."), "informal", context).evaluation.status).toBe("off_topic");
      // Slang does not rescue a genuinely off-topic answer, and no slang means no change (coach-B2 offtopic-formal).
      const beach = { ...context, learnerMessage: "lol I went to the beach with my friends last weekend, bro.", currentQuestion: "If the client rejects the revised scope, what alternative would you propose?" };
      expect(finalizeCoachEvaluation(offTopic("Lạc đề."), "formal", beach).evaluation.status).toBe("off_topic");
      const weather = { ...context, learnerMessage: "The weather in Hanoi has been really cold this week, so I bought a new jacket yesterday." };
      expect(finalizeCoachEvaluation(offTopic("Lạc đề."), "formal", weather).evaluation.status).toBe("off_topic");
    });

    it("3: coach_dialogue gets a larger output budget and a truncated evaluator is logged under its own code", async () => {
      expect(COACH_FEEDBACK_MAX_OUTPUT_TOKENS).toBeGreaterThan(1_400);
      const currentQuestion = "Any thoughts on how we should push back on their new request?";
      const learnerMessage = "I'd acknowledge the value of their idea first, then explain that squeezing it into this release would put the go-live date and our testing at real risk.";
      const turn = {
        seasonReply: "Thanks for that, it's a sensible starting point. Could you walk me through the exact wording you'd use in the meeting? 😊",
        learnerQuestion: "Could you walk me through the exact wording you'd use in the meeting?",
        suggestedLearnerReply: "I'd say we value the idea, but adding it now would put the go-live date at risk."
      };
      const truncated = Object.assign(new Error("truncated"), { code: "AI_OUTPUT_TRUNCATED" });
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockRejectedValueOnce(truncated);
      const result = await runCoachWithPersonaRepair({ runTask }, input(learnerMessage, "informal", "C1", currentQuestion), "System prompt", "informal", {
        learnerMessage, currentQuestion, priorQuestions: [currentQuestion]
      });
      expect(runTask.mock.calls[1]?.[2]?.maxOutputTokens).toBe(COACH_FEEDBACK_MAX_OUTPUT_TOKENS);
      expect(result.feedbackErrorCode).toBe("AI_OUTPUT_TRUNCATED");
      expect(result.roleplay.feedbackErrorCode).toBe("AI_OUTPUT_TRUNCATED");
      const log = { warn: vi.fn(), info: vi.fn() };
      logRoleplayDiagnostics(log, "req-trunc", "practice", result.roleplay);
      expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({
        code: "COACH_FEEDBACK_TRUNCATED", requestId: "req-trunc", maxOutputTokens: COACH_FEEDBACK_MAX_OUTPUT_TOKENS
      }), expect.any(String));
    });

    it("4: uses the roleplay call's own translation when the feedback copy drifted (conv-B1 turn 3)", async () => {
      const currentQuestion = "Before we agree on an extra week, could you explain which part of the timeline you think is unrealistic?";
      const learnerMessage = "I have already discussed the risk with our QA lead, and she agrees that the extra week is necessary.";
      const turn = {
        seasonReply: "Thank you for sharing that. I appreciate that the QA lead has reviewed the risk, but I would still like to understand the reasoning behind the extra week. Could you tell me which milestone on the timeline you believe is unrealistic, and what evidence supports that view?",
        learnerQuestion: "Could you tell me which milestone on the timeline you believe is unrealistic, and what evidence supports that view?",
        suggestedLearnerReply: "I believe the testing phase is unrealistic because the QA team needs more time to check the results.",
        seasonReplyTranslation: "Cảm ơn bạn đã chia sẻ. Tôi đánh giá cao việc trưởng nhóm QA đã xem xét rủi ro, nhưng tôi vẫn muốn hiểu lý do cần thêm một tuần. Bạn có thể cho tôi biết mốc nào trên lịch trình mà bạn cho là không khả thi, và bằng chứng nào hỗ trợ quan điểm đó không?",
        learnerQuestionTranslation: "Bạn có thể cho tôi biết mốc nào trên lịch trình mà bạn cho là không khả thi, và bằng chứng nào hỗ trợ quan điểm đó không?",
        suggestedLearnerReplyTranslation: "Tôi nghĩ giai đoạn kiểm thử không khả thi vì nhóm QA cần thêm thời gian để kiểm tra kết quả."
      };
      // The evaluator paraphrased the turn instead of copying it.
      const drifted: CoachTaskOutput = {
        ...output("Thank you for sharing. Could you tell me which milestone is unrealistic?", "Could you tell me which milestone is unrealistic?"),
        seasonReplyTranslation: "Cảm ơn bạn. Mốc nào không khả thi?", nextQuestionTranslation: "Mốc nào không khả thi?"
      };
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockResolvedValueOnce({ output: drifted, metadata });
      const result = await runCoachWithPersonaRepair({ runTask }, input(learnerMessage, "formal", "B1", currentQuestion), "System prompt", "formal", {
        learnerMessage, currentQuestion, priorQuestions: [currentQuestion]
      });

      expect(result.output.seasonReply).toBe(turn.seasonReply);
      expect(result.output.seasonReplyTranslation).toBe(turn.seasonReplyTranslation);
      expect(result.output.nextQuestionTranslation).toBe(turn.learnerQuestionTranslation);
      expect(result.output.suggestedAnswer.translation).toBe(turn.suggestedLearnerReplyTranslation);
      const feedbackPrompt = String(runTask.mock.calls[1]?.[2]?.systemPrompt);
      expect(feedbackPrompt).toContain("COPY FIRST, THEN TRANSLATE");
      expect(feedbackPrompt).not.toContain("learnerQuestionTranslation");
      expect(String(runTask.mock.calls[0]?.[2]?.systemPrompt)).toContain("seasonReplyTranslation, learnerQuestionTranslation, and suggestedLearnerReplyTranslation");
    });

    it("4: keeps the roleplay translation after a style-only repair but drops it when sentences were removed", async () => {
      const learnerMessage = "We will test the new feature with two clients next week.";
      const styled = {
        seasonReply: "That's a clear plan. When can you share the test results?",
        learnerQuestion: "When can you share the test results?",
        suggestedLearnerReply: "I can share the results on Friday.",
        seasonReplyTranslation: "Đó là một kế hoạch rõ ràng. Khi nào bạn có thể chia sẻ kết quả kiểm thử?",
        learnerQuestionTranslation: "Khi nào bạn có thể chia sẻ kết quả kiểm thử?",
        suggestedLearnerReplyTranslation: "Tôi có thể chia sẻ kết quả vào thứ Sáu."
      };
      const styledTask = vi.fn().mockResolvedValueOnce({ output: styled, metadata }).mockRejectedValueOnce(feedbackDown);
      const styledResult = await runCoachWithPersonaRepair({ runTask: styledTask }, input(learnerMessage, "formal", "A2", "How is the project going?"), "System prompt", "formal", { learnerMessage });
      expect(styledResult.output.seasonReply).toBe("That is a clear plan. When can you share the test results?");
      expect(styledResult.output.seasonReplyTranslation).toBe(styled.seasonReplyTranslation);

      const long = {
        ...styled,
        seasonReply: "Thanks for the update. The design looks clean. The client liked the colours. The layout is simple. The team is happy. When can you share the test results?"
      };
      const longTask = vi.fn().mockResolvedValueOnce({ output: long, metadata }).mockRejectedValueOnce(feedbackDown);
      const longResult = await runCoachWithPersonaRepair({ runTask: longTask }, input(learnerMessage, "formal", "A2", "How is the project going?"), "System prompt", "formal", { learnerMessage });
      expect(longResult.output.seasonReply).not.toBe(long.seasonReply);
      expect(longResult.output.seasonReplyTranslation).toBe("");
      expect(longResult.output.nextQuestionTranslation).toBe(styled.learnerQuestionTranslation);
    });

    it("5: noteVi never contradicts the final counting status (coach-B1 grammar-informal, conv-A1 turn 5)", () => {
      const counted = (noteVi: string): CoachTaskOutput => ({
        ...output("Oh, nice to hear it went well! What exactly did the client ask you to fix before Friday? 😊", "What exactly did the client ask you to fix before Friday?"),
        evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi }
      });
      const b1 = finalizeCoachEvaluation(counted("Câu trả lời chưa đạt điều kiện đếm: chưa đủ cấu trúc chủ-vị rõ ràng ở mức tối thiểu cho lượt này. Hãy trả lời lại đầy đủ hơn về cuộc họp với khách hàng."), "informal", { learnerMessage: "It go well but they wants we fix two bug before Friday so I needs help from QA team." });
      expect(b1.evaluation.noteVi).toMatch(/^Lượt này được tính/u);
      expect(b1.evaluation.noteVi).not.toMatch(/chưa đạt điều kiện/u);
      expect(b1.evaluation.noteVi).toContain("Hãy trả lời lại đầy đủ hơn");
      const a1 = finalizeCoachEvaluation(counted("Câu trả lời chưa trả lời đúng câu hỏi về bước tiếp theo cho \"day\". Câu của bạn nói về việc tham gia cuộc họp lúc 10 giờ, nên chưa đạt điều kiện tính điểm."), "formal", { learnerMessage: "Yes, I can join the meeting at ten." });
      expect(a1.evaluation.noteVi).not.toMatch(/chưa đạt điều kiện/u);
      // A consistent note is left untouched.
      expect(finalizeCoachEvaluation(counted("Đúng trọng tâm."), "formal", { learnerMessage: "We will test it." }).evaluation.noteVi).toBe("Đúng trọng tâm.");
      // The reverse contradiction is fixed too.
      const notCounted: CoachTaskOutput = {
        ...counted("Câu trả lời đã được tính lượt. Nội dung lạc đề."),
        evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Câu trả lời đã được tính lượt. Nội dung lạc đề." },
        rubric: { ...output("a", "b").rubric, meaning: { score: 0, evidence: "Lạc đề.", improvement: "" } }
      };
      expect(finalizeCoachEvaluation(notCounted, "informal", { learnerMessage: "I like pho." }).evaluation.noteVi).toBe("Lượt này chưa được tính vì câu trả lời chưa đúng trọng tâm câu hỏi. Nội dung lạc đề.");
    });
  });
});
