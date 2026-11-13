import { coachOutputSchema, coachRoleplayTurnOutputSchema, type AiRunResult, type AiTaskRunner } from "@e4s/ai";
import type { CoachRoleplayTurnOutput, CoachTaskOutput } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import type { ObjectStorage } from "@e4s/storage";
import type { AudioArtifactInput, AudioArtifactView, CoachView } from "@e4s/contracts";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { assessmentInProgress } from "../assessment/active-attempt.js";
import { COACH_CONDUCT_RULE } from "./conduct-policy.js";
import { coachAnswerIdeaLanguage, coachAnswerIdeaPromptRule, fallbackCoachAnswerIdea, repairCoachAnswerIdea } from "./answer-idea.js";

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
type CoachTaskOutputWithFeedbackStatus = CoachTaskOutput & {
  feedbackStatus?: "unavailable";
  suggestedAnswer: CoachTaskOutput["suggestedAnswer"] & { kind?: "idea" };
};

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

  const practiceAccess: preHandlerHookHandler[] = [learnerOnly, async (request, reply) => {
    if (await assessmentInProgress(pool, request.e4sSession!.user.id)) {
      return reply.code(409).send({ code: "COACH_LOCKED_DURING_ASSESSMENT" });
    }
  }];

  app.get("/api/v1/coach", { preHandler: practiceAccess }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const view = await repositories.coach.currentForLearner(learnerId, Boolean(await runnerFor(learnerId)));
    return view ? withCoachAudio(view, learnerId, repositories, storage) : reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
  });

  app.post("/api/v1/coach/messages", {
    preHandler: practiceAccess,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const parsed = messageInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_COACH_MESSAGE" });
    const audio = parsed.data.audio as AudioArtifactInput | undefined;
    const learnerId = request.e4sSession!.user.id;
    const runner = await runnerFor(learnerId);
    const existing = await repositories.coach.currentForLearner(learnerId, Boolean(runner));
    if (!existing) return reply.code(404).send({ code: "COACH_CONTEXT_NOT_FOUND" });
    if (await repositories.coach.hasPracticeTurn(existing.sessionId, parsed.data.requestId)) return withCoachAudio(existing, learnerId, repositories, storage);
    if (existing.daily.used >= existing.daily.limit) return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });
    if (existing.chatAvailability?.available === false) return reply.code(409).send({ code: "COACH_CLOSED_TODAY", reason: existing.chatAvailability.reason });
    const currentQuestion = coachQuestionForPersona(
      coachCurrentQuestion(existing.messages, existing.topic), existing.persona
    );
    const currentQuestionTranslation = coachCurrentQuestionTranslation(existing.messages);
    const scenarioOpening = coachScenarioOpening(existing.messages);
    const learnerMessages = [...existing.messages.filter((item) => item.speaker === "learner").map((item) => item.text), parsed.data.message];
    const validationContext = {
      learnerMessage: parsed.data.message,
      learnerOwned: coachScenarioRoles(scenarioOpening, learnerMessages).learnerOwned,
      previousSuggestedAnswer: coachPreviousSuggestedAnswer(existing.messages),
      topic: existing.topic,
      currentQuestion,
      currentQuestionTranslation,
      priorQuestions: existing.questionHistory ?? [],
      cefr: existing.cefr
    };
    const turnGate = coachPracticeTurnGate(parsed.data.message, existing.cefr, existing.messages);
    if (turnGate) {
      // A gated reply does not count: Season asks the SAME open question again.
      const followUp = coachReaskFollowUp({
        kind: turnGate.kind, currentQuestion, currentQuestionTranslation, persona: existing.persona, cefr: existing.cefr
      });
      await repositories.coach.saveLocalPracticeTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
        message: parsed.data.message, currentQuestion, reasonVi: turnGate.reasonVi,
        ...followUp, ...(audio ? { audio } : {}),
        ...(turnGate.kind === "clarification" || turnGate.kind === "dont_know" ? { notScored: true } : {})
      });
      return withCoachAudio(await repositories.coach.currentForLearner(learnerId, true), learnerId, repositories, storage);
    }
    let dailyReservation = false;
    try {
      const reservation = await repositories.coach.reserveDailyTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId
      });
      if (reservation === "limit") return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });
      if (reservation === "in_progress") return reply.code(409).send({ code: "COACH_REQUEST_IN_PROGRESS" });
      dailyReservation = true;
      const aiInput = {
        message: parsed.data.message,
        cefr: existing.cefr,
        persona: existing.persona,
        mode: "practice",
        scenario: existing.topic,
        currentQuestion,
        priorQuestions: (existing.questionHistory ?? []).slice(-20),
        // currentQuestion carries the only prior context needed for grading. Sending old
        // learner answers lets model feedback leak from one turn into the next.
        priorTurns: []
      };
      const saveOutageTurn = async (code: string, acceptedReply?: CoachTaskOutput) => {
        const reasonVi = "Đã tính lượt luyện tập. Nhận xét AI tạm thời chưa có.";
        // Without an accepted AI turn Season politely re-asks the open question;
        // it never invents a new question from the learner's words.
        const reask = coachReaskFollowUp({ kind: "unavailable", currentQuestion, currentQuestionTranslation, persona: existing.persona, cefr: existing.cefr });
        const stored = await repositories.coach.saveLocalPracticeTurn({
          learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId,
          message: parsed.data.message, currentQuestion, aiFailureCode: code, reasonVi,
          seasonReply: acceptedReply?.seasonReply ?? reask.seasonReply,
          seasonReplyTranslation: acceptedReply ? acceptedReply.seasonReplyTranslation || reasonVi : reask.seasonReplyTranslation,
          nextQuestion: acceptedReply?.nextQuestion || reask.nextQuestion,
          nextQuestionTranslation: acceptedReply ? acceptedReply.nextQuestionTranslation ?? "" : reask.nextQuestionTranslation,
          ...(acceptedReply?.suggestedAnswer.text.trim() ? { suggestedAnswer: acceptedReply.suggestedAnswer } : {}),
          ...(audio ? { audio } : {})
        });
        if (stored) request.log.warn({ code, requestId: parsed.data.requestId }, "Season practice credited during AI outage");
        return withCoachAudio(await repositories.coach.currentForLearner(learnerId, Boolean(runner)), learnerId, repositories, storage);
      };
      if (!runner) return await saveOutageTurn("AI_UNAVAILABLE");
      const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "coach_dialogue");
      if (!task) return await saveOutageTurn("AI_PROMPT_NOT_READY");
      let scored: Awaited<ReturnType<typeof runCoachWithPersonaRepair>>;
      try {
        scored = await runCoachWithPersonaRepair(
          runner, aiInput, `${coachPersonaPrompt(task.prompt, existing.persona, existing.cefr, audio)}\n\n${coachPracticeTurnPolicy(existing.cefr, existing.topic, (existing.questionHistory ?? []).slice(-20), {
            learnerWordCount: countCoachWords(parsed.data.message),
            currentQuestion,
            scenarioOpening,
            learnerMessages,
            unopenedVocabulary: (existing.vocabulary ?? []).filter((item) => !item.opened).map((item) => item.word)
          })}`, existing.persona, validationContext
        );
      } catch (error) {
        return await saveOutageTurn(safeAiErrorCode(error));
      }
      const { result, output, feedbackErrorCode } = scored;
      logRoleplayDiagnostics(request.log, parsed.data.requestId, "practice", scored.roleplay);
      if (feedbackErrorCode) return await saveOutageTurn(feedbackErrorCode, output);
      const normalizedOutput = normalizeCoachVocabularyUnlocks(
        coachQuestionFlowForTurn(output, {
          currentQuestion, currentQuestionTranslation, persona: existing.persona, cefr: existing.cefr,
          learnerMessage: parsed.data.message, topic: existing.topic, priorQuestions: existing.questionHistory ?? []
        }), parsed.data.message, existing.vocabulary
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
    } finally {
      if (dailyReservation) await repositories.coach.releaseDailyTurn(learnerId, parsed.data.requestId).catch((error) => {
        request.log.warn({ code: safeAiErrorCode(error) }, "Season daily-slot reservation cleanup failed");
      });
    }
  });

  app.put("/api/v1/coach/persona", { preHandler: practiceAccess }, async (request, reply) => {
    const parsed = personaInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_COACH_PERSONA" });
    const learnerId = request.e4sSession!.user.id;
    const aiAvailable = Boolean(await runnerFor(learnerId));
    await repositories.coach.currentForLearner(learnerId, aiAvailable);
    await repositories.coach.setPersona(learnerId, parsed.data.persona);
    return withCoachAudio(await repositories.coach.currentForLearner(learnerId, aiAvailable), learnerId, repositories, storage);
  });

  app.delete("/api/v1/coach/session", { preHandler: practiceAccess }, async (request) => {
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
    let dailyReservation = false;
    try {
      const reservation = await repositories.coach.reserveDailyTurn({
        learnerId, sessionId: existing.sessionId, requestId: parsed.data.requestId
      });
      if (reservation === "limit") return reply.code(429).send({ code: "COACH_DAILY_LIMIT" });
      if (reservation === "in_progress") return reply.code(409).send({ code: "COACH_REQUEST_IN_PROGRESS" });
      dailyReservation = true;
      const challengeQuestion = coachCurrentQuestion(existing.messages, `Tell me about your work at ${existing.targetLevel} level.`);
      const challengeQuestionTranslation = coachCurrentQuestionTranslation(existing.messages);
      const aiInput = {
        message: parsed.data.message,
        cefr: existing.targetLevel,
        persona: "formal",
        mode: "challenge",
        scenario: `Level-up challenge for ${existing.targetLevel}. Ask one workplace follow-up question at a time.`,
        currentQuestion: challengeQuestion,
        priorTurns: []
      };
      const { result, output, roleplay } = await runCoachWithPersonaRepair(
        runner, aiInput, coachPersonaPrompt(task.prompt, "formal", existing.targetLevel, audio), "formal", {
          learnerMessage: parsed.data.message,
          previousSuggestedAnswer: coachPreviousSuggestedAnswer(existing.messages),
          currentQuestion: challengeQuestion,
          currentQuestionTranslation: challengeQuestionTranslation,
          cefr: existing.targetLevel,
          learnerOwned: coachScenarioRoles(coachScenarioOpening(existing.messages),
            [...existing.messages.filter((item) => item.speaker === "learner").map((item) => item.text), parsed.data.message]).learnerOwned
        }
      );
      logRoleplayDiagnostics(request.log, parsed.data.requestId, "challenge", roleplay);
      // Same rule as practice: an answer that does not count re-asks the open question.
      const normalizedOutput = normalizeCoachVocabularyUnlocks(coachQuestionFlowForTurn(output, {
        currentQuestion: challengeQuestion, currentQuestionTranslation: challengeQuestionTranslation,
        persona: "formal", cefr: existing.targetLevel,
        learnerMessage: parsed.data.message, topic: aiInput.scenario
      }), parsed.data.message, []);
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
    } finally {
      if (dailyReservation) await repositories.coach.releaseDailyTurn(learnerId, parsed.data.requestId).catch((error) => {
        request.log.warn({ code: safeAiErrorCode(error) }, "Season challenge daily-slot reservation cleanup failed");
      });
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
  const correctionGuard = "ROLEPLAY FIRST: You are the learner's workplace conversation partner, not a teacher, examiner, narrator, or lesson UI. seasonReply is the complete spoken turn from that partner and MUST contain English dialogue only; never put Vietnamese prose there (a Vietnamese learner name is allowed only in an opening greeting). Continue the scenario directly in character; respond naturally to the learner and, when another response is useful, end with a natural in-character question or request. Speak directly as that colleague/customer using I/me; never refer to a third party as 'your colleague' or 'the learner'. Never write teacher, examiner, or coaching narration such as 'Great! Now, how do you...', 'Your opening sounds...', 'You should say...', 'What would you say?', or 'The learner...'. Do not praise or explain inside seasonReply. nextQuestion is an internal state anchor only: it must be the exact final in-character question/request already contained verbatim inside seasonReply; never create a second, standalone question or a meta prompt. LATEST TURN ONLY: Evaluate message against currentQuestion as a fresh pair. Never carry an error, correction, score, or evidence from priorTurns into this result. TRANSLATIONS: Return a natural Vietnamese translation of the complete Season turn in seasonReplyTranslation. suggestedAnswer is the answer idea described under ANSWER IDEA. For every correction, return a natural Vietnamese translation of the corrected learner sentence in corrections[].translation. Keep correction reason focused only on the short language reason; never place a translation inside reason. CORRECTIONS ONLY: Only put genuine language errors in corrections. If the learner's message is grammatical, relevant, and answers currentQuestion—even if it is brief or less specific—return corrections: [] and correctedText: \"\". Do not rewrite a correct answer merely to make it longer, more detailed, or stylistically different. RESULT LABEL: evaluation.result must be correct for a complete correct answer, partially_correct for a meaningful answer that needs a small language or content improvement, missing_information for insufficient input, or off_topic for the wrong target. INSUFFICIENT means no meaningful attempt and requires meaning score 0. If the learner gives relevant information but omits part of the requested content, use valid/partially_correct/countsTowardGoal true and a positive meaning score. RUBRIC SCOPE: rubric evidence and improvement must refer only to the learner's latest message and currentQuestion. Every rubric evidence and improvement must be concise, specific, and written in Vietnamese so the learner can act on it. Never base rubric feedback on the next turn or suggestedAnswer. For a strong criterion, set improvement to an empty string; never write 'Không cần thay đổi.' or 'No change needed.' suggestedAnswer gives an idea for answering the final in-character question/request in seasonReply; it must not repeat or re-ask that question, must never be a sentence the learner can copy, and must never be presented as a correction to the learner's latest message. SECRET WORDS: usedWords may include only configured lesson vocabulary used with its taught meaning, including a regular conjugated or plural form. The message itself is the evidence; never infer or invent a word.";
  const cefrGuidance = normalizedCefr
    ? isHigherCefr
      ? `CEFR LEVEL (${normalizedCefr}): Calibrate the complete in-character seasonReply strictly to ${normalizedCefr} workplace English with connected clauses, accurate workplace collocations, and professional register appropriate for ${normalizedCefr}. For B1 and above, explanations in rubric evidence, rubric improvement, and corrections[].reason may use concise English while keeping Vietnamese translations in dedicated translation fields.`
      : `CEFR LEVEL (${normalizedCefr}): Calibrate the complete in-character seasonReply strictly to ${normalizedCefr} workplace English using high-frequency vocabulary, short direct sentences, and foundational workplace grammar. Keep explanations in Vietnamese.`
      : "";
  const asrGuidance = hasAudio
    ? "ASR / SPOKEN TRANSCRIPT TOLERANCE: The learner message comes from a spoken audio transcript (ASR). Ignore speech-recognition punctuation, capitalization, and minor filler words (such as um or uh) when evaluating grammar and workplace meaning; do not create corrections for ASR formatting noise."
    : "";
  const requiredGrammarGuard = "GRAMMAR CHECK: Every complete clause needs an explicit subject and any required copula. Do not mark a message correct if it starts with a clipped or missing subject/copula such as 'm a project manager' or 'I a project manager'. Correct the first to 'I'm a project manager' and the second to 'I am a project manager'; make equivalent fixes for he/she/it is and you/we/they are. The grammar evidence must name the missing subject/copula and the correction must include it.";
  const correctionCompactnessGuard = "CORRECTION DISPLAY: Each corrections[].reason must be one concise explanation of at most 12 words. Do not restate the corrected sentence in the reason. Keep correctedText empty when it would duplicate a corrections[].corrected value; the UI already shows the corrected form.";
  const registerGuard = persona === "formal"
    ? "LEARNER REGISTER: Slang or overly casual wording in the learner message (for example lol, gimme, mate, 'em, no big deal) is a register problem, never a reason for off_topic. If the message still responds to currentQuestion, use status valid, result partially_correct, countsTowardGoal true, lower only rubric.meaning (appropriateness) to at most 3, and explain the register issue in noteVi and rubric.meaning.improvement. Use off_topic only when the content does not address currentQuestion."
    : "";
  return [prompt, instruction, correctionGuard, requiredGrammarGuard, correctionCompactnessGuard, registerGuard, cefrGuidance, asrGuidance, COACH_CONDUCT_RULE, COACH_ROLE_RULE, COACH_SAME_QUESTION_RULE, coachAnswerIdeaPromptRule(normalizedCefr)].filter(Boolean).join("\n\n");
}

/**
 * Fixed sides in the roleplay. Season plays the other person in the
 * situation for the whole session; the learner plays themselves. Every
 * question Season asks comes from Season's side, and the answer idea helps
 * the learner answer it from the learner's side.
 */
export const COACH_ROLE_RULE = "FIXED ROLES: The learner always plays themselves: 'you/your' in the scenario and opening is the learner, and everything described as 'your ...' (your update, your report, your slides) belongs to the learner. Season plays the OTHER person in that situation (the client, colleague, teammate, or manager it names) and keeps that same role in every turn; never switch sides. Every question or request in seasonReply is something that person asks the learner, in Season's own voice. Never write the learner's line for them: never ask the question the learner is supposed to ask you, and never say 'my update', 'my report', or similar about something the learner owns (say 'your update'). When the learner asks you something in role, answer it briefly as that person, then ask a NEW in-character question; never answer and then ask the same question again. The answer idea must describe how the learner, from the learner's side, answers that exact question.";

/** Artifact nouns a learner can own in a workplace scenario ("your update"). */
const LEARNER_ARTIFACT_NOUNS = ["update", "report", "slides", "slide", "deck", "draft", "presentation", "proposal", "summary", "timeline", "email", "design", "document", "plan", "schedule", "estimate", "budget", "demo", "notes"];
const ARTIFACT_PATTERN = LEARNER_ARTIFACT_NOUNS.join("|");
const ARTIFACT_MODIFIERS = "(?:(?:latest|new|recent|last|current|first|second|final|revised|weekly|monthly|project|progress|status|sales|team)\\s+){0,2}";
const SEASON_COUNTERPARTS = ["client", "customer", "colleague", "teammate", "coworker", "co-worker", "manager", "boss", "team leader", "supplier", "partner", "director"];

/**
 * Who Season plays and which artifacts belong to the learner, read from the
 * opening (the scenario framing, "A client has concerns about your latest
 * update…") and the learner's own words ("my update").
 */
export function coachScenarioRoles(opening: string, learnerMessages: readonly string[] = []): { seasonRole?: string; learnerOwned: string[] } {
  const owned = new Set<string>();
  const collect = (text: string, possessive: "your" | "my") => {
    for (const match of text.matchAll(new RegExp(`\\b${possessive}\\s+${ARTIFACT_MODIFIERS}(${ARTIFACT_PATTERN})\\b`, "giu"))) {
      owned.add(match[1]!.toLocaleLowerCase("en-US"));
    }
  };
  collect(opening, "your");
  for (const message of learnerMessages) collect(message, "my");
  const role = new RegExp(`\\b(?:a|an|the|your|our)\\s+(?:new\\s+)?(${SEASON_COUNTERPARTS.join("|")})\\b`, "iu").exec(opening)?.[1]?.toLocaleLowerCase("en-US");
  return { ...(role ? { seasonRole: role } : {}), learnerOwned: [...owned] };
}

const ROLEPLAY_LEARNER_PERSPECTIVE = "Season's question is phrased from the learner's side (the learner's own line).";

/**
 * A Season question written from the learner's side: it claims something the
 * learner owns as Season's ("my update" when the update is the learner's), or
 * it is the very question the answer idea tells the learner to ask.
 */
export function coachQuestionFromLearnerSide(question: string, context: { learnerOwned?: readonly string[]; answerIdea?: string }): boolean {
  const owned = (context.learnerOwned ?? []).map((noun) => noun.toLocaleLowerCase("en-US"));
  if (owned.length) {
    const claims = new RegExp(`\\bmy\\s+${ARTIFACT_MODIFIERS}(${owned.map((noun) => noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "iu");
    if (claims.test(question)) return true;
  }
  const idea = context.answerIdea?.trim() ?? "";
  const asksOther = /^(?:you (?:can|could|might|should)\s+|try (?:to\s+)?)?(?:politely\s+)?ask\b/iu.test(idea);
  if (asksOther) {
    const stop = new Set(["the", "a", "an", "you", "your", "they", "them", "their", "what", "which", "how", "about", "can", "could", "ask", "politely", "try", "to", "of", "is", "are", "and", "or", "it", "this", "that", "for", "in", "on", "me", "my", "i"]);
    const words = (value: string) => new Set((value.toLocaleLowerCase("en-US").match(/\p{L}{3,}/gu) ?? []).filter((word) => !stop.has(word)));
    const asked = words(question);
    const suggested = words(idea);
    if (asked.size >= 2 && [...asked].filter((word) => suggested.has(word)).length / asked.size >= 0.6) return true;
  }
  return false;
}

/** The session's fixed roles, written into the practice policy. */
export function coachRolePolicy(opening: string, learnerMessages: readonly string[] = []): string {
  if (!opening.trim()) return "";
  const roles = coachScenarioRoles(opening, learnerMessages);
  const season = roles.seasonRole ? `the ${roles.seasonRole} in that situation` : "the other person in that situation (the colleague, client, or manager the learner is talking to)";
  const owned = roles.learnerOwned.length
    ? ` These belong to the learner, never to Season: ${roles.learnerOwned.map((noun) => `"your ${noun}"`).join(", ")}; Season never says "my ${roles.learnerOwned[0]}".`
    : "";
  return ` SCENARIO ROLES: The session opened with ${JSON.stringify(opening.trim())}. For this whole session the learner is "you" in that opening and Season plays ${season}.${owned} Each Season question is asked by that person to the learner; it is never the line the learner should say.`;
}

/** An unanswered question stays open: Season asks it again instead of moving on. */
export const COACH_SAME_QUESTION_RULE = "SAME QUESTION UNTIL ANSWERED: When the learner's message does not answer currentQuestion (off_topic, insufficient, Vietnamese text, too short, 'I don't know', a request to clarify, or currentQuestion itself typed back), the turn does not count and Season must not move on. seasonReply stays in character, may say in one short sentence why that did not answer the question, and then asks currentQuestion again: the same question, optionally rephrased in simpler words. Do not answer or add new content in that turn. learnerQuestion/nextQuestion is that re-asked question, and the answer idea helps answer currentQuestion. Only a valid answer to currentQuestion moves the conversation to a new question, and after a valid answer Season never asks currentQuestion again.";

export function isAcknowledgementOnly(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}\s']/gu, "").replace(/\s+/g, " ");
  return new Set(["ok", "okay", "yes", "no", "yeah", "yep", "nope", "sure", "thanks", "thank you", "hi", "hello"]).has(normalized);
}

export function isInsufficientCoachInput(message: string, cefr: string = "A1"): boolean {
  if (isAcknowledgementOnly(message)) return true;
  const normalized = normalizedCoachWords(message);
  if (/^(?:i do not know|i don't know|i dont know|idk)$/u.test(normalized.replaceAll("’", "'"))) return true;
  return countCoachWords(message) < minimumSeasonTurnWords(cefr);
}

function normalizedCoachWords(message: string): string {
  return message.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}'’\s]/gu, "").replace(/\s+/g, " ");
}

/** The single, code-side word count used by the Season turn gate. */
export function countCoachWords(message: string): number {
  return normalizedCoachWords(message).split(" ").filter(Boolean).length;
}

/**
 * Vietnamese prose in a learner answer: a lower-case token carrying a
 * Vietnamese/Latin diacritic ("vào", "nhé", "thứ"). Capitalised tokens are
 * skipped so an English sentence containing a name such as "Lê" or "José"
 * is not rejected.
 */
export function containsVietnameseLearnerText(message: string): boolean {
  return (message.normalize("NFC").match(/[\p{L}\p{M}'’-]+/gu) ?? [])
    .some((token) => /[\u00c0-\u024f\u1e00-\u1eff]/u.test(token) && !/^\p{Lu}/u.test(token));
}

function minimumSeasonTurnWords(cefr: string): number {
  return ({ A1: 5, A2: 7, B1: 10, B2: 12, C1: 15 } as Record<string, number>)[cefr.trim().toUpperCase()] ?? 5;
}

export type CoachUnansweredKind = "repeated" | "clarification" | "dont_know" | "vietnamese" | "insufficient";

const CLARIFICATION_REQUEST = /(?:\bwhat do you mean\b|\bwhat does (?:that|it|this|the question) mean\b|\bwhat(?:'s| is) the question\b|^\s*(?:sorry|pardon|excuse me|huh|what)\s*\??\s*$|\bpardon\b|\bcome again\b|\b(?:can|could|would) you (?:please )?(?:explain|repeat|rephrase|clarify|say (?:that|it) again|ask (?:that|it) again)\b|\b(?:please )?(?:repeat|explain|rephrase)(?: that| it| the question)?(?: please)?\s*[?.!]*\s*$|\b(?:i )?(?:don['’]?t|do not|didn['’]?t|did not) (?:understand|get (?:it|that|the question)|follow)\b|\bnot clear\b|không hiểu|nghĩa là gì|ý (?:bạn )?là sao)/iu;
const DONT_KNOW = /(?:^|\b)(?:i\s+)?(?:don['’]?t|do not|dont)\s+know\b|\bdunno\b|\bidk\b|\bno idea\b|\bnot sure\b|\bi can['’]?t think\b|không biết/iu;

/**
 * Code-side gate for a Season practice turn. The kind decides how Season
 * answers: a clarification request gets the same question in simpler words,
 * "I don't know" gets an idea hint and the same question, and every other
 * gated reply gets the same question again. None of them counts as a turn.
 */
export function coachPracticeTurnGate(
  message: string,
  cefr: string,
  messages: CoachView["messages"]
): { kind: CoachUnansweredKind; reasonVi: string } | undefined {
  // Season's open question typed back is not an answer to it: the turn does
  // not count and Season re-asks the same question without answering it.
  if (isCoachQuestionEcho(message, coachCurrentQuestion(messages, ""))) return { kind: "repeated", reasonVi: COACH_ECHO_REASON_VI };
  if (isRepeatedSeasonMessage(message, messages)) return { kind: "repeated", reasonVi: "Câu trả lời trùng hoàn toàn với một câu trước đó; hãy tự viết câu mới." };
  const words = countCoachWords(message);
  if (words <= 12 && CLARIFICATION_REQUEST.test(message)) {
    return { kind: "clarification", reasonVi: "Season hỏi lại câu hỏi bằng cách nói đơn giản hơn. Lượt này không tính và không bị trừ điểm." };
  }
  if (words <= 8 && DONT_KNOW.test(message)) {
    return { kind: "dont_know", reasonVi: "Không sao! Season gợi ý một ý tưởng và hỏi lại câu hỏi. Lượt này không tính và không bị trừ điểm." };
  }
  if (containsVietnameseLearnerText(message)) return { kind: "vietnamese", reasonVi: "Câu trả lời còn chứa tiếng Việt nên chưa được tính lượt; hãy viết toàn bộ câu bằng tiếng Anh." };
  if (isInsufficientCoachInput(message, cefr)) return { kind: "insufficient", reasonVi: `Câu trả lời chưa đủ ${minimumSeasonTurnWords(cefr)} từ hoặc chưa thành ý; hãy viết một câu tiếng Anh có chủ ngữ và động từ.` };
  return undefined;
}

export function coachPracticeTurnGateReason(
  message: string,
  cefr: string,
  messages: CoachView["messages"]
): string | undefined {
  return coachPracticeTurnGate(message, cefr, messages)?.reasonVi;
}

export const COACH_ECHO_REASON_VI = "Câu này lặp lại câu hỏi của Season, chưa phải câu trả lời. Season hỏi lại câu hỏi; hãy trả lời bằng lời của bạn.";

/**
 * The learner's message is (nearly) Season's open question typed back:
 * the same question key, or the same content words in both directions.
 * Such a message never answers the question it repeats.
 */
export function isCoachQuestionEcho(message: string, currentQuestion: string): boolean {
  const asked = cleanCoachQuestionAnchor(currentQuestion);
  if (!asked || !message.trim()) return false;
  if (coachQuestionKey(message) === coachQuestionKey(asked)) return true;
  return coachQuestionOverlap(message, asked) >= 0.8 && coachQuestionOverlap(asked, message) >= 0.8;
}

function isRepeatedSeasonMessage(message: string, messages: CoachView["messages"]): boolean {
  const normalizeExact = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
  const target = normalizeExact(message);
  if (!target) return false;
  // "An exact copy of any prior Season or learner sentence": a single Season
  // sentence (for example its question) copied on its own counts too.
  const sentenceKey = (value: string) => normalizeCoachTurnText(value);
  const targetKey = sentenceKey(message);
  return messages.some((item) => {
    const prior = item.speaker === "learner" ? item.text : item.feedback?.seasonReply ?? item.text;
    if (normalizeExact(prior) === target) return true;
    if (item.speaker !== "coach" || !targetKey) return false;
    const sentences = prior.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) ?? [];
    return sentences.some((sentence) => sentenceKey(sentence) === targetKey && countCoachWords(sentence) >= 3);
  });
}

export function coachPracticeTurnPolicy(
  cefr: string,
  topic: string,
  priorQuestions: readonly string[] = [],
  context: { learnerWordCount?: number; unopenedVocabulary?: readonly string[]; currentQuestion?: string; scenarioOpening?: string; learnerMessages?: readonly string[] } = {}
): string {
  // The current question is still open: re-asking it after an unanswered turn
  // is a natural re-prompt, so only the earlier questions are forbidden.
  const currentKey = coachQuestionKey(context.currentQuestion ?? "");
  const earlierQuestions = priorQuestions.filter((question) => !currentKey || coachQuestionKey(question) !== currentKey);
  const history = earlierQuestions.length ? ` Exact questions already asked in this topic: ${JSON.stringify(earlierQuestions)}.` : "";
  const wordCount = typeof context.learnerWordCount === "number"
    ? ` WORD COUNT: The learner message has exactly ${context.learnerWordCount} words, counted by code, and it already passed the code checks for minimum word count and Vietnamese text. Do not recount words and never state a different word count in noteVi.`
    : "";
  const vocabulary = [...new Set((context.unopenedVocabulary ?? []).map((word) => word.trim()).filter(Boolean))].slice(0, 15);
  const monthVocabulary = vocabulary.length
    ? ` MONTH VOCABULARY: This month's lesson words the learner has not used yet: ${JSON.stringify(vocabulary)}. When it fits the scenario naturally, ask a follow-up that gives the learner a chance to use one of them; never list, define, or teach these words in seasonReply.`
    : "";
  return `SEASON TURN ELIGIBILITY (practice only): A valid turn must be entirely English, answer the current in-character question, contain at least ${minimumSeasonTurnWords(cefr)} words, and include at least one clause with a subject and verb. Reject acknowledgements, fragments, word lists, and an exact copy of any prior Season or learner sentence as insufficient; name the short reason in Vietnamese. Ignore grammatical correctness when deciding whether the turn counts: grammar errors may still count if the other four gates pass. Set countsTowardGoal=true only when all five gates pass. These gates do not change the language score or monthly exam score. ROLEPLAY CONTINUITY: Stay in the workplace topic “${topic}”. Respond to the details in the learner's latest message, then ask one concise, natural in-character follow-up about that detail. Do not use classroom instructions such as asking them to write a complete sentence. If the learner has already stated their role or job, acknowledge it and ask about a project, task, or next step instead of asking about their role again. Do not repeat any earlier question from the supplied priorQuestions. When the learner did not answer currentQuestion, ask currentQuestion again (the same question, optionally in simpler words) instead of a new one; only after a valid answer move forward with a new follow-up about the same topic.${coachRolePolicy(context.scenarioOpening ?? "", context.learnerMessages ?? [])}${history}${wordCount}${monthVocabulary}`;
}

const REASK_LEADS: Record<CoachUnansweredKind | "off_topic" | "unavailable", { formal: string; informal: string; vi: string }> = {
  clarification: { formal: "Of course. Let me ask it in a simpler way.", informal: "No problem, let me say it more simply.", vi: "Không sao, mình hỏi lại đơn giản hơn nhé." },
  dont_know: { formal: "That is all right. Here is a small idea to help you.", informal: "No worries, here's a small idea to help you.", vi: "Không sao, đây là một gợi ý nhỏ cho bạn." },
  vietnamese: { formal: "Please answer in English so I can follow.", informal: "Let's try that in English so I can follow.", vi: "Bạn hãy trả lời bằng tiếng Anh để mình hiểu nhé." },
  repeated: { formal: "Please answer in your own words.", informal: "Let's hear it in your own words.", vi: "Bạn hãy trả lời bằng lời của chính mình nhé." },
  insufficient: { formal: "I would like to hear a little more detail.", informal: "I'd love to hear a bit more detail.", vi: "Mình muốn nghe thêm một chút chi tiết." },
  off_topic: { formal: "I am not sure that answers my question yet.", informal: "Hmm, I don't think that answers my question yet.", vi: "Mình nghĩ câu đó chưa trả lời câu hỏi của mình." },
  unavailable: { formal: "Your answer was saved. I will reply properly as soon as I am available again.", informal: "Your answer's saved. I'll reply properly as soon as I'm available again.", vi: "Câu trả lời của bạn đã được lưu. Season sẽ trả lời đầy đủ ngay khi hoạt động lại." }
};

/** The open question in simpler words: a lead-in clause and "please" are dropped. */
export function simplifyCoachQuestion(question: string): string {
  const clean = cleanCoachQuestionAnchor(question).replace(/[\p{Extended_Pictographic}️]/gu, "").replace(/\s+/gu, " ").trim();
  const core = clean
    .replace(/^[^,?]{1,120},\s+(?=(?:could|can|would|will|what|which|how|when|where|who|why|do|does|did|is|are|please)\b)/iu, "")
    .replace(/,?\s*\bplease\b,?/giu, "")
    .replace(/\s+([,?.!])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
  const simplified = core || clean;
  return simplified.charAt(0).toLocaleUpperCase("en-US") + simplified.slice(1);
}

/**
 * Season's reply when a learner reply did not answer the open question:
 * the SAME question is asked again (in simpler words after a clarification
 * request), with an idea hint after "I don't know". Nothing is invented from
 * the learner's words.
 */
export function coachReaskFollowUp(input: {
  kind: CoachUnansweredKind | "off_topic" | "unavailable";
  currentQuestion: string;
  currentQuestionTranslation?: string | undefined;
  persona: "informal" | "formal";
  cefr?: string | undefined;
}): {
  seasonReply: string; seasonReplyTranslation: string; nextQuestion: string; nextQuestionTranslation: string;
  suggestedAnswer?: { text: string; translation: string };
} {
  const lead = REASK_LEADS[input.kind];
  const asked = cleanCoachQuestionAnchor(input.currentQuestion).replace(/[\p{Extended_Pictographic}️]/gu, "").replace(/\s+/gu, " ").trim();
  const question = coachQuestionForPersona(input.kind === "clarification" ? simplifyCoachQuestion(asked) : asked, input.persona);
  const spokenLead = input.persona === "formal" ? lead.formal : lead.informal;
  const questionTranslation = input.currentQuestionTranslation?.trim() ?? "";
  return {
    seasonReply: `${spokenLead} ${question}${input.persona === "informal" ? " 😊" : ""}`.trim(),
    seasonReplyTranslation: `${lead.vi} ${questionTranslation}`.trim(),
    nextQuestion: question,
    nextQuestionTranslation: questionTranslation,
    ...(input.kind === "dont_know" || input.kind === "clarification"
      ? { suggestedAnswer: fallbackCoachAnswerIdea(input.cefr, input.kind === "dont_know" ? "dont_know" : "answer") }
      : {})
  };
}

/**
 * A new follow-up question, used only when the model's roleplay turn had to
 * be discarded. It never quotes a word picked from the learner's message.
 */
export function coachFallbackFollowUp(
  message: string,
  currentQuestion: string,
  topic: string,
  persona: "informal" | "formal",
  priorQuestions: readonly string[] = []
): { seasonReply: string; seasonReplyTranslation: string; nextQuestion: string; nextQuestionTranslation: string } {
  const roleAlreadyStated = /\b(?:i am|i'm|i work as|my role is|i work in)\b/iu.test(message);
  const options: Array<[string, string]> = roleAlreadyStated
    ? [
        ["Which project are you working on this week?", "Tuần này bạn đang làm dự án nào?"],
        ["What task is taking most of your time today?", "Hôm nay công việc nào đang chiếm nhiều thời gian của bạn nhất?"],
        ["What would you like to accomplish next?", "Tiếp theo bạn muốn hoàn thành điều gì?"],
        ["Which project needs your attention first?", "Dự án nào cần bạn ưu tiên trước?"],
        ["What is one task you handled recently?", "Gần đây bạn đã xử lý công việc nào?"]
      ]
    : [
        [`Which detail about “${topic}” can you share first?`, `Bạn có thể chia sẻ trước chi tiết nào về “${topic}”?`],
        ["What happened next in that situation?", "Sau đó chuyện gì đã xảy ra trong tình huống đó?"],
        ["What would you like us to focus on first?", "Bạn muốn chúng ta tập trung vào điều gì trước?"],
        ["What is one next step you could take?", "Một bước tiếp theo bạn có thể thực hiện là gì?"],
        ["Which part of the situation matters most to your team?", "Phần nào của tình huống quan trọng nhất với nhóm của bạn?"]
      ];
  const previouslyAsked = new Set([...priorQuestions, currentQuestion].map(coachQuestionKey));
  let selected = options.find(([question]) => !previouslyAsked.has(coachQuestionKey(question)));
  if (!selected) {
    const fallbackOptions: Array<[string, string]> = [
      [`What would you recommend as the next step for “${topic}”?`, `Bạn đề xuất bước tiếp theo nào cho “${topic}”?`],
      [`Which part of “${topic}” should we discuss next?`, `Chúng ta nên trao đổi tiếp về phần nào của “${topic}”?`],
      [`What is one practical detail about “${topic}” we should consider?`, `Có chi tiết thực tế nào về “${topic}” chúng ta nên cân nhắc?`]
    ];
    selected = fallbackOptions.find(([question]) => !previouslyAsked.has(coachQuestionKey(question))) ?? fallbackOptions[priorQuestions.length % fallbackOptions.length]!;
  }
  const [nextQuestion, nextQuestionTranslation] = selected;
  const acknowledgement = roleAlreadyStated
    ? persona === "formal" ? "Thank you for sharing your role." : "I'm glad you told me about your work."
    : persona === "formal" ? "Thank you for sharing that." : "I'm glad you shared that.";
  const translatedAcknowledgement = roleAlreadyStated ? "Cảm ơn bạn đã chia sẻ về công việc của mình." : "Cảm ơn bạn đã chia sẻ.";
  return {
    seasonReply: `${acknowledgement} ${nextQuestion}${persona === "informal" ? " 😊" : ""}`,
    seasonReplyTranslation: `${translatedAcknowledgement} ${nextQuestionTranslation}`,
    nextQuestion,
    nextQuestionTranslation
  };
}

/** Vietnamese translation of the open question, from the latest Season turn. */
export function coachCurrentQuestionTranslation(
  messages: Array<{ speaker: "learner" | "coach"; text: string; feedback?: { nextQuestionTranslation?: string } }>
): string {
  const latestCoach = [...messages].reverse().find((message) => message.speaker === "coach" && message.text.trim());
  return latestCoach?.feedback?.nextQuestionTranslation?.trim() ?? "";
}

export function coachCurrentQuestion(
  messages: Array<{ speaker: "learner" | "coach"; text: string; feedback?: { nextQuestion?: string } }>,
  fallback: string
): string {
  const latestCoach = [...messages].reverse().find((message) => message.speaker === "coach" && message.text.trim());
  return cleanCoachQuestionAnchor(latestCoach?.feedback?.nextQuestion ?? "") || latestCoach?.text.trim() || fallback;
}

/** Drops quote/punctuation debris left at the start of a split sentence (”). */
function cleanCoachQuestionAnchor(value: string): string {
  return value.trim().replace(/^[\s”"’'.,;:]+/u, "").trim();
}

/**
 * Comparison key for "was this question already asked": case, punctuation,
 * quotes, emoji, contractions, "please" and a leading lead-in clause
 * ("Before we agree on an extra week, could you…") are ignored.
 */
export function coachQuestionKey(value: string): string {
  const question = cleanCoachQuestionAnchor(formalizeText(value));
  const core = question.replace(/^[^,?]{1,120},\s+(?=(?:could|can|would|will|what|which|how|when|where|who|why|do|does|did|is|are|please)\b)/iu, "");
  return normalizeCoachTurnText(core).replace(/\bplease\b/gu, " ").replace(/\s+/gu, " ").trim();
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

/**
 * A turn that does not count (off_topic or insufficient) keeps the open
 * question: Season asks currentQuestion again. A model turn that already
 * re-asks it (same question, or a light rephrasing) is kept; a turn that
 * moved on to a different question is replaced by a deterministic re-ask,
 * and its answer idea (written for the other question) is replaced too.
 * Only a valid answer advances to a new question.
 */
export function repeatCurrentQuestionForInvalidTurn<T extends CoachTaskOutput>(
  output: T,
  context: { currentQuestion: string; currentQuestionTranslation?: string | undefined; persona: "informal" | "formal"; cefr?: string | undefined }
): T {
  if (output.evaluation.status === "valid") return output;
  const current = cleanCoachQuestionAnchor(context.currentQuestion);
  if (!current) return output;
  const reply = output.seasonReply.trim();
  const asked = output.nextQuestion.trim();
  const reasksCurrent = Boolean(asked)
    && (coachQuestionKey(asked) === coachQuestionKey(current) || coachQuestionOverlap(asked, current) >= 0.6)
    && normalizeCoachTurnText(reply).includes(normalizeCoachTurnText(asked));
  // A kept re-ask may carry one short "why that did not answer" sentence; a
  // longer turn also answers or adds content, which a re-ask must not do.
  if (reasksCurrent && coachSentenceCount(replyWithoutQuestion(reply, asked)) <= 1) return output;
  const reask = coachReaskFollowUp({
    kind: output.evaluation.status === "off_topic" ? "off_topic" : "insufficient",
    currentQuestion: current,
    currentQuestionTranslation: context.currentQuestionTranslation,
    persona: context.persona,
    cefr: context.cefr
  });
  return {
    ...output,
    seasonReply: reask.seasonReply,
    seasonReplyTranslation: reask.seasonReplyTranslation,
    nextQuestion: reask.nextQuestion,
    nextQuestionTranslation: reask.nextQuestionTranslation,
    suggestedAnswer: { ...fallbackCoachAnswerIdea(context.cefr), kind: "idea" as const }
  };
}

/** The Season turn without its final question (and the emoji after it). */
function replyWithoutQuestion(reply: string, question: string): string {
  const trimmed = reply.replace(/[\p{Extended_Pictographic}️\s]+$/gu, "").trim();
  const asked = question.trim();
  if (asked && trimmed.endsWith(asked)) return trimmed.slice(0, -asked.length).trim();
  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  const last = sentences.at(-1);
  return last && normalizeCoachTurnText(last) === normalizeCoachTurnText(asked) ? sentences.slice(0, -1).join(" ") : trimmed;
}

function sameCoachQuestion(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  return coachQuestionKey(a) === coachQuestionKey(b)
    || (coachQuestionOverlap(a, b) >= 0.85 && coachQuestionOverlap(b, a) >= 0.85);
}

/** The opening Season turn (the scenario framing), or "" when there is none. */
export function coachScenarioOpening(messages: Array<{ id?: string; speaker: "learner" | "coach"; text: string }>): string {
  const opening = messages.find((item) => item.speaker === "coach" && item.id?.endsWith(":opening"))
    ?? messages.find((item) => item.speaker === "coach");
  return opening?.text.trim() ?? "";
}

/**
 * After a VALID answer the open question is closed: a turn that answers and
 * then asks currentQuestion again keeps its in-character content but gets a
 * new follow-up question (and a matching answer idea) instead.
 */
export function avoidRepeatedQuestionAfterAnswer<T extends CoachTaskOutput>(
  output: T,
  context: {
    currentQuestion: string; persona: "informal" | "formal"; cefr?: string | undefined;
    learnerMessage?: string; topic?: string; priorQuestions?: readonly string[];
  }
): T {
  if (output.evaluation.status !== "valid") return output;
  const current = cleanCoachQuestionAnchor(context.currentQuestion);
  if (!sameCoachQuestion(output.nextQuestion, current)) return output;
  const fallback = coachFallbackFollowUp(
    context.learnerMessage ?? "", current, context.topic ?? "workplace conversation", context.persona,
    [...(context.priorQuestions ?? []), output.nextQuestion]
  );
  const question = coachQuestionForPersona(fallback.nextQuestion, context.persona);
  const emoji = context.persona === "informal" ? " 😊" : "";
  const content = replyWithoutQuestion(output.seasonReply, output.nextQuestion);
  const questionTranslation = output.nextQuestionTranslation.trim();
  const replyTranslation = output.seasonReplyTranslation.trim();
  const keepContent = /[\p{L}\p{N}]/u.test(content) && normalizeCoachTurnText(content) !== normalizeCoachTurnText(output.seasonReply);
  const translatedContent = keepContent && questionTranslation && replyTranslation.endsWith(questionTranslation)
    ? replyTranslation.slice(0, -questionTranslation.length).trim()
    : undefined;
  const useContent = keepContent && translatedContent !== undefined;
  return {
    ...output,
    seasonReply: useContent ? `${content} ${question}${emoji}` : `${fallback.seasonReply.replace(/\s*😊$/u, "")}${emoji}`.replace(fallback.nextQuestion, question),
    seasonReplyTranslation: useContent ? `${translatedContent} ${fallback.nextQuestionTranslation}`.trim() : fallback.seasonReplyTranslation,
    nextQuestion: question,
    nextQuestionTranslation: fallback.nextQuestionTranslation,
    suggestedAnswer: { ...fallbackCoachAnswerIdea(context.cefr), kind: "idea" as const }
  };
}

/**
 * The learner typed currentQuestion back. It is not an answer: the grade is
 * "insufficient" (it does not count) and the reply is the re-ask below, so
 * the grading and Season's turn never disagree.
 */
export function treatQuestionEchoAsUnanswered<T extends CoachTaskOutput>(output: T, learnerMessage: string, currentQuestion: string): T {
  if (!isCoachQuestionEcho(learnerMessage, currentQuestion)) return output;
  return {
    ...output,
    evaluation: { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: COACH_ECHO_REASON_VI },
    rubric: { ...output.rubric, meaning: { score: 0, evidence: COACH_ECHO_REASON_VI, improvement: "Hãy trả lời câu hỏi của Season bằng thông tin của bạn." } },
    corrections: [], correctedText: "", usedWords: []
  };
}

/**
 * Question flow after grading, in one place for practice and challenge:
 * an echoed question is not an answer; a turn that does not count re-asks the
 * open question without answering; a valid answer never re-asks it.
 */
export function coachQuestionFlowForTurn<T extends CoachTaskOutput>(
  output: T,
  context: {
    currentQuestion: string; currentQuestionTranslation?: string | undefined; persona: "informal" | "formal"; cefr?: string | undefined;
    learnerMessage?: string; topic?: string; priorQuestions?: readonly string[];
  }
): T {
  const graded = context.learnerMessage ? treatQuestionEchoAsUnanswered(output, context.learnerMessage, context.currentQuestion) : output;
  if (graded.evaluation.status !== "valid") {
    if (graded === output) return repeatCurrentQuestionForInvalidTurn(graded, context);
    // An echo is always re-asked deterministically, never with the model's
    // turn that answered the echoed question.
    const followUp = coachReaskFollowUp({
      kind: "repeated", currentQuestion: context.currentQuestion, currentQuestionTranslation: context.currentQuestionTranslation,
      persona: context.persona, cefr: context.cefr
    });
    return {
      ...graded, seasonReply: followUp.seasonReply, seasonReplyTranslation: followUp.seasonReplyTranslation,
      nextQuestion: followUp.nextQuestion, nextQuestionTranslation: followUp.nextQuestionTranslation,
      suggestedAnswer: { ...fallbackCoachAnswerIdea(context.cefr), kind: "idea" as const }
    };
  }
  return avoidRepeatedQuestionAfterAnswer(graded, context);
}

/** Share of the current question's content words that the asked question keeps. */
function coachQuestionOverlap(asked: string, current: string): number {
  const stop = new Set(["the", "a", "an", "you", "your", "is", "are", "do", "does", "did", "to", "of", "for", "in", "on", "at", "it", "can", "could", "would", "will", "please", "me", "us", "we", "i", "and", "or", "this", "that"]);
  const tokens = (value: string) => new Set(coachQuestionKey(value).split(" ").filter((token) => token && !stop.has(token)));
  const currentTokens = tokens(current);
  if (!currentTokens.size) return 0;
  const askedTokens = tokens(asked);
  return [...currentTokens].filter((token) => askedTokens.has(token)).length / currentTokens.size;
}

function endsWithCoachQuestion(value: string): boolean {
  return /\?\s*(?:[\p{Extended_Pictographic}\uFE0F]\s*)*$/u.test(value.trim());
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
      return coachVocabularyForms(word).some((form) => {
        const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(message);
      });
    })
    .map((word) => configured.get(word)!);
  return { ...output, usedWords };
}

function coachVocabularyForms(word: string): string[] {
  const tokens = word.split(/\s+/u);
  const base = tokens.at(-1) ?? word;
  const forms = new Set([word]);
  const addEnding = (ending: string) => forms.add([...tokens.slice(0, -1), `${base}${ending}`].join(" "));
  addEnding("s");
  addEnding("es");
  addEnding("ed");
  addEnding("d");
  addEnding("ing");
  if (/[^aeiou]y$/iu.test(base)) {
    forms.add([...tokens.slice(0, -1), `${base.slice(0, -1)}ies`].join(" "));
    forms.add([...tokens.slice(0, -1), `${base.slice(0, -1)}ied`].join(" "));
  }
  if (/e$/iu.test(base)) forms.add([...tokens.slice(0, -1), `${base.slice(0, -1)}ing`].join(" "));
  if (/[^aeiou][aeiou][^aeiouwxy]$/iu.test(base)) {
    const doubled = `${base}${base.at(-1)}`;
    forms.add([...tokens.slice(0, -1), `${doubled}ed`].join(" "));
    forms.add([...tokens.slice(0, -1), `${doubled}ing`].join(" "));
  }
  return [...forms];
}

interface CoachValidationContext {
  learnerMessage: string;
  previousSuggestedAnswer?: string | undefined;
  topic?: string;
  currentQuestion?: string;
  currentQuestionTranslation?: string;
  priorQuestions?: string[];
  /** Artifacts the learner owns in the scenario ("update" for "your update"); Season never claims them. */
  learnerOwned?: string[];
  /** Level of the learner (practice) or of the challenge; decides the answer-idea language. */
  cefr?: string;
}

export function validateCoachPersonaOutput(
  output: CoachTaskOutput,
  persona: "informal" | "formal",
  context?: CoachValidationContext
): string[] {
  const text = output.seasonReply.trim();
  const emojiCount = [...text.matchAll(/\p{Extended_Pictographic}/gu)].length;
  const contraction = /\b\p{L}+['’](?:s|re|ve|ll|d|m|t)\b/iu.test(text);
  const conversationViolations = [
    ...(coachSentenceCount(output.seasonReply) < 2 || coachSentenceCount(output.seasonReply) > 4
      ? ["Season reply must contain between two and four sentences."] : []),
    ...validateRequiredSubjectCopulaFeedback(output, context),
    ...validateSuggestedAnswer(output),
    ...validateSuggestedAnswerReplay(output, context),
    ...validateInCharacterTurn(output)
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

function validateInCharacterTurn(output: CoachTaskOutput): string[] {
  const reply = output.seasonReply.trim();
  const question = output.nextQuestion.trim();
  // The spoken turn is consumed verbatim by the learner.  Translation belongs in
  // its dedicated field, so accepting mixed-language prose here turns the coach
  // into an instruction screen instead of a conversation partner.
  // A learner's Vietnamese name can legitimately appear in an English greeting;
  // remove that name token before enforcing the spoken-turn language contract.
  const replyWithoutGreetingName = reply.replace(/^(?:hi|hello|hey|dear)\s+[\p{L}'-]+[!,.]?\s*/iu, "");
  const containsVietnameseProse = /[\u00c0-\u024f\u1e00-\u1eff]/u;
  const metaNarration = /\b(?:your (?:opening|answer|response|colleague)|great\s*now|how do you ask|what could you say|what would you say|you should say|the learner|as a coach|let'?s practise|roleplay)\b/iu;
  // "What do you say to the client?" is an in-character question about a
  // third party in the scenario; only an unaddressed "What do you say?" is a
  // meta prompt. (Teacher phrasing like "what would you say" is still caught
  // by metaNarration above.)
  const directMetaQuestion = /\b(?:how|what)\s+(?:would|do|should|can)\s+you\s+(?:reply|respond|answer|ask|say)\b(?!\s+(?:to|with)\s+(?:the|our|this|that|my|him|her|them)\b)/iu;
  return [
    ...(containsVietnameseProse.test(replyWithoutGreetingName) ? ["Season reply must be English-only; Vietnamese belongs in seasonReplyTranslation."] : []),
    ...(metaNarration.test(reply) ? ["Season reply contains teacher or examiner narration."] : []),
    ...(normalizeCoachTurnText(reply).includes(normalizeCoachTurnText(question)) && !directMetaQuestion.test(question)
      ? []
      : ["Next question must be an in-character anchor included verbatim in the Season reply."])
  ];
}

function validateRequiredSubjectCopulaFeedback(output: CoachTaskOutput, context?: CoachValidationContext): string[] {
  if (!context?.learnerMessage) return [];
  const requiredCorrection = missingSubjectCopulaCorrection(context.learnerMessage);
  if (!requiredCorrection) return [];
  const correctionIncluded = output.corrections.some((item) => normalizeCoachTurnText(item.corrected) === normalizeCoachTurnText(requiredCorrection.corrected));
  const accuratelyGraded = output.evaluation.result === "partially_correct"
    && output.rubric.grammar.score <= 3
    && correctionIncluded;
  return accuratelyGraded ? [] : ["The learner response is missing a required subject/copula and must be corrected and graded as partially correct."];
}

function missingSubjectCopulaCorrection(message: string): { corrected: string; reason: string } | undefined {
  const clippedFirstPerson = /(^|[.!?]\s+)m\s+(a|an)\b/iu;
  if (clippedFirstPerson.test(message)) {
    return {
      corrected: message.replace(clippedFirstPerson, (_match, prefix: string, article: string) => `${prefix}I'm ${article}`),
      reason: "Câu mở đầu thiếu chủ ngữ I và động từ am; dùng I'm trước cụm danh từ chỉ nghề."
    };
  }
  const missingCopula = /(^|[.!?]\s+)(I|you|we|they|he|she|it)\s+(a|an)\b/iu;
  const match = missingCopula.exec(message);
  if (!match) return undefined;
  const subject = match[2]!;
  const canonicalSubject = subject.toLocaleLowerCase() === "i" ? "I" : `${subject[0]!.toLocaleUpperCase()}${subject.slice(1)}`;
  const copula = canonicalSubject === "I" ? "am" : ["He", "She", "It"].includes(canonicalSubject) ? "is" : "are";
  return {
    corrected: message.replace(missingCopula, (_full, prefix: string, _subject: string, article: string) => `${prefix}${canonicalSubject} ${copula} ${article}`),
    reason: `Thêm động từ nối ${copula} sau chủ ngữ ${canonicalSubject} trước cụm danh từ.`
  };
}

function normalizeCoachTurnText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").trim();
}

function coachSentenceCount(value: string): number {
  // A trailing emoji ("…next? 😊") is not a sentence of its own.
  return value.split(/[.!?]+(?:\s+|$)/u).map((part) => part.trim()).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
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

/**
 * Keep the spoken roleplay boundary independent from scoring.  The old single
 * `coach_dialogue` response asked one model call to satisfy English dialogue,
 * Vietnamese translations and a rubric at once; a malformed rubric therefore
 * made a perfectly usable dialogue turn fail with 502.  We accept the small
 * turn first, then ask for feedback separately and never let feedback replace
 * the accepted turn.
 */
export interface CoachRoleplayDiagnostics {
  /** Violations found in the model's roleplay turn before local repair. */
  modelViolations: string[];
  /** Non-blocking findings (contraction, emoji, sentence count…) on the turn that was kept. */
  warnings: string[];
  /** Blocking violations that replaced the model's turn with the local fallback. */
  fallbackViolations?: string[];
  /** Error code of a failed feedback call (for example AI_OUTPUT_TRUNCATED). */
  feedbackErrorCode?: string;
}

/** Output budgets of the two Season calls. coach_dialogue was truncated at 1 400 tokens on long C1 turns. */
export const COACH_ROLEPLAY_MAX_OUTPUT_TOKENS = 1_200;
export const COACH_FEEDBACK_MAX_OUTPUT_TOKENS = 2_400;

export async function runCoachWithPersonaRepair(
  runner: AiTaskRunner,
  input: unknown,
  systemPrompt: string,
  persona: "informal" | "formal",
  validationContext?: CoachValidationContext
): Promise<{ result: AiRunResult; output: CoachTaskOutputWithFeedbackStatus; feedbackErrorCode?: string; roleplay: CoachRoleplayDiagnostics }> {
  const roleplayPrompt = `${systemPrompt}\n\nROLEPLAY TURN ONLY. Return ONLY this compact JSON object: {"seasonReply":"...","learnerQuestion":"...","answerIdea":"...","seasonReplyTranslation":"...","learnerQuestionTranslation":"...","answerIdeaTranslation":"..."}. seasonReply and learnerQuestion are English-only. Speak as the colleague/customer, not as a teacher. seasonReply has 2-4 direct in-character sentences and ends with learnerQuestion verbatim. learnerQuestion must be a natural question/request to the learner, never 'What would you say?' or other teaching language. If the learner's message does not answer currentQuestion, learnerQuestion is currentQuestion asked again (optionally in simpler words), never a new question. answerIdea is an IDEA for answering learnerQuestion as defined under ANSWER IDEA, never a sentence the learner can copy. seasonReplyTranslation and learnerQuestionTranslation are natural Vietnamese translations of exactly your own seasonReply and learnerQuestion; answerIdeaTranslation is the Vietnamese translation of an English answerIdea, or an empty string when answerIdea is already Vietnamese. Do not return evaluation, rubric, corrections, headings, or commentary, and never put Vietnamese in seasonReply or learnerQuestion.`;
  const roleplayResult = await runner.runTask("coach_roleplay_turn", input, {
    systemPrompt: roleplayPrompt, temperature: 0, maxAttempts: 2, maxOutputTokens: COACH_ROLEPLAY_MAX_OUTPUT_TOKENS
  });
  const roleplay = inspectRoleplayTurn(roleplayResult.output, persona, validationContext);
  if (!roleplay.turn) throw Object.assign(new Error("Coach roleplay turn invalid"), { code: "AI_OUTPUT_INVALID", issues: roleplay.violations });

  // Feedback remains useful when the large pedagogical contract fails.  It is
  // intentionally not allowed to overwrite the accepted spoken turn.
  let feedback: CoachTaskOutputWithFeedbackStatus | undefined;
  let feedbackResult: AiRunResult | undefined;
  let feedbackErrorCode: string | undefined;
  try {
    const acceptedTurn = {
      seasonReply: roleplay.turn.seasonReply,
      learnerQuestion: roleplay.turn.learnerQuestion,
      answerIdea: roleplay.turn.answerIdea
    };
    const generated = await runCoachFeedbackWithPersonaRepair(runner, input, `${systemPrompt}\n\nFEEDBACK ONLY: evaluate the learner response. The roleplay turn below is already accepted and must not be changed. Return the standard JSON object with seasonReply copied verbatim from ACCEPTED TURN.seasonReply, nextQuestion copied verbatim from ACCEPTED TURN.learnerQuestion, and suggestedAnswer.text copied verbatim from ACCEPTED TURN.answerIdea (an answer idea, not a sample answer). COPY FIRST, THEN TRANSLATE: copy each of those three strings character for character (same words, punctuation, contractions, and emoji), even where the persona style rules above would phrase them differently; those style rules were already applied to the accepted turn. Then seasonReplyTranslation and nextQuestionTranslation must be faithful Vietnamese translations of exactly those copied texts, and suggestedAnswer.translation translates an English idea (empty when the idea is already Vietnamese); never write or translate a different Season reply, question, or idea.\nACCEPTED TURN: ${JSON.stringify(acceptedTurn)}`, validationContext);
    feedback = generated.output;
    feedbackResult = generated.result;
  } catch (error) {
    feedbackErrorCode = safeAiErrorCode(error);
    // Preserve the learning flow; an unavailable evaluator cannot erase a
    // valid roleplay turn. This is deliberately modest rather than fabricated.
    feedback = localCoachFeedback(roleplay.turn, validationContext?.learnerMessage ?? "");
  }
  const merged = mergeAcceptedRoleplay(feedback!, roleplay.turn, roleplay.fallbackTranslations, roleplay.modelTurn, validationContext?.cefr);
  const output = feedbackErrorCode ? merged : finalizeCoachEvaluation(merged, persona, validationContext);
  return {
    result: feedbackResult ?? roleplayResult,
    output,
    ...(feedbackErrorCode ? { feedbackErrorCode } : {}),
    roleplay: {
      modelViolations: roleplay.modelViolations,
      warnings: roleplay.warnings,
      ...(roleplay.fallbackViolations ? { fallbackViolations: roleplay.fallbackViolations } : {}),
      ...(feedbackErrorCode ? { feedbackErrorCode } : {})
    }
  };
}

const INFORMAL_REGISTER_MARKER = /(?<![\p{L}\p{N}'’])(?:lol|lmao|omg|btw|bro|dude|mate|gimme|gonna|wanna|gotta|kinda|sorta|dunno|ain['’]t|nah|yeah|yep|chill|whatever|thx|pls|no big deal|['’]em)(?![\p{L}\p{N}])|^\s*hey\b/giu;
const WORKPLACE_TERM = /\b(?:client|customer|file|report|deadline|meeting|project|team|manager|boss|ship|release|deliver\w*|scope|design|feature|bug|test\w*|plan|schedule|timeline|task|email|call|budget|contract|work|slide|deck|update|feedback|request)s?\b/iu;
const NOTE_DENIES_COUNT = /(?:chưa|không)\s+(?:được\s+)?(?:tính|đếm)|(?:chưa|không)\s+(?:đạt|đủ)\s+(?:điều\s+kiện|yêu\s+cầu\s+(?:tính|đếm))/iu;
const NOTE_CLAIMS_COUNT = /(?<!(?:chưa|không)\s)(?:được|đã)\s+tính\s+(?:lượt|vào)/iu;

/** Learner slang / overly casual markers, lower-cased and de-duplicated. */
export function informalRegisterMarkers(message: string): string[] {
  return [...new Set([...message.matchAll(INFORMAL_REGISTER_MARKER)].map((match) => match[0].trim().toLocaleLowerCase("en-US").replace("’", "'")))];
}

/**
 * Deterministic last step on a graded turn:
 * 1. Formal register: slang in an on-topic answer is an appropriateness
 *    problem, not off_topic. The turn counts and only the meaning ("Ý")
 *    score is capped at 3.
 * 2. noteVi never contradicts countsTowardGoal; a sentence claiming the
 *    opposite counting status is replaced by a code-derived one.
 */
export function finalizeCoachEvaluation(
  output: CoachTaskOutputWithFeedbackStatus,
  persona: "informal" | "formal",
  context?: Pick<CoachValidationContext, "learnerMessage" | "currentQuestion" | "topic">
): CoachTaskOutputWithFeedbackStatus {
  let next = output;
  const message = context?.learnerMessage ?? "";
  const markers = persona === "formal" ? informalRegisterMarkers(message) : [];
  if (markers.length && next.evaluation.status !== "insufficient") {
    const listed = markers.map((marker) => `“${marker}”`).join(", ");
    const registerImprovement = "Thay từ lóng bằng cách nói lịch sự, chuyên nghiệp phù hợp hội thoại trang trọng.";
    if (next.evaluation.status === "off_topic" && learnerMessageAddressesScenario(message, context)) {
      next = {
        ...next,
        evaluation: {
          status: "valid", result: "partially_correct", countsTowardGoal: true,
          noteVi: `Câu trả lời đúng chủ đề nên được tính lượt, nhưng cách nói suồng sã (${listed}) không phù hợp hội thoại trang trọng nên bị trừ điểm Ý. ${registerImprovement}`
        },
        rubric: {
          ...next.rubric,
          meaning: {
            score: Math.min(3, Math.max(2, next.rubric.meaning.score)),
            evidence: `Ý trả lời đúng trọng tâm nhưng văn phong suồng sã (${listed}) không phù hợp hội thoại trang trọng.`,
            improvement: registerImprovement
          }
        }
      };
    } else if (next.evaluation.status === "valid" && next.rubric.meaning.score > 3) {
      next = {
        ...next,
        evaluation: { ...next.evaluation, result: "partially_correct" },
        rubric: {
          ...next.rubric,
          meaning: { ...next.rubric.meaning, score: 3, improvement: next.rubric.meaning.improvement.trim() || registerImprovement }
        }
      };
    }
  }
  return { ...next, evaluation: { ...next.evaluation, noteVi: consistentCoachNote(next.evaluation) } };
}

function learnerMessageAddressesScenario(
  message: string,
  context?: Pick<CoachValidationContext, "currentQuestion" | "topic">
): boolean {
  if (WORKPLACE_TERM.test(message)) return true;
  // "tell 'em no", "they're being a pain": the client/team being discussed.
  if (/(?:\bthey\b|\bthem\b|\btheir\b|['’]em\b)/iu.test(message)) return true;
  const contentWords = (value: string) => new Set((formalizeText(value).toLocaleLowerCase("en-US").match(/\p{L}{4,}/gu) ?? [])
    .filter((word) => !["what", "which", "would", "could", "should", "about", "there", "their", "with", "this", "that", "your", "have", "will", "tell", "please"].includes(word)));
  const learner = contentWords(message);
  const scenario = new Set([...contentWords(context?.currentQuestion ?? ""), ...contentWords(context?.topic ?? "")]);
  return [...learner].some((word) => scenario.has(word));
}

function consistentCoachNote(evaluation: CoachTaskOutput["evaluation"]): string {
  const note = evaluation.noteVi.trim();
  const contradicts = evaluation.countsTowardGoal ? NOTE_DENIES_COUNT : NOTE_CLAIMS_COUNT;
  const sentences = note.split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (!sentences.some((sentence) => contradicts.test(sentence))) return note;
  const kept = sentences.filter((sentence) => !contradicts.test(sentence));
  const lead = evaluation.countsTowardGoal
    ? "Lượt này được tính vào mục tiêu."
    : evaluation.status === "off_topic"
      ? "Lượt này chưa được tính vì câu trả lời chưa đúng trọng tâm câu hỏi."
      : "Lượt này chưa được tính vì câu trả lời chưa đủ ý.";
  return [lead, ...kept].join(" ").slice(0, 500);
}

const ROLEPLAY_REPEATED_QUESTION = "Season repeated a question already asked in this month's topic.";
const ROLEPLAY_ROLE_AGAIN = "Season asked for the learner's role after it had already been stated.";
const ROLEPLAY_NO_QUESTION = "Season reply has no in-character question after repair.";

/**
 * Only these violations replace a model turn with the local fallback:
 * Vietnamese prose, teacher narration, a broken question anchor, or a
 * repeated question. Style findings (contraction, emoji, exclamation mark,
 * sentence count, length) are normalised locally and logged as warnings.
 */
export function isBlockingRoleplayViolation(violation: string): boolean {
  return isEnglishOnlyViolation(violation)
    || isTeacherNarrationViolation(violation)
    || isInCharacterAnchorViolation(violation)
    || violation === ROLEPLAY_REPEATED_QUESTION
    || violation === ROLEPLAY_ROLE_AGAIN
    || violation === ROLEPLAY_LEARNER_PERSPECTIVE
    || violation === ROLEPLAY_NO_QUESTION;
}

type RoleplayFallbackTranslations = { seasonReply: string; nextQuestion: string };
/** A roleplay turn whose answer idea already passed (or was repaired by) the idea gate. */
type AcceptedRoleplayTurn = CoachRoleplayTurnOutput & { answerIdea: string; answerIdeaTranslation: string };

export function logRoleplayDiagnostics(
  log: { warn: (details: object, message: string) => void; info: (details: object, message: string) => void },
  requestId: string,
  mode: "practice" | "challenge",
  diagnostics: CoachRoleplayDiagnostics
): void {
  if (diagnostics.feedbackErrorCode === "AI_OUTPUT_TRUNCATED") {
    // A truncated evaluator leaves the turn without feedback; log it under
    // its own code so the output budget can be monitored.
    log.warn({
      code: "COACH_FEEDBACK_TRUNCATED", requestId, mode, maxOutputTokens: COACH_FEEDBACK_MAX_OUTPUT_TOKENS
    }, "Season feedback output was truncated at the output-token limit");
  }
  if (diagnostics.fallbackViolations) {
    log.warn({
      code: "SEASON_ROLEPLAY_FALLBACK", requestId, mode,
      violations: diagnostics.fallbackViolations, modelViolations: diagnostics.modelViolations
    }, "Season roleplay turn replaced by the local fallback");
    return;
  }
  if (diagnostics.modelViolations.length) {
    log.info({
      code: "SEASON_ROLEPLAY_REPAIRED", requestId, mode,
      modelViolations: diagnostics.modelViolations, warnings: diagnostics.warnings
    }, "Season roleplay turn repaired locally");
  }
}

function inspectRoleplayTurn(raw: unknown, persona: "informal" | "formal", context?: CoachValidationContext): {
  turn?: AcceptedRoleplayTurn;
  violations: string[];
  modelViolations: string[];
  warnings: string[];
  fallbackViolations?: string[];
  fallbackTranslations?: RoleplayFallbackTranslations;
  /** The parsed model turn with its own translations, before any local repair. */
  modelTurn?: CoachRoleplayTurnOutput;
} {
  // Accepting the legacy composite shape here keeps persisted/mock outputs
  // readable during rollout; live calls use the compact task above.
  const candidate = coachRoleplayTurnOutputSchema.safeParse(raw).success
    ? raw
    : coachOutputSchema.safeParse(raw).success
      ? { seasonReply: (raw as CoachTaskOutput).seasonReply, learnerQuestion: (raw as CoachTaskOutput).nextQuestion, answerIdea: (raw as CoachTaskOutput).suggestedAnswer.text, answerIdeaTranslation: (raw as CoachTaskOutput).suggestedAnswer.translation }
      : raw;
  const parsed = coachRoleplayTurnOutputSchema.safeParse(candidate);
  if (!parsed.success) return { violations: ["Coach roleplay turn does not match its compact schema."], modelViolations: [], warnings: [] };
  // ANSWER IDEA gate: an English sample answer (including the legacy
  // suggestedLearnerReply) is never shown; it is replaced by a level-language idea.
  const idea = repairCoachAnswerIdea({ text: parsed.data.answerIdea, translation: parsed.data.answerIdeaTranslation }, context?.cefr);
  const turn: AcceptedRoleplayTurn = { ...parsed.data, answerIdea: idea.text, answerIdeaTranslation: idea.translation };
  const probe = localCoachFeedback(turn, "");
  const validate = (value: CoachRoleplayTurnOutput) => validateCoachPersonaOutput({ ...probe, seasonReply: value.seasonReply, nextQuestion: value.learnerQuestion, suggestedAnswer: { text: value.answerIdea ?? "", translation: "" } }, persona)
    .filter((violation) => !violation.startsWith("Suggested answer") && !violation.includes("translation"));
  // A genuine repeat is an *earlier* question asked again. questionHistory
  // also holds the current, still-open question; re-asking it after an
  // unanswered turn is a natural re-prompt and must not trigger the fallback.
  const currentKey = coachQuestionKey(context?.currentQuestion ?? "");
  const earlierKeys = new Set((context?.priorQuestions ?? []).map(coachQuestionKey).filter((key) => key && key !== currentKey));
  const repeatedQuestion = (question: string) => {
    const key = coachQuestionKey(question);
    return Boolean(key) && earlierKeys.has(key);
  };
  const learnerAlreadyStatedRole = /\b(?:i am|i'm|i work as|my role is|i work in)\b/iu.test(context?.learnerMessage ?? "");
  const asksForRoleAgain = (question: string) => learnerAlreadyStatedRole
    && /\b(?:what(?:'s| is) your role|what do you do|what is your job|tell me about your role|where do you work)\b/iu.test(question);
  const fromLearnerSide = (value: CoachRoleplayTurnOutput) => coachQuestionFromLearnerSide(value.learnerQuestion, {
    learnerOwned: context?.learnerOwned ?? [], answerIdea: value.answerIdea ?? ""
  });
  const collect = (value: CoachRoleplayTurnOutput) => [
    ...validate(value),
    ...(fromLearnerSide(value) ? [ROLEPLAY_LEARNER_PERSPECTIVE] : []),
    ...(repeatedQuestion(value.learnerQuestion) ? [ROLEPLAY_REPEATED_QUESTION] : []),
    ...(asksForRoleAgain(value.learnerQuestion) ? [ROLEPLAY_ROLE_AGAIN] : [])
  ];
  const modelViolations = collect(turn);
  if (!modelViolations.length) return { turn, violations: [], modelViolations: [], warnings: [], modelTurn: turn };
  // Defensive final boundary: strip leaked teacher/mixed prose and normalise
  // the persona style locally rather than persisting it. No extra model call.
  const enforced = enforceEnglishRoleplayTurn({ ...probe, seasonReply: turn.seasonReply, nextQuestion: turn.learnerQuestion }, persona);
  const recovered: AcceptedRoleplayTurn = { ...turn, seasonReply: enforced.seasonReply, learnerQuestion: enforced.nextQuestion };
  const remaining = [
    ...collect(recovered),
    ...(/\?/u.test(recovered.seasonReply) ? [] : [ROLEPLAY_NO_QUESTION])
  ];
  const blocking = remaining.filter(isBlockingRoleplayViolation);
  // Style-only findings never discard a usable in-character turn.
  if (!blocking.length) return { turn: recovered, violations: [], modelViolations, warnings: remaining, modelTurn: turn };
  const fallbackFollowUp = coachFallbackFollowUp(
    context?.learnerMessage ?? "", context?.currentQuestion ?? "", context?.topic ?? "workplace conversation",
    persona, context?.priorQuestions ?? []
  );
  const fallbackIdea = fallbackCoachAnswerIdea(context?.cefr);
  const fallback: AcceptedRoleplayTurn = {
    seasonReply: fallbackFollowUp.seasonReply,
    learnerQuestion: fallbackFollowUp.nextQuestion,
    answerIdea: fallbackIdea.text,
    answerIdeaTranslation: fallbackIdea.translation
  };
  return {
    turn: fallback,
    violations: [],
    modelViolations,
    warnings: [],
    fallbackViolations: blocking,
    // The fallback carries its own translations; feedback translations
    // describe a different (rejected) turn and must never be shown with it.
    fallbackTranslations: {
      seasonReply: fallbackFollowUp.seasonReplyTranslation,
      nextQuestion: fallbackFollowUp.nextQuestionTranslation
    }
  };
}

function mergeAcceptedRoleplay(
  feedback: CoachTaskOutputWithFeedbackStatus,
  turn: AcceptedRoleplayTurn,
  fallbackTranslations?: RoleplayFallbackTranslations,
  modelTurn?: CoachRoleplayTurnOutput,
  cefr?: string
): CoachTaskOutputWithFeedbackStatus {
  // A translation is shown only when it translates the text that is actually
  // displayed; otherwise it is left empty (the UI hides it). The feedback
  // copy is tried first, then the roleplay call's own translation of its own
  // text. Local style repair (contraction expansion, emoji) keeps the match;
  // a reworded or trimmed turn does not.
  const translationFor = (displayedText: string, ...candidates: Array<[string | undefined, string | undefined]>) => {
    const displayed = coachTranslationKey(displayedText);
    if (!displayed) return "";
    const match = candidates.find(([text, translation]) => text && translation?.trim() && coachTranslationKey(text) === displayed);
    return match?.[1]?.trim() ?? "";
  };
  return {
    ...feedback,
    seasonReply: turn.seasonReply,
    nextQuestion: turn.learnerQuestion,
    // The hint is always an answer idea; a Vietnamese (A1–A2) idea has no translation.
    suggestedAnswer: {
      text: turn.answerIdea,
      translation: coachAnswerIdeaLanguage(cefr) === "vi" ? "" : turn.answerIdeaTranslation
        || translationFor(turn.answerIdea, [feedback.suggestedAnswer.text, feedback.suggestedAnswer.translation]),
      kind: "idea"
    },
    seasonReplyTranslation: fallbackTranslations?.seasonReply
      ?? translationFor(turn.seasonReply,
        [feedback.seasonReply, feedback.seasonReplyTranslation],
        [modelTurn?.seasonReply, modelTurn?.seasonReplyTranslation]),
    nextQuestionTranslation: fallbackTranslations?.nextQuestion
      ?? translationFor(turn.learnerQuestion,
        [feedback.nextQuestion, feedback.nextQuestionTranslation],
        [modelTurn?.learnerQuestion, modelTurn?.learnerQuestionTranslation])
  };
}

/** Text identity for translation matching: style-only differences are ignored. */
function coachTranslationKey(value: string): string {
  return normalizeCoachTurnText(formalizeText(value));
}

function localCoachFeedback(turn: CoachRoleplayTurnOutput, learnerMessage: string): CoachTaskOutputWithFeedbackStatus {
  const grammarCorrection = missingSubjectCopulaCorrection(learnerMessage);
  return {
    feedbackStatus: "unavailable",
    evaluation: {
      status: "insufficient", result: "missing_information", countsTowardGoal: false,
      noteVi: grammarCorrection
        ? "Chưa thể chấm đầy đủ vì nhận xét AI tạm thời không khả dụng. Hệ thống đã phát hiện lỗi ngữ pháp bên dưới."
        : "Nhận xét AI tạm thời không khả dụng cho lượt này. Câu trả lời vẫn được lưu."
    },
    seasonReply: turn.seasonReply, seasonReplyTranslation: "",
    nextQuestion: turn.learnerQuestion, nextQuestionTranslation: "",
    rubric: {
      meaning: { score: 0, evidence: "Chưa chấm ý nghĩa do nhận xét AI không khả dụng.", improvement: "" },
      vocabulary: { score: 0, evidence: "Chưa chấm từ vựng do nhận xét AI không khả dụng.", improvement: "" },
      grammar: {
        score: 0,
        evidence: grammarCorrection ? grammarCorrection.reason : "Chưa chấm ngữ pháp do nhận xét AI không khả dụng.",
        improvement: grammarCorrection?.reason ?? ""
      }
    },
    corrections: grammarCorrection ? [{ original: learnerMessage, corrected: grammarCorrection.corrected, translation: "", reason: grammarCorrection.reason }] : [],
    correctedText: grammarCorrection?.corrected ?? "",
    suggestedAnswer: { text: turn.answerIdea ?? "", translation: "", kind: "idea" }, usedWords: []
  };
}

async function runCoachFeedbackWithPersonaRepair(
  runner: AiTaskRunner,
  input: unknown,
  systemPrompt: string,
  validationContext?: CoachValidationContext
): Promise<{ result: AiRunResult; output: CoachTaskOutput }> {
  // Feedback is generated against an already accepted roleplay turn. The
  // model's duplicated seasonReply/nextQuestion/suggestedAnswer fields are
  // ignored by mergeAcceptedRoleplay, so persona/roleplay checks on those
  // fields must not discard otherwise valid evaluation, translations, and
  // rubric data. Keep the full structured contract for required feedback
  // fields and retry malformed structured output once before falling back.
  const result = await runner.runTask("coach_dialogue", input, {
    systemPrompt, temperature: 0, maxAttempts: 2, maxOutputTokens: COACH_FEEDBACK_MAX_OUTPUT_TOKENS
  });
  const parsed = coachOutputSchema.safeParse(result.output);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`);
    throw Object.assign(new Error("Coach feedback output invalid"), { code: "AI_OUTPUT_INVALID", issues });
  }
  const violations = validateRequiredSubjectCopulaFeedback(parsed.data, validationContext);
  if (violations.length) throw Object.assign(new Error("Coach feedback output invalid"), { code: "AI_OUTPUT_INVALID", issues: violations });
  return { result, output: parsed.data };
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

function isInCharacterAnchorViolation(violation: string): boolean {
  return violation === "Next question must be an in-character anchor included verbatim in the Season reply.";
}

function isTeacherNarrationViolation(violation: string): boolean {
  return violation === "Season reply contains teacher or examiner narration.";
}

function isEnglishOnlyViolation(violation: string): boolean {
  return violation === "Season reply must be English-only; Vietnamese belongs in seasonReplyTranslation.";
}

function alignNextQuestionWithSeasonReply(output: CoachTaskOutput): CoachTaskOutput {
  const turns = output.seasonReply.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)
    ?.map((turn) => turn.trim().replace(/[\p{Extended_Pictographic}\uFE0F]+$/gu, "").trim())
    .filter(Boolean) ?? [];
  const terminalQuestion = cleanCoachQuestionAnchor([...turns].reverse().find((turn) => turn.endsWith("?")) ?? turns.at(-1) ?? "");
  return terminalQuestion ? { ...output, nextQuestion: terminalQuestion } : output;
}

function enforceDirectRoleplayQuestion(output: CoachTaskOutput): CoachTaskOutput {
  const reply = output.seasonReply.replace(
    /\b(?:what|how) would you say to (?:your colleague|me) about (.+?)\?/iu,
    "What do you think about $1?"
  ).replace(
    /\b(?:what|how) would you say to (?:your colleague|me)\?/iu,
    "What do you think?"
  );
  return reply === output.seasonReply ? output : alignNextQuestionWithSeasonReply({ ...output, seasonReply: reply });
}

/**
 * Last-line safety repair for model output that still mixes an explanation into
 * the spoken turn after provider retries. This never relaxes validation: it
 * removes only non-dialogue / non-English sentences and then creates a short,
 * direct partner turn if no safe dialogue remains. Vietnamese stays exclusively
 * in the schema's translation fields.
 */
function enforceEnglishRoleplayTurn(output: CoachTaskOutput, persona: "informal" | "formal"): CoachTaskOutput {
  const segments = output.seasonReply.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)
    ?.map((segment) => segment.trim()).filter(Boolean) ?? [];
  const isGreetingWithName = (segment: string) => /^(?:hi|hello|hey|dear)\s+[\p{L}'-]+[!,.]?\s*/iu.test(segment);
  const hasVietnameseProse = (segment: string) => {
    const withoutName = isGreetingWithName(segment)
      ? segment.replace(/^(?:hi|hello|hey|dear)\s+[\p{L}'-]+[!,.]?\s*/iu, "")
      : segment;
    return /[\u00c0-\u024f\u1e00-\u1eff]/u.test(withoutName);
  };
  const isTeacherSentence = (segment: string) => /\b(?:your (?:opening|answer|response|colleague)|great\s*now|how do you ask|what could you say|what would you say|you should say|the learner|as a coach|let'?s practise|roleplay)\b/iu.test(segment);
  const directSegment = (segment: string) => segment.replace(
    /\b(?:what|how) would you say to (?:your colleague|me) about (.+?)\?/iu,
    "What do you think about $1?"
  ).replace(
    /\b(?:what|how) would you say to (?:your colleague|me)\?/iu,
    "What do you think?"
  );
  const safe = segments.map(directSegment)
    .filter((segment) => !hasVietnameseProse(segment) && !isTeacherSentence(segment));
  // No local substitution here: a turn left without a direct question is a
  // blocking violation, replaced and logged by inspectRoleplayTurn.
  const bounded = enforceReplySentenceCount({ ...output, seasonReply: safe.join(" ") });
  const normalized = alignNextQuestionWithSeasonReply(bounded);
  return persona === "informal" ? enforceInformalStyle(normalized) : enforceFormalStyle(normalized);
}

function isSuggestedAnswerReplayViolation(violation: string): boolean {
  return violation.startsWith("The learner used the exact previous suggested answer");
}

function isLocallyEnforceableCoachViolation(violation: string): boolean {
  return isFormalStyleViolation(violation)
    || isInformalStyleViolation(violation)
    || isReplyLengthViolation(violation)
    || isSuggestedAnswerViolation(violation)
    || isTeacherNarrationViolation(violation)
    || isEnglishOnlyViolation(violation)
    || isInCharacterAnchorViolation(violation)
    || isSuggestedAnswerReplayViolation(violation);
}

/**
 * Keeps at most four spoken sentences and always keeps the final question,
 * so the anchor survives trimming. Emoji-only fragments are dropped (the
 * persona style step restores the Informal emoji). A short turn is left
 * short: padding it with canned text is worse than a style warning.
 */
function enforceReplySentenceCount(output: CoachTaskOutput): CoachTaskOutput {
  const sentences = output.seasonReply.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)
    ?.map((part) => part.trim()).filter((part) => /[\p{L}\p{N}]/u.test(part)) ?? [];
  if (sentences.length <= 4) return { ...output, seasonReply: sentences.join(" ") };
  const isQuestion = (sentence: string) => sentence.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").trim().endsWith("?");
  const questionIndex = sentences.findLastIndex(isQuestion);
  if (questionIndex < 0) return { ...output, seasonReply: sentences.slice(0, 4).join(" ") };
  const others = sentences.filter((_, index) => index !== questionIndex).slice(0, 3);
  return { ...output, seasonReply: [...others, sentences[questionIndex]!].join(" ") };
}

function enforceInformalStyle(output: CoachTaskOutput): CoachTaskOutput {
  const stripEmoji = (value: string) => value.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "").replace(/\s+/gu, " ").trim();
  // Exactly one emoji is the designed Informal style. A missing contraction
  // is only a style warning; never patch it with canned text.
  const seasonReply = stripEmoji(output.seasonReply);
  const nextQuestion = stripEmoji(output.nextQuestion);
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
  return output;
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
      ? `Thank you. ${output.nextQuestion}`
      : `Thanks, that helps. ${output.nextQuestion} 😊`,
    seasonReplyTranslation: "Cảm ơn bạn. Tôi đã hiểu ý của bạn.",
    rubric: {
      ...output.rubric,
      meaning: {
        score: Math.max(4, output.rubric.meaning.score),
        evidence: "The response matches the suggested answer for the current question.",
        improvement: ""
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
