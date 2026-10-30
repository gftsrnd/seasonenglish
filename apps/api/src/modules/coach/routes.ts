import { coachOutputSchema, type AiRunResult, type AiTaskRunner } from "@e4s/ai";
import type { CoachTaskOutput } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { ObjectStorage } from "@e4s/storage";
import type { AudioArtifactInput, AudioArtifactView, CoachView } from "@e4s/contracts";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

const audioArtifactInput = z.object({
  fileId: z.uuid().optional().nullable(),
  artifactKey: z.string().trim().min(1).max(512),
  signedUrl: z.string().max(4_096).optional().nullable(),
  expiresAt: z.string().max(100).optional().nullable(),
  createdAt: z.string().max(100).optional().nullable(),
  mimeType: z.string().max(160).optional().nullable(),
  sizeBytes: z.number().int().nonnegative().max(20 * 1024 * 1024).optional().nullable(),
  transcript: z.string().max(20_000).optional().nullable(),
  retentionUntil: z.string().max(100).optional().nullable(),
  cleanupEligible: z.boolean().optional(),
  deletedAt: z.string().max(100).optional().nullable(),
  deletedBy: z.uuid().optional().nullable()
});
const messageInput = z.object({
  requestId: z.uuid(),
  message: z.string().trim().max(2_000),
  audio: audioArtifactInput.optional()
}).refine((input) => Boolean(input.message || input.audio), { path: ["message"] });
const personaInput = z.object({ persona: z.enum(["informal", "formal"]) });

