import { describe, expect, it, vi } from "vitest";
import { coachRoleplayTurnOutputJsonSchema, coachRoleplayTurnOutputSchema, coachOutputSchema, type CoachTaskOutput } from "@e4s/ai";
import {
  coachAnswerIdeaIssues, coachAnswerIdeaLanguage, coachAnswerIdeaPromptRule, fallbackCoachAnswerIdea, repairCoachAnswerIdea
} from "../src/modules/coach/answer-idea.js";
import {
  coachPersonaPrompt, coachPracticeTurnGate, coachReaskFollowUp, repeatCurrentQuestionForInvalidTurn,
  runCoachWithPersonaRepair, simplifyCoachQuestion
} from "../src/modules/coach/routes.js";

const metadata = { traceId: "t", provider: "mock", model: "m", inputHash: "h", usage: {}, latencyMs: 1 };

const graded = (status: "valid" | "off_topic" | "insufficient", seasonReply: string, nextQuestion: string): CoachTaskOutput => ({
  evaluation: status === "valid"
    ? { status, result: "correct", countsTowardGoal: true, noteVi: "Đúng trọng tâm." }
    : { status, result: status === "off_topic" ? "off_topic" : "missing_information", countsTowardGoal: false, noteVi: "Chưa tính." },
  seasonReply, seasonReplyTranslation: "Bản dịch.", nextQuestion, nextQuestionTranslation: "Câu hỏi.",
  rubric: {
    meaning: { score: status === "valid" ? 4 : 0, evidence: "Ý.", improvement: "" },
    vocabulary: { score: 3, evidence: "Từ.", improvement: "" },
    grammar: { score: 3, evidence: "Ngữ pháp.", improvement: "" }
  },
  corrections: [], correctedText: "",
  suggestedAnswer: { text: "Bạn có thể nói về tiến độ.", translation: "" }, usedWords: []
});

