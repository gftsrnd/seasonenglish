import type {
  CefrLevel,
  LearnerHomeView,
  LearnerProfileData,
  LearnerProfileView,
  LessonPartCode,
  LessonView
} from "@e4s/contracts";
import { createRepositories, type LearnerLessonRecord } from "@e4s/database";
import { isLearnerProfileComplete, mergeLessonProgress } from "@e4s/domain/learning";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

const partCode = z.enum([
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
]);
const profileInput = z.object({
  version: z.number().int().nonnegative(),
  fullName: z.string().trim().min(1),
  email: z.email(),
  department: z.string().optional(),
  position: z.string().optional(),
  contact: z.string().optional(),
  goals: z.array(z.string()).min(1),
  environmentUse: z.string().min(1),
  familyUse: z.string().min(1),
  habits: z.array(z.string()).min(1),
  situations: z.string().optional(),
  learningStyles: z.array(z.string()).min(1),
  explanationLanguage: z.enum(["auto", "vi", "en"]).optional(),
  persona: z.enum(["informal", "formal"]),
  durationMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  device: z.enum(["phone", "computer", "both"]),
  selfLevel: z.enum(["unknown", "A1", "A2", "B1", "B2", "C1"]),
  certificates: z.array(z.object({ type: z.string(), result: z.string(), year: z.string().optional() })).optional(),
  experience: z.string().optional(),
  concerns: z.string().optional(),
  avatar: z.object({
    color: z.enum(["ink", "brown", "olive", "taupe", "orange", "rose"]),
    acc: z.enum(["none", "leaf", "sun", "flower", "cloud", "star", "drop", "snow"]),
    bg: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
  }).optional()
});
const partEvidence = z.object({
  attempts: z.number().int().nonnegative(),
  answer: z.string().optional(),
  score: z.number().optional(),
  feedback: z.string().optional(),
  artifactKey: z.string().optional()
});
const progressInput = z.object({
  completedPartCodes: z.array(partCode),
  evidence: z.partialRecord(partCode, partEvidence),
  markComplete: z.boolean().optional(),
  score: z.number().min(0).max(100).optional()
});

