import { createHash, randomUUID } from "node:crypto";
import type {
  ContentLessonDraftInput,
  LessonVocabularyContent,
  ContentPromptKey,
  ContentPromptSettingsView,
  ContentWeekInput,
  ContentWeekSuggestionView,
  ContentReviewAssessmentDetailView,
  ContentReviewAiGradeJobView
} from "@e4s/contracts";
import { weeklyPracticeInputSchema, weeklyPracticeOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { createRepositories } from "@e4s/database";
import { approveContentVersion, retirePublishedContent, submitContentForReview, validateGenerationFindingsForPublication, validateLessonDraft, validateLessonPublication } from "@e4s/domain/content";
import type { ObjectStorage } from "@e4s/storage";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { ContentMediaService } from "../media/index.js";
import { lessonDaysNeedingRepair, mergeGeneratedLessons, mergeGenerationFindingsAfterRepair, type LessonRepairMode } from "./enrichment.js";
import { buildGenerationProvenance } from "./generation-provenance.js";
import {
  buildPartialLessonFromPipelineState,
  generateWeeklyLessons,
  lessonQualityProfileFromEnv,
  normalizeWeeklyLessonPlanBlueprint,
  prepareWeeklyLessonRetryState,
  WEEKLY_LESSON_PIPELINE_VERSION,
  type WeeklyLessonPipelineCheckpoint,
  type WeeklyLessonPipelineComponent
} from "./weekly-generation.js";
import { generateWeekSuggestionBatches } from "./week-suggestion-generation.js";
import { publicLessonGenerationFailure, safeGenerationDiagnosticIssues } from "./generation-errors.js";

const weekInput = z.object({
  weekNumber: z.int().min(1).max(52),
  topic: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000),
  objectives: z.string().trim().max(2_000),
  keyVocabHint: z.string().trim().max(1_000),
  plan: z.object({
    A1: z.array(z.string().trim().min(1).max(500)).length(5), A2: z.array(z.string().trim().min(1).max(500)).length(5),
    B1: z.array(z.string().trim().min(1).max(500)).length(5), B2: z.array(z.string().trim().min(1).max(500)).length(5),
    C1: z.array(z.string().trim().min(1).max(500)).length(5)
  }).partial().optional()
});
const weeksInput = z.object({ weeks: z.array(weekInput).min(1).max(52) });
const resumablePipelineComponents: readonly WeeklyLessonPipelineComponent[] = [
  "grammarClassification", "objectives", "foundation", "vocabulary",
  "skills.comprehension", "skills.languagePractice", "skills.speaking", "skills.reviewer"
] as const;

function weeklyLessonCheckpointFingerprint(input: {
  week: ContentWeekInput;
  cefr: string;
  promptVersionId: string;
  qualityProfile: string;
}): string {
  return createHash("sha256").update(JSON.stringify({
    pipelineVersion: WEEKLY_LESSON_PIPELINE_VERSION,
    promptVersionId: input.promptVersionId,
    qualityProfile: input.qualityProfile,
    cefr: input.cefr,
    week: input.week
  })).digest("hex");
}

