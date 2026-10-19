import type {
  CefrLevel,
  LearnerHomeView,
  LearnerProfileData,
  LearnerProfileView,
  LessonPartCode,
  LessonPartAttemptEvidenceInput,
  LessonVocabularyContent,
  LessonView,
  MicroLessonView,
  PilotPhase
} from "@e4s/contracts";
import { microGradingOutputSchema, microLessonOutputSchema, type MicroLessonTaskOutput } from "@e4s/ai";
import { createRepositories, type LearnerLessonRecord } from "@e4s/database";
import { isLearnerProfileComplete, mergeLessonProgress } from "@e4s/domain/learning";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { AiTaskRunner } from "../coach/index.js";
import type { ContentMediaService } from "../media/index.js";

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
const lessonAttemptInput = z.object({
  requestId: z.uuid(),
  answer: z.string().max(10_000).optional(),
  artifactKey: z.string().trim().min(1).max(500).optional(),
  translated: z.boolean().optional(),
  evidence: z.object({
    answer: z.string().max(10_000).optional(),
    artifactKey: z.string().trim().min(1).max(500).optional(),
    translated: z.boolean().optional()
  }).optional()
}).superRefine((input, context) => {
  const evidence = input.evidence ?? input;
  if (evidence.answer === undefined && evidence.artifactKey === undefined && !evidence.translated) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "Exercise evidence is required" });
  }
});
const lessonAppealInput = z.object({ reason: z.string().trim().min(3).max(2_000) });
const monthlyGoalInput = z.object({ monthlyGoal: z.string().trim().min(1).max(2_000) });
const rewardAnnouncementAcknowledgeInput = z.object({ announcementId: z.string().trim().min(1).max(200) });

