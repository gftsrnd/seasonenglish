import { AiProviderError, type AiUsage } from "../types.js";

export interface SpeechTranscriptionResult {
  text: string;
  /** Audio length when the provider reports it (whisper verbose_json or duration usage). */
  durationSeconds?: number;
  /** Words the recogniser was unsure about (token probability below 0.5), when logprobs are available. */
  uncertainWords: string[];
  usage: AiUsage;
  provider: string;
  model: string;
  latencyMs: number;
}

export interface SpeechTranscriber {
  provider: string;
  model: string;
  transcribe(input: { audio: Uint8Array; mimeType: string; signal?: AbortSignal; language?: string }): Promise<SpeechTranscriptionResult>;
}

/**
 * OpenAI-compatible `/audio/transcriptions` (OpenAI gpt-4o(-mini)-transcribe or
 * whisper-1, Groq whisper-large-v3(-turbo)). No `prompt` is sent on purpose:
 * biasing the recogniser toward the lesson's target words would hide the very
 * pronunciation misses the daily Speaking grade looks for.
 */
export function createOpenAiTranscriber(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  provider?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}): SpeechTranscriber {
  if (!options.apiKey.trim() || !options.model.trim()) throw new AiProviderError("AI_PROVIDER_NOT_CONFIGURED", false);
  const model = options.model.trim();
  const baseUrl = (options.baseUrl?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
  const fetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const provider = options.provider ?? "openai";
  const whisper = /whisper/i.test(model);

  return {
    provider,
    model,
    async transcribe(input) {
      const startedAt = now();
      const form = new FormData();
      form.append("model", model);
      form.append("file", new Blob([new Uint8Array(input.audio)], { type: input.mimeType || "audio/webm" }), `recording.${audioExtension(input.mimeType)}`);
      form.append("language", input.language ?? "en");
      form.append("temperature", "0");
      if (whisper) {
        form.append("response_format", "verbose_json");
      } else {
        form.append("response_format", "json");
        form.append("include[]", "logprobs");
      }
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: { authorization: `Bearer ${options.apiKey}` },
          body: form,
          ...(input.signal ? { signal: input.signal } : {})
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw new AiProviderError("AI_TIMEOUT", true);
        throw new AiProviderError("AI_PROVIDER_NETWORK", true);
      }
      if (!response.ok) {
        if (response.status === 429) throw new AiProviderError("AI_PROVIDER_RATE_LIMIT", true);
        if (response.status >= 500) throw new AiProviderError("AI_PROVIDER_UNAVAILABLE", true);
        if (response.status === 401 || response.status === 403) throw new AiProviderError("AI_PROVIDER_AUTH", false);
        throw new AiProviderError("AI_STT_REJECTED", false);
      }
      const body = await response.json().catch(() => null) as TranscriptionBody | null;
      if (!body || typeof body.text !== "string") throw new AiProviderError("AI_PROVIDER_MALFORMED_RESPONSE", true);
      const durationSeconds = typeof body.duration === "number" ? body.duration
        : body.usage?.type === "duration" && typeof body.usage.seconds === "number" ? body.usage.seconds : undefined;
      return {
        text: body.text.trim(),
        ...(durationSeconds === undefined ? {} : { durationSeconds }),
        uncertainWords: uncertainWords(body.logprobs),
        usage: {
          ...(typeof body.usage?.input_tokens === "number" ? { inputTokens: body.usage.input_tokens } : {}),
          ...(typeof body.usage?.output_tokens === "number" ? { outputTokens: body.usage.output_tokens } : {}),
          ...(typeof body.usage?.total_tokens === "number" ? { totalTokens: body.usage.total_tokens } : {})
        },
        provider,
        model,
        latencyMs: Math.max(0, now() - startedAt)
      };
    }
  };
}

export function audioExtension(mimeType: string): string {
  const type = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (type === "audio/ogg") return "ogg";
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a" || type === "audio/aac") return "m4a";
  if (type === "audio/mpeg" || type === "audio/mp3") return "mp3";
  if (type === "audio/wav" || type === "audio/x-wav" || type === "audio/wave") return "wav";
  if (type === "audio/flac") return "flac";
  return "webm";
}

const UNCERTAIN_LOGPROB = Math.log(0.5);

function uncertainWords(logprobs: TranscriptionBody["logprobs"]): string[] {
  if (!Array.isArray(logprobs)) return [];
  const words = new Set<string>();
  for (const entry of logprobs) {
    if (!entry || typeof entry.token !== "string" || typeof entry.logprob !== "number") continue;
    if (entry.logprob >= UNCERTAIN_LOGPROB) continue;
    const word = entry.token.replace(/[^\p{L}\p{N}'-]/gu, "").trim();
    if (/\p{L}/u.test(word)) words.add(word.toLocaleLowerCase("en"));
    if (words.size >= 40) break;
  }
  return [...words];
}

interface TranscriptionBody {
  text?: unknown;
  duration?: unknown;
  logprobs?: Array<{ token?: unknown; logprob?: unknown }>;
  usage?: { type?: string; seconds?: unknown; input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
}
