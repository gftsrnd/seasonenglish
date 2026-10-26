import { AiProviderError, type AiProvider, type AiProviderRequest, type AiProviderResponse } from "../types.js";

export function createGroqProvider(options: {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}): AiProvider {
  const model = options.model ?? "qwen/qwen3.8-27b";
  const baseUrl = (options.baseUrl ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  if (!options.apiKey.trim()) throw new AiProviderError("AI_PROVIDER_NOT_CONFIGURED", false);

  return {
    name: "groq",
    model,
    async complete(request: AiProviderRequest): Promise<AiProviderResponse> {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal: request.signal,
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
            "x-client-request-id": request.traceId
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            // Keep the model-safe default for Groq; Anthropic's weekly lesson
            // request may opt into a larger budget through maxOutputTokens.
            max_tokens: Math.min(request.maxOutputTokens ?? 8192, 8192),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: `${request.taskId}_output`,
                strict: false,
                schema: request.outputJsonSchema
              }
            },
            messages: [
              { role: "system", content: `${request.systemPrompt}\nReturn only JSON matching the supplied response schema. Do not add prose, markdown, legacy keys, or omit required nested fields.` },
              { role: "user", content: JSON.stringify(request.input) }
            ]
          })
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new AiProviderError("AI_PROVIDER_NETWORK", true);
      }
      if (!response.ok) {
        if (response.status === 429) throw new AiProviderError("AI_PROVIDER_RATE_LIMIT", true);
        if (response.status >= 500) throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", true);
        throw new AiProviderError("AI_PROVIDER_REJECTED", false);
      }
      const body = await response.json().catch(() => null) as GroqResponse | null;
      if (body?.choices?.[0]?.finish_reason === "length") {
        throw new AiProviderError("AI_OUTPUT_TRUNCATED", false);
      }
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true);
      let output: unknown;
      try { output = JSON.parse(content); }
      catch { throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true); }
      return {
        output,
        usage: {
          ...(typeof body?.usage?.prompt_tokens === "number" ? { inputTokens: body.usage.prompt_tokens } : {}),
          ...(typeof body?.usage?.completion_tokens === "number" ? { outputTokens: body.usage.completion_tokens } : {}),
          ...(typeof body?.usage?.total_tokens === "number" ? { totalTokens: body.usage.total_tokens } : {})
        }
      };
    }
  };
}
interface GroqResponse {
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
