import { AI_TASKS, createAiService, createGroqProvider } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { Pool } from "pg";
import type { AiTaskRunner } from "../coach/index.js";

/**
 * Builds an AI runner from the provider credential saved by Manager settings.
 * The credential is decrypted and consumed only on the API; it is never put in
 * the capability response or sent to the browser.
 */
export function createOrganizationAiRunnerFactory(pool: Pool, fallback?: AiTaskRunner): (actorId: string) => Promise<AiTaskRunner | undefined> {
  const repositories = createRepositories(pool);
  return async (actorId) => {
    const runtime = await repositories.manager.providerRuntime(actorId);
    if (!runtime) return fallback;
    if (runtime.provider !== "openai") return undefined;
    return createAiService({
      registry: AI_TASKS,
      provider: createGroqProvider({ apiKey: runtime.credential, baseUrl: runtime.baseUrl, model: runtime.model }),
      loadPrompt: async (promptKey) => (await repositories.aiRuns.activeTaskPrompt(actorId, promptKey))?.prompt ?? ""
    });
  };
}
