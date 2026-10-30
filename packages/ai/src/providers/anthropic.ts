import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResponse } from "../types.js";

export function createAnthropicProvider(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}): AiProvider {
  const model = options.model ?? "claude-haiku-5-5";
  const baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  if (!options.apiKey.trim()) throw new AiProviderError("AI_PROVIDER_NOT_CONFIGURED", false);

  return {
    name: "anthropic",
    model,
    async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
      let response: Response;
      const hasMultiTurnMessages = Array.isArray(request.messages) && request.messages.length > 0;
      const stableSystemPrompt = hasMultiTurnMessages
        ? request.systemPrompt.replace(/\n\nREPAIR REQUIRED(?: FOR THIS COMPONENT ONLY)?:[\s\S]*$/u, "").trim()
        : request.systemPrompt;
      const systemText = `${stableSystemPrompt}\nReturn only the structured tool input. Follow the tool schema exactly; do not add prose, markdown, legacy keys, or omit required nested fields.`;
      const messages = hasMultiTurnMessages
        ? request.messages
        : [{ role: "user" as const, content: JSON.stringify(request.input) }];
      try {
        response = await fetch(`${baseUrl}/messages`, {
          method: "POST",
          signal: request.signal,
          headers: {
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "x-api-key": options.apiKey,
            "x-client-request-id": request.traceId
          },
          body: JSON.stringify({
            model,
            max_tokens: request.maxOutputTokens ?? 8192,
            ...(request.temperature === undefined || model === "claude-haiku-5-5" ? {} : { temperature: request.temperature }),
            ...(model === "claude-haiku-5-5" ? { thinking: { type: "disabled" } } : {}),
            tools: [{
              name: `${request.taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}_output`,
              description: "Return the requested result in the exact structured schema.",
              // The task schemas are validated by Zod after the response. Anthropic's
              // strict grammar accepts only a smaller JSON-Schema subset and rejects
              // valid Coach constraints such as minimum/maximum before inference.
              // The legacy six-exercise schema is intentionally non-strict:
              // Anthropic rejects that compiled grammar as too large. New weekly
              // generation uses provider-sized strict subcomponents instead.
              strict: request.taskId === "weekly_lesson_grammar_classifier"
                || request.taskId === "weekly_lesson_objectives"
                || request.taskId === "weekly_lesson_foundation"
                || request.taskId === "weekly_lesson_vocabulary"
                || request.taskId === "weekly_lesson_comprehension"
                || request.taskId === "weekly_lesson_language_practice"
                || request.taskId === "weekly_lesson_speaking"
                || request.taskId === "weekly_lesson_length_repair"
                || request.taskId === "weekly_lesson_skills_reviewer",
              input_schema: request.outputJsonSchema,
              // Cache only the stable schema/tool prefix. Week, learner and
              // repair input stays dynamic and is never cached.
              cache_control: { type: "ephemeral" }
            }],
            tool_choice: { type: "tool", name: `${request.taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}_output` },
            system: [{
              type: "text",
              text: systemText,
              cache_control: { type: "ephemeral" }
            }],
            messages
          })
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new AiProviderError("AI_PROVIDER_NETWORK", true);
      }
      if (!response.ok) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        if (response.status === 429) throw new AiProviderError("AI_PROVIDER_RATE_LIMIT", true, undefined, retryAfterMs);
        if (response.status >= 500) throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", true, undefined, retryAfterMs);
        const providerError = await response.json().catch(() => null) as AnthropicErrorResponse | null;
        throw new AiProviderError(
          "AI_PROVIDER_REJECTED",
          false,
          safeProviderErrorDetails(response.status, providerError)
        );
      }
      const body = await response.json().catch(() => null) as AnthropicResponse | null;
      if (body?.stop_reason === "max_tokens") {
        throw new AiProviderError("AI_OUTPUT_TRUNCATED", false, {
          stopReason: "max_tokens",
          maxOutputTokens: request.maxOutputTokens ?? 8192,
          usage: anthropicUsage(body.usage)
        });
      }
      const toolInput = body?.content?.find((block) => block.type === "tool_use")?.input;
      if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
        return {
          output: toolInput,
          ...(body.stop_reason ? { stopReason: body.stop_reason } : {}),
          usage: anthropicUsage(body.usage)
        };
      }
      const text = body?.content?.find((block) => block.type === "text")?.text;
      // A transient provider response can be valid HTTP but still have no
      // usable text block. Retry only this failed call; never persist it.
      if (typeof text !== "string") throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true);
      let output: unknown;
      try { output = parseJsonResponse(text); }
      catch { throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true); }
      return {
        output,
        ...(body?.stop_reason ? { stopReason: body.stop_reason } : {}),
        usage: anthropicUsage(body?.usage)
      };
    }
  };
}

function anthropicUsage(usage: AnthropicResponse["usage"]): AiProviderResponse["usage"] {
  const inputTokens = usage?.input_tokens;
  const outputTokens = usage?.output_tokens;
  const cacheCreationInputTokens = usage?.cache_creation_input_tokens;
  const cacheReadInputTokens = usage?.cache_read_input_tokens;
  return {
    ...(typeof inputTokens === "number" ? { inputTokens } : {}),
    ...(typeof outputTokens === "number" ? { outputTokens } : {}),
    ...(typeof inputTokens === "number" && typeof outputTokens === "number" ? { totalTokens: inputTokens + outputTokens } : {}),
    ...(typeof cacheCreationInputTokens === "number" ? { cacheCreationInputTokens } : {}),
    ...(typeof cacheReadInputTokens === "number" ? { cacheReadInputTokens } : {})
  };
}

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(60_000, Math.ceil(seconds * 1000));
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isNaN(parsedDate)) {
    return Math.min(60_000, Math.max(0, parsedDate - Date.now()));
  }
  return undefined;
}

function safeProviderErrorDetails(status: number, body: AnthropicErrorResponse | null): { status: number; issues: Array<{ path: string; message: string }> } {
  const providerType = safeText(body?.error?.type, 80);
  const providerMessage = safeText(body?.error?.message, 300) || "Request rejected by provider.";
  return {
    status,
    issues: [{
      path: "provider",
      message: `Anthropic HTTP ${status}${providerType ? ` (${providerType})` : ""}: ${providerMessage}`
    }]
  };
}

function safeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, maxLength);
}

function parseJsonResponse(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(normalized); } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("JSON_OBJECT_NOT_FOUND");
    return JSON.parse(normalized.slice(start, end + 1));
  }
}

interface AnthropicResponse {
  stop_reason?: string;
  content?: Array<{ type?: string; text?: string; input?: unknown }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

interface AnthropicErrorResponse {
  error?: { type?: unknown; message?: unknown };
}