export function registerCoachRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>,
  storage?: ObjectStorage
): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);

  app.get("/api/v1/coach", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const view = await repositories.coach.currentForLearner(learnerId, Boolean(await runnerFor(learnerId)));
    return view ? withCoachAudio(view, learnerId, repositories, storage) : reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
  });

  app.post("/api/v1/coach/messages", {
    preHandler: learnerOnly,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = messageInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_COACH_MESSAGE" });
    const audio = parsed.data.audio as AudioArtifactInput | undefined;
    const learnerId = request.e4sSession!.user.id;
    const runner = await runnerFor(learnerId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const existing = await repositories.coach.currentForLearner(learnerId, true);
    if (!existing) return reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
    if (await repositories.aiRuns.requestExists(learnerId, parsed.data.requestId, "coach_dialogue")) return withCoachAudio(existing, learnerId, repositories, storage);
    if (existing.daily.used >= existing.daily.limit) return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });
    const currentQuestion = coachQuestionForPersona(
      coachCurrentQuestion(existing.messages, existing.topic), existing.persona
    );
    const validationContext = {
      learnerMessage: parsed.data.message,
      previousSuggestedAnswer: coachPreviousSuggestedAnswer(existing.messages)
    };
    if (isInsufficientCoachInput(parsed.data.message)) {
      await repositories.coach.saveInsufficientTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
        message: parsed.data.message, currentQuestion, ...(audio ? { audio } : {})
      });
      return withCoachAudio(await repositories.coach.currentForLearner(learnerId, true), learnerId, repositories, storage);
    }
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
        // currentQuestion carries the only prior context needed for grading. Sending old
        // learner answers lets model feedback leak from one turn into the next.
        priorTurns: []
      };
      const { result, output } = await runCoachWithPersonaRepair(
        runner, aiInput, coachPersonaPrompt(task.prompt, existing.persona, existing.cefr, audio), existing.persona, validationContext
      );
      const normalizedOutput = normalizeCoachVocabularyUnlocks(
        repeatCurrentQuestionForOffTopic(output, currentQuestion), parsed.data.message, existing.vocabulary
      );
      await repositories.coach.saveAiTurn({
        learnerId,
        sessionId: existing.sessionId,
        requestId: parsed.data.requestId,
        message: parsed.data.message,
        ...(audio ? { audio } : {}),
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
      return withCoachAudio(await repositories.coach.currentForLearner(learnerId, true), learnerId, repositories, storage);
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
    return withCoachAudio(await repositories.coach.currentForLearner(learnerId, aiAvailable), learnerId, repositories, storage);
  });

  app.delete("/api/v1/coach/session", { preHandler: learnerOnly }, async (request) => {
    const learnerId = request.e4sSession!.user.id;
    await repositories.coach.archiveCurrent(learnerId);
    return withCoachAudio(await repositories.coach.currentForLearner(learnerId, Boolean(await runnerFor(learnerId))), learnerId, repositories, storage);
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
    const audio = parsed.data.audio as AudioArtifactInput | undefined;
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
        priorTurns: []
      };
      const { result, output } = await runCoachWithPersonaRepair(
        runner, aiInput, coachPersonaPrompt(task.prompt, "formal", existing.targetLevel, audio), "formal", {
          learnerMessage: parsed.data.message,
          previousSuggestedAnswer: coachPreviousSuggestedAnswer(existing.messages)
        }
      );
      const normalizedOutput = normalizeCoachVocabularyUnlocks(repeatCurrentQuestionForOffTopic(
        output, coachCurrentQuestion(existing.messages, `Tell me about your work at ${existing.targetLevel} level.`)
      ), parsed.data.message, []);
      await repositories.coach.saveAiTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
        message: parsed.data.message, taskId: task.taskId, promptVersionId: task.promptVersionId,
        ...(audio ? { audio } : {}),
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

async function withCoachAudio(
  view: CoachView | null,
  learnerId: string,
  repositories: ReturnType<typeof createRepositories>,
  storage?: ObjectStorage
): Promise<CoachView | null> {
  if (!view) return null;
  const messages = await Promise.all(view.messages.map(async (message) => {
    if (!message.audioArtifact) return message;
    return { ...message, audioArtifact: await refreshAudioArtifact(message.audioArtifact, learnerId, repositories, storage) };
  }));
  return { ...view, messages };
}

async function refreshAudioArtifact(
  artifact: AudioArtifactView,
  learnerId: string,
  repositories: ReturnType<typeof createRepositories>,
  storage?: ObjectStorage
): Promise<AudioArtifactView> {
  const file = await repositories.files.findAssessmentAudioForViewer(learnerId, artifact.artifactKey);
  if (!file) return artifact;
  let signed: { url: string; expiresAt: Date } | undefined;
  if (!file.deletedAt && storage?.presignGetObject) {
    try {
      signed = await storage.presignGetObject({ bucket: file.bucket, objectKey: file.objectKey, expiresInSeconds: 300 });
    } catch {
      signed = undefined;
    }
  }
  return {
    ...artifact,
    fileId: file.id,
    artifactKey: file.objectKey,
    signedUrl: file.deletedAt ? null : signed?.url ?? artifact.signedUrl ?? null,
    expiresAt: file.deletedAt ? null : signed?.expiresAt.toISOString() ?? artifact.expiresAt ?? null,
    createdAt: file.createdAt.toISOString(),
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    transcript: file.transcript,
    retentionUntil: file.retentionUntil?.toISOString() ?? null,
    cleanupEligible: Boolean(file.retentionUntil && file.retentionUntil.getTime() <= Date.now()),
    deletedAt: file.deletedAt?.toISOString() ?? null,
    deletedBy: file.deletedBy
  };
}

export function coachPersonaPrompt(
  prompt: string,
  persona: "informal" | "formal",
  cefr?: string,
  audio?: AudioArtifactInput | { hasAudio?: boolean; audio?: unknown } | boolean | null
): string {
  const normalizedCefr = cefr?.trim().toUpperCase();
  const isHigherCefr = normalizedCefr === "B1" || normalizedCefr === "B2" || normalizedCefr === "C1";
  const hasAudio = typeof audio === "boolean"
    ? audio
    : audio && typeof audio === "object" && "hasAudio" in audio
      ? Boolean(audio.hasAudio)
      : audio && typeof audio === "object" && "audio" in audio
        ? Boolean(audio.audio)
        : Boolean(audio);
  const instruction = persona === "formal"
    ? "FORMAL STYLE: Use professional, courteous workplace English. Avoid slang, contractions, emojis, and overly familiar language. Keep seasonReply between two and four CEFR-appropriate sentences."
    : "INFORMAL STYLE: Use warm, friendly, natural workplace English with a natural contraction and exactly one emoji in each turn. Keep seasonReply between two and four short CEFR-appropriate sentences.";
  const correctionGuard = "LATEST TURN ONLY: Evaluate message against currentQuestion as a fresh pair. Never carry an error, correction, score, or evidence from priorTurns into this result. TRANSLATIONS: Return a natural Vietnamese translation of Season's conversational reply in seasonReplyTranslation. For every correction, return a natural Vietnamese translation of the corrected learner sentence in corrections[].translation. Keep correction reason focused only on the short language reason; never place a translation inside reason. CORRECTIONS ONLY: Only put genuine language errors in corrections. If the learner's message is grammatical, relevant, and answers currentQuestion—even if it is brief or less specific—return corrections: [] and correctedText: \"\". Do not rewrite a correct answer merely to make it longer, more detailed, or stylistically different. RESULT LABEL: evaluation.result must be correct for a complete correct answer, partially_correct for a meaningful answer that needs a small language or content improvement, missing_information for insufficient input, or off_topic for the wrong target. INSUFFICIENT means no meaningful attempt and requires meaning score 0. If the learner gives relevant information but omits part of the requested content, use valid/partially_correct/countsTowardGoal true and a positive meaning score. Keep seasonReply and nextQuestion separate; seasonReply must not contain nextQuestion. RUBRIC SCOPE: rubric evidence and improvement must refer only to the learner's latest message and currentQuestion. Every rubric evidence and improvement must be concise, specific, and written in Vietnamese so the learner can act on it. Never base rubric feedback on nextQuestion or suggestedAnswer. If a criterion needs no improvement, say \"Không cần thay đổi.\" suggestedAnswer must directly answer nextQuestion in the exact conversation state, use one concise learner-level example, and contain no more than 40 words. It must not repeat or re-ask nextQuestion or a quoted question unless nextQuestion explicitly asks the learner to formulate a question. suggestedAnswer must never be presented as a correction to the learner's latest message. SECRET WORDS: usedWords may contain only configured secret vocabulary that appears as a whole word in the learner's latest message; never infer or invent a used word.";
  const cefrGuidance = normalizedCefr
    ? isHigherCefr
      ? `CEFR LEVEL (${normalizedCefr}): Calibrate seasonReply, nextQuestion, and suggestedAnswer.text strictly to ${normalizedCefr} workplace English with connected clauses, accurate workplace collocations, and professional register appropriate for ${normalizedCefr}. For B1 and above, explanations in rubric evidence, rubric improvement, and corrections[].reason may use concise English ("No change needed." when no improvement is needed) while keeping Vietnamese translations in dedicated translation fields.`
      : `CEFR LEVEL (${normalizedCefr}): Calibrate seasonReply, nextQuestion, and suggestedAnswer.text strictly to ${normalizedCefr} workplace English using high-frequency vocabulary, short direct sentences, and foundational workplace grammar. Keep explanations in Vietnamese.`
    : "";
  const asrGuidance = hasAudio
    ? "ASR / SPOKEN TRANSCRIPT TOLERANCE: The learner message comes from a spoken audio transcript (ASR). Ignore speech-recognition punctuation, capitalization, and minor filler words (such as um or uh) when evaluating grammar and workplace meaning; do not create corrections for ASR formatting noise."
    : "";
  return [prompt, instruction, correctionGuard, cefrGuidance, asrGuidance].filter(Boolean).join("\n\n");
}

export function isAcknowledgementOnly(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s']/gu, "").replace(/\s+/g, " ");
  return new Set(["ok", "okay", "yes", "no", "yeah", "yep", "nope", "sure", "thanks", "thank you", "hi", "hello"]).has(normalized);
}

export function isInsufficientCoachInput(message: string): boolean {
  if (isAcknowledgementOnly(message)) return true;
  const normalized = message.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}'’\s]/gu, "").replace(/\s+/g, " ");
  const words = normalized.split(" ").filter(Boolean);
  if (words.length >= 3) return false;
  return !/^(?:i|you|we|they|he|she|it)\s+\p{L}+(?:'\p{L}+)?$/u.test(normalized.replaceAll("’", "'"));
}

export function coachCurrentQuestion(
  messages: Array<{ speaker: "learner" | "coach"; text: string; feedback?: { nextQuestion?: string } }>,
  fallback: string
): string {
  const latestCoach = [...messages].reverse().find((message) => message.speaker === "coach" && message.text.trim());
  return latestCoach?.feedback?.nextQuestion?.trim() || latestCoach?.text.trim() || fallback;
}

export function coachQuestionForPersona(question: string, persona: "informal" | "formal"): string {
  return persona === "formal" ? formalizeText(question) : question;
}

function coachPreviousSuggestedAnswer(
  messages: Array<{ speaker: "learner" | "coach"; feedback?: { suggestedAnswer?: { text?: string } } }>
): string | undefined {
  return [...messages].reverse().find((message) =>
    message.speaker === "coach" && message.feedback?.suggestedAnswer?.text?.trim()
  )?.feedback?.suggestedAnswer?.text?.trim();
}

export function repeatCurrentQuestionForOffTopic(output: CoachTaskOutput, currentQuestion: string): CoachTaskOutput {
  return output.evaluation.status === "off_topic" ? { ...output, nextQuestion: currentQuestion } : output;
}

export function normalizeCoachVocabularyUnlocks(
  output: CoachTaskOutput,
  learnerMessage: string,
  vocabulary: Array<{ word: string; meaning?: string; opened?: boolean }>
): CoachTaskOutput {
  if (output.evaluation.status !== "valid" || !output.evaluation.countsTowardGoal) {
    return { ...output, usedWords: [] };
  }
  const message = learnerMessage.normalize("NFKC").toLocaleLowerCase("en-US");
  const configured = new Map(vocabulary.map((item) => [item.word.normalize("NFKC").trim().toLocaleLowerCase("en-US"), item.word]));
  const usedWords = [...new Set(output.usedWords.map((word) => word.normalize("NFKC").trim().toLocaleLowerCase("en-US")))]
    .filter((word) => {
      if (!word || !configured.has(word)) return false;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(message);
    })
    .map((word) => configured.get(word)!);
  return { ...output, usedWords };
}

interface CoachValidationContext {
  learnerMessage: string;
  previousSuggestedAnswer?: string | undefined;
}

export function validateCoachPersonaOutput(
  output: CoachTaskOutput,
  persona: "informal" | "formal",
  context?: CoachValidationContext
): string[] {
  const text = `${output.seasonReply} ${output.nextQuestion}`.trim();
  const emojiCount = [...text.matchAll(/\p{Extended_Pictographic}/gu)].length;
  const contraction = /\b\p{L}+['’](?:s|re|ve|ll|d|m|t)\b/iu.test(text);
  const conversationViolations = [
    ...(coachSentenceCount(output.seasonReply) < 2 || coachSentenceCount(output.seasonReply) > 4
      ? ["Season reply must contain between two and four sentences."] : []),
    ...validateSuggestedAnswer(output),
    ...validateSuggestedAnswerReplay(output, context)
  ];
  if (persona === "formal") {
    return [
      ...(contraction ? ["Formal reply contains a contraction."] : []),
      ...(/\b(?:gonna|wanna|gotta|bro|dude|lol)\b/iu.test(text) ? ["Formal reply contains slang."] : []),
      ...(emojiCount ? ["Formal reply contains emoji."] : []),
      ...(/!/.test(text) ? ["Formal reply contains an exclamation mark."] : []),
      ...conversationViolations
    ];
  }
  return [
    ...(text.split(/\s+/u).filter(Boolean).length > 60 ? ["Informal reply is too long."] : []),
    ...(!contraction ? ["Informal reply must contain a contraction."] : []),
    ...(emojiCount !== 1 ? ["Informal reply must contain exactly one emoji."] : []),
    ...conversationViolations
  ];
}

function coachSentenceCount(value: string): number {
  return value.split(/[.!?]+(?:\s+|$)/u).map((part) => part.trim()).filter(Boolean).length;
}

function validateSuggestedAnswerReplay(output: CoachTaskOutput, context?: CoachValidationContext): string[] {
  if (!context?.previousSuggestedAnswer) return [];
  const normalize = (value: string) => value.toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\s]/gu, " ").replace(/\s+/g, " ").trim();
  const exactReplay = normalize(context.learnerMessage) === normalize(context.previousSuggestedAnswer);
  return exactReplay && output.evaluation.status !== "valid"
    ? ["The learner used the exact previous suggested answer, so it cannot be graded off-topic or insufficient."]
    : [];
}

