import { describe, expect, it, vi } from "vitest";
import type { CoachTaskOutput } from "@e4s/ai";
import {
  COACH_ECHO_REASON_VI, COACH_ROLE_RULE, avoidRepeatedQuestionAfterAnswer, coachPersonaPrompt, coachPracticeTurnGate,
  coachPracticeTurnPolicy, coachQuestionFlowForTurn, coachQuestionFromLearnerSide, coachScenarioOpening, coachScenarioRoles,
  isBlockingRoleplayViolation, isCoachQuestionEcho, runCoachWithPersonaRepair
} from "../src/modules/coach/routes.js";

const metadata = { traceId: "t", provider: "mock", model: "m", inputHash: "h", usage: {}, latencyMs: 1 };

const OPENING = "Hi Anh! We're still working on \"Giving feedback\". A client has concerns about your latest update. What would you say to understand their feedback?";
const ECHOED = "Can you tell me, what exactly is the concern about my update?";

const graded = (
  status: "valid" | "off_topic" | "insufficient", seasonReply: string, nextQuestion: string,
  translations: { reply?: string; question?: string } = {}
): CoachTaskOutput => ({
  evaluation: status === "valid"
    ? { status, result: "partially_correct", countsTowardGoal: true, noteVi: "Đúng một phần." }
    : { status, result: status === "off_topic" ? "off_topic" : "missing_information", countsTowardGoal: false, noteVi: "Chưa tính." },
  seasonReply, seasonReplyTranslation: translations.reply ?? "Bản dịch.", nextQuestion, nextQuestionTranslation: translations.question ?? "Câu hỏi.",
  rubric: {
    meaning: { score: status === "valid" ? 2 : 0, evidence: "Ý.", improvement: "" },
    vocabulary: { score: 3, evidence: "Từ.", improvement: "" },
    grammar: { score: 3, evidence: "Ngữ pháp.", improvement: "" }
  },
  corrections: [], correctedText: "",
  suggestedAnswer: { text: "Bạn có thể nói về tiến độ.", translation: "" }, usedWords: []
});

const coachTurn = (text: string, nextQuestion: string) => ({
  id: "c1", speaker: "coach" as const, text, createdAt: "2026-11-13T00:00:00.000Z",
  feedback: { seasonReply: text, nextQuestion, nextQuestionTranslation: "Câu hỏi." }
}) as never;

describe("Season echo: the learner types Season's open question back", () => {
  it("detects an exact or near-identical copy of the open question", () => {
    expect(isCoachQuestionEcho(ECHOED, ECHOED)).toBe(true);
    expect(isCoachQuestionEcho("can you tell me what exactly is the concern about my update", ECHOED)).toBe(true);
    expect(isCoachQuestionEcho("What's the main problem with the slides?", "What is the main problem with the slides? 😊")).toBe(true);
    expect(isCoachQuestionEcho("So what is the main problem with the slides?", "What is the main problem with the slides?")).toBe(true);
    // A real answer, or an answer that quotes the question and goes on, is not an echo.
    expect(isCoachQuestionEcho("The main problem is that the slides have too much text.", "What is the main problem with the slides?")).toBe(false);
    expect(isCoachQuestionEcho("What is the main problem with the slides? I think there is too much text on them.", "What is the main problem with the slides?")).toBe(false);
    expect(isCoachQuestionEcho("Which slide should I change first for the client?", "What is the main problem with the slides?")).toBe(false);
    expect(isCoachQuestionEcho("", ECHOED)).toBe(false);
  });

  it("gates the echo before the AI call: the turn does not count and the same question is re-asked", () => {
    const messages = [coachTurn(`Hmm, I'm not sure about that yet. ${ECHOED} 😊`, ECHOED)];
    const gate = coachPracticeTurnGate(ECHOED, "A2", messages);
    expect(gate).toEqual({ kind: "repeated", reasonVi: COACH_ECHO_REASON_VI });
    expect(gate?.reasonVi).toMatch(/câu hỏi của Season, chưa phải câu trả lời/u);
    // Copying a single (non-question) Season sentence is an exact copy too.
    const copy = coachPracticeTurnGate("The client thinks the slides have too many details.",
      "A2", [coachTurn("Sure. The client thinks the slides have too many details. What will you change first?", "What will you change first?")]);
    expect(copy?.kind).toBe("repeated");
    // A real answer passes the gate.
    expect(coachPracticeTurnGate("I will make the slides shorter and send them again tomorrow.", "A2", messages)).toBeUndefined();
  });

  it("never answers the echoed question: grading and reply agree that it is not an answer", () => {
    // The observed bug: graded valid (2/5) and Season answered and asked the same question again.
    const model = graded("valid",
      `Sure, Anh! The client thinks the new update has too many details on the slides. They want a simpler version. ${ECHOED} 😊`,
      ECHOED);
    const fixed = coachQuestionFlowForTurn(model, {
      currentQuestion: ECHOED, currentQuestionTranslation: "Bạn có thể cho tôi biết mối lo cụ thể là gì không?",
      persona: "informal", cefr: "A2", learnerMessage: ECHOED, topic: "Giving feedback"
    });
    expect(fixed.evaluation).toMatchObject({ status: "insufficient", countsTowardGoal: false, noteVi: COACH_ECHO_REASON_VI });
    expect(fixed.rubric.meaning.score).toBe(0);
    expect(fixed.seasonReply).toBe(`Let's hear it in your own words. ${ECHOED} 😊`);
    expect(fixed.seasonReply).not.toMatch(/too many details|simpler version/u);
    expect(fixed.nextQuestion).toBe(ECHOED);
    expect(fixed.usedWords).toEqual([]);
  });
});

