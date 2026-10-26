import { describe, expect, it, vi } from "vitest";
import { createGroqProvider } from "../src/providers/groq.js";

describe("Groq provider", () => {
  it("uses the OpenAI-compatible JSON endpoint and returns parsed structured output", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ relevant: true, relevanceNote: "", reply: "Hello", rubric: { meaning: 5, vocabulary: 4, grammar: 4 }, suggestions: [], correctedText: "Hello", usedWords: [] }) } }],
      usage: { prompt_tokens: 12, completion_tokens: 18, total_tokens: 30 }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = createGroqProvider({ apiKey: "test-secret-key", model: "llama-test", fetch });

    const result = await provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-1"
    });

    expect(result.output).toMatchObject({ reply: "Hello" });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 18, totalTokens: 30 });
    expect(fetch).toHaveBeenCalledWith("https://api.groq.com/openai/v1/chat/completions", expect.objectContaining({ method: "POST" }));
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-secret-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      max_tokens: 8192,
      response_format: {
        type: "json_schema",
        json_schema: { name: "coach_dialogue_output", strict: false, schema: { type: "object" } }
      }
    });
    expect(JSON.stringify(result)).not.toContain("test-secret-key");
  });

  it("fails clearly when the provider truncates the JSON at its output limit", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: '{"lessons":[' } }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = createGroqProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-truncated"
    })).rejects.toMatchObject({ code: "AI_OUTPUT_TRUNCATED", retryable: false });
  });

  it("marks 429 and 5xx responses as retryable without exposing response bodies", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("provider-body-must-not-leak", { status: 429 }));
    const provider = createGroqProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-2"
    })).rejects.toMatchObject({ code: "AI_PROVIDER_RATE_LIMIT", retryable: true });
  });

  it("marks malformed JSON as retryable structured output", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "not-json" } }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = createGroqProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-malformed"
    })).rejects.toMatchObject({ code: "AI_PROVIDER_MALFORMED_RESPONSE", retryable: true });
  });

});
