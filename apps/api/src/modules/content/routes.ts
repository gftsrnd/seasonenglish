import type {
  ContentLessonDraftInput,
  ContentPromptKey,
  ContentPromptSettingsView,
  ContentWeekInput,
  ContentWeekSuggestionView,
  ContentReviewAssessmentDetailView,
  ContentReviewAiGradeJobView
} from "@e4s/contracts";
import { weeklyLessonsOutputSchema, weeklyPracticeInputSchema, weeklyPracticeOutputSchema, weekSuggestionsOutputSchema } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { approveContentVersion, retirePublishedContent, submitContentForReview, validateLessonDraft } from "@e4s/domain/content";
import type { ObjectStorage } from "@e4s/storage";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { AiTaskRunner } from "../coach/index.js";

const weekInput = z.object({
  weekNumber: z.int().min(1).max(52),
  topic: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000),
  objectives: z.string().trim().max(2_000),
  keyVocabHint: z.string().trim().max(1_000)
});
const weeksInput = z.object({ weeks: z.array(weekInput).min(1).max(52) });
const weekSuggestionsInput = z.object({ weekNumbers: z.array(z.int().min(1).max(52)).min(1).max(12) });
const lessonPartCode = z.enum([
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
]);
const lessonDraftInput = z.object({
  dayNumber: z.int().min(1).max(7),
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.int().min(1).max(120),
  parts: z.array(z.object({
    code: lessonPartCode,
    title: z.string().trim().min(1).max(100),
    content: z.record(z.string(), z.unknown())
  })).min(1).max(20)
});
// A blank manual draft is a valid starting point: the Operator opens the
// granular day editor immediately and fills the set incrementally. Review
// submission still enforces the complete five-day contract server-side.
const lessonDraftsInput = z.object({ lessons: z.array(lessonDraftInput).max(7) });
const granularLessonInput = z.union([
  lessonDraftInput.extend({ expectedVersion: z.int().min(0).optional() }),
  z.object({ expectedVersion: z.int().min(0).optional(), lesson: lessonDraftInput })
]);
const lessonJsonInput = z.object({ expectedVersion: z.int().min(0).optional(), lessons: z.array(lessonDraftInput).min(1).max(7) });
const lessonActionInput = z.object({ expectedVersion: z.int().min(0).optional() });
const lessonSetParams = z.object({
  week: z.coerce.number().int().min(1).max(52),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"])
});
const versionParams = z.object({ versionId: z.uuid() });
const reviewItemParams = z.object({ kind: z.enum(["submission", "coach"]), id: z.uuid() });
const reviewCheckedInput = z.object({ checked: z.boolean() });
const microParams = z.object({ id: z.uuid() });
const manualGradeInput = z.object({
  meaning: z.number().min(0).max(5), vocabulary: z.number().min(0).max(5), grammar: z.number().min(0).max(5),
  feedback: z.string().trim().min(1).max(2_000)
});
const aiGradeInput = z.object({ requestId: z.string().trim().min(1).max(160).optional() });
const appealDecisionInput = z.object({ status: z.enum(["accepted", "rejected"]), resolution: z.string().trim().min(1).max(2_000) });
const promptKeys = [
  "system_rules", "assessment_scoring", "weekly_lessons", "week_suggestions",
  "micro_grading", "coach_dialogue", "weekly_practice_grading"
] as const satisfies readonly ContentPromptKey[];
const promptInput = z.object({
  groups: z.array(z.object({
    key: z.enum(promptKeys),
    content: z.string().trim().min(1).max(100_000)
  })).min(1).max(promptKeys.length)
});

const promptLabels: Record<ContentPromptKey, string> = {
  system_rules: "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)",
  assessment_scoring: "Chấm test & xếp trình độ",
  weekly_lessons: "Sinh 5 bài siêu ngắn cho tuần",
  week_suggestions: "Gợi ý khung chủ đề tuần",
  micro_grading: "Chấm bài thực hành siêu ngắn",
  coach_dialogue: "AI coach hội thoại",
  weekly_practice_grading: "Chấm bài thực hành thứ Sáu"
};
const ASSESSMENT_AUDIO_PRESIGN_TTL_SECONDS = 300;

