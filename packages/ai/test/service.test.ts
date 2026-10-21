import { describe, expect, it, vi } from "vitest";
import { createAiService } from "../src/service.js";
import { AI_TASKS } from "../src/registry.js";
import { AiProviderError, type AiProvider } from "../src/types.js";

const validCoachOutput = {
  relevant: true,
  relevanceNote: "",
  reply: "I work in product. What are you working on this week?",
  rubric: { meaning: 4, vocabulary: 4, grammar: 3 },
  suggestions: [{ original: "at product", corrected: "in product", explanation: "Use in before a department." }],
  correctedText: "I work in product.",
  usedWords: ["product"]
};

describe("AI service", () => {
  it("validates input/output and only sends allowlisted learner context", async () => {
    const complete = vi.fn().mockResolvedValue({ output: validCoachOutput, usage: { inputTokens: 20, outputTokens: 30 } });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Coach safely." });

    const result = await service.runTask("coach_dialogue", {
      message: "I work at product.", cefr: "A2", scenario: "Daily meeting", priorTurns: [],
      email: "private@example.com", browserApiKey: "must-not-leave-browser"
    });

    expect(result.output).toEqual(validCoachOutput);
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    expect(request.input).toEqual({ message: "I work at product.", cefr: "A2", scenario: "Daily meeting", priorTurns: [] });
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

  it("retries a schema-invalid model response once before accepting a valid retry", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ output: { reply: "Missing scores" }, usage: {} })
      .mockResolvedValueOnce({ output: validCoachOutput, usage: {} });
    const service = createAiService({ registry: AI_TASKS, provider: fixtureProvider(complete), loadPrompt: async () => "Coach safely.", maxAttempts: 2 });

    await expect(service.runTask("coach_dialogue", coachInput())).resolves.toMatchObject({
      output: validCoachOutput,
      metadata: { attempts: 2 }
    });
    expect(complete).toHaveBeenCalledTimes(2);
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
        output: { topic: "Sprint planning", words: Array.from({ length: 15 }, (_, index) => ({
          id: `word-${index + 1}`, english: `word ${index + 1}`, vietnamese: `từ ${index + 1}`,
          definition: `definition ${index + 1}`, partOfSpeech: "noun"
        })) }, usage: {}
      })),
      loadPrompt: async () => "Create a safe word set."
    });
    await expect(vocabulary.runTask("vocabulary_generation", { topic: "Sprint planning", cefr: "A2", count: 15 }))
      .resolves.toMatchObject({ output: { topic: "Sprint planning", words: expect.arrayContaining([expect.objectContaining({ english: "word 1" })]) } });
  });
});

function coachInput() {
  return { message: "I work at product.", cefr: "A2", scenario: "Daily meeting", priorTurns: [] };
}

function fixtureProvider(complete: ReturnType<typeof vi.fn>): AiProvider {
  return { name: "fixture", model: "fixture-model", complete: complete as unknown as AiProvider["complete"] };
}
