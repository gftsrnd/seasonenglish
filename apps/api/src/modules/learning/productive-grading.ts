import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import {
  AiGatewayError, AiProviderError, LESSON_PRODUCTIVE_GRADING_TASK, buildLessonProductiveGradingSystemPrompt,
  lessonProductiveGradingOutputSchema, lessonProductiveOutcome, lessonRetakeFeedback, speakingTranscriptTooShort,
  type AiTaskRunner, type LessonProductiveGradingInput, type SpeechTranscriber, type SpeechTranscriptionResult
} from "@e4s/ai";
import type { CefrLevel, LessonPartCode } from "@e4s/contracts";
import { createRepositories, LESSON_PRODUCTIVE_GRADING_JOB, type LearnerLessonRecord, type LessonAttemptGrading } from "@e4s/database";
import type { ObjectStorage } from "@e4s/storage";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

/**
 * Background AI grading of daily-lesson Speaking (speech-to-text on the real
 * recording, then the three-level grade) and self-written Writing.
 *
 * The attempt route stores the attempt as `submitted` with grading.state
 * "pending" and queues a `lesson.productive-grade` job in the same transaction;
 * this API-side consumer (same pattern as assessment AI scoring) leases the job,
 * grades it and moves the part to correct / wrong_retry / wrong_exhausted, or
 * asks for a new recording. When AI cannot grade it, the attempt stays submitted
 * for the operator with grading.state "operator" — never a silent failure.
 */
export interface LessonProductiveGradingDeps {
  pool: Pool;
  runnerFor: (actorId: string) => Promise<AiTaskRunner | undefined>;
  transcriberFor?: ((actorId: string) => Promise<SpeechTranscriber | undefined>) | undefined;
  storage?: ObjectStorage | undefined;
  now?: () => Date;
}

export interface LessonProductiveGrading {
  /** Whether a new attempt for this part can be AI-graded right now (else it goes straight to the operator). */
  available(learnerId: string, partCode: LessonPartCode): Promise<boolean>;
  /** Starts processing queued jobs without waiting for the next poll. */
  kick(): void;
}

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const STT_TIMEOUT_MS = 60_000;

export function registerLessonProductiveGrading(app: FastifyInstance, deps: LessonProductiveGradingDeps): LessonProductiveGrading {
  const repositories = createRepositories(deps.pool);
  const workerId = `lesson-grading-api:${randomUUID()}`;
  const maxConcurrent = 3;
  let running = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const inFlight = new Set<Promise<void>>();

  const processOne = async (): Promise<boolean> => {
    const job = await repositories.jobs.leaseNext(workerId, 300, [LESSON_PRODUCTIVE_GRADING_JOB]);
    if (!job) return false;
    const payload = job.payload as { learnerId?: unknown; attemptId?: unknown } | null;
    const learnerId = typeof payload?.learnerId === "string" ? payload.learnerId : "";
    const attemptId = typeof payload?.attemptId === "string" ? payload.attemptId : "";
    try {
      await gradeLessonProductiveAttempt(deps, learnerId, attemptId);
      await repositories.jobs.markSucceeded(job.id, workerId);
    } catch (error) {
      const code = gradingErrorCode(error);
      const retry = isRetryableGradingError(error) && job.attempts < job.maxAttempts;
      await repositories.jobs.markFailed(job.id, workerId, code, retry);
      if (!retry && learnerId && attemptId) {
        await fallBackToOperator(deps, learnerId, attemptId, code).catch((fallbackError: unknown) => {
          app.log.error({ attemptId, code: gradingErrorCode(fallbackError) }, "Lesson grading fallback could not be saved");
        });
      }
      app.log.warn({ attemptId, code, retry }, retry ? "Lesson AI grading failed; it will be retried" : "Lesson AI grading failed; the attempt stays with the operator");
    }
    return true;
  };

  // Each call leases at most one job; a slot that found work immediately looks for the next one.
  const drain = (): void => {
    if (running >= maxConcurrent) return;
    running += 1;
    const work: Promise<void> = processOne()
      .then((found) => { if (found) setImmediate(drain); })
      .catch((error: unknown) => { app.log.error({ code: gradingErrorCode(error) }, "Could not process the lesson grading queue"); })
      .finally(() => { running -= 1; inFlight.delete(work); });
    inFlight.add(work);
  };

  app.addHook("onReady", async () => {
    timer = setInterval(drain, 2_000);
    timer.unref();
  });
  app.addHook("onClose", async () => {
    clearInterval(timer);
    await Promise.allSettled([...inFlight]);
  });

  return {
    async available(learnerId, partCode) {
      if (partCode !== "speaking" && partCode !== "writing") return false;
      if (partCode === "speaking" && (!deps.storage?.getObject || !deps.transcriberFor || !await deps.transcriberFor(learnerId))) return false;
      if (!await deps.runnerFor(learnerId)) return false;
      return Boolean(await repositories.aiRuns.activeTaskPrompt(learnerId, LESSON_PRODUCTIVE_GRADING_TASK));
    },
    kick: () => drain()
  };
}