export function registerLearningRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  mediaService?: ContentMediaService
): void {
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

  app.patch("/api/v1/learner/monthly-goal", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = monthlyGoalInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_MONTHLY_GOAL" });
    const saved = await repositories.learning.updateMonthlyGoal(request.e4sSession!.user.id, parsed.data.monthlyGoal);
    return saved ?? reply.code(404).send({ code: "LEARNER_NOT_FOUND" });
  });

  app.post("/api/v1/learner/reward-announcement/acknowledge", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = rewardAnnouncementAcknowledgeInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_REWARD_ANNOUNCEMENT" });
    const acknowledged = await repositories.learning.acknowledgeRewardAnnouncement(
      request.e4sSession!.user.id, parsed.data.announcementId
    );
    if (!acknowledged) return reply.code(409).send({ code: "REWARD_ANNOUNCEMENT_NOT_ACTIVE" });
    return { acknowledged: true, announcementId: parsed.data.announcementId };
  });

  app.get("/api/v1/learner/home", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const [profile, context, progress, weeklyPractice, microLesson] = await Promise.all([
      repositories.learning.getProfile(learnerId),
      repositories.learning.getActiveContext(learnerId),
      repositories.learning.getProgressDashboard(learnerId),
      repositories.engagement.weeklyPractice(learnerId),
      repositories.learning.todayMicroLesson(learnerId)
    ]);
    if (!progress) return reply.code(404).send({ code: "LEARNER_NOT_FOUND" });
    const lifecycle = await repositories.learning.learnerLifecycle(learnerId, progress.points, progress.levelReadiness.eligible);
    const onboardingRequired = !profile || !isLearnerProfileComplete(profile.profile);
    const lessons = context ? await repositories.learning.listLessons(learnerId, context.weekId) : [];
    const summaries = lessons.map((lesson) => ({
      id: lesson.id,
      dayNumber: lesson.dayNumber,
      title: lesson.title,
      status: lesson.progress.status,
      lock: lesson.lock
    }));
    const completedLessons = summaries.filter((lesson) => lesson.status === "completed").length;
    const points = progress.points;
    const view: LearnerHomeView = {
      onboardingRequired,
      learner: { displayName: progress.learner.displayName, cefr: (context?.cefr ?? null) as CefrLevel | null },
      program: context ? { name: context.programName, weekCount: context.weekCount } : null,
      week: context ? {
        id: context.weekId,
        weekNumber: context.weekNumber,
        topic: context.topic,
        description: context.description,
        objectives: context.objectives
      } : null,
      lessons: summaries,
      nextLesson: summaries.find((lesson) => lesson.status !== "completed") ?? null,
      microLesson: microLesson ? {
        id: microLesson.id, topic: microLesson.topic, durationMinutes: microLesson.durationMinutes,
        completed: Boolean(microLesson.completedAt)
      } : null,
      microGenerationAvailable: Boolean(aiRunner),
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
        status: weeklyPractice?.state ?? "locked",
        detail: weeklyPractice?.state === "reviewed" ? "Bài đã được phản hồi theo rubric."
          : weeklyPractice?.state === "submitted" ? "Bài đã nộp và đang chờ phản hồi."
            : weeklyPractice?.state === "draft" ? "Bản nháp đang được lưu."
              : weeklyPractice?.state === "open" ? "Bạn đã mở khoá bài thực hành tuần này."
                : `Mở khi hoàn thành đủ ${summaries.length} bài · hiện có ${completedLessons}/${summaries.length}.`,
        href: "/practice"
      },
      levelReadiness: progress.levelReadiness,
      finalAssessment: {
        available: progress.finalAssessmentAvailable,
        label: "Làm bài cuối kỳ",
        href: "/test/final"
      },
      ...(context ? { pilotPhase: pilotPhaseFor(context.startDate, context.weekCount) satisfies PilotPhase } : {}),
      ...(lifecycle ? {
        levelUpPhase: lifecycle.levelUpPhase,
        monthlyGoal: lifecycle.monthlyGoal,
        rewardAnnouncement: lifecycle.rewardAnnouncement
      } : {})
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

  app.get("/api/v1/lessons/:lessonId/vocabulary/:itemIndex/image", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid(), itemIndex: z.coerce.number().int().nonnegative() }).safeParse(request.params);
    if (!params.success) return reply.code(404).send({ code: "VOCABULARY_IMAGE_NOT_FOUND" });
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    const vocabulary = lesson.content.parts.find((part) => part.code === "vocabulary")?.content as LessonVocabularyContent | undefined;
    const item = vocabulary?.items[params.data.itemIndex];
    if (!item) return reply.code(404).send({ code: "VOCABULARY_IMAGE_NOT_FOUND" });
    if (!mediaService) return { status: "unavailable" };
    try {
      const partOfSpeech = canonicalPartOfSpeech(item.type);
      return await mediaService.resolveForUser(learnerId, {
        term: item.word,
        ...(partOfSpeech ? { partOfSpeech } : {}),
        ...(item.imageQuery ? { imageQuery: item.imageQuery } : {}),
        ...(item.imageUrl ? { explicitImageUrl: item.imageUrl } : {}),
        ...(item.imageAttribution ? { explicitAttribution: item.imageAttribution } : {})
      });
    } catch {
      return { status: "unavailable" };
    }
  });

  app.put("/api/v1/lessons/:lessonId/progress", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    const body = progressInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_PROGRESS" });
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    if (lesson.lock) return reply.code(409).send({ code: "LESSON_LOCKED", lock: lesson.lock });
    const required = lesson.content.parts
      .map((item) => item.code)
      .filter((code): code is LessonPartCode =>
        ["listening", "reading", "writing", "word_class", "word_use", "speaking"].includes(code)
      );
    const merged = mergeLessonProgress(lesson.progress, body.data, required);
    return repositories.learning.saveLessonProgress({ learnerId, lessonId: lesson.id, progress: merged });
  });

  app.post("/api/v1/lessons/:lessonId/parts/:partCode/attempts", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid(), partCode }).safeParse(request.params);
    const body = lessonAttemptInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LESSON_ATTEMPT" });
    const direct = body.data;
    const evidence: LessonPartAttemptEvidenceInput = {};
    const source = direct.evidence ?? direct;
    if (source.answer !== undefined) evidence.answer = source.answer;
    if (source.artifactKey !== undefined) evidence.artifactKey = source.artifactKey;
    if (source.translated !== undefined) evidence.translated = source.translated;
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
    if (lesson.lock) return reply.code(409).send({ code: "LESSON_LOCKED", lock: lesson.lock });
    const result = await repositories.learning.submitLessonPartAttempt({
      learnerId,
      lessonId: params.data.lessonId,
      partCode: params.data.partCode,
      requestId: direct.requestId,
      evidence
    });
    return result ?? reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
  });

  app.post("/api/v1/lessons/:lessonId/parts/:partCode/appeals", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid(), partCode }).safeParse(request.params);
    const body = lessonAppealInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LESSON_APPEAL" });
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
    if (lesson.lock) return reply.code(409).send({ code: "LESSON_LOCKED", lock: lesson.lock });
    const result = await repositories.learning.appealLessonPart({
      learnerId,
      lessonId: params.data.lessonId,
      partCode: params.data.partCode,
      reason: body.data.reason
    });
    return result ?? reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
  });

  app.post("/api/v1/micro-lessons", {
    preHandler: learnerOnly,
    config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const body = z.object({ requestId: z.uuid(), regenerate: z.boolean().optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_REQUEST" });
    if (!aiRunner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const learnerId = request.e4sSession!.user.id;
    const regenerate = body.data.regenerate === true;
    const existing = regenerate ? null : await repositories.learning.todayMicroLesson(learnerId);
    if (existing) return microLessonView(existing, Boolean(aiRunner));
    const [profile, context, task] = await Promise.all([
      repositories.learning.getProfile(learnerId),
      repositories.learning.getActiveContext(learnerId),
      repositories.aiRuns.activeTaskPrompt(learnerId, "micro_lesson_generation")
    ]);
    if (!profile || !context || !context.cefr) return reply.code(409).send({ code: "LEARNER_CONTEXT_NOT_READY" });
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await aiRunner.runTask("micro_lesson_generation", {
        cefr: context.cefr,
        weekTopic: context.topic,
        goals: profile.profile.goals ?? [],
        workContext: [profile.profile.position, profile.profile.department, profile.profile.environmentUse].filter(Boolean).join(" · "),
        learningStyles: profile.profile.learningStyles ?? [],
        explanationLanguage: profile.profile.explanationLanguage ?? "auto",
        durationMinutes: profile.profile.durationMinutes ?? 10
      }, { systemPrompt: task.prompt });
      const output = microLessonOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      await repositories.aiRuns.recordSucceeded({
        userId: learnerId, requestId: body.data.requestId, taskId: task.taskId,
        promptVersionId: task.promptVersionId, output: output.data, metadata: result.metadata
      });
      return reply.code(201).send(microLessonView(await repositories.learning.createMicroLesson({
        learnerId, weekId: context.weekId, cefr: context.cefr as CefrLevel,
        content: {
          ...output.data,
          practice: { ...output.data.practice, ...(output.data.practice.options ? { options: output.data.practice.options } : {}) }
        } as MicroLessonTaskOutput
      }), Boolean(aiRunner)));
    } catch (error) {
      request.log.warn({ error }, "Micro lesson generation failed");
      return reply.code(502).send({ code: "AI_MICRO_LESSON_FAILED" });
    }
  });

  app.get("/api/v1/micro-lessons/:microLessonId", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_ID" });
    const micro = await repositories.learning.findMicroLesson(request.e4sSession!.user.id, params.data.microLessonId);
    return micro ? microLessonView(micro, Boolean(aiRunner)) : reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
  });

  app.post("/api/v1/micro-lessons/:microLessonId/attempts", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    const body = z.object({ answer: z.string().trim().min(1).max(2_000) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_MICRO_ATTEMPT" });
    const learnerId = request.e4sSession!.user.id;
    const [micro, task] = await Promise.all([
      repositories.learning.microLessonForGrading(learnerId, params.data.microLessonId),
      repositories.aiRuns.activeTaskPrompt(learnerId, "micro_grading")
    ]);
    if (!micro) return reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
    const deterministic = () => {
      const objective = micro.practice.type === "mcq" || micro.practice.type === "fill";
      const correct = objective
        ? normalizeAnswer(body.data.answer) === normalizeAnswer(micro.practice.answer)
        : null;
      return repositories.learning.saveMicroAttemptGrade({
        learnerId, microLessonId: params.data.microLessonId, answer: body.data.answer,
        correct, score: correct === null ? null : correct ? 10 : 0,
        feedback: correct === null
          ? "Đã lưu câu trả lời. AI hiện chưa sẵn sàng; người vận hành có thể đọc và phản hồi bài này."
          : correct ? "Đúng rồi. Bạn đã áp dụng đúng mẫu câu của bài."
            : "Chưa đúng. Hãy xem lại mẫu câu và các từ gợi ý rồi thử lại."
      }).then((saved) => saved ? microLessonView(saved, Boolean(aiRunner)) : saved);
    };
    if (!aiRunner || !task) return await deterministic();
    try {
      const requestId = `micro-grade:${params.data.microLessonId}:${Date.now()}`;
      const result = await aiRunner.runTask("micro_grading", {
        cefr: micro.cefr, theory: micro.theory, vocabulary: micro.vocabulary,
        practice: micro.practice, learnerAnswer: body.data.answer
      }, { systemPrompt: task.prompt });
      const output = microGradingOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      await repositories.aiRuns.recordSucceeded({
        userId: learnerId, requestId, taskId: task.taskId, promptVersionId: task.promptVersionId,
        output: output.data, metadata: result.metadata
      });
      const saved = await repositories.learning.saveMicroAttemptGrade({
        learnerId, microLessonId: params.data.microLessonId, answer: body.data.answer,
        correct: output.data.correct, score: output.data.score, feedback: output.data.feedback
      });
      return saved ? microLessonView(saved, Boolean(aiRunner)) : saved;
    } catch (error) {
      request.log.warn({ error }, "Micro lesson grading failed");
      return await deterministic();
    }
  });

  app.post("/api/v1/micro-lessons/:microLessonId/complete", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_ID" });
    const micro = await repositories.learning.completeMicroLesson(request.e4sSession!.user.id, params.data.microLessonId);
    return micro ? microLessonView(micro, Boolean(aiRunner)) : reply.code(409).send({ code: "MICRO_FEEDBACK_REQUIRED" });
  });
}

