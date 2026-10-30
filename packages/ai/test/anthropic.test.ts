import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "../src/providers/anthropic.js";
import { weeklyLessonsOutputJsonSchema } from "../src/schemas.js";

describe("Anthropic provider", () => {
  it("uses the Messages API and parses JSON content", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ reply: "Hello" }) }],
      usage: { input_tokens: 12, output_tokens: 18 }
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", model: "claude-haiku-5-5", fetch });

    const result = await provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-1"
    });

    expect(result.output).toEqual({ reply: "Hello" });
    expect(result.stopReason).toBe("end_turn");
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

  it("caches the stable tool schema without caching dynamic lesson input", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { reply: "Hello" } }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await provider.complete({
      taskId: "weekly_lesson_foundation", systemPrompt: "Return one foundation.",
      input: { week: 4, topic: "Dynamic topic" },
      outputJsonSchema: { type: "object", properties: { reply: { type: "string" } } },
      signal: new AbortController().signal, traceId: "trace-cache"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.tools[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(body.messages[0]).not.toHaveProperty("cache_control");
  });

  it("reports Anthropic prompt-cache creation and hit tokens", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { reply: "Hello" } }],
      usage: {
        input_tokens: 12,
        output_tokens: 18,
        cache_creation_input_tokens: 700,
        cache_read_input_tokens: 1400
      }
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    const result = await provider.complete({
      taskId: "weekly_lesson_foundation", systemPrompt: "Return one foundation.", input: {},
      outputJsonSchema: { type: "object" }, signal: new AbortController().signal, traceId: "trace-cache-usage"
    });

    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 18,
      totalTokens: 30,
      cacheCreationInputTokens: 700,
      cacheReadInputTokens: 1400
    });
  });

  it("keeps the oversized skills tool forced but non-strict so Anthropic can compile it", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { listening: {} } }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await provider.complete({
      taskId: "weekly_lesson_skills", systemPrompt: "Return one skill set.", input: {},
      outputJsonSchema: { type: "object", properties: { listening: { type: "object" } } },
      signal: new AbortController().signal, traceId: "trace-weekly-component"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      tools: [expect.objectContaining({ name: "weekly_lesson_skills_output", strict: false })],
      tool_choice: { type: "tool", name: "weekly_lesson_skills_output" }
    });
  });

  it("enables strict compilation for compact foundation components", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { durationMinutes: 10 } }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await provider.complete({
      taskId: "weekly_lesson_foundation", systemPrompt: "Return one foundation.", input: {},
      outputJsonSchema: { type: "object", properties: { durationMinutes: { type: "integer" } } },
      signal: new AbortController().signal, traceId: "trace-foundation-component"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      tools: [expect.objectContaining({ name: "weekly_lesson_foundation_output", strict: true })]
    });
  });

  it.each([
    "weekly_lesson_grammar_classifier",
    "weekly_lesson_objectives",
    "weekly_lesson_foundation",
    "weekly_lesson_comprehension",
    "weekly_lesson_language_practice",
    "weekly_lesson_speaking",
    "weekly_lesson_skills_reviewer"
  ])("enables strict compilation for compact weekly component %s", async (taskId) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: {} }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await provider.complete({
      taskId, systemPrompt: "Return one compact component.", input: {},
      outputJsonSchema: { type: "object", properties: {} },
      signal: new AbortController().signal, traceId: `trace-${taskId}`
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      tools: [expect.objectContaining({ name: `${taskId}_output`, strict: true })]
    });
  });

  it("omits the deprecated temperature override for claude-haiku-5-5", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { reply: "Hello" } }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", model: "claude-haiku-5-5", fetch });

    await provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, temperature: 0,
      signal: new AbortController().signal, traceId: "trace-no-deprecated-temperature"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).not.toHaveProperty("temperature");
  });

  it("keeps the temperature override for Anthropic models that support it", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { reply: "Hello" } }]
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", model: "claude-3-5-haiku-latest", fetch });

    await provider.complete({
      taskId: "coach_dialogue", systemPrompt: "Coach safely.", input: { message: "Hello" },
      outputJsonSchema: { type: "object" }, temperature: 0,
      signal: new AbortController().signal, traceId: "trace-supported-temperature"
    });

    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ temperature: 0 });
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
      content: [{ type: "text", text: '{"lessons":[' }],
      usage: { input_tokens: 640, output_tokens: 2200, cache_read_input_tokens: 900 }
    }), { status: 200 }));
    const provider = createAnthropicProvider({ apiKey: "test-secret-key", fetch });

    await expect(provider.complete({
      taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
      outputJsonSchema: { type: "object" }, maxOutputTokens: 2200,
      signal: new AbortController().signal, traceId: "trace-truncated"
    })).rejects.toMatchObject({
      code: "AI_OUTPUT_TRUNCATED",
      retryable: false,
      details: {
        stopReason: "max_tokens",
        maxOutputTokens: 2200,
        usage: { inputTokens: 640, outputTokens: 2200, totalTokens: 2840, cacheReadInputTokens: 900 }
      }
    });
    try {
      await provider.complete({
        taskId: "weekly_lessons", systemPrompt: "Return lessons.", input: {},
        outputJsonSchema: { type: "object" }, maxOutputTokens: 2200,
        signal: new AbortController().signal, traceId: "trace-truncated-again"
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('{"lessons":[');
    }
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

  it("extracts Retry-After on 429 and sends multi-turn repair messages while keeping the cached system block clean", async () => {
    const rateLimitedFetch = vi.fn().mockResolvedValue(new Response("rate-limited", {
      status: 429,
      headers: { "retry-after": "2" }
    }));
    const rateLimitedProvider = createAnthropicProvider({ apiKey: "test-secret-key", fetch: rateLimitedFetch });
    await expect(rateLimitedProvider.complete({
      taskId: "weekly_lesson_foundation",
      systemPrompt: "Stable foundation prompt.",
      input: { dayNumber: 1 },
      outputJsonSchema: { type: "object" },
      signal: new AbortController().signal,
      traceId: "trace-retry-after"
    })).rejects.toMatchObject({
      code: "AI_PROVIDER_RATE_LIMIT",
      retryable: true,
      retryAfterMs: 2000
    });

    const repairFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "tool_use", input: { durationMinutes: 10 } }]
    }), { status: 200 }));
    const repairProvider = createAnthropicProvider({ apiKey: "test-secret-key", fetch: repairFetch });
    await repairProvider.complete({
      taskId: "weekly_lesson_foundation",
      systemPrompt: "Stable foundation prompt.\n\nREPAIR REQUIRED: durationMinutes: Required\nPREVIOUS INVALID OUTPUT: {}",
      input: { dayNumber: 1 },
      messages: [
        { role: "user", content: JSON.stringify({ dayNumber: 1 }) },
        { role: "assistant", content: "{}" },
        { role: "user", content: "REPAIR REQUIRED: durationMinutes: Required" }
      ],
      outputJsonSchema: { type: "object" },
      signal: new AbortController().signal,
      traceId: "trace-multiturn-repair"
    });

    const init = repairFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.system).toEqual([{
      type: "text",
      text: expect.stringContaining("Stable foundation prompt."),
      cache_control: { type: "ephemeral" }
    }]);
    expect(body.system[0].text).not.toContain("PREVIOUS INVALID OUTPUT");
    expect(body.messages).toEqual([
      { role: "user", content: JSON.stringify({ dayNumber: 1 }) },
      { role: "assistant", content: "{}" },
      { role: "user", content: "REPAIR REQUIRED: durationMinutes: Required" }
    ]);
  });
});
