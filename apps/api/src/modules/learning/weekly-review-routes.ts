import type {
  CefrLevel, LessonPart, WeeklyReviewAnswerResult, WeeklyReviewSectionCode, WeeklyReviewSessionView
} from "@e4s/contracts";
import { createRepositories } from "@e4s/database";
import {
  answerWeeklyReviewItem, currentWeeklyReviewSection, isWeeklyReviewComplete, resumeWeeklyReviewSession,
  setWeeklyReviewWarmup, variantFor, weeklyReviewSectionsFromParts, weeklyReviewWarmupCards,
  weeklyReviewSectionTitle, type WeeklyReviewSectionDefinition, type WeeklyReviewSessionState
} from "@e4s/domain/monthly";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

const sectionCode = z.enum(["listening", "word_use", "word_class", "grammar", "reading", "writing", "speaking"]);
const answerInput = z.object({
  sectionCode,
  itemId: z.string().trim().min(1).max(200),
  answer: z.string().max(10_000).optional(),
  artifactKey: z.string().trim().min(1).max(500).optional()
}).refine((input) => input.answer !== undefined || input.artifactKey !== undefined, { message: "Answer evidence is required" });
const warmupInput = z.object({ status: z.enum(["skipped", "done"]) });

/** Learner-visible session view; answer keys and explanations stay on the server. */
export function buildWeeklyReviewSessionView(
  lessonId: string,
  parts: readonly LessonPart[],
  sections: readonly WeeklyReviewSectionDefinition[],
  state: WeeklyReviewSessionState,
  /** The lesson's level: B1+ section titles are English. */
  cefr?: CefrLevel | string | null
): WeeklyReviewSessionView {
  const current = currentWeeklyReviewSection(state);
  const head = current?.queue[0];
  const item = head ? sections.find((section) => section.code === current!.code)?.items.find((candidate) => candidate.id === head.itemId) : undefined;
  const variant = item && head ? variantFor(item, head.variant) : undefined;
  return {
    lessonId,
    warmup: { status: state.warmup, cards: weeklyReviewWarmupCards(parts, cefr) },
    sections: state.sections.map((section) => {
      const total = sections.find((candidate) => candidate.code === section.code)?.items.length ?? 0;
      return {
        code: section.code,
        title: weeklyReviewSectionTitle(section.code, cefr),
        totalItems: total,
        correctItems: section.correctItemIds.length,
        completed: section.queue.length === 0
      };
    }),
    currentSectionCode: current?.code ?? null,
    currentQuestion: current && head && item && variant ? {
      sectionCode: current.code,
      itemId: item.id,
      variantId: variant.id,
      retry: head.retry,
      prompt: variant.prompt,
      ...(variant.passage ? { passage: variant.passage } : {}),
      ...(variant.audioText ? { audioText: variant.audioText } : {}),
      ...(variant.audioText && variant.audioUrl ? { audioUrl: variant.audioUrl } : {}),
      ...(variant.options?.length ? { options: variant.options } : {}),
      freeResponse: variant.answer === undefined,
      acceptsAudio: Boolean(variant.acceptsAudio)
    } : null,
    completed: isWeeklyReviewComplete(state) || Boolean(state.completedAt),
    completedAt: state.completedAt
  };
}

/**
 * Friday review session API. Resume, review-until-correct and completion are
 * server-owned; completion marks the review lesson complete, which drives the
 * next-week unlock gate and attendance.
 */