function microLessonView(micro: MicroLessonView, regenerateAvailable: boolean): MicroLessonView {
  return { ...micro, regenerateAvailable };
}

function normalizeAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
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

function canonicalPartOfSpeech(value: string | undefined): string | undefined {
  const normalized = value?.normalize("NFKC").trim().toLowerCase();
  if (normalized === "noun" || normalized === "danh từ") return "noun";
  if (normalized === "verb" || normalized === "động từ") return "verb";
  if (normalized === "adjective" || normalized === "tính từ") return "adjective";
  if (normalized === "adverb" || normalized === "trạng từ") return "adverb";
  return normalized || undefined;
}

function lessonView(lesson: LearnerLessonRecord): LessonView {
  return {
    id: lesson.id,
    title: lesson.title,
    dayNumber: lesson.dayNumber,
    durationMinutes: lesson.content.durationMinutes ?? 10,
    cefr: lesson.cefr,
    content: { parts: lesson.content.parts },
    progress: lesson.progress,
    lock: lesson.lock
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

function pilotPhaseFor(startDate: string, weekCount: number): PilotPhase {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start)) return "in_pilot";
  const end = start + Math.max(1, weekCount) * 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  return now < start ? "before_pilot" : now < end ? "in_pilot" : "after_pilot";
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