describe("Season never repeats the identical question twice in a row after content", () => {
  const current = "What exactly is the concern about the update?";

  it("gives a valid answer a NEW follow-up question and keeps the in-character content", () => {
    const model = graded("valid",
      `Thanks, that helps. I like the shorter slides. ${current} 😊`, current,
      { reply: "Cảm ơn, vậy giúp ích đấy. Tôi thích slide ngắn hơn. Mối lo cụ thể về bản cập nhật là gì?", question: "Mối lo cụ thể về bản cập nhật là gì?" });
    const fixed = avoidRepeatedQuestionAfterAnswer(model, {
      currentQuestion: current, persona: "informal", cefr: "A2",
      learnerMessage: "I made the slides shorter for the client.", topic: "Giving feedback", priorQuestions: [current]
    });
    expect(fixed.nextQuestion).not.toBe(current);
    expect(fixed.seasonReply.startsWith("Thanks, that helps. I like the shorter slides.")).toBe(true);
    expect(fixed.seasonReply).toContain(fixed.nextQuestion);
    expect(fixed.seasonReply.split(fixed.nextQuestion)).toHaveLength(2);
    expect(fixed.seasonReply).not.toContain(current);
    expect(fixed.seasonReplyTranslation).toContain("Tôi thích slide ngắn hơn.");
    expect(fixed.seasonReplyTranslation).toContain(fixed.nextQuestionTranslation);
    expect((fixed.suggestedAnswer as { kind?: string }).kind).toBe("idea");
    // A valid turn that already moves on is unchanged.
    const moved = graded("valid", "Thanks. Which slide will you change first?", "Which slide will you change first?");
    expect(avoidRepeatedQuestionAfterAnswer(moved, { currentQuestion: current, persona: "formal" })).toBe(moved);
  });

  it("re-asks without answering when an invalid turn also adds content", () => {
    const model = graded("off_topic",
      `Oh, the client liked the colours. They also want a demo next week. ${current}`, current);
    const fixed = coachQuestionFlowForTurn(model, { currentQuestion: current, persona: "formal", cefr: "A2" });
    expect(fixed.seasonReply).toBe(`I am not sure that answers my question yet. ${current}`);
    // One short "why" sentence plus the same question is a proper re-ask and is kept.
    const reask = graded("insufficient", `I need a little more detail. ${current}`, current);
    expect(coachQuestionFlowForTurn(reask, { currentQuestion: current, persona: "formal" })).toBe(reask);
  });
});