export function registerLearningRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/learner/profile", { preHandler: learnerOnly }, async (request, reply) => {
    const record = await repositories.learning.getProfile(request.e4sSession!.user.id);
    if (!record) return reply.code(404).send({ code: "PROFILE_NOT_FOUND" });
    return profileView(record);
  });

  app.put("/api/v1/learner/profile", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = profileInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_PROFILE", issues: parsed.error.issues });
    const { version, ...profile } = parsed.data;
    const complete = isLearnerProfileComplete(profile as LearnerProfileData);
    const saved = await repositories.learning.saveProfile({
      learnerId: request.e4sSession!.user.id,
      profile: profile as LearnerProfileData,
      expectedVersion: version,
      complete
    });
    if (!saved) return reply.code(409).send({ code: "PROFILE_VERSION_CONFLICT" });
    return profileView(saved);
  });

  app.get("/api/v1/learner/home", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const [profile, context, progress] = await Promise.all([
      repositories.learning.getProfile(learnerId),
      repositories.learning.getActiveContext(learnerId),
      repositories.learning.getProgressDashboard(learnerId)
    ]);
    if (!progress) return reply.code(404).send({ code: "LEARNER_NOT_FOUND" });
    const onboardingRequired = !profile || !isLearnerProfileComplete(profile.profile);
    const lessons = context ? await repositories.learning.listLessons(learnerId, context.weekId) : [];
    const summaries = lessons.map((lesson) => ({
      id: lesson.id,
      dayNumber: lesson.dayNumber,
      title: lesson.title,
      status: lesson.progress.status
    }));
    const completedLessons = summaries.filter((lesson) => lesson.status === "completed").length;
    const points = progress.points;
    const view: LearnerHomeView = {
      onboardingRequired,
      learner: { displayName: progress.learner.displayName, cefr: (context?.cefr ?? null) as CefrLevel | null },
      program: context ? { name: context.programName } : null,
      week: context ? {
        id: context.weekId,
        weekNumber: context.weekNumber,
        topic: context.topic,
        description: context.description,
        objectives: context.objectives
      } : null,
      lessons: summaries,
      nextLesson: summaries.find((lesson) => lesson.status !== "completed") ?? null,
      metrics: {
        completedLessons,
        totalLessons: summaries.length,
        studyDays: progress.studyDays,
        streakDays: calculateCurrentStreak(progress.activity.map((item) => item.occurredAt)),
        points
      },
      schedule: buildSchedule(
        Number(progress.learner.profile.durationMinutes ?? 10),
        progress.activity.map((item) => item.occurredAt)
      ),
      coach: { turnsThisWeek: progress.stats.coachTurns, targetTurns: 2, href: "/coach" },
      practice: {
        status: summaries.length > 0 && completedLessons === summaries.length ? "reviewed" : "locked",
        detail: summaries.length > 0 && completedLessons === summaries.length
          ? "Bạn đã mở khoá bài thực hành tuần này."
          : `Mở khi hoàn thành đủ ${summaries.length} bài · hiện có ${completedLessons}/${summaries.length}.`,
        href: "/practice"
      },
      levelReadiness: progress.levelReadiness,
      finalAssessment: {
        available: progress.finalAssessmentAvailable,
        label: "Làm bài cuối kỳ",
        href: "/test/final"
      }
    };
    return view;
  });

  app.get("/api/v1/learner/progress", { preHandler: learnerOnly }, async (request, reply) => {
    const view = await repositories.learning.getProgressDashboard(request.e4sSession!.user.id);
    return view ?? reply.code(404).send({ code: "LEARNER_NOT_FOUND" });
  });

  app.get("/api/v1/lessons/:lessonId", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LESSON_ID" });
    const lesson = await repositories.learning.findLesson(request.e4sSession!.user.id, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    return lessonView(lesson);
  });

  app.put("/api/v1/lessons/:lessonId/progress", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    const body = progressInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_PROGRESS" });
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    const required = lesson.content.parts
      .map((item) => item.code)
      .filter((code): code is LessonPartCode =>
        ["listening", "reading", "writing", "word_class", "word_use", "speaking"].includes(code)
      );
    const merged = mergeLessonProgress(lesson.progress, body.data, required);
    return repositories.learning.saveLessonProgress({ learnerId, lessonId: lesson.id, progress: merged });
  });

  app.get("/api/v1/micro-lessons/:microLessonId", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_ID" });
    const micro = await repositories.learning.findMicroLesson(request.e4sSession!.user.id, params.data.microLessonId);
    return micro ?? reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
  });

  app.post("/api/v1/micro-lessons/:microLessonId/attempts", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    const body = z.object({ answer: z.string().trim().min(1).max(2_000) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_MICRO_ATTEMPT" });
    const micro = await repositories.learning.submitMicroAttempt(
      request.e4sSession!.user.id,
      params.data.microLessonId,
      body.data.answer
    );
    return micro ?? reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
  });

  app.post("/api/v1/micro-lessons/:microLessonId/complete", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_ID" });
    const micro = await repositories.learning.completeMicroLesson(request.e4sSession!.user.id, params.data.microLessonId);
    return micro ?? reply.code(409).send({ code: "MICRO_FEEDBACK_REQUIRED" });
  });
}

function profileView(record: {
  profile: Partial<LearnerProfileData>;
  version: number;
  completedAt: Date | null;
  updatedAt: Date;
}): LearnerProfileView {
  return {
    profile: record.profile as LearnerProfileData,
    completed: Boolean(record.completedAt) && isLearnerProfileComplete(record.profile),
    version: record.version,
    updatedAt: record.updatedAt.toISOString()
  };
}

function lessonView(lesson: LearnerLessonRecord): LessonView {
  return {
    id: lesson.id,
    title: lesson.title,
    dayNumber: lesson.dayNumber,
    durationMinutes: lesson.content.durationMinutes ?? 10,
    cefr: lesson.cefr,
    content: { parts: lesson.content.parts },
    progress: lesson.progress
  };
}

function calculateCurrentStreak(occurredAt: string[]): number {
  const dates = new Set(occurredAt.map((value) => value.slice(0, 10)));
  let cursor = new Date();
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function buildSchedule(lessonMinutes: number, occurredAt: string[]): LearnerHomeView["schedule"] {
  const today = new Date();
  const utcDay = today.getUTCDay();
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((utcDay + 6) % 7));
  const activityDates = new Set(occurredAt.map((value) => value.slice(0, 10)));
  const labels = ["T2", "T3", "T4", "T5", "T6"];
  const todayKey = today.toISOString().slice(0, 10);
  return {
    daysPerWeek: 5,
    lessonMinutes,
    days: labels.map((label, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const status = activityDates.has(key) ? "attended"
        : key === todayKey ? "today"
          : key < todayKey ? "missed" : "upcoming";
      return { label, date: key, status };
    })
  };
}
