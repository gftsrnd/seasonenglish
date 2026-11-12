import { describe, expect, it, vi } from "vitest";
import {
  AI_TASKS, AiProviderError, LESSON_PRODUCTIVE_GRADING_TASK, buildLessonProductiveGradingSystemPrompt, countSentences,
  createAiService, createOpenAiTranscriber, lessonProductiveOutcome, lessonRetakeFeedback, speakingTranscriptTooShort,
  type AiProvider, type LessonProductiveGradingInput
} from "../src/index.js";

const input: LessonProductiveGradingInput = {
  mode: "speaking",
  cefr: "A1",
  feedbackLanguage: "vi",
  task: { prompt: "Hãy nói về tiến độ dự án, dùng các từ: client, document, problem.", requiredWords: ["client", "document", "problem"], minRequiredWords: 2, grammarFocus: "am/is/are" },
  pronunciation: { focus: "/m/", words: [{ word: "meeting", ipa: "/ˈmiːtɪŋ/" }, { word: "manager" }] },
  response: { text: "I am the manager. The client is happy. The document is ready.", uncertainWords: [] }
};

function providerReturning(...outputs: unknown[]): AiProvider & { calls: number } {
  const provider = {
    name: "mock", model: "mock-model", calls: 0,
    async complete() {
      const output = outputs[Math.min(provider.calls, outputs.length - 1)];
      provider.calls += 1;
      return { output, usage: { inputTokens: 10, outputTokens: 5 } };
    }
  };
  return provider;
}

function runner(provider: AiProvider) {
  return createAiService({ registry: AI_TASKS, provider, loadPrompt: async () => "", retryBaseDelayMs: 0 });
}

describe("lesson productive grading task", () => {
  it("accepts a valid three-level grade with failed positions", async () => {
    const provider = providerReturning({
      audioClear: true, level: "near", feedback: "Bạn dùng đủ từ. Hãy nói rõ âm /m/ trong meeting.",
      failedPositions: [{ target: "meeting", kind: "pronunciation", note: "missing from the transcript" }],
      usedRequiredWords: ["client", "document"]
    });
    const result = await runner(provider).runTask(LESSON_PRODUCTIVE_GRADING_TASK, input, { systemPrompt: "grade" });
    expect(result.output).toMatchObject({ level: "near", failedPositions: [{ target: "meeting" }] });
    expect(provider.calls).toBe(1);
  });

  it("asks the model to repair feedback longer than two sentences, English for B1+, or invented positions", async () => {
    const bad = {
      audioClear: true, level: "fail", feedback: "One. Two. Three.",
      failedPositions: [{ target: "banana", kind: "pronunciation", note: "x" }], usedRequiredWords: []
    };
    const good = { audioClear: true, level: "fail", feedback: "Say meeting clearly.", failedPositions: [{ target: "meeting", kind: "pronunciation", note: "unclear" }], usedRequiredWords: [] };
    const provider = providerReturning(bad, good);
    const result = await runner(provider).runTask(LESSON_PRODUCTIVE_GRADING_TASK, { ...input, cefr: "B1", feedbackLanguage: "en" }, { systemPrompt: "grade" });
    expect(provider.calls).toBe(2);
    expect(result.output).toMatchObject({ feedback: "Say meeting clearly." });
    await expect(runner(providerReturning({ ...good, feedback: "Hãy nói rõ hơn." })).runTask(
      LESSON_PRODUCTIVE_GRADING_TASK, { ...input, cefr: "B1", feedbackLanguage: "en" }, { systemPrompt: "grade" }
    )).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  });

  it("rejects a pass with failed positions and a fail without any", async () => {
    const base = { audioClear: true, feedback: "Bạn nói rõ và đủ từ.", usedRequiredWords: [] };
    await expect(runner(providerReturning({ ...base, level: "pass", failedPositions: [{ target: "meeting", kind: "pronunciation", note: "x" }] }))
      .runTask(LESSON_PRODUCTIVE_GRADING_TASK, input, { systemPrompt: "g" })).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
    await expect(runner(providerReturning({ ...base, level: "fail", failedPositions: [] }))
      .runTask(LESSON_PRODUCTIVE_GRADING_TASK, input, { systemPrompt: "g" })).rejects.toMatchObject({ code: "AI_OUTPUT_INVALID" });
  });

  it("states CEFR, mode and feedback language in the system prompt", () => {
    const prompt = buildLessonProductiveGradingSystemPrompt("", { cefr: "A2", feedbackLanguage: "vi", mode: "speaking" });
    expect(prompt).toContain("Never penalise a Vietnamese accent");
    expect(prompt).toContain("Learner CEFR: A2. Mode: speaking.");
    expect(prompt).toContain("Vietnamese");
    expect(buildLessonProductiveGradingSystemPrompt("custom", { cefr: "C1", feedbackLanguage: "en", mode: "writing" })).toMatch(/^custom\n\nLearner CEFR: C1/);
  });

  it("maps grades to the lesson part outcome and the attempt limit", () => {
    expect(lessonProductiveOutcome({ audioClear: true, level: "pass" }, 1)).toEqual({ status: "correct", score: 100 });
    expect(lessonProductiveOutcome({ audioClear: true, level: "near" }, 1)).toEqual({ status: "wrong_retry", score: 50 });
    expect(lessonProductiveOutcome({ audioClear: true, level: "fail" }, 2)).toEqual({ status: "wrong_exhausted", score: 0 });
    expect(lessonProductiveOutcome({ audioClear: false, level: "fail" }, 2)).toEqual({ status: "retake", score: 0 });
  });

  it("detects recordings too short to judge", () => {
    expect(speakingTranscriptTooShort("")).toBe(true);
    expect(speakingTranscriptTooShort("hello")).toBe(true);
    expect(speakingTranscriptTooShort("hello team", 0.8)).toBe(true);
    expect(speakingTranscriptTooShort("hello team", 4)).toBe(false);
    expect(countSentences(lessonRetakeFeedback("vi"))).toBeLessThanOrEqual(2);
  });
});

