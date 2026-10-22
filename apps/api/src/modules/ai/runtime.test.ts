import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createOrganizationAiRunnerFactory, createProviderFromRuntime } from "./runtime.js";

describe("organization AI runtime", () => {
  it("creates the Anthropic provider for Claude settings", () => {
    const provider = createProviderFromRuntime({
      provider: "claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5", credential: "test-secret"
    });

    expect(provider.name).toBe("anthropic");
    expect(provider.model).toBe("claude-haiku-5-5");
  });

  it("does not fall through to a database provider when the environment provider is authoritative", async () => {
    const pool = {
      query: () => { throw new Error("DATABASE_PROVIDER_MUST_NOT_BE_READ"); }
    } as unknown as Pool;
    const factory = createOrganizationAiRunnerFactory(pool, undefined, { preferFallback: true });

    await expect(factory("operator-id")).resolves.toBeUndefined();
  });
});