type GradingOutcome = "graded" | "skipped";

/** Grades one pending attempt. Throws on failure; the caller decides between retry and operator fallback. */
export async function gradeLessonProductiveAttempt(deps: LessonProductiveGradingDeps, learnerId: string, attemptId: string): Promise<GradingOutcome> {
  const repositories = createRepositories(deps.pool);
  const loaded = await repositories.learning.lessonAttemptForGrading(learnerId, attemptId);
  if (!loaded || loaded.attempt.grading?.state !== "pending") return "skipped";
  const { attempt, lesson, partContent } = loaded;
  if (!lesson || !partContent) throw gradingError("LESSON_NOT_FOUND");
  if (attempt.partCode !== "speaking" && attempt.partCode !== "writing") throw gradingError("LESSON_PART_NOT_GRADABLE");
  const mode = attempt.partCode;
  const runner = await deps.runnerFor(learnerId);
  if (!runner) throw gradingError("AI_UNAVAILABLE");
  const task = await repositories.aiRuns.activeTaskPrompt(learnerId, LESSON_PRODUCTIVE_GRADING_TASK);
  if (!task) throw gradingError("AI_PROMPT_NOT_READY");
  const language = lessonFeedbackLanguage(lesson.cefr);
  const now = deps.now ?? (() => new Date());

  let response: LessonProductiveGradingInput["response"];
  let stt: SpeechTranscriptionResult | undefined;
  if (mode === "speaking") {
    const transcriber = await deps.transcriberFor?.(learnerId);
    if (!transcriber) throw gradingError("AI_STT_UNAVAILABLE");
    if (!attempt.artifactKey) throw gradingError("LESSON_AUDIO_NOT_FOUND");
    const file = await repositories.files.findAssessmentAudioForViewer(learnerId, attempt.artifactKey);
    if (!file || file.deletedAt || !deps.storage?.getObject) throw gradingError("LESSON_AUDIO_NOT_FOUND");
    const object = await deps.storage.getObject({ bucket: file.bucket, objectKey: file.objectKey });
    const audio = await readStream(object.body, MAX_AUDIO_BYTES);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    try {
      stt = await transcriber.transcribe({ audio, mimeType: file.mimeType || object.mimeType || "audio/webm", signal: controller.signal, language: "en" });
    } finally {
      clearTimeout(timeout);
    }
    await repositories.aiRuns.recordSucceeded({
      userId: learnerId, requestId: `${attemptId}:stt`, taskId: task.taskId, promptVersionId: task.promptVersionId,
      output: { transcript: stt.text, durationSeconds: stt.durationSeconds ?? null, uncertainWords: stt.uncertainWords },
      metadata: { traceId: randomUUID(), provider: stt.provider, model: stt.model, inputHash: file.sha256, usage: stt.usage, latencyMs: stt.latencyMs }
    });
    if (speakingTranscriptTooShort(stt.text, stt.durationSeconds)) {
      await repositories.learning.saveLessonAttemptGrade({
        learnerId, attemptId, status: "retake", score: 0, feedback: lessonRetakeFeedback(language), transcript: stt.text,
        grading: { state: "graded", gradedAt: now().toISOString(), level: "retake", transcript: stt.text, failedPositions: [], sttModel: stt.model }
      });
      return "graded";
    }
    response = {
      text: stt.text.slice(0, 4_000), uncertainWords: stt.uncertainWords.slice(0, 40),
      ...(stt.durationSeconds === undefined ? {} : { durationSeconds: stt.durationSeconds })
    };
  } else {
    const text = attempt.answer?.trim() ?? "";
    if (!text) throw gradingError("LESSON_ANSWER_EMPTY");
    response = { text: text.slice(0, 4_000), uncertainWords: [] };
  }

  const input = buildLessonProductiveGradingInput(lesson, mode, partContent, response);
  let result: Awaited<ReturnType<AiTaskRunner["runTask"]>>;
  try {
    result = await runner.runTask(LESSON_PRODUCTIVE_GRADING_TASK, input, {
      systemPrompt: buildLessonProductiveGradingSystemPrompt(task.prompt, input), temperature: 0
    });
  } catch (error) {
    if (error instanceof AiGatewayError && error.code === "AI_OUTPUT_INVALID") {
      await repositories.aiRuns.recordFailed({
        userId: learnerId, requestId: attemptId, taskId: task.taskId, promptVersionId: task.promptVersionId,
        errorCode: "AI_OUTPUT_INVALID", diagnostic: { details: error.details }
      });
    }
    throw error;
  }
  const output = lessonProductiveGradingOutputSchema.parse(result.output);
  const outcome = lessonProductiveOutcome(output, attempt.attemptNumber);
  await repositories.aiRuns.recordSucceeded({
    userId: learnerId, requestId: attemptId, taskId: task.taskId, promptVersionId: task.promptVersionId,
    output: { ...output, ...(stt ? { sttModel: stt.model } : {}) }, metadata: result.metadata
  });
  const grading: LessonAttemptGrading = {
    state: "graded",
    gradedAt: now().toISOString(),
    level: outcome.status === "retake" ? "retake" : output.level,
    failedPositions: outcome.status === "retake" ? [] : output.failedPositions,
    usedRequiredWords: output.usedRequiredWords,
    ...(input.pronunciation?.focus ? { focus: input.pronunciation.focus } : {}),
    ...(stt ? { transcript: stt.text, sttModel: stt.model } : {}),
    model: result.metadata.model,
    traceId: result.metadata.traceId
  };
  await repositories.learning.saveLessonAttemptGrade({
    learnerId, attemptId, status: outcome.status, score: outcome.score,
    feedback: outcome.status === "retake" ? lessonRetakeFeedback(language) : output.feedback,
    ...(stt ? { transcript: stt.text } : {}),
    grading
  });
  return "graded";
}