function validateSuggestedAnswer(output: CoachTaskOutput): string[] {
  const normalize = (value: string) => value.toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9\s]/gu, " ").replace(/\s+/g, " ").trim();
  const nextQuestion = normalize(output.nextQuestion);
  const suggestedAnswer = normalize(output.suggestedAnswer.text);
  if (suggestedAnswer.split(" ").filter(Boolean).length > 40) return ["Suggested answer is too long."];
  if (nextQuestion === suggestedAnswer) return ["Suggested answer repeats nextQuestion instead of answering it."];

  const requestsReply = /\b(?:how|what)\s+(?:would|do|should|can)\s+you\s+(?:reply|respond|answer)\b/iu.test(output.nextQuestion);
  if (!requestsReply || !output.suggestedAnswer.text.includes("?")) return [];
  const quotedQuestions = [...output.nextQuestion.matchAll(/["“]([^"”]*[?])["”]/gu)].map((match) => match[1] ?? "");
  const suggestedTokens = new Set(suggestedAnswer.split(" ").filter(Boolean));
  const reasksQuotedQuestion = quotedQuestions.some((question) => {
    const tokens = normalize(question).split(" ").filter(Boolean);
    return tokens.length > 0 && tokens.filter((token) => suggestedTokens.has(token)).length / tokens.length >= 0.6;
  });
  return reasksQuotedQuestion ? ["Suggested answer re-asks the quoted question instead of replying to it."] : [];
}

export async function runCoachWithPersonaRepair(
  runner: AiTaskRunner,
  input: unknown,
  systemPrompt: string,
  persona: "informal" | "formal",
  validationContext?: CoachValidationContext
): Promise<{ result: AiRunResult; output: CoachTaskOutput }> {
  const firstResult = await runner.runTask("coach_dialogue", input, { systemPrompt, temperature: 0 });
  const first = inspectCoachOutput(firstResult.output, persona, validationContext);
  if (first.output && !first.violations.length) return { result: firstResult, output: first.output };

  const result = await runner.runTask("coach_dialogue", input, {
    systemPrompt: `${systemPrompt}\n\nREPAIR THE PREVIOUS OUTPUT ONCE. Return a complete object that matches the JSON schema. Keep valid pedagogical content, but fix every listed issue.\nISSUES: ${first.violations.join(" ")}\nPREVIOUS OUTPUT:\n${safeCoachOutputJson(firstResult.output)}`,
    messages: [
      { role: "user", content: JSON.stringify(input) },
      { role: "assistant", content: safeCoachOutputJson(firstResult.output) },
      {
        role: "user",
        content: `REPAIR THE PREVIOUS OUTPUT ONCE. Return a complete object that matches the JSON schema. Keep valid pedagogical content, but fix every listed issue.\nISSUES: ${first.violations.join(" ")}`
      }
    ],
    temperature: 0
  });
  const repaired = inspectCoachOutput(result.output, persona, validationContext);
  if (repaired.output && !repaired.violations.length) return { result, output: repaired.output };

  const candidate = repaired.output ?? first.output;
  const candidateResult = repaired.output ? result : firstResult;
  const candidateViolations = repaired.output ? repaired.violations : first.violations;
  if (candidate && candidateViolations.every(isLocallyEnforceableCoachViolation)) {
    let enforced = candidate;
    if (candidateViolations.some(isReplyLengthViolation)) enforced = enforceReplySentenceCount(enforced, persona);
    if (candidateViolations.some(isFormalStyleViolation)) enforced = enforceFormalStyle(enforced);
    if (candidateViolations.some(isInformalStyleViolation)) enforced = enforceInformalStyle(enforced);
    if (candidateViolations.some(isSuggestedAnswerViolation)) enforced = enforceSuggestedAnswerConsistency(enforced);
    if (candidateViolations.some(isSuggestedAnswerReplayViolation)) {
      enforced = enforceSuggestedAnswerReplay(enforced, persona);
    }
    const remaining = validateCoachPersonaOutput(enforced, persona, validationContext);
    if (!remaining.length) return { result: candidateResult, output: enforced };
  }
  throw Object.assign(new Error("Coach output repair failed"), { code: "AI_OUTPUT_INVALID" });
}

function inspectCoachOutput(
  rawOutput: unknown,
  persona: "informal" | "formal",
  validationContext?: CoachValidationContext
): {
  output?: CoachTaskOutput;
  violations: string[];
} {
  const parsed = coachOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`);
    return { violations: [`Coach output does not match schema. ${details.join(" ")}`] };
  }
  return { output: parsed.data, violations: validateCoachPersonaOutput(parsed.data, persona, validationContext) };
}

function safeCoachOutputJson(output: unknown): string {
  try { return JSON.stringify(output).slice(0, 12_000); }
  catch { return "[unserializable output]"; }
}

function isFormalStyleViolation(violation: string): boolean {
  return violation.startsWith("Formal reply contains ");
}

function isInformalStyleViolation(violation: string): boolean {
  return violation.startsWith("Informal reply ");
}

function isReplyLengthViolation(violation: string): boolean {
  return violation === "Season reply must contain between two and four sentences.";
}

function isSuggestedAnswerViolation(violation: string): boolean {
  return violation.startsWith("Suggested answer ");
}

function isSuggestedAnswerReplayViolation(violation: string): boolean {
  return violation.startsWith("The learner used the exact previous suggested answer");
}

function isLocallyEnforceableCoachViolation(violation: string): boolean {
  return isFormalStyleViolation(violation)
    || isInformalStyleViolation(violation)
    || isReplyLengthViolation(violation)
    || isSuggestedAnswerViolation(violation)
    || isSuggestedAnswerReplayViolation(violation);
}

function enforceReplySentenceCount(output: CoachTaskOutput, persona: "informal" | "formal"): CoachTaskOutput {
  const sentences = output.seasonReply.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  const bounded = sentences.slice(0, 4);
  if (bounded.length < 2) {
    bounded.push(persona === "formal" ? "That addresses the current question." : "That's helpful.");
  }
  return { ...output, seasonReply: bounded.join(" ") };
}

function enforceInformalStyle(output: CoachTaskOutput): CoachTaskOutput {
  const stripEmoji = (value: string) => value.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").replace(/\s+/gu, " ").trim();
  let seasonReply = stripEmoji(output.seasonReply);
  const nextQuestion = stripEmoji(output.nextQuestion);
  const combined = `${seasonReply} ${nextQuestion}`;
  if (!/\b\p{L}+['’](?:s|re|ve|ll|d|m|t)\b/iu.test(combined)) seasonReply = `That's clear: ${seasonReply}`;
  return { ...output, seasonReply: `${seasonReply} 😊`, nextQuestion };
}

function enforceSuggestedAnswerConsistency(output: CoachTaskOutput): CoachTaskOutput {
  if (output.suggestedAnswer.text.trim().split(/\s+/u).length > 40) {
    return {
      ...output,
      suggestedAnswer: {
        text: output.suggestedAnswer.text.trim().split(/\s+/u).slice(0, 40).join(" "),
        translation: output.suggestedAnswer.translation.trim().split(/\s+/u).slice(0, 60).join(" ")
      }
    };
  }
  return {
    ...output,
    nextQuestion: "What could you say next in this workplace situation?",
    nextQuestionTranslation: "Bạn có thể nói gì tiếp theo trong tình huống công việc này?"
  };
}

function enforceSuggestedAnswerReplay(
  output: CoachTaskOutput,
  persona: "informal" | "formal"
): CoachTaskOutput {
  const hasCorrections = output.corrections.length > 0;
  return {
    ...output,
    evaluation: {
      status: "valid",
      result: hasCorrections ? "partially_correct" : "correct",
      countsTowardGoal: true,
      noteVi: "Câu trả lời khớp với gợi ý cho câu hỏi hiện tại."
    },
    seasonReply: persona === "formal"
      ? "Thank you. That is an appropriate response to the current question."
      : "That's right. You've answered the current question well 😊",
    seasonReplyTranslation: "Cảm ơn bạn. Câu trả lời này phù hợp với câu hỏi hiện tại.",
    rubric: {
      ...output.rubric,
      meaning: {
        score: Math.max(4, output.rubric.meaning.score),
        evidence: "The response matches the suggested answer for the current question.",
        improvement: "No change needed."
      }
    }
  };
}

function enforceFormalStyle(output: CoachTaskOutput): CoachTaskOutput {
  return {
    ...output,
    seasonReply: formalizeText(output.seasonReply),
    nextQuestion: formalizeText(output.nextQuestion)
  };
}

function formalizeText(value: string): string {
  const replacements: Record<string, string> = {
    "can't": "cannot", "won't": "will not", "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "haven't": "have not", "hasn't": "has not", "hadn't": "had not", "shouldn't": "should not",
    "wouldn't": "would not", "couldn't": "could not", "mustn't": "must not", "let's": "let us",
    "i'm": "I am", "you're": "you are", "we're": "we are", "they're": "they are",
    "i've": "I have", "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "I will", "you'll": "you will", "we'll": "we will", "they'll": "they will",
    "that's": "that is", "what's": "what is", "here's": "here is", "there's": "there is"
  };
  return value.replaceAll("’", "'")
    .replace(/\b(?:can't|won't|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|shouldn't|wouldn't|couldn't|mustn't|let's|i'm|you're|we're|they're|i've|you've|we've|they've|i'll|you'll|we'll|they'll|that's|what's|here's|there's)\b/giu,
      (match) => {
        const replacement = replacements[match.toLocaleLowerCase("en-US")] ?? match;
        return /^[A-Z]/u.test(match) && !replacement.startsWith("I ")
          ? replacement.charAt(0).toLocaleUpperCase("en-US") + replacement.slice(1)
          : replacement;
      })
    .replace(/\b(?:gonna|wanna|gotta)\b/giu, (match) => ({ gonna: "going to", wanna: "want to", gotta: "have to" })[match.toLocaleLowerCase("en-US")] ?? match)
    .replace(/\b(?:bro|dude|lol)\b/giu, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/!/gu, ".")
    .replace(/\s+([,.!?;:])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function safeAiErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const code = error.code;
    if (code.startsWith("AI_") || code === "COACH_DAILY_LIMIT") return code;
  }
  return "AI_PROVIDER_FAILED";
}

function aiErrorStatus(error: unknown): 429 | 502 | 503 | 504 {
  const code = safeAiErrorCode(error);
  if (code === "AI_PROVIDER_RATE_LIMIT" || code === "COACH_DAILY_LIMIT") return 429;
  if (code === "AI_TIMEOUT") return 504;
  if (code === "AI_PROVIDER_NOT_CONFIGURED" || code === "AI_PROMPT_NOT_FOUND") return 503;
  return 502;
}
