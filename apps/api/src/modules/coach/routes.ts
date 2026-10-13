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
    options?: { systemPrompt?: string }
  ): Promise<AiRunResult>;
}

const messageInput = z.object({
  requestId: z.uuid(),
  message: z.string().trim().min(1).max(2_000)
});
const personaInput = z.object({ persona: z.enum(["informal", "formal"]) });

export function registerCoachRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/coach", { preHandler: learnerOnly }, async (request, reply) => {
    const view = await repositories.coach.currentForLearner(request.e4sSession!.user.id, Boolean(aiRunner));
    return view ?? reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
  });

  app.post("/api/v1/coach/messages", {
    preHandler: learnerOnly,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = messageInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_COACH_MESSAGE" });
    if (!aiRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });

    const learnerId = request.e4sSession!.user.id;
    const existing = await repositories.coach.currentForLearner(learnerId, true);
    if (!existing) return reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
    if (await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "coach_dialogue")) return existing;
    if (existing.daily.used >= existing.daily.limit) return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });

    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "coach_dialogue");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await aiRunner.runTask("coach_dialogue", {
        message: parsed.data.message,
        cefr: existing.cefr,
        scenario: existing.topic,
        priorTurns: existing.messages.slice(-8).map((message) => ({ speaker: message.speaker, text: message.text }))
      }, { systemPrompt: task.prompt });
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
    await repositories.coach.currentForLearner(learnerId, Boolean(aiRunner));
    await repositories.coach.setPersona(learnerId, parsed.data.persona);
    return await repositories.coach.currentForLearner(learnerId, Boolean(aiRunner));
  });

  app.delete("/api/v1/coach/session", { preHandler: learnerOnly }, async (request) => {
    const learnerId = request.e4sSession!.user.id;
    await repositories.coach.archiveCurrent(learnerId);
    return await repositories.coach.currentForLearner(learnerId, Boolean(aiRunner));
  });
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