describe("Season answer idea (hint box)", () => {
  it("uses Vietnamese at A1–A2 and English idea descriptions at B1+", () => {
    expect(coachAnswerIdeaLanguage("A1")).toBe("vi");
    expect(coachAnswerIdeaLanguage("A2")).toBe("vi");
    expect(coachAnswerIdeaLanguage("B1")).toBe("en");
    expect(coachAnswerIdeaLanguage("C1")).toBe("en");
    expect(coachAnswerIdeaPromptRule("A2")).toContain("natural Vietnamese");
    expect(coachAnswerIdeaPromptRule("B2")).toContain("Talk about why the slides look unclear.");
    expect(coachAnswerIdeaPromptRule("A1")).toContain("not a ready-made answer");
  });

  it("accepts a Vietnamese idea and rejects an English sample answer at A1–A2", () => {
    expect(coachAnswerIdeaIssues("Bạn có thể nói về việc mấy cái slide trông chưa ổn.", "A1")).toEqual([]);
    expect(coachAnswerIdeaIssues("Bạn có thể nói về deadline cho team khi gặp sếp.", "A2")).toEqual([]);
    expect(coachAnswerIdeaIssues("The slides are stupid", "A1")).toContain("Answer idea must be written in Vietnamese at A1–A2.");
    expect(coachAnswerIdeaIssues("Bạn có thể nói: \"The slides are stupid\"", "A1").length).toBeGreaterThan(0);
    expect(coachAnswerIdeaIssues("Bạn có thể nói The slides are not ready yet", "A2"))
      .toContain("Answer idea embeds an English sentence instead of describing an idea.");
  });

  it("accepts an English idea description and rejects a first-person sample answer at B1+", () => {
    expect(coachAnswerIdeaIssues("Talk about why the slides look unclear.", "B1")).toEqual([]);
    expect(coachAnswerIdeaIssues("You could mention which slide needs more data.", "B2")).toEqual([]);
    expect(coachAnswerIdeaIssues("I think the slides are unclear.", "B1"))
      .toContain("Answer idea is a first-person sample answer, not an idea description.");
    expect(coachAnswerIdeaIssues("The slides are stupid.", "B1"))
      .toContain("Answer idea must start with an idea verb such as Talk about or Mention.");
    expect(coachAnswerIdeaIssues("Bạn có thể nói về slide.", "B2")).toContain("Answer idea must be written in English at B1+.");
  });

  it("repairs an invalid idea with a level-language fallback", () => {
    expect(repairCoachAnswerIdea({ text: "The slides are stupid" }, "A1")).toMatchObject({ repaired: true, text: fallbackCoachAnswerIdea("A1").text, translation: "" });
    expect(repairCoachAnswerIdea({ text: "I will fix the slides." }, "B1")).toMatchObject({ repaired: true, text: fallbackCoachAnswerIdea("B1").text });
    expect(repairCoachAnswerIdea({ text: "Talk about the slides.", translation: "Hãy nói về các slide." }, "B1"))
      .toEqual({ text: "Talk about the slides.", translation: "Hãy nói về các slide.", repaired: false });
    // A Vietnamese idea never carries a translation.
    expect(repairCoachAnswerIdea({ text: "Bạn có thể nói về slide.", translation: "x" }, "A2").translation).toBe("");
  });

  it("asks the roleplay model for answerIdea instead of a sample reply", () => {
    expect(coachRoleplayTurnOutputJsonSchema.required).toContain("answerIdea");
    expect(coachRoleplayTurnOutputJsonSchema.required).not.toContain("suggestedLearnerReply");
    expect(coachRoleplayTurnOutputSchema.safeParse({ seasonReply: "Hi. How?", learnerQuestion: "How?", answerIdea: "Bạn có thể nói về tiến độ." }).success).toBe(true);
    // A Vietnamese idea has no translation, so feedback output may leave it empty.
    expect(coachOutputSchema.safeParse(graded("valid", "Good. Who will review it?", "Who will review it?")).success).toBe(true);
    expect(coachPersonaPrompt("Base", "formal", "A1")).toContain("ANSWER IDEA");
  });

  it("stores the model's Vietnamese idea and replaces an English sample answer (A1 and B1)", async () => {
    const turn = {
      seasonReply: "Thank you. Which slide needs more work?", learnerQuestion: "Which slide needs more work?",
      answerIdea: "The slides are stupid", seasonReplyTranslation: "Cảm ơn. Slide nào cần làm thêm?",
      learnerQuestionTranslation: "Slide nào cần làm thêm?", answerIdeaTranslation: ""
    };
    const feedback = graded("valid", turn.seasonReply, turn.learnerQuestion);
    for (const cefr of ["A1", "B1"]) {
      const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockResolvedValueOnce({ output: feedback, metadata });
      const result = await runCoachWithPersonaRepair({ runTask }, {}, "System", "formal", {
        learnerMessage: "We finished the new slides for the client meeting today.", currentQuestion: "How are the slides?", cefr
      });
      expect(result.output.suggestedAnswer).toEqual({ ...fallbackCoachAnswerIdea(cefr), kind: "idea" });
      expect(String(runTask.mock.calls[0]?.[2]?.systemPrompt)).toContain('"answerIdea"');
    }
    const good = { ...turn, answerIdea: "Bạn có thể nói về việc mấy cái slide trông chưa ổn." };
    const runTask = vi.fn().mockResolvedValueOnce({ output: good, metadata }).mockResolvedValueOnce({ output: feedback, metadata });
    const result = await runCoachWithPersonaRepair({ runTask }, {}, "System", "formal", {
      learnerMessage: "We finished the new slides for the client meeting today.", currentQuestion: "How are the slides?", cefr: "A2"
    });
    expect(result.output.suggestedAnswer).toEqual({ text: good.answerIdea, translation: "", kind: "idea" });
  });
});

