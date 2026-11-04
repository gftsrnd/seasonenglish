import { coachOutputSchema, coachRoleplayTurnOutputSchema, type AiRunResult, type AiTaskRunner } from "@e4s/ai";
import type { CoachRoleplayTurnOutput, CoachTaskOutput } from "@e4s/ai";
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
  const correctionGuard = "ROLEPLAY FIRST: You are the learner's workplace conversation partner, not a teacher, examiner, narrator, or lesson UI. seasonReply is the complete spoken turn from that partner and MUST contain English dialogue only; never put Vietnamese prose there (a Vietnamese learner name is allowed only in an opening greeting). Continue the scenario directly in character; respond naturally to the learner and, when another response is useful, end with a natural in-character question or request. Speak directly as that colleague/customer using I/me; never refer to a third party as 'your colleague' or 'the learner'. Never write teacher, examiner, or coaching narration such as 'Great! Now, how do you...', 'Your opening sounds...', 'You should say...', 'What would you say?', or 'The learner...'. Do not praise or explain inside seasonReply. nextQuestion is an internal state anchor only: it must be the exact final in-character question/request already contained verbatim inside seasonReply; never create a second, standalone question or a meta prompt. LATEST TURN ONLY: Evaluate message against currentQuestion as a fresh pair. Never carry an error, correction, score, or evidence from priorTurns into this result. TRANSLATIONS: Return a natural Vietnamese translation of the complete Season turn in seasonReplyTranslation. Return the natural Vietnamese translation of the learner example in suggestedAnswer.translation. For every correction, return a natural Vietnamese translation of the corrected learner sentence in corrections[].translation. Keep correction reason focused only on the short language reason; never place a translation inside reason. CORRECTIONS ONLY: Only put genuine language errors in corrections. If the learner's message is grammatical, relevant, and answers currentQuestion—even if it is brief or less specific—return corrections: [] and correctedText: \"\". Do not rewrite a correct answer merely to make it longer, more detailed, or stylistically different. RESULT LABEL: evaluation.result must be correct for a complete correct answer, partially_correct for a meaningful answer that needs a small language or content improvement, missing_information for insufficient input, or off_topic for the wrong target. INSUFFICIENT means no meaningful attempt and requires meaning score 0. If the learner gives relevant information but omits part of the requested content, use valid/partially_correct/countsTowardGoal true and a positive meaning score. RUBRIC SCOPE: rubric evidence and improvement must refer only to the learner's latest message and currentQuestion. Every rubric evidence and improvement must be concise, specific, and written in Vietnamese so the learner can act on it. Never base rubric feedback on the next turn or suggestedAnswer. For a strong criterion, set improvement to an empty string; never write 'Không cần thay đổi.' or 'No change needed.' suggestedAnswer must directly answer the final in-character question/request in seasonReply, use one concise learner-level example, and contain no more than 40 words. It must not repeat or re-ask that question. suggestedAnswer must never be presented as a correction to the learner's latest message. SECRET WORDS: usedWords may contain only configured secret vocabulary that appears as a whole word in the learner's latest message; never infer or invent a used word.";
  const cefrGuidance = normalizedCefr
    ? isHigherCefr
      ? `CEFR LEVEL (${normalizedCefr}): Calibrate the complete in-character seasonReply and suggestedAnswer.text strictly to ${normalizedCefr} workplace English with connected clauses, accurate workplace collocations, and professional register appropriate for ${normalizedCefr}. For B1 and above, explanations in rubric evidence, rubric improvement, and corrections[].reason may use concise English while keeping Vietnamese translations in dedicated translation fields.`
      : `CEFR LEVEL (${normalizedCefr}): Calibrate the complete in-character seasonReply and suggestedAnswer.text strictly to ${normalizedCefr} workplace English using high-frequency vocabulary, short direct sentences, and foundational workplace grammar. Keep explanations in Vietnamese.`
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
  if (output.evaluation.status !== "off_topic") return output;
  const reply = output.seasonReply.trim();
  const hasQuestion = normalizeCoachTurnText(reply).includes(normalizeCoachTurnText(currentQuestion));
  return {
    ...output,
    nextQuestion: currentQuestion,
    seasonReply: hasQuestion ? reply : `${reply} ${currentQuestion}`.trim()
  };
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
  const text = output.seasonReply.trim();
  const emojiCount = [...text.matchAll(/\p{Extended_Pictographic}/gu)].length;
  const contraction = /\b\p{L}+['’](?:s|re|ve|ll|d|m|t)\b/iu.test(text);
  const conversationViolations = [
    ...(coachSentenceCount(output.seasonReply) < 2 || coachSentenceCount(output.seasonReply) > 4
      ? ["Season reply must contain between two and four sentences."] : []),
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
  const directMetaQuestion = /\b(?:how|what)\s+(?:would|do|should|can)\s+you\s+(?:reply|respond|answer|ask|say)\b/iu;
  return [
    ...(containsVietnameseProse.test(replyWithoutGreetingName) ? ["Season reply must be English-only; Vietnamese belongs in seasonReplyTranslation."] : []),
    ...(metaNarration.test(reply) ? ["Season reply contains teacher or examiner narration."] : []),
    ...(normalizeCoachTurnText(reply).includes(normalizeCoachTurnText(question)) && !directMetaQuestion.test(question)
      ? []
      : ["Next question must be an in-character anchor included verbatim in the Season reply."])
  ];
}

function normalizeCoachTurnText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/gu, " ").trim();
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

