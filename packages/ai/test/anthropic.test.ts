import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "../src/providers/anthropic.js";
import { weeklyLessonsOutputJsonSchema } from "../src/schemas.js";

describe("Anthropic provider", () => {
  it("uses the Messages API and parses JSON content", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: JSON.stringify({ reply: "Hello" }) }],
      usage: { input_tokens: 12, output_tokens: 18 }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", model: "claude-haiku-5-5", fetch });

    const result = await provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-1"
    });

    expect(result.output).toEqual({ reply: "Hello" });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 18, totalTokens: 30 });
    expect(fetch).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({ method: "POST" }));
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("test-secret-key");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "claude-haiku-5-5", max_tokens: 8192, thinking: { type: "disabled" }
    });
    expect(JSON.stringify(result)).not.toContain("test-secret-key");
  });

  it("marks 429 and 5xx responses as retryable without exposing response bodies", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("provider-body-must-not-leak", { status: 429 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-2"
    })).rejects.toMatchObject({ code: "AI_PROVIDER_RATE_LIMIT", retryable: true });
  });

  it("reports Anthropic's safe rejection reason without leaking response content", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "tools.0.custom.input_schema: Schema is too complex for compilation",
        sensitive_payload: "must never be exposed"
      }
    }), { status: 400, headers: { "content-type": "application/json" } }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    let error: unknown;
    try {
      await provider.complete({
        taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
        outputJsonSchema: weeklyLessonsOutputJsonSchema,
        signal: new AbortController().signal, traceId: "trace-rejected"
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "AI_PROVIDER_REJECTED",
      retryable: false,
      details: {
        issues: [{
          path: "provider",
          message: "Anthropic HTTP 400 (invalid_request_error): tools.0.custom.input_schema: Schema is too complex for compilation"
        }]
      }
    });
    expect(JSON.stringify(error)).not.toContain("must never be exposed");
    expect(JSON.stringify(error)).not.toContain("test-secret-key");
  });

  it("accepts JSON wrapped in a markdown fence or short provider preface", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "Here is the JSON:\n```json\n{\"reply\":\"Hello\"}\n```" }] }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-3"
    })).resolves.toMatchObject({ output: { reply: "Hello" } });
  });

  it("uses Anthropic tool input when structured output is returned", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { reply: "Hello" } }],
      usage: { input_tokens: 4, output_tokens: 5 }
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", model: "claude-haiku-5-5", fetch });

    await expect(provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-tool"
    })).resolves.toMatchObject({ output: { reply: "Hello" }, usage: { totalTokens: 9 } });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      tools: [expect.objectContaining({ name: "coach_dialogue_output", strict: false })],
      tool_choice: { type: "tool", name: "coach_dialogue_output" }
    });
  });

  it("avoids Anthropic grammar compilation for the dynamic CEFR week plan while keeping tool output", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { weeks: [] } }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await provider.complete({
      taskId: "week_suggestions", systemPrompt: "Return week options.", input: { levels: ["A1"] },
      outputJsonSchema: { type: "object", properties: { weeks: { type: "array" } } },
      signal: new AbortController().signal, traceId: "trace-week-options"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      tools: [expect.objectContaining({ name: "week_suggestions_output", strict: false })],
      tool_choice: { type: "tool", name: "week_suggestions_output" }
    });
  });

  it("uses a task-specific output budget for the complete weekly lesson contract", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { lessons: [] } }],
      usage: { input_tokens: 4, output_tokens: 5 }
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await provider.complete({
      taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
      outputJsonSchema: weeklyLessonsOutputJsonSchema, maxOutputTokens: 30_000,
      signal: new AbortController().signal, traceId: "trace-weekly-budget"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      max_tokens: 30_000,
      tools: [expect.objectContaining({
        name: "weekly_lessons_output",
          strict: false,
        input_schema: expect.objectContaining({
          properties: expect.objectContaining({
            lessons: expect.objectContaining({
              type: "object",
              required: ["day1", "day2", "day3", "day4", "day5"]
            })
          })
        })
      })]
    });
  });

  it("fails clearly when Claude stops because max_tokens was reached", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"lessons":[' }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-truncated"
    })).rejects.toMatchObject({ code: "AI_OUTPUT_TRUNCATED", retryable: false });
  });

  it("marks a malformed JSON response as retryable without exposing provider data", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "not-json" }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-malformed"
    })).rejects.toMatchObject({ code: "AI_PROVIDER_MALFORMED_RESPONSE", retryable: true });
  });
});