async function fallBackToOperator(deps: LessonProductiveGradingDeps, learnerId: string, attemptId: string, code: string): Promise<void> {
  const repositories = createRepositories(deps.pool);
  const changed = await repositories.learning.markLessonAttemptGradingFallback({ learnerId, attemptId, code });
  if (!changed || code === "AI_OUTPUT_INVALID") return;
  const task = await repositories.aiRuns.activeTaskPrompt(learnerId, LESSON_PRODUCTIVE_GRADING_TASK).catch(() => null);
  if (task) {
    await repositories.aiRuns.recordFailed({
      userId: learnerId, requestId: attemptId, taskId: task.taskId, promptVersionId: task.promptVersionId,
      errorCode: code, diagnostic: { fallback: "operator" }
    });
  }
}

export function lessonFeedbackLanguage(cefr: string): "vi" | "en" {
  return cefr === "A1" || cefr === "A2" ? "vi" : "en";
}

/**
 * Only the day's pronunciation item and the task requirement are graded: the
 * part prompt / sample / read-aloud passage, the required words (explicit, or
 * the day's vocabulary), the day's grammar formula and the pronunciation focus.
 */
export function buildLessonProductiveGradingInput(
  lesson: Pick<LearnerLessonRecord, "cefr" | "content">,
  mode: "speaking" | "writing",
  partContent: Record<string, unknown>,
  response: LessonProductiveGradingInput["response"]
): LessonProductiveGradingInput {
  const items = Array.isArray(partContent.items)
    ? partContent.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  const prompts = [text(partContent.prompt) ?? text(partContent.task), ...items.map((item) => text(item.prompt))].filter((value): value is string => Boolean(value));
  const passages = [text(partContent.passage), ...items.map((item) => text(item.passage))].filter((value): value is string => Boolean(value));
  const explicitWords = [partContent.requiredWords, ...items.map((item) => item.requiredWords)]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
  const vocabulary = lesson.content.parts.find((part) => part.code === "vocabulary")?.content.items;
  const vocabularyWords = Array.isArray(vocabulary)
    ? vocabulary.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).word === "string" ? [String((item as Record<string, unknown>).word).trim()] : [])
    : [];
  const requiredWords = unique(explicitWords.length ? explicitWords : vocabularyWords).slice(0, 12);
  const explicitMinimum = [partContent.minRequiredWords, ...items.map((item) => item.minRequiredWords)]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minRequiredWords = Math.min(requiredWords.length, explicitMinimum.length ? Math.max(...explicitMinimum) : Math.min(2, requiredWords.length));
  const grammar = lesson.content.parts.find((part) => part.code === "grammar")?.content;
  const grammarFocus = grammar && grammar.hidden !== true && grammar.status !== "unavailable" ? text(grammar.formula) : undefined;
  const sample = text(partContent.sample) ?? text(partContent.answer) ?? text(partContent.audioText);
  const pronunciation = mode === "speaking" ? pronunciationItem(lesson) : undefined;
  return {
    mode,
    cefr: lesson.cefr as CefrLevel,
    feedbackLanguage: lessonFeedbackLanguage(lesson.cefr),
    task: {
      prompt: (prompts.join(" / ") || (mode === "speaking" ? "Speak about today's lesson." : "Write about today's lesson.")).slice(0, 1_200),
      ...(sample ? { sample: sample.slice(0, 600) } : {}),
      ...(passages.length ? { passage: passages.join(" ").slice(0, 600) } : {}),
      requiredWords,
      minRequiredWords: Math.max(0, minRequiredWords),
      ...(grammarFocus ? { grammarFocus: grammarFocus.slice(0, 600) } : {})
    },
    ...(pronunciation ? { pronunciation } : {}),
    response
  };
}

