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
            ...(model === "claude-haiku-5-5" ? { thinking: { type: "disabled" } } : {}),
            tools: [{
              name: `${request.taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}_output`,
              description: "Return the requested result in the exact structured schema.",
              // The task schemas are validated by Zod after the response. Anthropic's
              // strict grammar accepts only a smaller JSON-Schema subset and rejects
              // valid Coach constraints such as minimum/maximum before inference.
              strict: false,
              input_schema: request.outputJsonSchema
            }],
            tool_choice: { type: "tool", name: `${request.taskId.replace(/[^a-zA-Z0-9_-]/g, "_")}_output` },
            system: `${request.systemPrompt}\nReturn only the structured tool input. Follow the tool schema exactly; do not add prose, markdown, legacy keys, or omit required nested fields.`,
            messages: [{ role: "user", content: JSON.stringify(request.input) }]
          })
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new AiProviderError("AI_PROVIDER_NETWORK", true);
      }
      if (!response.ok) {
        if (response.status === 429) throw new AiProviderError("AI_PROVIDER_RATE_LIMIT", true);
        if (response.status >= 500) throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", true);
        const providerError = await response.json().catch(() => null) as AnthropicErrorResponse | null;
        throw new AiProviderError(
          "AI_PROVIDER_REJECTED",
          false,
          safeProviderErrorDetails(response.status, providerError)
        );
      }
      const body = await response.json().catch(() => null) as AnthropicResponse | null;
      if (body?.stop_reason === "max_tokens") {
        throw new AiProviderError("AI_OUTPUT_TRUNCATED", false);
      }
      const toolInput = body?.content?.find((block) => block.type === "tool_use")?.input;
      if (toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)) {
        const inputTokens = body?.usage?.input_tokens;
        const outputTokens = body?.usage?.output_tokens;
        return {
          output: toolInput,
          usage: {
            ...(typeof inputTokens === "number" ? { inputTokens } : {}),
            ...(typeof outputTokens === "number" ? { outputTokens } : {}),
            ...(typeof inputTokens === "number" && typeof outputTokens === "number" ? { totalTokens: inputTokens + outputTokens } : {})
          }
        };
      }
      const text = body?.content?.find((block) => block.type === "text")?.text;
      // A transient provider response can be valid HTTP but still have no
      // usable text block. Retry only this failed call; never persist it.
      if (typeof text !== "string") throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true);
      let output: unknown;
      try { output = parseJsonResponse(text); }
      catch { throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true); }
      const inputTokens = body?.usage?.input_tokens;
      const outputTokens = body?.usage?.output_tokens;
      return {
        output,
        usage: {
          ...(typeof inputTokens === "number" ? { inputTokens } : {}),
          ...(typeof outputTokens === "number" ? { outputTokens } : {}),
          ...(typeof inputTokens === "number" && typeof outputTokens === "number" ? { totalTokens: inputTokens + outputTokens } : {})
        }
      };
    }
  };
}

function safeProviderErrorDetails(status: number, body: AnthropicErrorResponse | null): { issues: Array<{ path: string; message: string }> } {
  const providerType = safeText(body?.error?.type, 80);
  const providerMessage = safeText(body?.error?.message, 300) || "Request rejected by provider.";
  return {
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
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicErrorResponse {
  error?: { type?: unknown; message?: unknown };
}
