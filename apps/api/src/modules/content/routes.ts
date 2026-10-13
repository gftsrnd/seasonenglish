import type {
  ContentLessonDraftInput,
  ContentPromptKey,
  ContentPromptSettingsView,
  ContentWeekInput
} from "@e4s/contracts";
import { createRepositories } from "@e4s/database";
import { approveContentVersion, retirePublishedContent, submitContentForReview, validateLessonDraft } from "@e4s/domain/content";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

const weekInput = z.object({
  weekNumber: z.int().min(1).max(52),
  topic: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000),
  objectives: z.string().trim().max(2_000),
  keyVocabHint: z.string().trim().max(1_000)
});
const weeksInput = z.object({ weeks: z.array(weekInput).min(1).max(52) });
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
const lessonDraftsInput = z.object({ lessons: z.array(lessonDraftInput).min(1).max(7) });
const lessonSetParams = z.object({
  week: z.coerce.number().int().min(1).max(52),
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1"])
});
const versionParams = z.object({ versionId: z.uuid() });
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

export function registerContentRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const readers = createRoleGuard(pool, ["operator", "manager"]);
  const operators = createRoleGuard(pool, ["operator"]);

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