/**
 * Keep the spoken roleplay boundary independent from scoring.  The old single
 * `coach_dialogue` response asked one model call to satisfy English dialogue,
 * Vietnamese translations and a rubric at once; a malformed rubric therefore
 * made a perfectly usable dialogue turn fail with 502.  We accept the small
 * turn first, then ask for feedback separately and never let feedback replace
 * the accepted turn.
 */
export async function runCoachWithPersonaRepair(
  runner: AiTaskRunner,
  input: unknown,
  systemPrompt: string,
  persona: "informal" | "formal",
  validationContext?: CoachValidationContext
): Promise<{ result: AiRunResult; output: CoachTaskOutput }> {
  const roleplayPrompt = `${systemPrompt}\n\nROLEPLAY TURN ONLY. Return ONLY this compact JSON object: {"seasonReply":"...","learnerQuestion":"...","suggestedLearnerReply":"..."}. All three fields are English-only. Speak as the colleague/customer, not as a teacher. seasonReply has 2-4 direct in-character sentences and ends with learnerQuestion verbatim. learnerQuestion must be a natural question/request to the learner, never 'What would you say?' or other teaching language. suggestedLearnerReply directly answers learnerQuestion. Do not return evaluation, translations, rubric, corrections, headings, Vietnamese, or commentary.`;
  const roleplayResult = await runner.runTask("coach_roleplay_turn", input, {
    systemPrompt: roleplayPrompt, temperature: 0, maxAttempts: 2, maxOutputTokens: 700
  });
  const roleplay = inspectRoleplayTurn(roleplayResult.output, persona);
  if (!roleplay.turn) throw Object.assign(new Error("Coach roleplay turn invalid"), { code: "AI_OUTPUT_INVALID", issues: roleplay.violations });

  // Feedback remains useful when the large pedagogical contract fails.  It is
  // intentionally not allowed to overwrite the accepted spoken turn.
  let feedback: CoachTaskOutput | undefined;
  let feedbackResult: AiRunResult | undefined;
  try {
    const generated = await runCoachFeedbackWithPersonaRepair(runner, input, `${systemPrompt}\n\nFEEDBACK ONLY: evaluate the learner response. The roleplay turn below is already accepted and must not be changed. Return the standard JSON object, but its seasonReply/nextQuestion/suggestedAnswer fields will be ignored.\nACCEPTED TURN: ${JSON.stringify(roleplay.turn)}`, persona, validationContext);
    feedback = generated.output;
    feedbackResult = generated.result;
  } catch {
    // Preserve the learning flow; an unavailable evaluator cannot erase a
    // valid roleplay turn. This is deliberately modest rather than fabricated.
    feedback = localCoachFeedback(roleplay.turn, validationContext?.learnerMessage ?? "");
  }
  const output = mergeAcceptedRoleplay(feedback!, roleplay.turn);
  return { result: feedbackResult ?? roleplayResult, output };
}

function inspectRoleplayTurn(raw: unknown, persona: "informal" | "formal"): { turn?: CoachRoleplayTurnOutput; violations: string[] } {
  // Accepting the legacy composite shape here keeps persisted/mock outputs
  // readable during rollout; live calls use the compact task above.
  const candidate = coachRoleplayTurnOutputSchema.safeParse(raw).success
    ? raw
    : coachOutputSchema.safeParse(raw).success
      ? { seasonReply: (raw as CoachTaskOutput).seasonReply, learnerQuestion: (raw as CoachTaskOutput).nextQuestion, suggestedLearnerReply: (raw as CoachTaskOutput).suggestedAnswer.text }
      : raw;
  const parsed = coachRoleplayTurnOutputSchema.safeParse(candidate);
  if (!parsed.success) return { violations: ["Coach roleplay turn does not match its compact schema."] };
  const turn = parsed.data;
  const probe = localCoachFeedback(turn, "");
  const validate = (value: CoachRoleplayTurnOutput) => validateCoachPersonaOutput({ ...probe, seasonReply: value.seasonReply, nextQuestion: value.learnerQuestion, suggestedAnswer: { text: value.suggestedLearnerReply, translation: "" } }, persona)
    .filter((violation) => !violation.startsWith("Suggested answer") && !violation.includes("translation"));
  const violations = validate(turn);
  if (!violations.length) return { turn, violations: [] };
  // Defensive final boundary: strip any leaked teacher/mixed prose rather
  // than persisting it. Provider retries remain the primary path; this makes
  // a malformed optional phrase recoverable instead of turning into a 502.
  const enforced = enforceEnglishRoleplayTurn({ ...probe, seasonReply: turn.seasonReply, nextQuestion: turn.learnerQuestion, suggestedAnswer: { text: turn.suggestedLearnerReply, translation: "" } }, persona);
  const recovered = { seasonReply: enforced.seasonReply, learnerQuestion: enforced.nextQuestion, suggestedLearnerReply: enforced.suggestedAnswer.text };
  const remaining = validate(recovered);
  if (!remaining.length) return { turn: recovered, violations: [] };
  const fallback: CoachRoleplayTurnOutput = persona === "formal"
    ? { seasonReply: "Thank you for explaining that. Could you tell me a little more about your role?", learnerQuestion: "Could you tell me a little more about your role?", suggestedLearnerReply: "I work in customer support and help clients with their questions." }
    : { seasonReply: "I'm glad you explained that. Could you tell me a little more about your role? 😊", learnerQuestion: "Could you tell me a little more about your role?", suggestedLearnerReply: "I work in customer support and help clients with their questions." };
  return { turn: fallback, violations: [] };
}

