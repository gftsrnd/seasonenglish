import { describe, expect, it, vi } from "vitest";
import { createAiService } from "../src/service.js";
import { AI_TASKS, AiTaskRegistry } from "../src/registry.js";
import { coachOutputJsonSchema, coachOutputSchema } from "../src/schemas.js";
import { AiProviderError, type AiProvider } from "../src/types.js";
import { z } from "zod";

const validCoachOutput = {
  evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi: "Câu trả lời đúng trọng tâm." },
  seasonReply: "Thanks for sharing that.",
  seasonReplyTranslation: "Cảm ơn bạn đã chia sẻ.",
  nextQuestion: "What are you working on this week?",
  nextQuestionTranslation: "Tuần này bạn đang làm việc gì?",
  rubric: {
    meaning: { score: 4, evidence: "The learner states their department.", improvement: "Add one responsibility." },
    vocabulary: { score: 4, evidence: "Uses 'product' appropriately.", improvement: "Add a job-specific verb." },
    grammar: { score: 3, evidence: "The department preposition is incorrect.", improvement: "Use 'in' before a department." }
  },
  corrections: [{
    original: "at product",
    corrected: "in product",
    translation: "trong bộ phận sản phẩm",
    reason: "Use in before a department."
  }],
  correctedText: "I work in product.",
  suggestedAnswer: { text: "I am preparing a new release.", translation: "Tôi đang chuẩn bị một bản phát hành mới." },
  usedWords: ["product"]
};

