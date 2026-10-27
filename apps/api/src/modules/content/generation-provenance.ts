import type { ContentWeekInput } from "@e4s/contracts";

export interface GenerationProvenance {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly prompt: {
    readonly versionId: string;
    readonly content: string;
  };
  readonly model: {
    readonly provider: string;
    readonly name: string;
    readonly config: Record<string, unknown>;
  };
  readonly input: ContentWeekInput & { readonly cefr: string } & Record<string, unknown>;
  readonly output: unknown;
  readonly validation: {
    readonly valid: boolean;
    readonly issues: readonly unknown[];
  };
}

/**
 * Stored inside the copy-on-write lesson-set version payload.  Keeping the
 * provenance with the version means a later prompt change cannot make an
 * approved lesson impossible to reconstruct or audit.
 */
export function buildGenerationProvenance(input: {
  promptVersionId: string;
  prompt: string;
  model: { provider: string; name: string; config?: Record<string, unknown> };
  week: ContentWeekInput;
  cefr: string;
  extraInput?: Record<string, unknown>;
  output: unknown;
  validation: { valid: boolean; issues: readonly unknown[] };
  generatedAt?: Date;
}): GenerationProvenance {
  return {
    schemaVersion: 1,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    prompt: {
      versionId: input.promptVersionId,
      content: input.prompt
    },
    model: {
      provider: input.model.provider,
      name: input.model.name,
      config: input.model.config ?? {}
    },
    input: {
      ...input.week,
      cefr: input.cefr,
      ...input.extraInput
    },
    output: input.output,
    validation: {
      valid: input.validation.valid,
      issues: input.validation.issues
    }
  };
}
