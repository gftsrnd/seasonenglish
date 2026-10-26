import { AI_TASKS, createAiService, createAnthropicProvider, createGroqProvider, type AiProvider, type AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { ManagerAiRuntimeSettings } from "@e4s/database";
import type { Pool } from "pg";

export function normalizeAiMaxAttempts(raw: string | number | undefined): number {
  const configured = Number(raw ?? 3);
  return Number.isFinite(configured) ? Math.max(1, Math.min(3, Math.trunc(configured))) : 3;
}

/**
 * Builds an AI runner from the provider credential saved by Manager settings.
 * The credential is decrypted and consumed only on the API; it is never put in
 * the capability response or sent to the browser.
 */
export function createOrganizationAiRunnerFactory(pool: Pool, fallback?: AiTaskRunner, options: { preferFallback?: boolean; timeoutMs?: number; maxAttempts?: number } = {}): (actorId: string) => Promise<AiTaskRunner | undefined> {
  const repositories = createRepositories(pool);
  return async (actorId) => {
    const testMode = await pool.query<{ ai_test_disabled: boolean }>(
      `select coalesce((os.configuration ->> 'aiTestDisabled')::boolean, false) as ai_test_disabled
       from users u
       left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`,
      [actorId]
    );
    if (testMode.rows[0]?.ai_test_disabled === true) return undefined;
    // When an environment provider is selected it is the only source of
    // truth. Never silently fall through to a stale database provider.
    if (options.preferFallback) return fallback;
    const runtime = await repositories.manager.providerRuntime(actorId);
    if (!runtime) return fallback;
    return createAiService({
      registry: AI_TASKS,
      provider: createProviderFromRuntime(runtime),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxAttempts !== undefined ? { maxAttempts: options.maxAttempts } : {}),
      loadPrompt: async (promptKey) => (await repositories.aiRuns.activeTaskPrompt(actorId, promptKey))?.prompt ?? ""
    });
  };
}

export function createProviderFromRuntime(runtime: ManagerAiRuntimeSettings): AiProvider {
  if (runtime.provider === "claude") {
    return createAnthropicProvider({ apiKey: runtime.credential, baseUrl: runtime.baseUrl, model: runtime.model });
  }
  if (runtime.provider === "openai") {
    return createGroqProvider({ apiKey: runtime.credential, baseUrl: runtime.baseUrl, model: runtime.model });
  }
  throw new Error("AI_PROVIDER_UNSUPPORTED");
}
