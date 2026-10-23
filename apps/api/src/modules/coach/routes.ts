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
    const currentQuestion = coachCurrentQuestion(existing.messages, existing.topic);
    if (isAcknowledgementOnly(parsed.data.message)) {
      await repositories.coach.saveInsufficientTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
        message: parsed.data.message, currentQuestion
      });
      return await repositories.coach.currentForLearner(learnerId, true);
    }
    if (existing.daily.used >= existing.daily.limit) return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });

    const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "coach_dialogue");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const aiInput = {
        message: parsed.data.message,
        cefr: existing.cefr,
        persona: existing.persona,
        mode: "practice",
        scenario: existing.topic,
        currentQuestion,
        priorTurns: existing.messages.slice(-8).map((message) => ({ speaker: message.speaker, text: message.text }))
      };
      const { result, output } = await runCoachWithPersonaRepair(
        runner, aiInput, coachPersonaPrompt(task.prompt, existing.persona), existing.persona
      );
      const normalizedOutput = repeatCurrentQuestionForOffTopic(output, currentQuestion);
      await repositories.coach.saveAiTurn({
        learnerId,
        sessionId: existing.sessionId,
        requestId: parsed.data.requestId,
        message: parsed.data.message,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output: normalizedOutput as CoachTaskOutput,
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
      const aiInput = {
        message: parsed.data.message,
        cefr: existing.targetLevel,
        persona: "formal",
        mode: "challenge",
        scenario: `Level-up challenge for ${existing.targetLevel}. Ask one workplace follow-up question at a time.`,
        currentQuestion: coachCurrentQuestion(existing.messages, `Tell me about your work at ${existing.targetLevel} level.`),
        priorTurns: existing.messages.slice(-8).map((message) => ({ speaker: message.speaker, text: message.text }))
      };
      const { result, output } = await runCoachWithPersonaRepair(
        runner, aiInput, coachPersonaPrompt(task.prompt, "formal"), "formal"
      );
      const normalizedOutput = repeatCurrentQuestionForOffTopic(
        output,
        coachCurrentQuestion(existing.messages, `Tell me about your work at ${existing.targetLevel} level.`)
      );
      await repositories.coach.saveAiTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
        message: parsed.data.message, taskId: task.taskId, promptVersionId: task.promptVersionId,
        challengeAttemptId: existing.assessmentAttemptId,
        output: normalizedOutput as CoachTaskOutput,
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
  const correctionGuard = "TRANSLATIONS: Return a natural Vietnamese translation of Season's conversational reply in seasonReplyTranslation. For every correction, return a natural Vietnamese translation of the corrected learner sentence in corrections[].translation. Keep correction reason focused only on the short language reason; never place a translation inside reason. CORRECTIONS ONLY: Only put genuine language errors in corrections. If the learner's message is grammatical, relevant, and answers currentQuestion—even if it is brief or less specific—return corrections: [] and correctedText: \"\". Do not rewrite a correct answer merely to make it longer, more detailed, or stylistically different. RUBRIC SCOPE: rubric evidence and improvement must refer only to the learner's latest message and currentQuestion. Never base rubric feedback on nextQuestion or suggestedAnswer. If a criterion needs no improvement, say \"No change needed.\" suggestedAnswer answers nextQuestion only and must never be presented as a correction to the learner's latest message.";
  return `${prompt}\n\n${instruction}\n\n${correctionGuard}`;
}

export function isAcknowledgementOnly(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s']/gu, "").replace(/\s+/g, " ");
  return new Set(["ok", "okay", "yes", "no", "yeah", "yep", "nope", "sure", "thanks", "thank you", "hi", "hello"]).has(normalized);
}

export function coachCurrentQuestion(
  messages: Array<{ speaker: "learner" | "coach"; text: string; feedback?: { nextQuestion?: string } }>,
  fallback: string
): string {
  const latestCoach = [...messages].reverse().find((message) => message.speaker === "coach" && message.text.trim());
  return latestCoach?.feedback?.nextQuestion?.trim() || latestCoach?.text.trim() || fallback;
}

export function repeatCurrentQuestionForOffTopic(output: CoachTaskOutput, currentQuestion: string): CoachTaskOutput {
  return output.evaluation.status === "off_topic" ? { ...output, nextQuestion: currentQuestion } : output;
}

export function validateCoachPersonaOutput(output: CoachTaskOutput, persona: "informal" | "formal"): string[] {
  const text = `${output.seasonReply} ${output.nextQuestion}`.trim();
  const emojiCount = [...text.matchAll(/\p{Extended_Pictographic}/gu)].length;
  const contraction = /\b\p{L}+['’](?:s|re|ve|ll|d|m|t)\b/iu.test(text);
  if (persona === "formal") {
    return [
      ...(contraction ? ["Formal reply contains a contraction."] : []),
      ...(/\b(?:gonna|wanna|gotta|bro|dude|lol)\b/iu.test(text) ? ["Formal reply contains slang."] : []),
      ...(emojiCount ? ["Formal reply contains emoji."] : []),
      ...(text.includes("!") ? ["Formal reply contains an exclamation mark."] : [])
    ];
  }
  return [
    ...(!contraction ? ["Informal reply needs a natural contraction."] : []),
    ...(emojiCount !== 1 ? ["Informal reply needs exactly one emoji."] : []),
    ...(text.split(/\s+/u).filter(Boolean).length > 60 ? ["Informal reply is too long."] : [])
  ];
}

async function runCoachWithPersonaRepair(
  runner: AiTaskRunner,
  input: unknown,
  systemPrompt: string,
  persona: "informal" | "formal"
): Promise<{ result: AiRunResult; output: CoachTaskOutput }> {
  let result = await runner.runTask("coach_dialogue", input, { systemPrompt });
  let parsed = coachOutputSchema.safeParse(result.output);
  if (!parsed.success) throw Object.assign(new Error("Invalid Coach output"), { code: "AI_OUTPUT_INVALID" });
  const violations = validateCoachPersonaOutput(parsed.data, persona);
  if (!violations.length) return { result, output: parsed.data };
  result = await runner.runTask("coach_dialogue", input, {
    systemPrompt: `${systemPrompt}\n\nREPAIR THE PREVIOUS OUTPUT ONCE. Keep the same pedagogical content and JSON schema, but fix: ${violations.join(" ")}`
  });
  parsed = coachOutputSchema.safeParse(result.output);
  if (!parsed.success || validateCoachPersonaOutput(parsed.data, persona).length) {
    throw Object.assign(new Error("Coach persona policy failed"), { code: "AI_OUTPUT_INVALID" });
  }
  return { result, output: parsed.data };
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