describe("Season keeps a fixed role in the scenario", () => {
  it("reads Season's role and the learner's own artifacts from the opening", () => {
    expect(coachScenarioRoles(OPENING)).toEqual({ seasonRole: "client", learnerOwned: ["update"] });
    expect(coachScenarioRoles("Hi! A colleague's report is clear, but one slide has too much text. What feedback would you give?").seasonRole).toBe("colleague");
    expect(coachScenarioRoles("Hi!", ["I sent my weekly report and my slides yesterday."]).learnerOwned).toEqual(["report", "slides"]);
    expect(coachScenarioOpening([
      { id: "s:opening", speaker: "coach", text: OPENING }, { id: "l", speaker: "learner", text: "Hello." }
    ])).toBe(OPENING);
  });

  it("flags a Season question written from the learner's side", () => {
    const { learnerOwned } = coachScenarioRoles(OPENING);
    expect(coachQuestionFromLearnerSide(ECHOED, { learnerOwned })).toBe(true);
    expect(coachQuestionFromLearnerSide("What will you change in your update first?", { learnerOwned })).toBe(false);
    expect(coachQuestionFromLearnerSide("Can you tell me about my concern?", { learnerOwned })).toBe(false);
    // The B1+ idea tells the learner to ask exactly what Season just asked.
    expect(coachQuestionFromLearnerSide("Which part of the update worries you most?", {
      answerIdea: "Ask the client which part of the update worries them most."
    })).toBe(true);
    expect(coachQuestionFromLearnerSide("When can you send the new version?", {
      answerIdea: "Mention a realistic date and what you will change."
    })).toBe(false);
    expect(isBlockingRoleplayViolation("Season's question is phrased from the learner's side (the learner's own line).")).toBe(true);
  });

  it("replaces a learner-side roleplay turn with an in-character fallback question", async () => {
    const turn = {
      seasonReply: `Hmm, I'm not sure about that yet. ${ECHOED} 😊`, learnerQuestion: ECHOED,
      answerIdea: "Bạn có thể hỏi khách hàng xem họ lo lắng về phần nào của bản cập nhật.",
      seasonReplyTranslation: "Hmm.", learnerQuestionTranslation: "Câu hỏi.", answerIdeaTranslation: ""
    };
    const feedback = graded("valid", turn.seasonReply, turn.learnerQuestion);
    const runTask = vi.fn().mockResolvedValueOnce({ output: turn, metadata }).mockResolvedValueOnce({ output: feedback, metadata });
    const result = await runCoachWithPersonaRepair({ runTask }, {}, "System", "informal", {
      learnerMessage: "Believe me, the client will like the new version of my update.", currentQuestion: OPENING,
      learnerOwned: coachScenarioRoles(OPENING, ["Believe me, the client will like the new version of my update."]).learnerOwned,
      topic: "Giving feedback", cefr: "A2"
    });
    expect(result.roleplay.fallbackViolations).toContain("Season's question is phrased from the learner's side (the learner's own line).");
    expect(result.output.nextQuestion).not.toMatch(/\bmy update\b/iu);
    expect(result.output.seasonReply).not.toMatch(/\bmy update\b/iu);
  });

  it("states the fixed roles in the Season prompt and the practice policy", () => {
    const prompt = coachPersonaPrompt("Base", "informal", "A2");
    expect(prompt).toContain(COACH_ROLE_RULE);
    expect(COACH_ROLE_RULE).toMatch(/Season plays the OTHER person/u);
    expect(COACH_ROLE_RULE).toMatch(/never ask the question the learner is supposed to ask you/u);
    expect(COACH_ROLE_RULE).toMatch(/never say 'my update'/u);
    expect(COACH_ROLE_RULE).toMatch(/never answer and then ask the same question again/u);
    expect(COACH_ROLE_RULE).toMatch(/answer idea must describe how the learner, from the learner's side, answers that exact question/u);
    const policy = coachPracticeTurnPolicy("A2", "Giving feedback", [], { currentQuestion: OPENING, scenarioOpening: OPENING, learnerMessages: [] });
    expect(policy).toContain("SCENARIO ROLES");
    expect(policy).toContain("Season plays the client in that situation");
    expect(policy).toContain('"your update"');
    expect(policy).toContain('Season never says "my update"');
    expect(coachPracticeTurnPolicy("A2", "Giving feedback", [])).not.toContain("SCENARIO ROLES");
  });
});
