import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createOrganizationAiRunnerFactory, createProviderFromRuntime, normalizeAiMaxAttempts } from "./runtime.js";

describe("organization AI runtime", () => {
  it("allows at most three provider attempts", () => {
    expect(normalizeAiMaxAttempts(undefined)).toBe(3);
    expect(normalizeAiMaxAttempts("2")).toBe(2);
    expect(normalizeAiMaxAttempts("99")).toBe(3);
  });
  it("creates the Anthropic provider for Claude settings", () => {
    const provider = createProviderFromRuntime({
      provider: "claude", baseUrl: "https://api.anthropic.com/v1", model: "claude-haiku-5-5", credential: "test-secret"
    });

    expect(provider.name).toBe("anthropic");
    expect(provider.model).toBe("claude-haiku-5-5");
  });

  it("does not fall through to a database provider when the environment provider is authoritative", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ai_test_disabled: false }] })
    } as unknown as Pool;
    const factory = createOrganizationAiRunnerFactory(pool, undefined, { preferFallback: true });

    await expect(factory("operator-id")).resolves.toBeUndefined();
  });

  it("treats a supplied environment runner as authoritative by default", async () => {
    const fallback = { runTask: vi.fn() } as any;
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ ai_test_disabled: false }] })
        .mockRejectedValueOnce(new Error("stale database provider must not be read"))
    } as unknown as Pool;
    const factory = createOrganizationAiRunnerFactory(pool, fallback);

    await expect(factory("operator-id")).resolves.toBe(fallback);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("returns no runner while Manager AI test mode is disabled even with an environment runner", async () => {
    const fallback = { runTask: vi.fn() } as any;
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ai_test_disabled: true }] })
    } as unknown as Pool;
    const factory = createOrganizationAiRunnerFactory(pool, fallback, { preferFallback: true });

    await expect(factory("operator-id")).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