function weeklyLessonCheckpointKey(fingerprint: string, dayNumber: number, component: WeeklyLessonPipelineComponent): string {
  return `weekly-lessons-checkpoint:${fingerprint}:day${dayNumber}:${component}`;
}
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
const weeklyPracticeDraftInput = z.object({
  expectedVersion: z.int().min(0),
  task: z.string().trim().min(1).max(4_000),
  guidance: z.string().trim().min(1).max(4_000),
  requiredVocabulary: z.array(z.string().trim().min(1).max(100)).max(12)
});
const lessonActionInput = z.object({
  expectedVersion: z.int().min(0).optional(),
  dayNumber: z.int().min(1).max(5).optional()
});
const lessonSetParams = z.object({
  week: z.coerce.number().int().min(1).max(52),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"])
});
const lessonLevelsInput = z.object({
  levels: z.array(z.enum(["A1", "A2", "B1", "B2", "C1"])).min(1).max(5)
    .refine((levels) => new Set(levels).size === levels.length, "Mỗi mức chỉ được chọn một lần")
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
const appealDecisionInput = z.object({
  status: z.enum(["accepted", "rejected"]),
  resolution: z.string().trim().min(1).max(2_000),
  newScore: z.number().int().min(0).max(100).optional()
});
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
const promptPublicationParams = z.object({ key: z.enum(promptKeys), version: z.coerce.number().int().min(1) });

const promptLabels: Record<ContentPromptKey, string> = {
  system_rules: "Quy tắc chung (mọi lời gọi trừ sinh bài siêu ngắn)",
  assessment_scoring: "Chấm test & xếp trình độ",
  weekly_lessons: "Sinh 5 bài T2–T6 theo chủ đề và kế hoạch đã duyệt",
  week_suggestions: "Gợi ý khung chủ đề tuần",
  micro_grading: "Chấm bài thực hành siêu ngắn",
  coach_dialogue: "AI coach hội thoại",
  weekly_practice_grading: "Chấm bài thực hành thứ Sáu"
};
const ASSESSMENT_AUDIO_PRESIGN_TTL_SECONDS = 300;
export function registerContentRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  storage?: ObjectStorage,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>,
  mediaService?: ContentMediaService
): void {
  const repositories = createRepositories(pool);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);
  const readers = createRoleGuard(pool, ["operator", "manager"]);
  const operators = createRoleGuard(pool, ["operator", "manager"]);
  const authors = createRoleGuard(pool, ["operator", "manager"]);
  const weeklyPracticeAuthors = createRoleGuard(pool, ["operator"]);
  const managers = createRoleGuard(pool, ["manager"]);

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
    const actorId = request.e4sSession!.user.id;
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const [frame, matrix, task, historicalTopics, suggestedTopics] = await Promise.all([
      repositories.content.listWeeks(actorId), repositories.content.lessonMatrix(actorId),
      repositories.aiRuns.activeTaskPrompt(actorId, "week_suggestions"),
      repositories.content.usedLessonTopics(actorId),
      repositories.content.usedSuggestedTopics(actorId)
    ]);
    if (!frame || !matrix || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const generated = await generateWeekSuggestionBatches({
        weekNumbers: input.data.weekNumbers, levels: matrix.levels.map((level) => level.cefr),
        usedTopics: [...new Set([
          ...frame.weeks.map((week) => week.topic).filter(Boolean),
          ...historicalTopics,
          ...suggestedTopics
        ])].slice(0, 52)
      }, task, runner);
      const output = { data: generated.output };
      const auditResult = generated.results[generated.results.length - 1];
      if (!auditResult) throw new Error("WEEK_SUGGESTION_AUDIT_MISSING");
      const activeLevels = matrix.levels.map((level) => level.cefr);
      const activeLevelSet = new Set(activeLevels);
      const requestedWeeks = new Set(input.data.weekNumbers);
      const returnedWeeks = new Set(output.data.weeks.map((week) => week.weekNumber));
      if (output.data.weeks.length !== requestedWeeks.size || returnedWeeks.size !== requestedWeeks.size || [...requestedWeeks].some((weekNumber) => !returnedWeeks.has(weekNumber))) {
        return reply.code(502).send({
          code: "AI_OUTPUT_INVALID",
          issues: [{
            path: "weeks",
            message: `Expected exactly one result for each requested week (${[...requestedWeeks].join(", ")}), received ${output.data.weeks.length}.`
          }]
        });
      }
      const expanded: ContentWeekSuggestionView[] = [];
      for (const week of output.data.weeks) {
        const levels = week.levels.filter((level) => activeLevelSet.has(level));
        if (levels.length !== activeLevels.length || levels.length !== week.levels.length || activeLevels.some((level) => !levels.includes(level))) {
          return reply.code(502).send({
            code: "AI_OUTPUT_INVALID",
            issues: [{
              path: `weeks.${week.weekNumber}.levels`,
              message: `CEFR levels must exactly match the active matrix: ${activeLevels.join(", ")}.`
            }]
          });
        }
        const usedTopicKeys = new Set(frame.weeks.map((candidate) => candidate.topic.trim().toLocaleLowerCase()).filter(Boolean));
        const freshOptions = week.options.filter((option) => {
          const topicKey = option.topic.trim().toLocaleLowerCase();
          if (!topicKey || usedTopicKeys.has(topicKey)) return false;
          usedTopicKeys.add(topicKey);
          return true;
        });
        if (!freshOptions.length) {
          return reply.code(502).send({
            code: "AI_OUTPUT_INVALID",
            issues: [{
              path: `weeks.${week.weekNumber}.options`,
              message: "All returned topic options were empty or duplicated an existing week topic."
            }]
          });
        }
        for (const option of freshOptions) {
          for (const level of levels) {
            if ((option.plan[level] ?? []).length !== 5) {
              return reply.code(502).send({
                code: "AI_OUTPUT_INVALID",
                issues: [{
                  path: `weeks.${week.weekNumber}.options.${option.topic}.plan.${level}`,
                  message: "Each active CEFR level must contain exactly 5 day-plan items."
                }]
              });
            }
          }
          for (const level of Object.keys(option.plan)) {
            if (!activeLevelSet.has(level as typeof activeLevels[number])) {
              return reply.code(502).send({
                code: "AI_OUTPUT_INVALID",
                issues: [{
                  path: `weeks.${week.weekNumber}.options.${option.topic}.plan.${level}`,
                  message: `The plan contains inactive CEFR level ${level}.`
                }]
              });
            }
          }
        }
        expanded.push({ ...week, levels, options: freshOptions.map((option) => ({ ...option, plan: Object.fromEntries(levels.map((level) => [level, option.plan[level]!])) })) });
      }
      try {
        await repositories.aiRuns.recordSucceeded({
          userId: actorId,
          requestId: `week-suggestions:${input.data.weekNumbers.join("-")}:${Date.now()}`,
          taskId: task.taskId,
          promptVersionId: task.promptVersionId,
          output: output.data,
          metadata: auditResult.metadata
        });
      } catch (error) {
        request.log.warn({ code: errorCode(error, "AI_RUN_RECORD_FAILED") }, "Week suggestion audit record failed");
      }
      return { weeks: expanded };
    } catch (error) {
      const code = errorCode(error, "WEEK_SUGGESTION_FAILED");
      request.log.warn({ code }, "Week suggestion generation failed");
      if (code === "AI_OUTPUT_INVALID") {
        const issues = error && typeof error === "object" && "issues" in error
          ? (error as { issues?: unknown }).issues
          : undefined;
        return reply.code(502).send({
          code,
          issues: Array.isArray(issues) ? issues : []
        });
      }
      return reply.code(502).send({
        code: "WEEK_SUGGESTION_FAILED",
        message: "AI chưa tạo được gợi ý chủ đề hợp lệ. Vui lòng thử lại sau ít phút."
      });
    }
  });

  app.get("/api/v1/content/lesson-matrix", { preHandler: readers }, async (request, reply) => {
    const matrix = await repositories.content.lessonMatrix(request.e4sSession!.user.id);
    return matrix ?? reply.code(404).send({ code: "CONTENT_PROGRAM_NOT_FOUND" });
  });

  app.put("/api/v1/content/lesson-levels", { preHandler: operators }, async (request, reply) => {
    const input = lessonLevelsInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_LEVELS" });
    try {
      const matrix = await repositories.content.setLessonMatrixLevels(request.e4sSession!.user.id, input.data.levels);
      return matrix ?? reply.code(404).send({ code: "CONTENT_PROGRAM_NOT_FOUND" });
    } catch (error) {
      return reply.code(409).send({ code: errorCode(error, "CONTENT_LESSON_LEVELS_NOT_SAVED") });
    }
  });

  app.get("/api/v1/content/lesson-sets/:week/:cefr", { preHandler: readers }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_SET" });
    const version = await repositories.content.latestLessonSet(
      request.e4sSession!.user.id, params.data.week, params.data.cefr
    );
    return version ?? reply.code(404).send({ code: "CONTENT_LESSON_SET_NOT_FOUND" });
  });

  app.get("/api/v1/content/lesson-sets/:week/:cefr/lessons/:lessonId/vocabulary/:itemIndex/image", { preHandler: readers }, async (request, reply) => {
    const params = lessonSetParams.extend({ lessonId: z.uuid(), itemIndex: z.coerce.number().int().nonnegative() }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ code: "VOCABULARY_IMAGE_NOT_FOUND" });
    const actorId = request.e4sSession!.user.id;
    const version = await repositories.content.latestLessonSet(actorId, params.data.week, params.data.cefr);
    const lesson = version?.lessons.find((candidate) => candidate.id === params.data.lessonId);
    const vocabulary = lesson?.parts.find((part) => part.code === "vocabulary")?.content as LessonVocabularyContent | undefined;
    const item = vocabulary?.items[params.data.itemIndex];
    if (!lesson || !item) return reply.code(404).send({ code: "VOCABULARY_IMAGE_NOT_FOUND" });
    if (!mediaService) return { status: "unavailable" };
    try {
      const partOfSpeech = canonicalPartOfSpeech(item.type);
      return await mediaService.resolveForUser(actorId, {
        term: item.word,
        ...(partOfSpeech ? { partOfSpeech } : {}),
        allowProviderFallback: true,
        ...(item.imageQuery ? { imageQuery: item.imageQuery } : {}),
        ...(item.imageUrl ? { explicitImageUrl: item.imageUrl } : {}),
        ...(item.imageAttribution ? { explicitAttribution: item.imageAttribution } : {})
      });
    } catch {
      return { status: "unavailable" };
    }
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

  app.put("/api/v1/content/lesson-sets/:week/:cefr/draft/weekly-practice", { preHandler: weeklyPracticeAuthors }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    const input = weeklyPracticeDraftInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "INVALID_WEEKLY_PRACTICE_DRAFT" });
    try {
      return await repositories.content.saveWeeklyPractice(
        request.e4sSession!.user.id, params.data.week, params.data.cefr,
        { task: input.data.task, guidance: input.data.guidance, requiredVocabulary: input.data.requiredVocabulary, expectedVersion: input.data.expectedVersion }
      );
    } catch (error) {
      const code = errorCode(error, "WEEKLY_PRACTICE_NOT_SAVED");
      return reply.code(code === "CONTENT_VERSION_CONFLICT" ? 409 : code === "CONTENT_WEEK_NOT_FOUND" ? 404 : 400).send({ code });
    }
  });

  for (const action of ["enrich", "fill-phrases"] as const) {
    app.post(`/api/v1/content/lesson-sets/:week/:cefr/draft/${action}`, { preHandler: authors }, async (request, reply) => {
      const params = lessonSetParams.safeParse(request.params);
      const body = lessonActionInput.safeParse(request.body ?? {});
      if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_ACTION" });
      const actorId = request.e4sSession!.user.id;
      const runner = await runnerFor(actorId);
      if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
      const frame = await repositories.content.listWeeks(actorId);
      const week = frame?.weeks.find((candidate) => candidate.weekNumber === params.data.week);
      const task = await repositories.aiRuns.activeTaskPrompt(actorId, "weekly_lessons");
      const current = await repositories.content.latestLessonSet(actorId, params.data.week, params.data.cefr);
      if (!week || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
      if (!current) return reply.code(404).send({ code: "CONTENT_LESSON_SET_NOT_FOUND" });
      try {
        const existing = current.lessons.map((lesson) => ({
          dayNumber: lesson.dayNumber,
          title: lesson.title,
          durationMinutes: lesson.durationMinutes,
          parts: lesson.parts
        })) as ContentLessonDraftInput[];
        const repairableDays = lessonDaysNeedingRepair(existing, action as LessonRepairMode);
        const requestedFindings = current.generationFindings?.filter((finding) =>
          finding.repairAction === "regenerate_component"
          && (body.data.dayNumber === undefined || finding.dayNumber === body.data.dayNumber)
        ) ?? [];
        const forcedComponentsByDay = requestedFindings.reduce<Partial<Record<number, Array<"foundation" | "vocabulary" | "skills">>>>((result, finding) => {
          if (finding.dayNumber === null || finding.component === "plan") return result;
          const component: "foundation" | "vocabulary" | "skills" = finding.component === "grammarClassification" || finding.component === "objectives"
            ? "foundation"
            : finding.component.startsWith("skills.") ? "skills" : finding.component as "foundation" | "vocabulary" | "skills";
          const components = result[finding.dayNumber] ?? [];
          if (!components.includes(component)) components.push(component);
          result[finding.dayNumber] = components;
          return result;
        }, {});
        const dayNumbers = action === "enrich" && body.data.dayNumber !== undefined
          ? (repairableDays.includes(body.data.dayNumber) || forcedComponentsByDay[body.data.dayNumber]?.length ? [body.data.dayNumber] : [])
          : [...new Set([...repairableDays, ...Object.keys(forcedComponentsByDay).map(Number)])].sort((left, right) => left - right);
        if (dayNumbers.length === 0) return reply.send(current);
        const plan = week.plan?.[params.data.cefr];
        if (!plan || plan.length !== 5 || plan.some((focus) => !focus.trim())) {
          return reply.code(409).send({
            code: "CONTENT_WEEK_PLAN_REQUIRED",
            findings: [{ dayNumber: null, component: "plan", code: "CONTENT_WEEK_PLAN_REQUIRED", severity: "error", message: `Mức ${params.data.cefr} cần kế hoạch 5 ngày trước khi sửa bằng AI.`, issues: [], repairAction: "regenerate_plan" }]
          });
        }
        const repairVocabulary = new Set(existing
          .filter((lesson) => dayNumbers.includes(lesson.dayNumber))
          .flatMap((lesson) => {
            const items = lesson.parts.find((part) => part.code === "vocabulary")?.content.items;
            return Array.isArray(items) ? items.flatMap((item) => {
              const word = typeof item === "string"
                ? item
                : item && typeof item === "object" && "word" in item && typeof item.word === "string"
                  ? item.word
                  : "";
              return word.trim() ? [word.trim().toLocaleLowerCase("en-US")] : [];
            }) : [];
          }));
        const excludedVocabulary = (await repositories.content.usedLessonVocabulary(actorId))
          .filter((word) => !repairVocabulary.has(word.trim().toLocaleLowerCase("en-US")));
        const matrix = await repositories.content.lessonMatrix(actorId);
        const excludedGrammarFrames = [
          ...(matrix?.weeks.find((item) => item.weekNumber === params.data.week)?.cells
            .filter((cell) => cell.cefr !== params.data.cefr)
            .flatMap((cell) => cell.lessons.map((lesson) => lesson.title)) ?? []),
          ...existing
            .filter((lesson) => !dayNumbers.includes(lesson.dayNumber))
            .flatMap((lesson) => {
              const grammar = lesson.parts.find((part) => part.code === "grammar")?.content;
              if (!grammar || typeof grammar !== "object" || Array.isArray(grammar)) return [lesson.title];
              const formula = typeof grammar.formula === "string" ? grammar.formula : "";
              const targetName = typeof grammar.targetName === "string" ? grammar.targetName : "";
              return [formula || targetName || lesson.title];
            })
        ];
        const qualityProfile = lessonQualityProfileFromEnv();
        const generated = await generateWeeklyLessons(week, params.data.cefr, task, runner, {
          excludedVocabulary,
          dayNumbers,
          qualityReview: true,
          qualityProfile,
          excludedGrammarFrames,
          existingLessons: existing,
          repairMode: action,
          forcedComponentsByDay,
          sequentialPipeline: true,
          onProgress: (progress) => request.log.info({ week: params.data.week, cefr: params.data.cefr, ...progress }, "Weekly lesson generation progress")
        });
        const lessons = mergeGeneratedLessons(existing, generated.lessons, action as LessonRepairMode, forcedComponentsByDay);
        const output = {
          ...generated.output,
          findings: mergeGenerationFindingsAfterRepair(current.generationFindings, generated.findings, forcedComponentsByDay)
        };
        const validation = validateLessonDraft(lessons);
        if (!validation.valid) {
          request.log.warn({
            code: "AI_LESSON_SET_PARTIAL",
            issues: validation.issues,
            retainedDays: generated.lessons.map((lesson) => lesson.dayNumber),
            failures: generated.failures
          }, "Weekly lesson repair retained valid components and left the remaining gaps for supplementation");
        }
        try {
          await repositories.aiRuns.recordSucceeded({
            userId: actorId,
            requestId: `weekly-lessons-repair:${params.data.week}:${params.data.cefr}:${action}:${Date.now()}`,
            taskId: task.taskId,
            promptVersionId: task.promptVersionId,
            output,
            metadata: generated.result.metadata
          });
        } catch (error) {
          request.log.warn({ code: errorCode(error, "AI_RUN_RECORD_FAILED") }, "Lesson repair audit record failed");
        }
        return reply.code(201).send(await repositories.content.saveLessonDraft(
          actorId,
          params.data.week,
          params.data.cefr,
          lessons,
          "ai",
          buildGenerationProvenance({
            promptVersionId: task.promptVersionId,
            prompt: task.prompt,
            model: { provider: generated.result.metadata.provider, name: generated.result.metadata.model },
            week,
            cefr: params.data.cefr,
            extraInput: { action, dayNumbers, excludedVocabulary, excludedGrammarFrames, qualityProfile },
            output,
            validation
          })
        ));
      } catch (error) {
        const code = errorCode(error, "AI_LESSON_REPAIR_FAILED");
        request.log.warn({ code, message: error instanceof Error ? error.message : String(error) }, "Weekly lesson repair failed");
        return reply.code(502).send(publicLessonGenerationFailure(error));
      }
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
    // A pilot can run 3–4 weeks across several active CEFR levels.  The
    // operator deliberately sends these requests sequentially, but the old
    // four-per-minute ceiling still rejected a valid third week mid-run.
    // Keep a bounded route limit without making the product block its own
    // configured pilot size.
    preHandler: operators, config: { rateLimit: { max: 24, timeWindow: "10 minutes" } }
  }, async (request, reply) => {
    const params = lessonSetParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_LESSON_SET" });
    const actorId = request.e4sSession!.user.id;
    const matrix = await repositories.content.lessonMatrix(actorId);
    if (!matrix?.levels.some((level) => level.cefr === params.data.cefr)) {
      return reply.code(409).send({ code: "CONTENT_LEVEL_NOT_ACTIVE" });
    }
    const frame = await repositories.content.listWeeks(actorId);
    const week = frame?.weeks.find((candidate) => candidate.weekNumber === params.data.week);
    if (!week?.topic.trim()) return reply.code(409).send({ code: "CONTENT_WEEK_TOPIC_REQUIRED" });
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "weekly_lessons");
    if (!week || !task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    const plan = week.plan?.[params.data.cefr];
    if (!plan || plan.length !== 5 || plan.some((focus) => !focus.trim())) {
      return reply.code(409).send({
        code: "CONTENT_WEEK_PLAN_REQUIRED",
        findings: [{ dayNumber: null, component: "plan", code: "CONTENT_WEEK_PLAN_REQUIRED", severity: "error", message: `Mức ${params.data.cefr} cần kế hoạch 5 ngày trước khi sinh bài.`, issues: [], repairAction: "regenerate_plan" }]
      });
    }
    const runner = await runnerFor(actorId);
    if (!runner) {
      await repositories.aiRuns.recordFailed({
        userId: actorId,
        requestId: `weekly-lessons:${week.weekNumber}:${params.data.cefr}:${randomUUID()}`,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        errorCode: "AI_UNAVAILABLE",
        diagnostic: generationFailureDiagnostic(week, params.data.cefr, task, "AI_UNAVAILABLE")
      });
      return reply.code(503).send(publicLessonGenerationFailure(new Error("AI_UNAVAILABLE")));
    }
    const qualityProfile = lessonQualityProfileFromEnv();
    let generationWeek: ContentWeekInput = week;
    let generationPlan = plan;
    let checkpointFingerprint = "";
    const resumeStatesByDay: Partial<Record<number, WeeklyLessonPipelineCheckpoint["state"]>> = {};
    let excludedVocabulary: string[] = [];
    let excludedGrammarFrames: string[] = [];
    try {
      const normalizedBlueprint = await normalizeWeeklyLessonPlanBlueprint(week, task, runner);
      generationWeek = normalizedBlueprint.week;
      generationPlan = normalizedBlueprint.week.plan[params.data.cefr];
      checkpointFingerprint = weeklyLessonCheckpointFingerprint({
        week: generationWeek,
        cefr: params.data.cefr,
        promptVersionId: task.promptVersionId,
        qualityProfile
      });
      excludedVocabulary = await repositories.content.usedLessonVocabulary(actorId);
      excludedGrammarFrames = matrix.weeks
        .find((item) => item.weekNumber === week.weekNumber)?.cells
        .filter((cell) => cell.cefr !== params.data.cefr)
        .flatMap((cell) => cell.lessons.map((lesson) => lesson.title)) ?? [];
      for (let dayNumber = 1; dayNumber <= 5; dayNumber += 1) {
        for (const component of [...resumablePipelineComponents].reverse()) {
          const stored = await repositories.aiRuns.findSucceededOutput(
            actorId,
            weeklyLessonCheckpointKey(checkpointFingerprint, dayNumber, component),
            "weekly_lessons"
          );
          const payload = stored?.output && typeof stored.output === "object"
            ? stored.output as { pipelineVersion?: unknown; fingerprint?: unknown; checkpoint?: WeeklyLessonPipelineCheckpoint }
            : undefined;
          if (payload?.pipelineVersion === WEEKLY_LESSON_PIPELINE_VERSION
            && payload.fingerprint === checkpointFingerprint
            && payload.checkpoint?.dayNumber === dayNumber
            && payload.checkpoint.component === component) {
            resumeStatesByDay[dayNumber] = prepareWeeklyLessonRetryState(payload.checkpoint.state);
            break;
          }
        }
      }
      const generated = await generateWeeklyLessons(generationWeek, params.data.cefr, task, runner, {
        excludedVocabulary,
        excludedGrammarFrames,
        qualityReview: true,
        qualityProfile,
        sequentialPipeline: true,
        resumeStatesByDay,
        onCheckpoint: async (checkpoint) => {
          resumeStatesByDay[checkpoint.dayNumber] = checkpoint.state;
          if (checkpoint.component === "assemble") return;
          const metadata = checkpoint.attemptLog.findLast((entry) => entry.metadata)?.metadata;
          if (!metadata) return;
          await repositories.aiRuns.recordCheckpoint({
            userId: actorId,
            requestId: weeklyLessonCheckpointKey(checkpointFingerprint, checkpoint.dayNumber, checkpoint.component),
            taskId: task.taskId,
            promptVersionId: task.promptVersionId,
            output: {
              pipelineVersion: WEEKLY_LESSON_PIPELINE_VERSION,
              fingerprint: checkpointFingerprint,
              checkpoint
            },
            metadata
          });
        },
        onProgress: (progress) => request.log.info({ week: week.weekNumber, cefr: params.data.cefr, ...progress }, "Weekly lesson generation progress")
      });
      const validation = validateLessonDraft(generated.lessons);
      const saved = await repositories.content.saveLessonDraft(
        actorId,
        week.weekNumber,
        params.data.cefr,
        generated.lessons,
        "ai",
        buildGenerationProvenance({
          promptVersionId: task.promptVersionId,
          prompt: task.prompt,
          model: { provider: generated.result.metadata.provider, name: generated.result.metadata.model },
          week: generationWeek,
          cefr: params.data.cefr,
          extraInput: { excludedVocabulary, excludedGrammarFrames, qualityProfile },
          output: generated.output,
          validation
        })
      );
      try {
        await repositories.aiRuns.recordSucceeded({
          userId: actorId,
          requestId: `weekly-lessons:${week.weekNumber}:${params.data.cefr}:${randomUUID()}`,
          taskId: task.taskId,
          promptVersionId: task.promptVersionId,
          output: generated.output,
          metadata: generated.result.metadata
        });
      } catch (error) {
        request.log.warn({ code: errorCode(error, "AI_RUN_RECORD_FAILED") }, "Lesson generation audit record failed");
      }
      return reply.code(201).send(saved);
    } catch (error) {
      const code = errorCode(error, "AI_LESSON_GENERATION_FAILED");
      const diagnosticIssues = safeGenerationDiagnosticIssues(error);
      const checkpointLessons = [1, 2, 3, 4, 5].flatMap((dayNumber) => {
        const state = resumeStatesByDay[dayNumber];
        if (!state) return [];
        const lesson = buildPartialLessonFromPipelineState({
          weekNumber: week.weekNumber,
          topic: generationWeek.topic,
          description: generationWeek.description,
          objectives: generationWeek.objectives,
          keyVocabHint: generationWeek.keyVocabHint,
          cefr: params.data.cefr,
          dayNumber,
          lessonFocus: generationPlan[dayNumber - 1]!,
          allLessonFocuses: generationPlan
        }, state);
        return lesson ? [lesson] : [];
      });
      const returnedPartialLessons = error && typeof error === "object" && "partialResult" in error
        && (error as { partialResult?: unknown }).partialResult
        && typeof (error as { partialResult: unknown }).partialResult === "object"
        && "lessons" in ((error as { partialResult: object }).partialResult)
        && Array.isArray(((error as { partialResult: { lessons?: unknown } }).partialResult).lessons)
        ? (error as { partialResult: { lessons: typeof checkpointLessons } }).partialResult.lessons
        : [];
      const partialLessons = [...new Map(
        [...returnedPartialLessons, ...checkpointLessons].map((lesson) => [lesson.dayNumber, lesson] as const)
      ).values()].sort((left, right) => left.dayNumber - right.dayNumber);
      const publicFailure = publicLessonGenerationFailure(error);
      const findings = (publicFailure.findings ?? []).map((finding) => ({
        dayNumber: finding.dayNumber,
        component: finding.component,
        code: finding.code,
        severity: "error" as const,
        message: `Ngày ${finding.dayNumber ?? "?"}: component ${finding.component} chưa vượt qua kiểm tra sau tối đa 2 lần.`,
        issues: diagnosticIssues,
        repairAction: "regenerate_component" as const
      }));
      try {
        await repositories.aiRuns.recordFailed({
          userId: actorId,
          requestId: `weekly-lessons:${week.weekNumber}:${params.data.cefr}:${randomUUID()}`,
          taskId: task.taskId,
          promptVersionId: task.promptVersionId,
          errorCode: code,
          diagnostic: generationFailureDiagnostic(week, params.data.cefr, task, code, error)
        });
      } catch (recordError) {
        request.log.warn({ code: errorCode(recordError, "AI_RUN_RECORD_FAILED") }, "Lesson generation failure audit record failed");
      }
      request.log.warn({
        code,
        issues: diagnosticIssues,
        retainedDays: partialLessons.map((lesson) => lesson.dayNumber)
      }, "Weekly lesson generation failed");
      if (partialLessons.length > 0) {
        const validation = validateLessonDraft(partialLessons);
        const saved = await repositories.content.saveLessonDraft(
          actorId,
          week.weekNumber,
          params.data.cefr,
          partialLessons,
          "ai",
          buildGenerationProvenance({
            promptVersionId: task.promptVersionId,
            prompt: task.prompt,
            model: { provider: "partial-pipeline", name: WEEKLY_LESSON_PIPELINE_VERSION },
            week: generationWeek,
            cefr: params.data.cefr,
            extraInput: { excludedVocabulary, excludedGrammarFrames, qualityProfile, partial: true },
            output: { lessons: partialLessons, findings, failure: { code, issues: diagnosticIssues } },
            validation
          })
        );
        return reply.code(502).send({
          ...publicFailure,
          partialDraft: saved
        });
      }
      return reply.code(502).send(publicFailure);
    }
  });

  app.post("/api/v1/content/lesson-set-versions/:versionId/review", { preHandler: operators }, async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_CONTENT_VERSION" });
    const actorId = request.e4sSession!.user.id;
    const version = await repositories.content.lessonSetVersion(actorId, params.data.versionId);
    if (!version) return reply.code(404).send({ code: "CONTENT_VERSION_NOT_FOUND" });
    const validation = validateLessonPublication(version.lessons, version.weeklyPractice, version.cefr);
    const generationValidation = validateGenerationFindingsForPublication(version.generationFindings);
    if (!validation.valid || !generationValidation.valid) return reply.code(409).send({ code: "CONTENT_VALIDATION_FAILED", issues: [...validation.issues, ...generationValidation.issues] });
    try {
      submitContentForReview({
        status: version.status,
        lessons: version.lessons,
        cefr: version.cefr,
        ...(version.weeklyPractice ? { weeklyPractice: version.weeklyPractice } : {})
      });
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
    const validation = validateLessonPublication(version.lessons, version.weeklyPractice, version.cefr);
    const generationValidation = validateGenerationFindingsForPublication(version.generationFindings);
    if (!validation.valid || !generationValidation.valid) return reply.code(409).send({ code: "CONTENT_VALIDATION_FAILED", issues: [...validation.issues, ...generationValidation.issues] });
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
      file_id: string; bucket: string; object_key: string; mime_type: string; size_bytes: number; sha256: string;
      source_flow: "placement" | "daily_lesson" | "weekly_practice" | "season"; source_entity_id: string | null;
      task_key: string | null; question_key: string | null; transcript: string | null; completed_at: Date | null;
      graded_at: Date | null; retention_until: Date | null; deleted_at: Date | null; deleted_by: string | null;
    }>(
      `select f.id as file_id, f.bucket, f.object_key, f.mime_type, f.size_bytes, f.sha256,
              f.source_flow, f.source_entity_id, f.task_key, f.question_key, f.transcript,
              f.completed_at, f.graded_at, f.retention_until, f.deleted_at, f.deleted_by
       from files f join users learner on learner.id = f.owner_user_id
       join users staff on staff.id = $1 and staff.organization_id = learner.organization_id
       where f.purpose = 'assessment_audio' and f.object_key = any($2::text[])`,
      [request.e4sSession!.user.id, artifactKeys]
    ) : { rows: [] };
    const byArtifact = new Map(files.rows.map((file) => [file.object_key, file]));
    const signedArtifacts = new Map<string, { url: string; expiresAt: Date }>();
    if (storage?.presignGetObject) {
      await Promise.all(files.rows.filter((file) => !file.deleted_at).map(async (file) => {
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
      overallCefr: detail.overallCefr ?? null,
      totalTimeSeconds: detail.totalTimeSeconds ?? null,
      totalTimeLimitMinutes: detail.totalTimeLimitMinutes ?? 70,
      ...(detail.taskPrompts ? { taskPrompts: detail.taskPrompts } : {}),
      answers: detail.responses.map((answer) => {
        const artifact = answer.artifactKey ? byArtifact.get(answer.artifactKey) : undefined;
        const signed = answer.artifactKey ? signedArtifacts.get(answer.artifactKey) : undefined;
        return {
          ...answer,
          ...(answer.artifactKey ? { audioArtifact: {
            artifactKey: answer.artifactKey,
            mimeType: artifact?.mime_type ?? null,
            sizeBytes: artifact ? Number(artifact.size_bytes) : null,
            signedUrl: signed ? `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(answer.artifactKey)}` : null,
            expiresAt: signed?.expiresAt.toISOString() ?? null,
            ...(artifact ? {
              fileId: artifact.file_id,
              sha256: artifact.sha256,
              sourceFlow: artifact.source_flow,
              sourceEntityId: artifact.source_entity_id,
              taskKey: artifact.task_key,
              questionKey: artifact.question_key,
              transcript: artifact.transcript,
              completedAt: artifact.completed_at?.toISOString() ?? null,
              gradedAt: artifact.graded_at?.toISOString() ?? null,
              retentionUntil: artifact.retention_until?.toISOString() ?? null,
              cleanupEligible: Boolean(artifact.retention_until && artifact.retention_until.getTime() <= Date.now()),
              deletedAt: artifact.deleted_at?.toISOString() ?? null,
              deletedBy: artifact.deleted_by
            } : {})
          } } : {})
        };
      }),
      scores: detail.scores,
      aiScoring: detail.aiScoring ?? null,
      ...(detail.sections ? { sections: detail.sections } : {}),
      ...(detail.activity ? { activity: detail.activity } : {}),
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
    const runner = await runnerFor(actorId);
    if (!runner) {
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
      const result = await runner.runTask("weekly_practice_grading", input.data, { systemPrompt: task.prompt });
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
    try {
      const saved = await repositories.content.resolveAppeal(
        request.e4sSession!.user.id, params.data.id, body.data.status, body.data.resolution, body.data.newScore
      );
      return saved ? { saved: true } : reply.code(409).send({ code: "APPEAL_NOT_PENDING" });
    } catch (error) {
      if (error instanceof Error && error.message === "PRACTICE_APPEAL_SCORE_REQUIRED") {
        return reply.code(400).send({ code: "PRACTICE_APPEAL_SCORE_REQUIRED" });
      }
      throw error;
    }
  });

  app.get("/api/v1/content/prompts", { preHandler: managers }, async (request): Promise<ContentPromptSettingsView> => {
    const stored = await repositories.content.promptSettings(request.e4sSession!.user.id);
    const byKey = new Map(stored.map((group) => [group.key, group]));
    return {
      groups: promptKeys.flatMap((key) => {
        const group = byKey.get(key);
        return group ? [{ ...group, label: promptLabels[key] }] : [];
      })
    };
  });

  app.put("/api/v1/content/prompts", { preHandler: managers }, async (request, reply) => {
    const input = promptInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ code: "INVALID_CONTENT_PROMPTS" });
    const stored = await repositories.content.savePromptDrafts(request.e4sSession!.user.id, input.data.groups);
    return { groups: stored.map((group) => ({ ...group, label: promptLabels[group.key] })) };
  });

  app.post("/api/v1/content/prompts/:key/:version/publication", { preHandler: managers }, async (request, reply) => {
    const params = promptPublicationParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_PROMPT_VERSION" });
    const published = await repositories.content.publishPromptDraft(
      request.e4sSession!.user.id, params.data.key, params.data.version
    );
    return published
      ? { ...published, label: promptLabels[published.key] }
      : reply.code(404).send({ code: "PROMPT_DRAFT_NOT_FOUND" });
  });
}

function generationFailureDiagnostic(
  week: ContentWeekInput,
  cefr: string,
  task: { promptVersionId: string; prompt: string },
  code: string,
  error?: unknown
) {
  return {
    status: "generation_failed",
    code,
    generatedAt: new Date().toISOString(),
    prompt: { versionId: task.promptVersionId, content: task.prompt },
    input: { ...week, cefr },
    issues: safeGenerationDiagnosticIssues(error)
  };
}

function errorCode(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code)) return code;
  }
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}

function canonicalPartOfSpeech(value: string | undefined): string | undefined {
  const normalized = value?.normalize("NFKC").trim().toLowerCase();
  if (normalized === "noun" || normalized === "danh từ") return "noun";
  if (normalized === "verb" || normalized === "động từ") return "verb";
  if (normalized === "adjective" || normalized === "tính từ") return "adjective";
  if (normalized === "adverb" || normalized === "trạng từ") return "adverb";
  return normalized || undefined;
}