function pronunciationItem(lesson: Pick<LearnerLessonRecord, "content">): LessonProductiveGradingInput["pronunciation"] | undefined {
  const content = lesson.content.parts.find((part) => part.code === "pronunciation")?.content;
  if (!content) return undefined;
  const targets = Array.isArray(content.reviewTargets)
    ? content.reviewTargets.filter((target): target is Record<string, unknown> => Boolean(target) && typeof target === "object" && !Array.isArray(target))
    : [];
  const focus = targets.length
    ? unique(targets.map((target) => text(target.focus)).filter((value): value is string => Boolean(value))).join(", ")
    : text(content.focus) ?? "";
  const rawWords = targets.length ? targets.flatMap((target) => Array.isArray(target.words) ? target.words : []) : Array.isArray(content.words) ? content.words.slice(0, 3) : [];
  const seen = new Set<string>();
  const words = rawWords.flatMap((entry) => {
    const word = typeof entry === "string" ? entry.trim() : entry && typeof entry === "object" ? text((entry as Record<string, unknown>).word) : undefined;
    if (!word || seen.has(word.toLowerCase())) return [];
    seen.add(word.toLowerCase());
    const ipa = entry && typeof entry === "object" ? text((entry as Record<string, unknown>).ipa) : undefined;
    return [{ word: word.slice(0, 80), ...(ipa ? { ipa: ipa.slice(0, 80) } : {}) }];
  }).slice(0, 12);
  if (!focus && !words.length) return undefined;
  return { focus: focus.slice(0, 80), words };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readStream(stream: Readable, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > limit) throw gradingError("LESSON_AUDIO_TOO_LARGE");
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function gradingError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

export function gradingErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : "LESSON_AI_GRADING_FAILED";
}

/** Transient provider trouble is retried by the job; missing configuration or invalid output goes to the operator now. */
export function isRetryableGradingError(error: unknown): boolean {
  if (error instanceof AiProviderError) return error.retryable;
  if (error instanceof AiGatewayError) return error.code === "AI_TIMEOUT" || error.code.startsWith("AI_PROVIDER_");
  return false;
}
