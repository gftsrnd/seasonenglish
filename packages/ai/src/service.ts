import { createHash, randomUUID } from "node:crypto";
import type { AiTaskRegistry } from "./registry.js";
import { AiGatewayError, AiProviderError, type AiProvider, type AiRunResult } from "./types.js";

export function createAiService(options: {
  registry: AiTaskRegistry;
  provider: AiProvider;
  loadPrompt: (promptKey: string) => Promise<string>;
  timeoutMs?: number;
  maxAttempts?: number;
  createTraceId?: () => string;
  now?: () => number;
}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxAttempts = Math.max(1, Math.min(3, options.maxAttempts ?? 3));
  const createTraceId = options.createTraceId ?? randomUUID;
  const now = options.now ?? Date.now;

  return {
    async runTask<TOutput = unknown>(
      taskId: string,
      rawInput: unknown,
      runOptions?: { systemPrompt?: string; maxOutputTokens?: number }
    ): Promise<AiRunResult<TOutput>> {
      const task = options.registry.get(taskId);
      const inputResult = task.inputSchema.safeParse(rawInput);
      if (!inputResult.success) throw new AiGatewayError("AI_INPUT_INVALID");
      const input = inputResult.data;
      const systemPrompt = runOptions?.systemPrompt ?? await options.loadPrompt(task.promptKey);
      if (!systemPrompt.trim()) throw new AiGatewayError("AI_PROMPT_NOT_FOUND");
      const traceId = createTraceId();
      const inputHash = createHash("sha256").update(stableJson(input)).digest("hex");
      const startedAt = now();
      let lastError: unknown;
      let attemptPrompt = systemPrompt;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        let invalidOutput = "";
        try {
          const response = await callWithTimeout(
            () => options.provider.complete({
              taskId, systemPrompt: attemptPrompt, input, outputJsonSchema: task.outputJsonSchema,
              ...(runOptions?.maxOutputTokens === undefined ? {} : { maxOutputTokens: runOptions.maxOutputTokens }),
              signal: controller.signal, traceId
            }),
            timeoutMs,
            controller
          );
          const normalizedOutput = task.normalizeOutput ? task.normalizeOutput(response.output, input) : response.output;
          invalidOutput = stableJson(normalizedOutput).slice(0, 12_000);
          const outputResult = task.outputSchema.safeParse(normalizedOutput);
          if (!outputResult.success) {
            throw new AiGatewayError("AI_OUTPUT_INVALID", {
              issues: outputResult.error.issues.slice(0, 8).map(issue => ({ path: issue.path.join("."), message: issue.message }))
            });
          }
          const semanticIssues = task.validateOutput?.(outputResult.data, input) ?? [];
          if (semanticIssues.length) {
            throw new AiGatewayError("AI_OUTPUT_INVALID", { issues: semanticIssues.slice(0, 8) });
          }
          return {
            output: outputResult.data as TOutput,
            metadata: {
              traceId, taskId, provider: options.provider.name, model: options.provider.model,
              attempts: attempt, latencyMs: Math.max(0, now() - startedAt), inputHash,
              schemaValid: true, usage: response.usage
            }
          };
        } catch (error) {
          lastError = normalizeError(error);
          if (lastError instanceof AiGatewayError && lastError.code === "AI_OUTPUT_INVALID") {
            const details = lastError.details as { issues?: Array<{ path: string; message: string }> } | undefined;
            const issues = Array.isArray(details?.issues)
              ? details.issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join("; ")
              : "The previous structured output did not satisfy the schema.";
            const previousOutput = invalidOutput
              ? `\nPREVIOUS INVALID OUTPUT: ${invalidOutput}`
              : "";
            attemptPrompt = `${systemPrompt}\n\nREPAIR REQUIRED: ${issues}${previousOutput}\nReturn a complete corrected result; preserve valid fields and change every field identified above; never leave required strings empty.`;
          }
          if (!isRetryable(lastError) || attempt === maxAttempts) throw lastError;
        }
      }
      throw normalizeError(lastError);
    }
  };
}

async function callWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiGatewayError("AI_TIMEOUT"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function normalizeError(error: unknown): AiGatewayError | AiProviderError {
  if (error instanceof AiGatewayError || error instanceof AiProviderError) return error;
  if (error instanceof DOMException && error.name === "AbortError") return new AiGatewayError("AI_TIMEOUT");
  return new AiProviderError("AI_PROVIDER_FAILED", false);
}

function isRetryable(error: unknown): boolean {
  return (error instanceof AiProviderError && error.retryable)
    || (error instanceof AiGatewayError && (error.code === "AI_TIMEOUT" || error.code === "AI_OUTPUT_INVALID"));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