describe("OpenAI-compatible transcriber", () => {
  it("posts the recording without a biasing prompt and returns text, usage and uncertain words", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
      expect(form.get("language")).toBe("en");
      expect(form.get("prompt")).toBeNull();
      expect(form.getAll("include[]")).toEqual(["logprobs"]);
      expect((form.get("file") as File).name).toBe("recording.webm");
      return new Response(JSON.stringify({
        text: " I am the manager. ",
        logprobs: [{ token: " I", logprob: -0.01 }, { token: " manager", logprob: -1.2 }],
        usage: { type: "tokens", input_tokens: 40, output_tokens: 6, total_tokens: 46 }
      }), { status: 200 });
    });
    const transcriber = createOpenAiTranscriber({ apiKey: "k", model: "gpt-4o-mini-transcribe", baseUrl: "https://example.test/v1/", fetch });
    const result = await transcriber.transcribe({ audio: new Uint8Array([1, 2, 3]), mimeType: "audio/webm;codecs=opus" });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://example.test/v1/audio/transcriptions");
    expect(result).toMatchObject({ text: "I am the manager.", uncertainWords: ["manager"], usage: { inputTokens: 40, outputTokens: 6, totalTokens: 46 }, model: "gpt-4o-mini-transcribe" });
  });

  it("uses verbose_json for whisper models and reads the duration", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.body as FormData).get("response_format")).toBe("verbose_json");
      return new Response(JSON.stringify({ text: "hi", duration: 0.9 }), { status: 200 });
    });
    const result = await createOpenAiTranscriber({ apiKey: "k", model: "whisper-large-v3-turbo", fetch }).transcribe({ audio: new Uint8Array([1]), mimeType: "audio/mp4" });
    expect(result.durationSeconds).toBe(0.9);
  });

  it("maps provider failures to retryable and non-retryable errors", async () => {
    const failing = (status: number) => createOpenAiTranscriber({ apiKey: "k", model: "m", fetch: async () => new Response("{}", { status }) });
    await expect(failing(503).transcribe({ audio: new Uint8Array([1]), mimeType: "audio/webm" })).rejects.toMatchObject({ code: "AI_PROVIDER_UNAVAILABLE", retryable: true });
    await expect(failing(400).transcribe({ audio: new Uint8Array([1]), mimeType: "audio/webm" })).rejects.toMatchObject({ code: "AI_STT_REJECTED", retryable: false });
    expect(() => createOpenAiTranscriber({ apiKey: "", model: "m" })).toThrow(AiProviderError);
  });
});
