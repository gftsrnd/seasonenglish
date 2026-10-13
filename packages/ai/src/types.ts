import type { ZodType } from "zod";

export interface AiTaskDefinition<TInput = unknown, TOutput = unknown> {
  id: string;
  promptKey: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  outputJsonSchema: Record<string, unknown>;
}

export interface AiProviderRequest {
  taskId: string;
  systemPrompt: string;
  input: unknown;
  outputJsonSchema: Record<string, unknown>;
  signal: AbortSignal;
  traceId: string;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AiProviderResponse {
  output: unknown;
  usage: AiUsage;
}

export interface AiProvider {
  name: string;
  model: string;
  complete(request: AiProviderRequest): Promise<AiProviderResponse>;
}

export class AiProviderError extends Error {
  constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
    this.name = "AiProviderError";
  }
}

export class AiGatewayError extends Error {
  constructor(public readonly code: string) {
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
}

export interface AiRunResult<TOutput = unknown> {
  output: TOutput;
  metadata: AiRunMetadata;
}
