import { coachOutputSchema, type AiRunResult } from "@e4s/ai";
import type { CoachTaskOutput } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

export interface AiTaskRunner {
  runTask(
    taskId: string,
    input: unknown,
    options?: { systemPrompt?: string; maxOutputTokens?: number }
  ): Promise<AiRunResult>;
}

const messageInput = z.object({
  requestId: z.uuid(),
  message: z.string().trim().min(1).max(2_000)
});
const personaInput = z.object({ persona: z.enum(["informal", "formal"]) });
const vocabularyUnlockParams = z.object({ word: z.string().trim().min(1).max(160) });

export function registerCoachRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>
): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);

  app.get("/api/v1/coach", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const view = await repositories.coach.currentForLearner(learnerId, Boolean(await runnerFor(learnerId)));
    return view ?? reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
  });

  app.post("/api/v1/coach/vocabulary/:word/unlock", { preHandler: learnerOnly }, async (request, reply) => {
    const params = vocabularyUnlockParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_COACH_VOCABULARY" });
    const learnerId = request.e4sSession!.user.id;
    const view = await repositories.coach.unlockVocabulary(
      learnerId,
      params.data.word,
      Boolean(await runnerFor(learnerId))
    );
    return view ?? reply.code(404).send({ code: "COACH_VOCABULARY_NOT_FOUND" });
  });

  app.post("/api/v1/coach/messages", {
    preHandler: learnerOnly,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = messageInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_COACH_MESSAGE" });
    const learnerId = request.e4sSession!.user.id;
    const runner = await runnerFor(learnerId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const existing = await repositories.coach.currentForLearner(learnerId, true);
    if (!existing) return reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
    if (await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "coach_dialogue")) return existing;
    if (existing.daily.used >= existing.daily.limit) return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });

    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "coach_dialogue");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await runner.runTask("coach_dialogue", {
        message: parsed.data.message,
        cefr: existing.cefr,
        persona: existing.persona,
        scenario: existing.topic,
        priorTurns: existing.messages.slice(-8).map((message) => ({ speaker: message.speaker, text: message.text }))
      }, { systemPrompt: coachPersonaPrompt(task.prompt, existing.persona) });
      const output = coachOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      await repositories.coach.saveAiTurn({
        learnerId,
        sessionId: existing.sessionId,
        requestId: parsed.data.requestId,
        message: parsed.data.message,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output: output.data as CoachTaskOutput,
        metadata: {
          traceId: result.metadata.traceId,
          provider: result.metadata.provider,
          model: result.metadata.model,
          inputHash: result.metadata.inputHash,
          usage: result.metadata.usage,
          latencyMs: result.metadata.latencyMs
        }
      });
      return await repositories.coach.currentForLearner(learnerId, true);
    } catch (error) {
      request.log.warn({ code: safeAiErrorCode(error) }, "AI coach request failed");
      return reply.code(aiErrorStatus(error)).send({ code: safeAiErrorCode(error) });
    }
  });

  app.put("/api/v1/coach/persona", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = personaInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_COACH_PERSONA" });
    const learnerId = request.e4sSession!.user.id;
    const aiAvailable = Boolean(await runnerFor(learnerId));
    await repositories.coach.currentForLearner(learnerId, aiAvailable);
    await repositories.coach.setPersona(learnerId, parsed.data.persona);
    return await repositories.coach.currentForLearner(learnerId, aiAvailable);
  });

  app.delete("/api/v1/coach/session", { preHandler: learnerOnly }, async (request) => {
    const learnerId = request.e4sSession!.user.id;
    await repositories.coach.archiveCurrent(learnerId);
    return await repositories.coach.currentForLearner(learnerId, Boolean(await runnerFor(learnerId)));
  });

  app.get("/api/v1/challenge", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const view = await repositories.coach.challengeForLearner(learnerId, Boolean(await runnerFor(learnerId)));
    return view ?? reply.code(404).send({ code: "LEVEL_CHALLENGE_NOT_AVAILABLE" });
  });

  app.post("/api/v1/challenge/messages", {
    preHandler: learnerOnly,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = messageInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_CHALLENGE_MESSAGE" });
    const learnerId = request.e4sSession!.user.id;
    const runner = await runnerFor(learnerId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const existing = await repositories.coach.challengeForLearner(learnerId, true);
    if (!existing) return reply.code(404).send({ code: "LEVEL_CHALLENGE_NOT_AVAILABLE" });
    if (existing.progress.complete) return existing;
    if (existing.daily.used >= existing.daily.limit) return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });
    if (await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "coach_dialogue")) return existing;
    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "coach_dialogue");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await runner.runTask("coach_dialogue", {
        message: parsed.data.message,
        cefr: existing.targetLevel,
        persona: "formal",
        scenario: `Level-up challenge for ${existing.targetLevel}. Ask one workplace follow-up question at a time.`,
        priorTurns: existing.messages.slice(-8).map((message) => ({ speaker: message.speaker, text: message.text }))
      }, { systemPrompt: coachPersonaPrompt(task.prompt, "formal") });
      const output = coachOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      await repositories.coach.saveAiTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
        message: parsed.data.message, taskId: task.taskId, promptVersionId: task.promptVersionId,
        challengeAttemptId: existing.assessmentAttemptId,
        output: output.data as CoachTaskOutput,
        metadata: { traceId: result.metadata.traceId, provider: result.metadata.provider, model: result.metadata.model,
          inputHash: result.metadata.inputHash, usage: result.metadata.usage, latencyMs: result.metadata.latencyMs }
      });
      return await repositories.coach.challengeForLearner(learnerId, true);
    } catch (error) {
      request.log.warn({ code: safeAiErrorCode(error) }, "Level challenge AI request failed");
      return reply.code(aiErrorStatus(error)).send({ code: safeAiErrorCode(error) });
    }
  });
}

export function coachPersonaPrompt(prompt: string, persona: "informal" | "formal"): string {
  const instruction = persona === "formal"
    ? "FORMAL STYLE: Use professional, courteous workplace English. Avoid slang, contractions, emojis, and overly familiar language."
    : "INFORMAL STYLE: Use warm, friendly, natural workplace English. Contractions are welcome, but keep the language respectful and CEFR-appropriate.";
  const correctionGuard = "TRANSLATIONS: Return a natural Vietnamese translation of Season's complete reply in replyTranslation. For every correction, return a natural Vietnamese translation of the corrected learner sentence in suggestions[].translation. Keep explanation focused only on the short language reason; never place a translation inside explanation. CORRECTIONS ONLY: Only put genuine language errors in suggestions. If the learner's message is grammatical, relevant, and answers the question—even if it is brief or less specific—return suggestions: [] and correctedText: \"\". Do not rewrite a correct answer merely to make it longer, more detailed, or stylistically different. Invite more detail only in the conversational reply or follow-up question, without marking the learner's answer as wrong.";
  return `${prompt}\n\n${instruction}\n\n${correctionGuard}`;
}

function safeAiErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const code = error.code;
    if (code.startsWith("AI_")) return code;
  }
  return "AI_PROVIDER_FAILED";
}

function aiErrorStatus(error: unknown): 429 | 502 | 503 | 504 {
  const code = safeAiErrorCode(error);
  if (code === "AI_PROVIDER_RATE_LIMIT") return 429;
  if (code === "AI_TIMEOUT") return 504;
  if (code === "AI_PROVIDER_NOT_CONFIGURED" || code === "AI_PROMPT_NOT_FOUND") return 503;
  return 502;
}
