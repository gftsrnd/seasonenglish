import type { ZodType } from "zod";

export interface AiValidationIssue {
  path: string;
  message: string;
}

export interface AiTaskDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  promptKey: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  outputJsonSchema: Record<string, unknown>;
  normalizeOutput?: (rawOutput: unknown, input: TInput) => unknown;
  validateOutput?: (output: TOutput, input: TInput) => AiValidationIssue[];
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiProviderRequest {
  taskId: string;
  systemPrompt: string;
  input: unknown;
  messages?: AiMessage[];
  outputJsonSchema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
  signal: AbortSignal;
  traceId: string;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface AiProviderResponse {
  output: unknown;
  usage: AiUsage;
  stopReason?: string;
}

export interface AiProvider {
  name: string;
  model: string;
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export class AiProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly details?: unknown,
    public readonly retryAfterMs?: number
  ) {
    super(code);
    this.name = "AiProviderError";
  }
}

export class AiGatewayError extends Error {
  constructor(public readonly code: string, public readonly details?: unknown) {
    super(code);
    this.name = "AiGatewayError";
  }
}

export interface AiRunMetadata {
  traceId: string;
  taskId: string;
  provider: string;
  model: string;
  attempts: number;
  latencyMs: number;
  inputHash: string;
  schemaValid: true;
  usage: AiUsage;
  stopReason?: string;
}

export interface AiRunResult<TOutput = unknown> {
  output: TOutput;
  metadata: AiRunMetadata;
}

export interface AiTaskRunner {
  runTask(
    taskId: string,
    input: unknown,
    options?: {
      systemPrompt?: string;
      messages?: AiMessage[];
      maxOutputTokens?: number;
      temperature?: number;
      maxAttempts?: number;
    }
  ): Promise<AiRunResult>;
}