export function registerContentRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner, storage?: ObjectStorage): void {
  const repositories = createRepositories(pool);
  const readers = createRoleGuard(pool, ["operator", "manager"]);
  const operators = createRoleGuard(pool, ["operator", "manager"]);
  const authors = createRoleGuard(pool, ["operator", "manager"]);

  app.get("/api/v1/content/weeks", { preHandler: readers }, async (request, reply) => {
    const frame = await repositories.content.listWeeks(request.e4sSession!.user.id);
    return frame ?? reply.code(404).send({ code: "CONTENT_PROGRAM_NOT_FOUND" });
  });

  app.put("/api/v1/content/weeks", { preHandler: operators }, async (request, reply) => {
    const input = weeksInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ code: "INVALID_CONTENT_WEEKS" });
    try {
      const saved = await repositories.content.saveWeeks(
        request.e4sSession!.user.id,
        input.data.weeks as ContentWeekInput[]
      );
      return saved ?? reply.code(404).send({ code: "CONTENT_PROGRAM_NOT_FOUND" });
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "CONTENT_WEEKS_NOT_SAVED") });
    }
  });

  app.post("/api/v1/content/weeks/suggestions", {
    preHandler: authors, config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const input = weekSuggestionsInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ code: "INVALID_WEEK_SUGGESTION_REQUEST" });
    if (!aiRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const actorId = request.e4sSession!.user.id;
    const [frame, matrix, task] = await Promise.all([
      repositories.content.listWeeks(actorId), repositories.content.lessonMatrix(actorId),
      repositories.aiRuns.activeTaskPrompt(actorId, "week_suggestions")
    ]);
    if (!frame || !matrix || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await aiRunner.runTask("week_suggestions", {
        weekNumbers: input.data.weekNumbers, levels: matrix.levels.map((level) => level.cefr),
        usedTopics: frame.weeks.map((week) => week.topic).filter(Boolean)
      }, { systemPrompt: task.prompt });
      const output = weekSuggestionsOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      const activeLevels = matrix.levels.map((level) => level.cefr);
      const activeLevelSet = new Set(activeLevels);
      const requestedWeeks = new Set(input.data.weekNumbers);
      const returnedWeeks = new Set(output.data.weeks.map((week) => week.weekNumber));
      if (output.data.weeks.length !== requestedWeeks.size || returnedWeeks.size !== requestedWeeks.size || [...requestedWeeks].some((weekNumber) => !returnedWeeks.has(weekNumber))) {
        return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      }
      const expanded: ContentWeekSuggestionView[] = [];
      for (const week of output.data.weeks) {
        const levels = week.levels.filter((level) => activeLevelSet.has(level));
        if (!levels.length || levels.length !== week.levels.length) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
        for (const option of week.options) {
          for (const level of levels) if ((option.plan[level] ?? []).length !== 5) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
          for (const level of Object.keys(option.plan)) if (!activeLevelSet.has(level as typeof activeLevels[number])) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
        }
        expanded.push({ ...week, levels, options: week.options.map((option) => ({ ...option, plan: Object.fromEntries(levels.map((level) => [level, option.plan[level]!])) })) });
      }
      try {
        await repositories.aiRuns.recordSucceeded({
          userId: actorId,
          requestId: `week-suggestions:${input.data.weekNumbers.join("-")}:${Date.now()}`,
          taskId: task.taskId,
          promptVersionId: task.promptVersionId,
          output: output.data,
          metadata: result.metadata
        });
      } catch (error) {
        request.log.warn({ code: errorCode(error, "AI_RUN_RECORD_FAILED") }, "Week suggestion audit record failed");
      }
      return { weeks: expanded };
    } catch (error) {
      const code = errorCode(error, "WEEK_SUGGESTION_FAILED");
      request.log.warn({ code }, "Week suggestion generation failed");
      return reply.code(502).send({ code });
    }
  });

  app.get("/api/v1/content/lesson-matrix", { preHandler: readers }, async (request, reply) => {
    const matrix = await repositories.content.lessonMatrix(request.e4sSession!.user.id);
    return matrix ?? reply.code(404).send({ code: "CONTENT_PROGRAM_NOT_FOUND" });
  });

  app.get("/api/v1/content/lesson-sets/:week/:cefr", { preHandler: readers }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_SET" });
    const version = await repositories.content.latestLessonSet(
      request.e4sSession!.user.id, params.data.week, params.data.cefr
    );
    return version ?? reply.code(404).send({ code: "CONTENT_LESSON_SET_NOT_FOUND" });
  });

  app.put("/api/v1/content/lesson-sets/:week/:cefr/draft/lessons/:dayNumber", { preHandler: authors }, async (request, reply) => {
    const params = lessonSetParams.extend({ dayNumber: z.coerce.number().int().min(1).max(7) }).safeParse(request.params);
    const input = granularLessonInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON" });
    try {
      const lesson = "lesson" in input.data ? input.data.lesson : input.data;
      const validation = validateLessonDraft([lesson as ContentLessonDraftInput]);
      if (!validation.valid) return reply.code(400).send({ code: "CONTENT_VALIDATION_FAILED", issues: validation.issues });
      const saved = await repositories.content.upsertLessonDay(
        request.e4sSession!.user.id, params.data.week, params.data.cefr, params.data.dayNumber,
        lesson,
        input.data.expectedVersion
      );
      return saved;
    } catch (error) {
      const code = errorCode(error, "CONTENT_LESSON_NOT_SAVED");
      return reply.code(code === "CONTENT_VERSION_CONFLICT" ? 409 : 400).send({ code });
    }
  });

  app.patch("/api/v1/content/lesson-sets/:week/:cefr/draft/lessons/:dayNumber", { preHandler: authors }, async (request, reply) => {
    const params = lessonSetParams.extend({ dayNumber: z.coerce.number().int().min(1).max(7) }).safeParse(request.params);
    const input = granularLessonInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON" });
    try {
      const lesson = "lesson" in input.data ? input.data.lesson : input.data;
      const validation = validateLessonDraft([lesson as ContentLessonDraftInput]);
      if (!validation.valid) return reply.code(400).send({ code: "CONTENT_VALIDATION_FAILED", issues: validation.issues });
      return await repositories.content.upsertLessonDay(
        request.e4sSession!.user.id, params.data.week, params.data.cefr, params.data.dayNumber,
        lesson,
        input.data.expectedVersion
      );
    } catch (error) {
      const code = errorCode(error, "CONTENT_LESSON_NOT_SAVED");
      return reply.code(code === "CONTENT_VERSION_CONFLICT" ? 409 : 400).send({ code });
    }
  });

  app.delete("/api/v1/content/lesson-sets/:week/:cefr/draft/lessons/:dayNumber", { preHandler: authors }, async (request, reply) => {
    const params = lessonSetParams.extend({ dayNumber: z.coerce.number().int().min(1).max(7) }).safeParse(request.params);
    const body = z.object({ expectedVersion: z.int().min(0).optional() }).safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON" });
    try {
      return await repositories.content.deleteLessonDay(
        request.e4sSession!.user.id, params.data.week, params.data.cefr, params.data.dayNumber, body.data.expectedVersion
      );
    } catch (error) {
      const code = errorCode(error, "CONTENT_LESSON_NOT_DELETED");
      return reply.code(code === "CONTENT_VERSION_CONFLICT" ? 409 : code === "CONTENT_DAY_NOT_FOUND" ? 404 : 400).send({ code });
    }
  });

  app.put("/api/v1/content/lesson-sets/:week/:cefr/draft/json", { preHandler: authors }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    const input = lessonJsonInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_JSON" });
    const validation = validateLessonDraft(input.data.lessons as ContentLessonDraftInput[]);
    if (!validation.valid) return reply.code(400).send({ code: "CONTENT_VALIDATION_FAILED", issues: validation.issues });
    try {
      return await repositories.content.saveLessonJson(
        request.e4sSession!.user.id, params.data.week, params.data.cefr, input.data.lessons as ContentLessonDraftInput[], input.data.expectedVersion
      );
    } catch (error) {
      const code = errorCode(error, "CONTENT_LESSON_JSON_NOT_SAVED");
      return reply.code(code === "CONTENT_VERSION_CONFLICT" ? 409 : 400).send({ code });
    }
  });

  for (const action of ["enrich", "fill-phrases"] as const) {
    app.post(`/api/v1/content/lesson-sets/:week/:cefr/draft/${action}`, { preHandler: authors }, async (request, reply) => {
      const params = lessonSetParams.safeParse(request.params);
      const body = lessonActionInput.safeParse(request.body ?? {});
      if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_ACTION" });
      // These operations intentionally do not fabricate lexical material. A
      // provider-specific AI task/validated output contract must be configured
      // before the action can mutate an authoritative draft version.
      return reply.code(503).send({ code: aiRunner ? "AI_PROMPT_NOT_READY" : "AI_UNAVAILABLE" });
    });
  }

  app.delete("/api/v1/content/lesson-sets/:week/:cefr/draft", { preHandler: authors }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_SET" });
    try {
      return await repositories.content.deleteDraftLessonSet(request.e4sSession!.user.id, params.data.week, params.data.cefr);
    } catch (error) {
      const code = errorCode(error, "CONTENT_DRAFT_NOT_DELETED");
      return reply.code(code === "CONTENT_DRAFT_NOT_FOUND" ? 404 : 409).send({ code });
    }
  });

  app.put("/api/v1/content/lesson-sets/:week/:cefr/draft", { preHandler: operators }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    const input = lessonDraftsInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_DRAFT" });
    const validation = validateLessonDraft(input.data.lessons as ContentLessonDraftInput[]);
    if (!validation.valid) return reply.code(400).send({ code: "CONTENT_VALIDATION_FAILED", issues: validation.issues });
    try {
      const saved = await repositories.content.saveLessonDraft(
        request.e4sSession!.user.id, params.data.week, params.data.cefr,
        input.data.lessons as ContentLessonDraftInput[]
      );
      return reply.code(201).send(saved);
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "CONTENT_DRAFT_NOT_SAVED") });
    }
  });

  app.post("/api/v1/content/lesson-sets/:week/:cefr/generate", {
    preHandler: operators, config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_SET" });
    if (!aiRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const actorId = request.e4sSession!.user.id;
    const frame = await repositories.content.listWeeks(actorId);
    const week = frame?.weeks.find((candidate) => candidate.weekNumber === params.data.week);
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "weekly_lessons");
    if (!week || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await aiRunner.runTask("weekly_lessons", {
        weekNumber: week.weekNumber, topic: week.topic, description: week.description,
        objectives: week.objectives, keyVocabHint: week.keyVocabHint,
        cefr: params.data.cefr, lessonCount: 5
      }, { systemPrompt: task.prompt });
      const output = weeklyLessonsOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      const lessons = output.data.lessons as ContentLessonDraftInput[];
      const validation = validateLessonDraft(lessons);
      const days = [...new Set(lessons.map((lesson) => lesson.dayNumber))].sort((a, b) => a - b);
      if (!validation.valid || days.length !== 5 || days.some((day, index) => day !== index + 1)) {
        return reply.code(502).send({ code: "AI_LESSON_SET_INVALID", issues: validation.issues });
      }
      await repositories.aiRuns.recordSucceeded({
        userId: actorId,
        requestId: `weekly-lessons:${week.weekNumber}:${params.data.cefr}:${Date.now()}`,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output: output.data,
        metadata: result.metadata
      });
      return reply.code(201).send(await repositories.content.saveLessonDraft(actorId, week.weekNumber, params.data.cefr, lessons, "ai"));
    } catch (error) {
      request.log.warn({ code: errorCode(error, "AI_LESSON_GENERATION_FAILED") }, "Weekly lesson generation failed");
      return reply.code(502).send({ code: errorCode(error, "AI_LESSON_GENERATION_FAILED") });
    }
  });

  app.post("/api/v1/content/lesson-set-versions/:versionId/review", { preHandler: operators }, async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_VERSION" });
    const actorId = request.e4sSession!.user.id;
    const version = await repositories.content.lessonSetVersion(actorId, params.data.versionId);
    if (!version) return reply.code(404).send({ code: "CONTENT_VERSION_NOT_FOUND" });
    try {
      submitContentForReview({ status: version.status, lessons: version.lessons });
      const submitted = await repositories.content.submitVersionForReview(actorId, version.versionId);
      return submitted ?? reply.code(409).send({ code: "CONTENT_NOT_EDITABLE" });
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "CONTENT_NOT_EDITABLE") });
    }
  });

  app.post("/api/v1/content/lesson-set-versions/:versionId/publication", { preHandler: operators }, async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_VERSION" });
    const actorId = request.e4sSession!.user.id;
    const version = await repositories.content.lessonSetVersion(actorId, params.data.versionId);
    if (!version) return reply.code(404).send({ code: "CONTENT_VERSION_NOT_FOUND" });
    try {
      approveContentVersion({ status: version.status, createdBy: version.createdBy ?? "", checkerId: actorId });
      return await repositories.content.publishVersion(actorId, version.versionId);
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "CONTENT_NOT_PUBLISHABLE") });
    }
  });

  app.post("/api/v1/content/lesson-set-versions/:versionId/retirement", { preHandler: operators }, async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_VERSION" });
    const actorId = request.e4sSession!.user.id;
    const version = await repositories.content.lessonSetVersion(actorId, params.data.versionId);
    if (!version) return reply.code(404).send({ code: "CONTENT_VERSION_NOT_FOUND" });
    try {
      retirePublishedContent({ status: version.status, payload: version.lessons });
      return await repositories.content.retireVersion(actorId, version.versionId);
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "CONTENT_NOT_RETIRABLE") });
    }
  });

  app.get("/api/v1/content/review", { preHandler: readers }, async (request, reply) => {
    const overview = await repositories.content.reviewOverview(request.e4sSession!.user.id);
    return overview ?? reply.code(404).send({ code: "CONTENT_REVIEW_NOT_FOUND" });
  });

  app.get("/api/v1/content/review/assessments/:attemptId", { preHandler: readers }, async (request, reply): Promise<ContentReviewAssessmentDetailView | void> => {
    const params = z.object({ attemptId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_REVIEW_ASSESSMENT" });
    const detail = await repositories.assessments.getReviewAttempt(request.e4sSession!.user.id, params.data.attemptId);
    if (!detail) return reply.code(404).send({ code: "REVIEW_ASSESSMENT_NOT_FOUND" });
    const artifactKeys = detail.responses.flatMap((response) => response.artifactKey ? [response.artifactKey] : []);
    const files = artifactKeys.length ? await pool.query<{
      bucket: string; object_key: string; mime_type: string; size_bytes: number;
    }>(
      `select f.bucket, f.object_key, f.mime_type, f.size_bytes
       from files f join users learner on learner.id = f.owner_user_id
       join users staff on staff.id = $1 and staff.organization_id = learner.organization_id
       where f.purpose = 'assessment_audio' and f.object_key = any($2::text[])`,
      [request.e4sSession!.user.id, artifactKeys]
    ) : { rows: [] };
    const byArtifact = new Map(files.rows.map((file) => [file.object_key, file]));
    const signedArtifacts = new Map<string, { url: string; expiresAt: Date }>();
    if (storage?.presignGetObject) {
      await Promise.all(files.rows.map(async (file) => {
        try {
          signedArtifacts.set(file.object_key, await storage.presignGetObject!({
            bucket: file.bucket,
            objectKey: file.object_key,
            expiresInSeconds: ASSESSMENT_AUDIO_PRESIGN_TTL_SECONDS
          }));
        } catch (error) {
          request.log.warn({ error, objectKey: file.object_key }, "Assessment audio signing failed");
        }
      }));
    }
    const appeal = await pool.query<{
      id: string; reason: string; status: "pending" | "accepted" | "rejected"; resolution: string | null; created_at: Date;
    }>(
      `select a.id, a.reason, a.status, a.resolution, a.created_at
       from appeals a join assessment_attempts aa on aa.id = a.attempt_id
       join users learner on learner.id = aa.learner_id
       join users staff on staff.id = $1 and staff.organization_id = learner.organization_id
       where a.attempt_id = $2 order by a.created_at desc limit 1`,
      [request.e4sSession!.user.id, params.data.attemptId]
    );
    return {
      attemptId: detail.id,
      learnerId: detail.learnerId,
      learnerName: detail.learnerName,
      kind: detail.kind,
      title: detail.title,
      status: detail.status,
      startedAt: detail.startedAt,
      submittedAt: detail.submittedAt,
      totalScore: detail.totalScore,
      answers: detail.responses.map((answer) => {
        const artifact = answer.artifactKey ? byArtifact.get(answer.artifactKey) : undefined;
        const signed = answer.artifactKey ? signedArtifacts.get(answer.artifactKey) : undefined;
        return {
          ...answer,
          ...(answer.artifactKey ? { audioArtifact: {
            artifactKey: answer.artifactKey,
            mimeType: artifact?.mime_type ?? null,
            sizeBytes: artifact ? Number(artifact.size_bytes) : null,
            signedUrl: signed?.url ?? null,
            expiresAt: signed?.expiresAt.toISOString() ?? null
          } } : {})
        };
      }),
      scores: detail.scores,
      integrityEvents: detail.integrityEvents,
      decision: detail.decision,
      appeal: appeal.rows[0] ? { ...appeal.rows[0], createdAt: appeal.rows[0].created_at.toISOString() } : null
    };
  });

  app.post("/api/v1/content/review/submissions/:id/ai-grade", { preHandler: authors }, async (request, reply): Promise<ContentReviewAiGradeJobView | void> => {
    const params = microParams.safeParse(request.params);
    const body = aiGradeInput.safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_AI_GRADE_REQUEST" });
    const actorId = request.e4sSession!.user.id;
    const requestId = body.data.requestId ?? `operator-ai-grade:${params.data.id}`;
    const started = await repositories.content.beginReviewAiGrade(actorId, params.data.id, requestId);
    if (!started) return reply.code(404).send({ code: "SUBMISSION_NOT_FOUND" });
    if (!started.started) return started.job;
    if (!aiRunner) {
      await repositories.content.failReviewAiGrade(actorId, params.data.id, requestId, "AI_UNAVAILABLE");
      return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    }
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "weekly_practice_grading");
    if (!task || !started.input) {
      await repositories.content.failReviewAiGrade(actorId, params.data.id, requestId, "AI_PROMPT_NOT_READY");
      return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    }
    const input = weeklyPracticeInputSchema.safeParse({
      text: started.input.text,
      cefr: started.input.cefr,
      topic: started.input.topic,
      rubric: ["meaning", "vocabulary", "grammar"]
    });
    if (!input.success) {
      await repositories.content.failReviewAiGrade(actorId, params.data.id, requestId, "AI_INPUT_INVALID");
      return reply.code(400).send({ code: "AI_INPUT_INVALID" });
    }
    try {
      const result = await aiRunner.runTask("weekly_practice_grading", input.data, { systemPrompt: task.prompt });
      const output = weeklyPracticeOutputSchema.safeParse(result.output);
      if (!output.success) {
        await repositories.content.failReviewAiGrade(actorId, params.data.id, requestId, "AI_OUTPUT_INVALID");
        return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      }
      const saved = await repositories.content.completeReviewAiGrade({
        staffId: actorId,
        submissionId: params.data.id,
        requestId,
        output: output.data,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        metadata: result.metadata
      });
      return saved ?? reply.code(409).send({ code: "AI_GRADE_JOB_NOT_FOUND" });
    } catch (error) {
      request.log.warn({ error }, "Review AI grading failed");
      await repositories.content.failReviewAiGrade(actorId, params.data.id, requestId, "AI_GRADE_FAILED");
      return reply.code(502).send({ code: "AI_GRADE_FAILED" });
    }
  });

  app.patch("/api/v1/content/review/:kind/:id", { preHandler: authors }, async (request, reply) => {
    const params = reviewItemParams.safeParse(request.params);
    const body = reviewCheckedInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_REVIEW_ITEM" });
    const updated = await repositories.content.setReviewChecked(
      request.e4sSession!.user.id, params.data.kind, params.data.id, body.data.checked
    );
    return updated ? { checked: body.data.checked } : reply.code(404).send({ code: "REVIEW_ITEM_NOT_FOUND" });
  });

  app.delete("/api/v1/content/review/micro/:id", { preHandler: authors }, async (request, reply) => {
    const params = microParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON" });
    const deleted = await repositories.content.deleteMicroLesson(request.e4sSession!.user.id, params.data.id);
    return deleted ? reply.code(204).send() : reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
  });

  app.post("/api/v1/content/review/submissions/:id/manual-grade", { preHandler: authors }, async (request, reply) => {
    const params = microParams.safeParse(request.params);
    const body = manualGradeInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_MANUAL_GRADE" });
    const saved = await repositories.content.gradePracticeSubmission(request.e4sSession!.user.id, params.data.id, body.data);
    return saved ? { saved: true } : reply.code(404).send({ code: "SUBMISSION_NOT_FOUND" });
  });

  app.post("/api/v1/content/review/appeals/:id/decision", { preHandler: authors }, async (request, reply) => {
    const params = microParams.safeParse(request.params);
    const body = appealDecisionInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_APPEAL_DECISION" });
    const saved = await repositories.content.resolveAppeal(request.e4sSession!.user.id, params.data.id, body.data.status, body.data.resolution);
    return saved ? { saved: true } : reply.code(409).send({ code: "APPEAL_NOT_PENDING" });
  });

  app.get("/api/v1/content/prompts", { preHandler: readers }, async (request): Promise<ContentPromptSettingsView> => {
    const stored = await repositories.content.promptSettings(request.e4sSession!.user.id);
    const byKey = new Map(stored.map((group) => [group.key, group]));
    return {
      groups: promptKeys.flatMap((key) => {
        const group = byKey.get(key);
        return group ? [{ ...group, label: promptLabels[key] }] : [];
      })
    };
  });

  app.put("/api/v1/content/prompts", { preHandler: operators }, async (request, reply) => {
    const input = promptInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ code: "INVALID_CONTENT_PROMPTS" });
    const stored = await repositories.content.savePromptDrafts(request.e4sSession!.user.id, input.data.groups);
    return { groups: stored.map((group) => ({ ...group, label: promptLabels[group.key] })) };
  });
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}