describe("Season keeps the open question until it is answered", () => {
  it("classifies clarification requests and 'I don't know' before the word-count gate", () => {
    for (const message of ["what do you mean?", "Sorry?", "Can you explain?", "I don't understand.", "Could you repeat that, please?"]) {
      expect(coachPracticeTurnGate(message, "A1", [])?.kind, message).toBe("clarification");
    }
    for (const message of ["i don't know", "I have no idea", "idk", "Not sure."]) {
      expect(coachPracticeTurnGate(message, "A1", [])?.kind, message).toBe("dont_know");
    }
    expect(coachPracticeTurnGate("client", "A1", [])?.kind).toBe("insufficient");
    expect(coachPracticeTurnGate("Tôi không biết nói gì", "A1", [])?.kind).toBe("dont_know");
    // A real answer that mentions uncertainty is not gated.
    expect(coachPracticeTurnGate("I don't know the exact date, but I will check with the team tomorrow.", "A1", [])).toBeUndefined();
  });

  it("rephrases the same question more simply after a clarification request, with an idea hint", () => {
    const reply = coachReaskFollowUp({
      kind: "clarification", currentQuestion: "Before we agree on an extra week, could you please tell me which part of the timeline is unrealistic?",
      currentQuestionTranslation: "Phần nào của tiến độ chưa thực tế?", persona: "formal", cefr: "A2"
    });
    expect(reply.nextQuestion).toBe("Could you tell me which part of the timeline is unrealistic?");
    expect(reply.seasonReply).toBe("Of course. Let me ask it in a simpler way. Could you tell me which part of the timeline is unrealistic?");
    expect(reply.seasonReply).not.toMatch(/I hear you mention|next step for/u);
    expect(reply.suggestedAnswer?.text).toMatch(/^Bạn có thể/u);
    expect(simplifyCoachQuestion("What do you think? 😊")).toBe("What do you think?");
  });

  it("gives an idea and re-asks the same question after 'I don't know'", () => {
    const reply = coachReaskFollowUp({ kind: "dont_know", currentQuestion: "What did the client say?", persona: "informal", cefr: "B1" });
    expect(reply.nextQuestion).toBe("What did the client say?");
    expect(reply.seasonReply).toBe("No worries, here's a small idea to help you. What did the client say? 😊");
    expect(reply.suggestedAnswer).toEqual(fallbackCoachAnswerIdea("B1", "dont_know"));
    expect(coachAnswerIdeaIssues(reply.suggestedAnswer!.text, "B1")).toEqual([]);
  });

  it("politely re-asks the open question when the AI is unavailable", () => {
    const reply = coachReaskFollowUp({ kind: "unavailable", currentQuestion: "What did the client say?", persona: "formal" });
    expect(reply.seasonReply).toBe("Your answer was saved. I will reply properly as soon as I am available again. What did the client say?");
    expect(reply.nextQuestion).toBe("What did the client say?");
  });

  it("replaces a new question with the open one when the AI marks the turn as not counted", () => {
    const moved = graded("off_topic", "Interesting. What is your favourite food?", "What is your favourite food?");
    const fixed = repeatCurrentQuestionForInvalidTurn(moved, {
      currentQuestion: "When will the report be ready?", currentQuestionTranslation: "Khi nào báo cáo sẵn sàng?", persona: "formal", cefr: "A1"
    });
    expect(fixed.nextQuestion).toBe("When will the report be ready?");
    expect(fixed.seasonReply).toBe("I am not sure that answers my question yet. When will the report be ready?");
    expect(fixed.seasonReplyTranslation).toContain("Khi nào báo cáo sẵn sàng?");
    expect(fixed.suggestedAnswer).toEqual({ ...fallbackCoachAnswerIdea("A1"), kind: "idea" });
    // A light rephrasing of the open question is kept as Season wrote it.
    const rephrased = graded("insufficient", "Let us go back. When will the report be ready for the client?", "When will the report be ready for the client?");
    expect(repeatCurrentQuestionForInvalidTurn(rephrased, { currentQuestion: "When will the report be ready?", persona: "formal" })).toBe(rephrased);
    // A valid answer moves on unchanged.
    const valid = graded("valid", "Great. Who will review it?", "Who will review it?");
    expect(repeatCurrentQuestionForInvalidTurn(valid, { currentQuestion: "When will the report be ready?", persona: "formal" })).toBe(valid);
  });
});