describe("AI service", () => {
  it("normalizes omitted grammar transport fields to null when classification abstains", async () => {
    const provider = fixtureProvider(vi.fn(async () => ({ output: {
      durationMinutes: 10,
      objective: {
        title: "Objectives", explanationLanguage: "en",
        items: [
          { type: "content", text: "SWBAT propose one meeting time when asked.", condition: "when asked", criterion: "one clear proposal", assessmentCode: "listening" },
          { type: "language", text: "SWBAT confirm one next step after discussion.", condition: "after discussion", criterion: "one clear sentence", assessmentCode: "speaking" }
        ]
      },
      instruction: { title: "Instructions", step1: "Review the situation.", step2: "Study the vocabulary.", step3: "Complete the tasks." },
      pronunciation: {
        title: "Pronunciation", focus: "word stress", tip: "Stress the key word.",
        word1: { word: "schedule", ipa: "/\u02c8sked\u0292u\u02d0l/" },
        word2: { word: "confirm", ipa: "/k\u0259n\u02c8f\u025c\u02d0rm/" },
        word3: { word: "calendar", ipa: "/\u02c8k\u00e6l\u0259nd\u0259r/" }
      }
    } })));
    const service = createAiService({ registry: AI_TASKS, provider, loadPrompt: async () => "prompt" });

    const result = await service.runTask("weekly_lesson_foundation", {
      weekNumber: 2,
      topic: "Scheduling meetings",
      description: "Arrange a meeting",
      objectives: "Propose a time",
      keyVocabHint: "schedule, calendar",
      cefr: "B2",
      dayNumber: 1,
      lessonFocus: "Proposing a meeting time politely",
      allLessonFocuses: ["one", "two", "three", "four", "five"],
      grammarClassification: {
        status: "insufficient_evidence", contentType: null, targetName: null, scope: null,
        support: "none", confidence: "low", evidence: [], rejectedCandidates: []
      }
    });

    expect(result.output).toMatchObject({ title: null, grammar: null });
  });
  it("accepts an unambiguous Coach turn with independent evaluation, question, correction, evidence, and suggestion", () => {
    const output = {
      evaluation: { status: "valid", result: "partially_correct", countsTowardGoal: true, noteVi: "Bạn đã trả lời đúng trọng tâm." },
      seasonReply: "Thanks for explaining that.",
      seasonReplyTranslation: "Cảm ơn bạn đã giải thích.",
      nextQuestion: "What will you do next?",
      nextQuestionTranslation: "Tiếp theo bạn sẽ làm gì?",
      rubric: {
        meaning: { score: 4, evidence: "The learner states the next action.", improvement: "Add one reason." },
        vocabulary: { score: 4, evidence: "Uses 'prepare' accurately.", improvement: "Add a time phrase." },
        grammar: { score: 3, evidence: "The verb needs a preposition.", improvement: "Use 'prepare for'." }
      },
      corrections: [{
        original: "prepare the meeting", corrected: "prepare for the meeting",
        translation: "chuẩn bị cho cuộc họp", reason: "Use 'for' after 'prepare' in this meaning."
      }],
      correctedText: "I will prepare for the meeting.",
      suggestedAnswer: { text: "I will send the agenda next.", translation: "Tiếp theo tôi sẽ gửi chương trình họp." },
      usedWords: ["agenda"]
    };

    expect(coachOutputSchema.safeParse(output).success).toBe(true);
    expect(coachOutputJsonSchema.required).toEqual(expect.arrayContaining([
      "evaluation", "seasonReply", "seasonReplyTranslation", "nextQuestion", "nextQuestionTranslation",
      "rubric", "corrections", "correctedText", "suggestedAnswer", "usedWords"
    ]));
    expect(coachOutputJsonSchema.properties.evaluation.required).toContain("result");
  });

  it("requires explicit Vietnamese translations for the Coach reply, question, correction, and suggested answer", () => {
    const withoutReplyTranslation = { ...validCoachOutput, seasonReplyTranslation: undefined };
    const withoutCorrectionTranslation = {
      ...validCoachOutput,
      corrections: validCoachOutput.corrections.map(({ translation: _translation, ...correction }) => correction)
    };

    expect(coachOutputSchema.safeParse(validCoachOutput).success).toBe(true);
    expect(coachOutputSchema.safeParse(withoutReplyTranslation).success).toBe(false);
    expect(coachOutputSchema.safeParse(withoutCorrectionTranslation).success).toBe(false);
    expect(coachOutputJsonSchema.required).toContain("seasonReplyTranslation");
    expect(coachOutputJsonSchema.properties.corrections.items.required).toContain("translation");
  });

  it("rejects Coach evaluation states that would count or unlock an invalid learner turn", () => {
    const insufficient = {
      ...validCoachOutput,
      evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: true, noteVi: "Hãy viết một câu đầy đủ." },
      rubric: { ...validCoachOutput.rubric, meaning: { ...validCoachOutput.rubric.meaning, score: 2 } },
      usedWords: ["agenda"]
    };
    const offTopic = {
      ...validCoachOutput,
      evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: true, noteVi: "Câu này chưa liên quan." },
      rubric: { ...validCoachOutput.rubric, meaning: { ...validCoachOutput.rubric.meaning, score: 3 } },
      usedWords: ["agenda"]
    };
    const validButNotCounted = {
      ...validCoachOutput,
      evaluation: { status: "valid", result: "correct", countsTowardGoal: false, noteVi: "Câu trả lời hợp lệ." }
    };

    expect(coachOutputSchema.safeParse(insufficient).success).toBe(false);
    expect(coachOutputSchema.safeParse(offTopic).success).toBe(false);
    expect(coachOutputSchema.safeParse(validButNotCounted).success).toBe(false);
  });

  it("accepts non-counting insufficient and off-topic turns only at their allowed meaning scores", () => {
    const insufficient = {
      ...validCoachOutput,
      evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: "Hãy viết một câu đầy đủ." },
      rubric: { ...validCoachOutput.rubric, meaning: { ...validCoachOutput.rubric.meaning, score: 0 } },
      usedWords: []
    };
    const offTopic = {
      ...validCoachOutput,
      evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Câu này chưa liên quan." },
      rubric: { ...validCoachOutput.rubric, meaning: { ...validCoachOutput.rubric.meaning, score: 1 } },
      usedWords: []
    };

    expect(coachOutputSchema.safeParse(insufficient).success).toBe(true);
    expect(coachOutputSchema.safeParse(offTopic).success).toBe(true);
  });

  it("rejects result labels that conflict with the Coach evaluation status", () => {
    expect(coachOutputSchema.safeParse({
      ...validCoachOutput,
      evaluation: { ...validCoachOutput.evaluation, result: "off_topic" }
    }).success).toBe(false);
    expect(coachOutputSchema.safeParse({
      ...validCoachOutput,
      evaluation: { status: "insufficient", result: "correct", countsTowardGoal: false, noteVi: "Thiếu ý." },
      rubric: { ...validCoachOutput.rubric, meaning: { ...validCoachOutput.rubric.meaning, score: 0 } },
      usedWords: []
    }).success).toBe(false);
  });

  it("validates input/output and only sends allowlisted learner context", async () => {
    const complete = vi.fn().mockResolvedValue({ output: validCoachOutput, usage: { inputTokens: 20, outputTokens: 30 } });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Coach safely." });

    const result = await service.runTask("coach_dialogue", {
      message: "I work at product.", cefr: "A2", persona: "formal", mode: "practice",
      scenario: "Daily meeting", currentQuestion: "Where do you work?", priorTurns: [],
      email: "private@example.com", browserApiKey: "must-not-leave-browser"
    });

    expect(result.output).toEqual(validCoachOutput);
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    expect(request.input).toEqual({
      message: "I work at product.", cefr: "A2", persona: "formal", mode: "practice",
      scenario: "Daily meeting", currentQuestion: "Where do you work?", priorTurns: []
    });
    expect(JSON.stringify(request)).not.toContain("private@example.com");
    expect(JSON.stringify(request)).not.toContain("must-not-leave-browser");
    expect(result.metadata).toMatchObject({ provider: "fixture", model: "fixture-model", attempts: 1, schemaValid: true });
    expect(JSON.stringify(result.metadata)).not.toContain("I work at product");
  });

  it("rejects malformed structured output instead of persisting it", async () => {
    const service = createAiService({
      registry: AI_TASKS,
      provider: fixtureProvider(vi.fn().mockResolvedValue({ output: { reply: "Missing scores" }, usage: {} })),
      loadPrompt: async () => "Coach safely."
    });

    await expect(service.runTask("coach_dialogue", coachInput())).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  });

  it("repairs a schema-invalid model response once before returning it", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ output: { reply: "Missing scores" }, usage: {} })
      .mockResolvedValueOnce({ output: validCoachOutput, usage: {} });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Coach safely.", maxAttempts: 2 });

    await expect(service.runTask("coach_dialogue", coachInput())).resolves.toMatchObject({ output: validCoachOutput, metadata: { attempts: 2 } });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[0].systemPrompt).toContain("REPAIR REQUIRED");
  });

  it("normalizes output before strict schema validation", async () => {
    const registry = new AiTaskRegistry([{
      id: "normalized", promptKey: "normalized",
      inputSchema: z.object({ fallback: z.string() }),
      outputSchema: z.object({ instruction: z.object({ step1: z.string().min(1), step2: z.string().min(1) }) }),
      outputJsonSchema: { type: "object" },
      normalizeOutput: (raw, input) => ({
        ...(raw as Record<string, unknown>),
        instruction: {
          ...((raw as { instruction?: Record<string, unknown> }).instruction ?? {}),
          step1: (raw as { instruction?: { step1?: string } }).instruction?.step1 ?? (input as { fallback: string }).fallback,
          step2: (raw as { instruction?: { step2?: string } }).instruction?.step2 ?? (input as { fallback: string }).fallback
        }
      })
    }]);
    const service = createAiService({
      registry,
      provider: fixtureProvider(vi.fn().mockResolvedValue({ output: { instruction: {} }, usage: {} })),
      loadPrompt: async () => "Return instructions."
    });

    await expect(service.runTask("normalized", { fallback: "Read the example." }))
      .resolves.toMatchObject({ output: { instruction: { step1: "Read the example.", step2: "Read the example." } } });
  });

  it("retries task-specific semantic validation inside the gateway", async () => {
    const registry = new AiTaskRegistry([{
      id: "semantic", promptKey: "semantic",
      inputSchema: z.object({ requiredDays: z.number().int() }),
      outputSchema: z.object({ days: z.array(z.string()) }),
      outputJsonSchema: { type: "object" },
      validateOutput: (output, input) => (output as { days: string[] }).days.length === (input as { requiredDays: number }).requiredDays
        ? []
        : [{ path: "days", message: `Expected ${(input as { requiredDays: number }).requiredDays} days.` }]
    }]);
    const complete = vi.fn()
      .mockResolvedValueOnce({ output: { days: ["T2"] }, usage: {} })
      .mockResolvedValueOnce({ output: { days: ["T2", "T3"] }, usage: {} });
    const service = createAiService({ registry, provider: fixtureProvider(complete), loadPrompt: async () => "Return days." });

    await expect(service.runTask("semantic", { requiredDays: 2 }))
      .resolves.toMatchObject({ output: { days: ["T2", "T3"] }, metadata: { attempts: 2 } });
    expect(complete.mock.calls[1]?.[0].systemPrompt).toContain("days: Expected 2 days.");
  });

  it("uses at most three attempts to repair invalid structured output by default", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ output: { message: "" }, usage: {} })
      .mockResolvedValueOnce({ output: { message: "" }, usage: {} })
      .mockResolvedValueOnce({ output: validCoachOutput, usage: {} });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Coach safely." });

    await expect(service.runTask("coach_dialogue", coachInput()))
      .resolves.toMatchObject({ metadata: { attempts: 3 }, output: validCoachOutput });
    expect(complete).toHaveBeenCalledTimes(3);
    expect(complete.mock.calls[2]?.[0].systemPrompt).toContain("REPAIR REQUIRED");
  });

  it("repairs week suggestions that omit an active CEFR level", async () => {
    const option = (plan: Record<string, string[]>) => ({
      topic: "Project updates", description: "Give a concise project update.",
      objectives: "Report progress and blockers.", keyVocabHint: "progress, blocker", plan
    });
    const incomplete = {
      weeks: [{ weekNumber: 1, levels: ["A1"], options: [1, 2, 3].map(() => option({ A1: ["a", "b", "c", "d", "e"] })) }]
    };
    const completeOutput = {
      weeks: [{ weekNumber: 1, levels: ["A1", "A2"], options: [1, 2, 3].map(() => option({
        A1: ["a", "b", "c", "d", "e"], A2: ["f", "g", "h", "i", "j"]
      })) }]
    };
    const complete = vi.fn()
      .mockResolvedValueOnce({ output: incomplete, usage: {} })
      .mockResolvedValueOnce({ output: completeOutput, usage: {} });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Suggest weeks." });

    await expect(service.runTask("week_suggestions", { weekNumbers: [1], levels: ["A1", "A2"], usedTopics: [] }))
      .resolves.toMatchObject({ metadata: { attempts: 2 }, output: completeOutput });
    expect(complete.mock.calls[1]?.[0].systemPrompt).toContain("CEFR levels must exactly match");
  });

  it("aborts a provider call at the timeout boundary", async () => {
    const provider = fixtureProvider(vi.fn(async ({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const service = createAiService({ registry: AI_TASKS, provider, loadPrompt: async () => "Coach safely.", timeoutMs: 15, maxAttempts: 1 });

    await expect(service.runTask("coach_dialogue", coachInput())).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });

  it("retries one transient provider failure with the same trace and no raw-input metadata", async () => {
    const complete = vi.fn()
      .mockRejectedValueOnce(new AiProviderError("AI_PROVIDER_RATE_LIMIT", true))
      .mockResolvedValueOnce({ output: validCoachOutput, usage: {} });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Coach safely.", maxAttempts: 2 });

    const result = await service.runTask("coach_dialogue", coachInput());

    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[0].traceId).toBe(complete.mock.calls[1]?.[0].traceId);
    expect(result.metadata.attempts).toBe(2);
    expect(result.metadata.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses the organization prompt supplied by the API for this request", async () => {
    const complete = vi.fn().mockResolvedValue({ output: validCoachOutput, usage: {} });
    const loadPrompt = vi.fn(async () => "Fallback prompt");
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt });

    await service.runTask("coach_dialogue", coachInput(), { systemPrompt: "Approved E4S coach prompt" });

    expect(loadPrompt).not.toHaveBeenCalled();
    expect(complete.mock.calls[0]?.[0].systemPrompt).toBe("Approved E4S coach prompt");
  });

  it("validates weekly-practice grading and vocabulary-generation outputs", async () => {
    const weekly = createAiService({
      registry: AI_TASKS,
      provider: fixtureProvider(vi.fn().mockResolvedValue({
        output: {
          score: { total: 84, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } },
          feedback: "Ý rõ và đúng bối cảnh công việc.",
          suggestions: [{ original: "I prepare report", corrected: "I prepare reports", explanation: "Dùng danh từ số nhiều." }],
          correctedText: "I prepare reports."
        }, usage: {}
      })),
      loadPrompt: async () => "Grade safely."
    });
    await expect(weekly.runTask("weekly_practice_grading", {
      text: "I prepare reports and review the work with my team every Friday.",
      cefr: "A2", topic: "Introducing yourself & your job", rubric: ["meaning", "vocabulary", "grammar"]
    })).resolves.toMatchObject({ output: { score: { total: 84 } } });

    const vocabulary = createAiService({
      registry: AI_TASKS,
      provider: fixtureProvider(vi.fn().mockResolvedValue({
        output: { topic: "Sprint planning", words: Array.from({ length: 12 }, (_, index) => ({
          id: `word-${index + 1}`, english: `word ${index + 1}`, vietnamese: `từ ${index + 1}`,
          definition: `definition ${index + 1}`, partOfSpeech: "noun"
        })), distractors: Array.from({ length: 8 }, (_, index) => ({
          id: `distractor-${index + 1}`, english: `unrelated ${index + 1}`, vietnamese: `nhiễu ${index + 1}`,
          definition: `unrelated definition ${index + 1}`, partOfSpeech: "noun"
        })) }, usage: {}
      })),
      loadPrompt: async () => "Create a safe word set."
    });
    await expect(vocabulary.runTask("vocabulary_generation", { topic: "Sprint planning", cefr: "A2", count: 20 }))
      .resolves.toMatchObject({ output: { topic: "Sprint planning", words: expect.arrayContaining([expect.objectContaining({ english: "word 1" })]) } });
  });
});

function coachInput() {
  return {
    message: "I work at product.", cefr: "A2", persona: "informal", mode: "practice",
    scenario: "Daily meeting", currentQuestion: "Where do you work?", priorTurns: []
  };
}

function fixtureProvider(complete: ReturnType<typeof vi.fn>): AiProvider {
  return { name: "fixture", model: "fixture-model", complete: complete as unknown as AiProvider["complete"] };
}