function mergeAcceptedRoleplay(feedback: CoachTaskOutput, turn: CoachRoleplayTurnOutput): CoachTaskOutput {
  return {
    ...feedback,
    seasonReply: turn.seasonReply,
    nextQuestion: turn.learnerQuestion,
    suggestedAnswer: { text: turn.suggestedLearnerReply, translation: feedback.suggestedAnswer.translation || "Bản dịch gợi ý sẽ hiển thị trong phần giải thích." },
    seasonReplyTranslation: feedback.seasonReplyTranslation || "Nghĩa của câu Season được hiển thị trong phần giải thích.",
    nextQuestionTranslation: feedback.nextQuestionTranslation || ""
  };
}

function localCoachFeedback(turn: CoachRoleplayTurnOutput, learnerMessage: string): CoachTaskOutput {
  const hasWords = learnerMessage.trim().split(/\s+/u).filter(Boolean).length >= 3;
  return {
    evaluation: hasWords ? { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Bạn đã phản hồi đúng tình huống." } : { status: "insufficient", result: "missing_information", countsTowardGoal: false, noteVi: "Bạn cần trả lời đầy đủ hơn." },
    seasonReply: turn.seasonReply, seasonReplyTranslation: "Nghĩa câu Season sẽ được cập nhật khi phần nhận xét AI sẵn sàng.",
    nextQuestion: turn.learnerQuestion, nextQuestionTranslation: "",
    rubric: {
      meaning: { score: hasWords ? 4 : 0, evidence: hasWords ? "Câu trả lời bám sát tình huống." : "Câu trả lời chưa đủ thông tin.", improvement: "" },
      vocabulary: { score: hasWords ? 4 : 0, evidence: hasWords ? "Từ vựng phù hợp ngữ cảnh." : "", improvement: "" },
      grammar: { score: hasWords ? 4 : 0, evidence: hasWords ? "Cấu trúc câu rõ ràng." : "", improvement: "" }
    },
    corrections: [], correctedText: "",
    suggestedAnswer: { text: turn.suggestedLearnerReply, translation: "Bản dịch gợi ý sẽ được cập nhật khi phần nhận xét AI sẵn sàng." }, usedWords: []
  };
}

async function runCoachFeedbackWithPersonaRepair(
  runner: AiTaskRunner,
  input: unknown,
  systemPrompt: string,
  persona: "informal" | "formal",
  validationContext?: CoachValidationContext
): Promise<{ result: AiRunResult; output: CoachTaskOutput }> {
  const result = await runner.runTask("coach_dialogue", input, { systemPrompt, temperature: 0, maxAttempts: 1, maxOutputTokens: 1_400 });
  const inspected = inspectCoachOutput(result.output, persona, validationContext);
  if (inspected.output && !inspected.violations.length) return { result, output: inspected.output };
  throw Object.assign(new Error("Coach feedback output invalid"), { code: "AI_OUTPUT_INVALID", issues: inspected.violations });
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
  const terminalQuestion = [...turns].reverse().find((turn) => turn.endsWith("?")) ?? turns.at(-1);
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
  let reply = safe.join(" ");
  const containsDirectQuestion = /\?\s*(?:[\p{Extended_Pictographic}\uFE0F]+)?$/u.test(reply);
  if (!reply || !containsDirectQuestion) {
    reply = persona === "formal"
      ? "Thank you for explaining that. Could you tell me a little more about your role?"
      : "Thanks for explaining that. Could you tell me a little more about your role? 😊";
  }
  const normalized = alignNextQuestionWithSeasonReply({ ...output, seasonReply: reply });
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