export function registerWeeklyReviewRoutes(app: FastifyInstance, pool: Pool, learnerOnly: preHandlerHookHandler): void {
  const repositories = createRepositories(pool);

  const load = async (learnerId: string, lessonId: string) => {
    const lesson = await repositories.learning.findLesson(learnerId, lessonId);
    if (!lesson) return { error: { status: 404, body: { code: "LESSON_NOT_FOUND" } } } as const;
    if (lesson.monthlyKind !== "review") return { error: { status: 404, body: { code: "REVIEW_NOT_FOUND" } } } as const;
    if (lesson.lock) return { error: { status: 409, body: { code: "LESSON_LOCKED", lock: lesson.lock } } } as const;
    const sections = weeklyReviewSectionsFromParts(lesson.content.parts);
    if (!sections.length) return { error: { status: 409, body: { code: "REVIEW_CONTENT_EMPTY" } } } as const;
    const stored = await repositories.learning.getWeeklyReviewState(learnerId, lessonId);
    const state = resumeWeeklyReviewSession(stored?.state ?? null, sections);
    // A review already completed stays completed even if its content changes later.
    const completedState = lesson.progress.status === "completed" && !state.completedAt
      ? { ...state, completedAt: stored?.completedAt ?? lesson.progress.updatedAt ?? new Date().toISOString() }
      : state;
    return { lesson, sections, state: completedState } as const;
  };

  app.get("/api/v1/lessons/:lessonId/review-session", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LESSON_ID" });
    const loaded = await load(request.e4sSession!.user.id, params.data.lessonId);
    if ("error" in loaded) return reply.code(loaded.error.status).send(loaded.error.body);
    return buildWeeklyReviewSessionView(loaded.lesson.id, loaded.lesson.content.parts, loaded.sections, loaded.state, loaded.lesson.cefr);
  });

  app.post("/api/v1/lessons/:lessonId/review-session/warmup", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    const body = warmupInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_REVIEW_WARMUP" });
    const learnerId = request.e4sSession!.user.id;
    const loaded = await load(learnerId, params.data.lessonId);
    if ("error" in loaded) return reply.code(loaded.error.status).send(loaded.error.body);
    const state = setWeeklyReviewWarmup(loaded.state, body.data.status);
    await repositories.learning.saveWeeklyReviewState({ learnerId, lessonId: loaded.lesson.id, state, completed: isWeeklyReviewComplete(state) });
    return buildWeeklyReviewSessionView(loaded.lesson.id, loaded.lesson.content.parts, loaded.sections, state, loaded.lesson.cefr);
  });

  app.post("/api/v1/lessons/:lessonId/review-session/answers", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    const body = answerInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_REVIEW_ANSWER" });
    const learnerId = request.e4sSession!.user.id;
    const loaded = await load(learnerId, params.data.lessonId);
    if ("error" in loaded) return reply.code(loaded.error.status).send(loaded.error.body);
    // A read-aloud recording only counts when it is this learner's uploaded audio.
    if (body.data.artifactKey !== undefined && !(await repositories.files.ownedBy(learnerId, "assessment_audio", body.data.artifactKey))) {
      return reply.code(400).send({ code: "REVIEW_AUDIO_NOT_OWNED" });
    }
    const outcome = answerWeeklyReviewItem({
      state: loaded.state,
      sections: loaded.sections,
      sectionCode: body.data.sectionCode as WeeklyReviewSectionCode,
      itemId: body.data.itemId,
      ...(body.data.answer === undefined ? {} : { answer: body.data.answer }),
      ...(body.data.artifactKey === undefined ? {} : { artifactKey: body.data.artifactKey }),
      cefr: loaded.lesson.cefr as CefrLevel
    });
    if (!outcome.ok) {
      return reply.code(409).send({ code: outcome.code, session: buildWeeklyReviewSessionView(loaded.lesson.id, loaded.lesson.content.parts, loaded.sections, loaded.state, loaded.lesson.cefr) });
    }
    const completed = isWeeklyReviewComplete(outcome.state);
    await repositories.learning.saveWeeklyReviewState({ learnerId, lessonId: loaded.lesson.id, state: outcome.state, completed });
    const result: WeeklyReviewAnswerResult = {
      correct: outcome.correct,
      feedback: outcome.feedback,
      willRetry: outcome.willRetry,
      ...(outcome.translation ? { translation: outcome.translation } : {}),
      session: buildWeeklyReviewSessionView(loaded.lesson.id, loaded.lesson.content.parts, loaded.sections, outcome.state, loaded.lesson.cefr)
    };
    return result;
  });
}
