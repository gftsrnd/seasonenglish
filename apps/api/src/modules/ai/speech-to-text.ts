import { createOpenAiTranscriber, type SpeechTranscriber } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { Pool } from "pg";

export const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

/**
 * Speech-to-text from the process environment, like the other OpenAI features
 * (illustrations): OPENAI_API_KEY (+ optional OPENAI_BASE_URL) and
 * OPENAI_TRANSCRIPTION_MODEL (default gpt-4o-mini-transcribe; "off" disables it).
 */
export function createTranscriberFromEnvironment(env: NodeJS.ProcessEnv): SpeechTranscriber | undefined {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const configured = env.OPENAI_TRANSCRIPTION_MODEL?.trim();
  if (!apiKey || configured?.toLowerCase() === "off") return undefined;
  return createOpenAiTranscriber({
    apiKey,
    model: configured || DEFAULT_TRANSCRIPTION_MODEL,
    ...(env.OPENAI_BASE_URL?.trim() ? { baseUrl: env.OPENAI_BASE_URL.trim() } : {})
  });
}

/**
 * Per-actor speech-to-text: the organisation's AI test mode turns it off; the
 * environment transcriber wins; otherwise the Manager's OpenAI-compatible
 * provider is used when it has a speech-to-text model. Returns undefined when no
 * STT-capable provider is configured (the recording then goes to the operator).
 */
export function createSpeechToTextFactory(pool: Pool, environment?: SpeechTranscriber): (actorId: string) => Promise<SpeechTranscriber | undefined> {
  const repositories = createRepositories(pool);
  return async (actorId) => {
    const testMode = await pool.query<{ ai_test_disabled: boolean }>(
      `select coalesce((os.configuration ->> 'aiTestDisabled')::boolean, false) as ai_test_disabled
       from users u left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`,
      [actorId]
    );
    if (testMode.rows[0]?.ai_test_disabled === true) return undefined;
    if (environment) return environment;
    const runtime = await repositories.manager.providerRuntime(actorId).catch(() => null);
    if (!runtime || runtime.provider !== "openai" || !runtime.speechToTextModel?.trim()) return undefined;
    return createOpenAiTranscriber({
      apiKey: runtime.credential, baseUrl: runtime.baseUrl, model: runtime.speechToTextModel, provider: "openai-compatible"
    });
  };
}
