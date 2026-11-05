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
  MonthlyExamEligibilityView
} from "@e4s/contracts";
import { buildPronunciationAssets, microGradingOutputSchema, microLessonOutputSchema, type AiTaskRunner, type MicroLessonTaskOutput } from "@e4s/ai";
import { createRepositories, type LearnerLessonRecord } from "@e4s/database";
import { gradeLessonAnswer, validateGeneratedFeedback } from "@e4s/domain/content";
import { evaluateMonthlyExamEligibility } from "@e4s/domain/progression";
import { isLearnerProfileComplete, mergeLessonProgress } from "@e4s/domain/learning";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { ContentMediaService } from "../media/index.js";

const partCode = z.enum([
  "objective", "instruction", "vocabulary", "grammar", "pronunciation",
  "listening", "reading", "writing", "word_class", "word_use", "speaking"
]);
const studyPartCodes = ["objective", "vocabulary", "grammar", "pronunciation"] as const satisfies readonly LessonPartCode[];
const practicePartCodes = ["listening", "reading", "writing", "word_class", "word_use", "speaking"] as const satisfies readonly LessonPartCode[];
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
const profileDraftInput = profileInput.extend({
  fullName: z.string().trim().max(200),
  email: z.string().trim().max(320),
  goals: z.array(z.string()),
  environmentUse: z.string(),
  familyUse: z.string(),
  habits: z.array(z.string()),
  learningStyles: z.array(z.string())
}).partial().required({ version: true });
const partEvidence = z.object({
  attempts: z.number().int().nonnegative(),
  answer: z.string().optional(),
  score: z.number().optional(),
  feedback: z.string().optional(),
  artifactKey: z.string().optional()
});
const progressInput = z.object({
  markComplete: z.boolean().optional()
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
const lessonAppealInput = z.object({ reason: z.string().trim().min(5).max(2_000) });
const monthlyGoalInput = z.object({ monthlyGoal: z.string().trim().min(1).max(2_000) });
const rewardAnnouncementAcknowledgeInput = z.object({ announcementId: z.string().trim().min(1).max(200) });

export function registerLearningRoutes(
  app: FastifyInstance,
  pool: Pool,
  aiRunner?: AiTaskRunner,
  mediaService?: ContentMediaService,
  aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>
): void {
  const repositories = createRepositories(pool);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);
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
    let saved: Awaited<ReturnType<typeof repositories.learning.saveProfile>>;
    try {
      saved = await repositories.learning.saveProfile({
        learnerId: request.e4sSession!.user.id,
        profile: profile as LearnerProfileData,
        expectedVersion: version,
        complete
      });
    } catch (error) {
      if (error instanceof Error && error.message === "LEARNER_PROFILE_EMAIL_EXISTS") {
        return reply.code(409).send({ code: error.message });
      }
      throw error;
    }
    if (!saved) return reply.code(409).send({ code: "PROFILE_VERSION_CONFLICT" });
    return profileView(saved);
  });

  app.put("/api/v1/learner/profile/draft", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = profileDraftInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_PROFILE_DRAFT", issues: parsed.error.issues });
    const { version, ...profile } = parsed.data;
    const saved = await repositories.learning.saveProfileDraft({
      learnerId: request.e4sSession!.user.id,
      profile: profile as Partial<LearnerProfileData>,
      expectedVersion: version
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
    const [profile, monthlyContext, progress, microLesson, runner, monthlyEligibility] = await Promise.all([
      repositories.learning.getProfile(learnerId),
      repositories.learning.getActiveMonthlyContext(learnerId),
      repositories.learning.getProgressDashboard(learnerId),
      repositories.learning.todayMicroLesson(learnerId),
      runnerFor(learnerId),
      monthlyExamEligibility(pool, learnerId)
    ]);
    if (!progress) return reply.code(404).send({ code: "LEARNER_NOT_FOUND" });
    const lifecycle = monthlyContext
      ? await repositories.learning.learnerLifecycle(learnerId, progress.points, progress.levelReadiness.eligible)
      : null;
    const onboardingRequired = !profile || !isLearnerProfileComplete(profile.profile);
    const lessons = monthlyContext
      ? await repositories.learning.listMonthlyLessons(learnerId, monthlyContext.month)
      : [];
    const summaries = lessons.map((lesson) => ({
      id: lesson.id,
      dayNumber: lesson.dayNumber,
      title: learnerLessonDisplayTitle(lesson),
      status: lesson.progress.status,
      lock: lesson.lock,
      ...(lesson.lessonDate ? { lessonDate: lesson.lessonDate } : {}),
      ...(lesson.monthlyKind ? { kind: lesson.monthlyKind } : {})
    }));
    const completedLessons = summaries.filter((lesson) => lesson.status === "completed").length;
    const reviewLessons = summaries.filter((lesson) => lesson.kind === "review");
    const completedReviews = reviewLessons.filter((lesson) => lesson.status === "completed").length;
    const totalReviews = reviewLessons.length;
    const persistedMonthlyExamStatus = progress.monthlyProgress?.exam.status ?? "unpublished";
    const monthlyExamStatus = persistedMonthlyExamStatus === "completed"
      ? "completed" as const
      : monthlyEligibility.accessEligible ? "ready" as const : persistedMonthlyExamStatus === "unpublished" ? "unpublished" as const : "locked" as const;
    const points = monthlyContext ? progress.points : 0;
    const inactiveDays = monthlyContext
      ? calculateInactiveDays(progress.activity.map((item) => item.occurredAt), `${monthlyContext.month}-01`)
      : null;
    const view: LearnerHomeView = {
      onboardingRequired,
      learner: { displayName: progress.learner.displayName, cefr: (monthlyContext?.cefr ?? progress.learner.cefr ?? null) as CefrLevel | null },
      program: null,
      week: null,
      month: monthlyContext ? {
        month: monthlyContext.month,
        themeTitle: monthlyContext.themeTitle,
        themeBrief: monthlyContext.themeBrief,
        communicationGoal: monthlyContext.communicationGoal,
        examDate: monthlyContext.examDate,
        systemDate: monthlyContext.systemDate
      } : null,
      monthlyPreparation: !monthlyContext,
      monthlyEligibility,
      monthlyExam: monthlyContext ? {
        status: monthlyExamStatus,
        completedLessons,
        totalLessons: summaries.length,
        remainingLessons: Math.max(0, summaries.length - completedLessons),
        requirement: monthlyExamStatus === "completed"
          ? "Bạn đã hoàn thành bài thi tháng."
          : monthlyExamStatus === "unpublished"
            ? "Bài thi tháng đang chờ người vận hành phát hành."
            : !monthlyEligibility.lessonsEligible
            ? `Hoàn thành đủ ${monthlyEligibility.scheduledLessons ?? summaries.length} bài học theo lịch tháng.`
            : !monthlyEligibility.attendanceEligible
            ? "Số ngày vắng đã vượt giới hạn tháng; cần Manager xử lý kháng nghị."
            : !monthlyEligibility.seasonEligible
            ? `Đạt đủ ${monthlyEligibility.seasonTurnsRequired ?? 100} lượt hợp lệ với Season trong tháng.`
            : completedLessons < summaries.length
          ? `Hoàn thành ${summaries.length - completedLessons} bài còn lại để mở bài thi tháng.`
          : "Bạn đã hoàn thành điều kiện. Bài thi tháng đã sẵn sàng.",
        certificateEligible: monthlyContext.cefr === "C1"
      } : null,
      lessons: summaries,
      nextLesson: summaries.find((lesson) => lesson.status !== "completed") ?? null,
      microLesson: microLesson ? {
        id: microLesson.id, topic: microLesson.topic, durationMinutes: microLesson.durationMinutes,
        completed: Boolean(microLesson.completedAt)
      } : null,
      microGenerationAvailable: Boolean(runner),
      metrics: {
        completedLessons,
        totalLessons: summaries.length,
        studyDays: monthlyContext ? progress.studyDays : 0,
        streakDays: monthlyContext ? calculateCurrentStreak(progress.activity.map((item) => item.occurredAt)) : 0,
        points,
        completedReviews,
        totalReviews,
        monthlyExamStatus
      },
      ...(inactiveDays !== null && inactiveDays >= 2 ? { inactivityReminder: { inactiveDays } } : {}),
      schedule: monthlyContext
        ? buildMonthlySchedule(summaries, monthlyContext.systemDate, Number(progress.learner.profile.durationMinutes ?? 10))
        : buildSchedule(Number(progress.learner.profile.durationMinutes ?? 10), []),
      coach: { turnsToday: monthlyContext ? progress.stats.coachTurnsToday ?? 0 : 0, turnsThisWeek: monthlyContext ? progress.stats.coachTurns : 0, targetTurns: 30, href: "/coach" },
      practice: {
        status: "locked",
        detail: monthlyContext
          ? `Mở khi hoàn thành đủ ${summaries.length} bài · hiện có ${completedLessons}/${summaries.length}.`
          : "Mở khi bộ bài tháng đã được phát hành.",
        href: "/practice"
      },
      levelReadiness: progress.levelReadiness,
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

  app.get("/api/v1/learner/months/:month/exam", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MONTH" });
    const learnerId = request.e4sSession!.user.id;
    const [context, eligibility] = await Promise.all([
      repositories.learning.getActiveMonthlyContext(learnerId),
      monthlyExamEligibility(pool, learnerId)
    ]);
    if (!context || context.month !== params.data.month) return reply.code(404).send({ code: "MONTHLY_EXAM_NOT_AVAILABLE" });
    if (!eligibility.accessEligible) return reply.code(409).send({ code: "MONTHLY_EXAM_NOT_ELIGIBLE", eligibility });
    const lessons = await repositories.learning.listMonthlyLessons(learnerId, context.month);
    const completedLessons = lessons.filter((lesson) => lesson.progress.status === "completed").length;
    const totalLessons = lessons.length;
    const remainingLessons = Math.max(0, totalLessons - completedLessons);
    return {
      month: context.month,
      title: `Bài thi tháng · ${context.themeTitle}`,
      examDate: context.examDate,
      status: eligibility.accessEligible ? "ready" as const : "locked" as const,
      completedLessons,
      totalLessons,
      remainingLessons,
      requirement: eligibility.accessEligible
        ? "Bài thi tháng cố định đã sẵn sàng cho trình độ của bạn."
        : eligibility.accessState === "appeal_required"
          ? "Số ngày vắng vượt giới hạn. Gửi khiếu nại cho Quản lý để được xem xét."
          : "Bài thi tháng mở vào ngày thi sau khi form đã được phát hành.",
      certificateEligible: context.cefr === "C1"
    };
  });

  app.get("/api/v1/learner/months/:month", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MONTH" });
    const lessons = await repositories.learning.listMonthlyLessons(request.e4sSession!.user.id, params.data.month);
    return {
      month: params.data.month,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        dayNumber: lesson.dayNumber,
        title: learnerLessonDisplayTitle(lesson),
        status: lesson.progress.status,
        lock: lesson.lock
      }))
    };
  });

  app.get("/api/v1/lessons/:lessonId", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LESSON_ID" });
    const lesson = await repositories.learning.findLesson(request.e4sSession!.user.id, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    return learnerLessonView(lesson);
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
        allowProviderFallback: true,
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
      .filter((code): code is LessonPartCode => practicePartCodes.includes(code as typeof practicePartCodes[number]));
    if (body.data.markComplete) {
      // Completion is a server-owned transition.  The client may ask to finish,
      // but it cannot manufacture the required exercise evidence in that request.
      const completion = mergeLessonProgress(lesson.progress, {
        completedPartCodes: [],
        evidence: {},
        markComplete: true,
        ...(lesson.progress.score === undefined ? {} : { score: lesson.progress.score })
      }, required);
      if (completion.status !== "completed") {
        return reply.code(409).send({ code: "LESSON_INCOMPLETE" });
      }
      return repositories.learning.saveLessonProgress({ learnerId, lessonId: lesson.id, progress: completion });
    }
    return lesson.progress;
  });

  app.post("/api/v1/lessons/:lessonId/study-completion", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LESSON" });
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    if (lesson.lock) return reply.code(409).send({ code: "LESSON_LOCKED", lock: lesson.lock });
    const completedPartCodes = lesson.content.parts
      .map((item) => item.code)
      .filter((code): code is LessonPartCode => studyPartCodes.includes(code as typeof studyPartCodes[number]));
    const merged = mergeLessonProgress(lesson.progress, { completedPartCodes, evidence: {} }, []);
    const progress = lesson.progress.status === "completed" ? { ...merged, status: "completed" as const } : merged;
    return repositories.learning.saveLessonProgress({ learnerId, lessonId: lesson.id, progress });
  });

  app.post("/api/v1/lessons/:lessonId/pronunciation/listens", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid() }).safeParse(request.params);
    const body = z.object({ word: z.string().trim().min(1).max(120) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_PRONUNCIATION_LISTEN" });
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_NOT_FOUND" });
    if (lesson.lock) return reply.code(409).send({ code: "LESSON_LOCKED", lock: lesson.lock });
    const targetWords = pronunciationWordsForLesson(lesson).slice(0, 3);
    const match = targetWords.find((word) => word.toLocaleLowerCase() === body.data.word.toLocaleLowerCase());
    if (!match) return reply.code(422).send({ code: "PRONUNCIATION_WORD_NOT_ASSIGNED" });
    const listened = new Set(recordedPronunciationWords(lesson.progress.evidence.pronunciation?.answer));
    listened.add(match);
    return repositories.learning.saveLessonProgress({
      learnerId,
      lessonId: lesson.id,
      progress: {
        ...lesson.progress,
        evidence: {
          ...lesson.progress.evidence,
          pronunciation: { ...(lesson.progress.evidence.pronunciation ?? { attempts: 0 }), answer: JSON.stringify([...listened]) }
        }
      }
    });
  });

  app.post("/api/v1/lessons/:lessonId/parts/:partCode/attempts", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ lessonId: z.uuid(), partCode }).safeParse(request.params);
    const body = lessonAttemptInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LESSON_ATTEMPT" });
    const direct = body.data;
    const evidence: LessonPartAttemptEvidenceInput = {};
    const source = direct.evidence ?? direct;
    // Speaking is submitted as audio evidence only. A learner must never be able
    // to supply or overwrite a transcript through this endpoint.
    if (source.answer !== undefined && params.data.partCode !== "speaking") evidence.answer = source.answer;
    if (source.artifactKey !== undefined) evidence.artifactKey = source.artifactKey;
    if (source.translated !== undefined) evidence.translated = source.translated;
    const learnerId = request.e4sSession!.user.id;
    const lesson = await repositories.learning.findLesson(learnerId, params.data.lessonId);
    if (!lesson) return reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
    if (lesson.lock) return reply.code(409).send({ code: "LESSON_LOCKED", lock: lesson.lock });
    const part = lesson.content.parts.find((candidate) => candidate.code === params.data.partCode);
    if (!part || !practicePartCodes.includes(part.code as typeof practicePartCodes[number])) {
      return reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
    }
    const requiredStudy = lesson.content.parts
      .map((candidate) => candidate.code)
      .filter((code): code is LessonPartCode => studyPartCodes.includes(code as typeof studyPartCodes[number]));
    if (requiredStudy.some((code) => !lesson.progress.completedPartCodes.includes(code))) {
      return reply.code(409).send({ code: "LESSON_STUDY_INCOMPLETE" });
    }
    if (params.data.partCode === "speaking") {
      const requiredWords = pronunciationWordsForLesson(lesson).slice(0, 3);
      const listened = new Set(recordedPronunciationWords(lesson.progress.evidence.pronunciation?.answer).map((word) => word.toLocaleLowerCase()));
      if (requiredWords.some((word) => !listened.has(word.toLocaleLowerCase()))) {
        return reply.code(409).send({ code: "PRONUNCIATION_LISTENING_REQUIRED" });
      }
    }
    if (evidence.translated && !["wrong_retry", "wrong_exhausted"].includes(lesson.progress.evidence[params.data.partCode]?.status ?? "")) {
      return reply.code(409).send({ code: "LESSON_TRANSLATION_NOT_AVAILABLE" });
    }
    if (!evidence.translated && part?.code === "writing" && isSelfWritingContent(part.content) && lessonAnswerWordCount(evidence.answer) < 2) {
      return reply.code(422).send({ code: "LESSON_WRITING_TOO_SHORT", minimumWords: 2 });
    }
    if (!evidence.translated && (lesson.progress.evidence[params.data.partCode]?.attempts ?? 0) >= 2) {
      return reply.code(409).send({ code: "LESSON_ATTEMPTS_EXHAUSTED" });
    }
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
    const part = lesson.content.parts.find((candidate) => candidate.code === params.data.partCode);
    if (!part || !practicePartCodes.includes(part.code as typeof practicePartCodes[number])) {
      return reply.code(404).send({ code: "LESSON_PART_NOT_FOUND" });
    }
    const existingAppeal = await repositories.learning.findLessonPartAppeal(
      learnerId,
      params.data.lessonId,
      params.data.partCode
    );
    if (existingAppeal) return existingAppeal;
    const requiredStudy = lesson.content.parts
      .map((candidate) => candidate.code)
      .filter((code): code is LessonPartCode => studyPartCodes.includes(code as typeof studyPartCodes[number]));
    if (requiredStudy.some((code) => !lesson.progress.completedPartCodes.includes(code))) {
      return reply.code(409).send({ code: "LESSON_STUDY_INCOMPLETE" });
    }
    if (!["wrong_exhausted", "appealed"].includes(lesson.progress.evidence[params.data.partCode]?.status ?? "")) {
      return reply.code(409).send({ code: "LESSON_APPEAL_NOT_AVAILABLE" });
    }
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
    const learnerId = request.e4sSession!.user.id;
    const runner = await runnerFor(learnerId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
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
      const explanationLanguage = resolveExplanationLanguage(context.cefr, profile.profile.explanationLanguage);
      const result = await runner.runTask("micro_lesson_generation", {
        cefr: context.cefr,
        weekTopic: context.topic,
        goals: profile.profile.goals ?? [],
        workContext: [profile.profile.position, profile.profile.department, profile.profile.environmentUse].filter(Boolean).join(" · "),
        learningStyles: profile.profile.learningStyles ?? [],
        explanationLanguage,
        durationMinutes: profile.profile.durationMinutes ?? 10
      }, { systemPrompt: buildMicroLessonSystemPrompt(task.prompt, context.cefr, explanationLanguage) });


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
      }), Boolean(runner)));
    } catch (error) {
      request.log.warn({ error }, "Micro lesson generation failed");
      return reply.code(502).send({ code: "AI_MICRO_LESSON_FAILED" });
    }
  });

  app.get("/api/v1/micro-lessons/:microLessonId", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_ID" });
    const learnerId = request.e4sSession!.user.id;
    const [micro, runner] = await Promise.all([
      repositories.learning.findMicroLesson(learnerId, params.data.microLessonId),
      runnerFor(learnerId),
      monthlyExamEligibility(pool, learnerId)
    ]);
    return micro ? microLessonView(micro, Boolean(runner)) : reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
  });

  app.post("/api/v1/micro-lessons/:microLessonId/attempts", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    const body = z.object({ answer: z.string().trim().min(1).max(2_000) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_MICRO_ATTEMPT" });
    const learnerId = request.e4sSession!.user.id;
    const [micro, profile, task, runner] = await Promise.all([
      repositories.learning.microLessonForGrading(learnerId, params.data.microLessonId),
      repositories.learning.getProfile(learnerId),
      repositories.aiRuns.activeTaskPrompt(learnerId, "micro_grading"),
      runnerFor(learnerId),
      monthlyExamEligibility(pool, learnerId)
    ]);
    if (!micro) return reply.code(404).send({ code: "MICRO_LESSON_NOT_FOUND" });
    const policyGrade = gradeMicroAttempt({
      type: micro.practice.type,
      answer: body.data.answer,
      expected: micro.practice.answer,
      aiAvailable: Boolean(runner && task)
    });
    if (policyGrade.status === "invalid") {
      return reply.code(422).send({ code: "MICRO_ANSWER_TOO_SHORT", minimumWords: 2 });
    }
    const deterministic = () => {
      const fallbackGrade = gradeMicroAttempt({
        type: micro.practice.type,
        answer: body.data.answer,
        expected: micro.practice.answer,
        aiAvailable: false
      });
      const correct = fallbackGrade.correct;
      return repositories.learning.saveMicroAttemptGrade({
        learnerId, microLessonId: params.data.microLessonId, answer: body.data.answer,
        correct, score: correct === null ? null : correct ? 10 : 0,
        feedback: correct === null
          ? "Đã lưu câu trả lời. AI hiện chưa sẵn sàng; người vận hành có thể đọc và phản hồi bài này."
          : correct ? "Đúng rồi. Bạn đã áp dụng đúng mẫu câu của bài."
            : "Chưa đúng. Hãy xem lại mẫu câu và các từ gợi ý rồi thử lại."
      }).then((saved) => saved ? microLessonView(saved, Boolean(runner)) : saved);
    };
    if (!runner || !task) return await deterministic();
    try {
      const requestId = `micro-grade:${params.data.microLessonId}:${Date.now()}`;
      const explanationLanguage = resolveExplanationLanguage(micro.cefr, profile?.profile.explanationLanguage);
      const result = await runner.runTask("micro_grading", {
        cefr: micro.cefr, explanationLanguage, theory: micro.theory, vocabulary: micro.vocabulary, practice: micro.practice, learnerAnswer: body.data.answer,

      }, { systemPrompt: buildMicroGradingSystemPrompt(task.prompt, micro.cefr, explanationLanguage) });



      const output = microGradingOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      if (!validateGeneratedFeedback({
        answer: body.data.answer,
        feedback: output.data.feedback,
        citedError: output.data.citedError
      })) {
        request.log.warn("Micro grading feedback cited evidence absent from the learner answer");
        return await deterministic();
      }
      await repositories.aiRuns.recordSucceeded({
        userId: learnerId, requestId, taskId: task.taskId, promptVersionId: task.promptVersionId,
        output: output.data, metadata: result.metadata
      });
      const saved = await repositories.learning.saveMicroAttemptGrade({
        learnerId, microLessonId: params.data.microLessonId, answer: body.data.answer,
        correct: output.data.correct, score: output.data.score, feedback: output.data.feedback
      });
      return saved ? microLessonView(saved, Boolean(runner)) : saved;
    } catch (error) {
      request.log.warn({ error }, "Micro lesson grading failed");
      return await deterministic();
    }
  });

  app.post("/api/v1/micro-lessons/:microLessonId/complete", { preHandler: learnerOnly }, async (request, reply) => {
    const params = z.object({ microLessonId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_MICRO_LESSON_ID" });
    const learnerId = request.e4sSession!.user.id;
    const [micro, runner] = await Promise.all([
      repositories.learning.completeMicroLesson(learnerId, params.data.microLessonId),
      runnerFor(learnerId),
      monthlyExamEligibility(pool, learnerId)
    ]);
    return micro ? microLessonView(micro, Boolean(runner)) : reply.code(409).send({ code: "MICRO_FEEDBACK_REQUIRED" });
  });
}

function microLessonView(micro: MicroLessonView, regenerateAvailable: boolean): MicroLessonView {
  return { ...micro, regenerateAvailable };
}

export function resolveExplanationLanguage(
  cefr: string,
  explanationLanguage?: "auto" | "vi" | "en" | null
): "vi" | "en" {
  if (explanationLanguage === "vi" || explanationLanguage === "en") {
    return explanationLanguage;
  }
  return ["A1", "A2"].includes(cefr) ? "vi" : "en";
}

export function buildMicroLessonSystemPrompt(
  basePrompt: string,
  cefr: string,
  explanationLanguage: "vi" | "en"
): string {
  const activeRule = ["A1", "A2"].includes(cefr)
    ? `Active CEFR ${cefr} (explanationLanguage=${explanationLanguage}): Write all explanations and instructions in Vietnamese; keep English target phrases, examples, and options in English.`
    : `Active CEFR ${cefr} (explanationLanguage=${explanationLanguage}): Use English-only explanations and instructions, except Vietnamese vocabulary meanings.`;
  return `${basePrompt.trim()}\n\nCEFR LANGUAGE POLICY: A1-A2 must use Vietnamese explanations/instructions; B1-C1 must use English-only explanations/instructions except Vietnamese vocabulary meanings. ${activeRule}`;
}

export function buildMicroGradingSystemPrompt(
  basePrompt: string,
  cefr: string,
  explanationLanguage: "vi" | "en"
): string {
  const feedbackRule = explanationLanguage === "vi"
    ? "Write learner feedback in Vietnamese (explanationLanguage=vi)."
    : "Write learner feedback in English (explanationLanguage=en).";
  const tesolInstructions = [
    `TESOL GRADING POLICY (CEFR ${cefr}, explanationLanguage=${explanationLanguage}):`,
    `- ${feedbackRule}`,
    "- Accept alternative grammatical answers that fit the taught pattern and context, even when they differ from the reference answer.",
    "- Distinguish target-language errors from minor non-target slips; penalize primarily target-language errors or errors that block meaning.",
    "- Ignore minor capitalization, punctuation, and ASR filler noise (such as 'um' or 'uh') when the target pattern and meaning are accurate."
  ].join("\n");
  return `${basePrompt.trim()}\n\n${tesolInstructions}`;
}

export function gradeMicroAttempt(input: {
  type: "mcq" | "write" | "fill";
  answer: string;
  expected: string;
  aiAvailable: boolean;
}) {
  return gradeLessonAnswer({
    kind: input.type === "write" ? "self_writing" : "objective",
    answer: input.answer,
    acceptedAnswers: [input.expected],
    aiAvailable: input.aiAvailable
  });
}

function profileView(record: {
  profile: Partial<LearnerProfileData>;
  completedProfile?: Partial<LearnerProfileData>;
  draftAvailable?: boolean;
  version: number;
  completedAt: Date | null;
  updatedAt: Date;
}): LearnerProfileView {
  return {
    profile: record.profile as LearnerProfileData,
    completed: Boolean(record.completedAt) && isLearnerProfileComplete(record.completedProfile ?? record.profile),
    draftAvailable: Boolean(record.draftAvailable),
    version: record.version,
    updatedAt: record.updatedAt.toISOString()
  };
}

function pronunciationWordsForLesson(lesson: { content: { parts: Array<{ code: string; content: Record<string, unknown> }> } }): string[] {
  const words = lesson.content.parts.find((part) => part.code === "pronunciation")?.content.words;
  if (!Array.isArray(words)) return [];
  return words.flatMap((entry) => {
    if (typeof entry === "string" && entry.trim()) return [entry.trim()];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const word = (entry as Record<string, unknown>).word;
      return typeof word === "string" && word.trim() ? [word.trim()] : [];
    }
    return [];
  });
}

function recordedPronunciationWords(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === "string" && word.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function canonicalPartOfSpeech(value: string | undefined): string | undefined {
  const normalized = value?.normalize("NFKC").trim().toLowerCase();
  if (normalized === "noun" || normalized === "danh từ") return "noun";
  if (normalized === "verb" || normalized === "động từ") return "verb";
  if (normalized === "adjective" || normalized === "tính từ") return "adjective";
  if (normalized === "adverb" || normalized === "trạng từ") return "adverb";
  return normalized || undefined;
}

export function learnerLessonView(lesson: LearnerLessonRecord): LessonView {
  const parts = lesson.content.parts.map((part) => {
    if (part.code !== "pronunciation") return part;
    const content = part.content as Record<string, unknown>;
    const { phonemeAudioId: _legacyPhonemeAudioId, phonemeAudioUrl: _legacyPhonemeAudioUrl, ...safeContent } = content;
    if (Array.isArray(content.wordAudioUrls) && content.wordAudioUrls.some((url) => typeof url === "string" && url.trim())) {
      return { ...part, content: safeContent };
    }
    const focus = typeof content.focus === "string" ? content.focus : "";
    const words = Array.isArray(content.words) ? content.words.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const word = item as Record<string, unknown>;
      return typeof word.word === "string" && typeof word.ipa === "string"
        ? [{ word: word.word, ipa: word.ipa }]
        : [];
    }) : [];
    const assets = buildPronunciationAssets(focus, words);
    return {
      ...part,
      content: {
        ...safeContent,
        ...(assets.wordAudioUrls.length ? { wordAudioUrls: assets.wordAudioUrls } : {})
      }
    };
  });
  return {
    id: lesson.id,
    title: learnerLessonDisplayTitle(lesson),
    dayNumber: lesson.dayNumber,
    weekNumber: lesson.weekNumber,
    weekTopic: lesson.weekTopic,
    durationMinutes: lesson.content.durationMinutes ?? 10,
    cefr: lesson.cefr,
    content: { parts },
    progress: lesson.progress,
    lock: lesson.lock
  };
}

function lessonAnswerWordCount(answer: string | undefined): number {
  return answer?.trim().split(/\s+/u).filter(Boolean).length ?? 0;
}

function isSelfWritingContent(content: Record<string, unknown>): boolean {
  return content.type === undefined || content.type === "write";
}

export function learnerLessonDisplayTitle(lesson: LearnerLessonRecord): string {
  const grammar = lesson.content.parts.find((part) => part.code === "grammar");
  const grammarContent = grammar?.content && typeof grammar.content === "object"
    ? grammar.content as Record<string, unknown>
    : undefined;
  const grammarAvailable = Boolean(
    grammarContent
      && grammarContent.hidden !== true
      && grammarContent.status !== "unavailable"
      && typeof grammarContent.formula === "string"
      && grammarContent.formula.trim()
  );
  if (!grammarAvailable) return lesson.weekTopic.trim() || `Bài học T${lesson.dayNumber + 1}`;
  const title = lesson.title.trim();
  if (!/^S\s*\+\s*V(?:\s*\+\s*O)?$/i.test(title)) return title;
  const examples = grammarContent?.examples;
  const example = Array.isArray(examples) && typeof examples[0] === "string" ? examples[0].trim() : "";
  const englishExample = example.split(/\s+\(/, 1)[0]?.trim() ?? "";
  return englishExample ? englishExample.replace(/[.!?]+$/, "").slice(0, 60) : title;
}

function calculateCurrentStreak(occurredAt: string[]): number {
  const dates = new Set(occurredAt.map((value) => value.slice(0, 10)));
  const cursor = startOfUtcDay(new Date());
  let streak = 0;
  skipWeekendBackwards(cursor);
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    skipWeekendBackwards(cursor);
  }
  return streak;
}

export function calculateInactiveDays(occurredAt: string[], programStartDate: string): number | null {
  const timestamps = occurredAt.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (!timestamps.length) return null;
  const parsedProgramStart = Date.parse(`${programStartDate.slice(0, 10)}T00:00:00Z`);
  const latestRelevantTimestamp = Number.isFinite(parsedProgramStart)
    ? Math.max(...timestamps, parsedProgramStart)
    : Math.max(...timestamps);
  const latest = startOfUtcDay(new Date(latestRelevantTimestamp));
  const today = startOfUtcDay(new Date());
  return Math.max(0, Math.floor((today.getTime() - latest.getTime()) / 86_400_000));
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function skipWeekendBackwards(value: Date): void {
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
}

function buildMonthlySchedule(lessons: LearnerHomeView["lessons"], systemDate: string, lessonMinutes: number): LearnerHomeView["schedule"] {
  const today = /^\d{4}-\d{2}-\d{2}$/.test(systemDate) ? systemDate : new Date().toISOString().slice(0, 10);
  const current = new Date(`${today}T00:00:00Z`);
  const monday = new Date(current);
  monday.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
  const byDate = new Map(lessons.filter((lesson) => lesson.lessonDate).map((lesson) => [lesson.lessonDate!, lesson]));
  const labels = ["T2", "T3", "T4", "T5", "T6"];
  return {
    daysPerWeek: 5,
    lessonMinutes,
    days: labels.map((label, index) => {
      const date = new Date(monday);
      date.setUTCDate(monday.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const lesson = byDate.get(key);
      const status = lesson?.status === "completed" ? "attended" as const
        : lesson && key === today ? "today" as const
          : lesson && key < today ? "missed" as const
            : "upcoming" as const;
      return { label, date: key, status };
    })
  };
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


type MonthlyEligibilityRow = {
  system_date: string;
  month: string;
  exam_date: string | null;
  attended_days: string;
  attendance_appeal_approved: boolean;
  scheduled_lessons: string;
  completed_lessons: string;
  season_turns: string;
  framework_approved: boolean;
  form_published: boolean;
};

/** This gate is independent from framework/form publication and only reads persisted facts. */
export async function monthlyExamEligibility(pool: Pool, learnerId: string): Promise<MonthlyExamEligibilityView> {
  await pool.query(
    `update learner_complaints set status = 'auto_approved', resolution = 'Tự duyệt do quá hạn', resolved_at = now()
     where learner_id = $1 and kind = 'exam_eligibility' and status = 'pending' and due_at <= now()`,
    [learnerId]
  );
  const result = await pool.query<MonthlyEligibilityRow>(
    `with identity as (
       select u.organization_id, organization_system_date(u.organization_id)::date as system_date,
              e.cefr
       from users u left join enrollments e on e.learner_id = u.id
       where u.id = $1 and u.role = 'learner'
     ), dates as (
       select i.*, to_char(i.system_date, 'YYYY-MM') as month,
              coalesce(pm.exam_date, (select max(d)::date from generate_series(date_trunc('month', i.system_date)::date, (date_trunc('month', i.system_date) + interval '1 month - 1 day')::date, interval '1 day') d where extract(isodow from d) <= 5)) as exam_date,
              mf.id as framework_id, (mf.status = 'approved') as framework_approved
       from identity i left join program_months pm on pm.organization_id = i.organization_id and pm.month = to_char(i.system_date, 'YYYY-MM')
       left join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = i.cefr
     ), facts as (
       select d.*,
              (select count(*) from month_lessons ml where ml.framework_id = d.framework_id and ml.status = 'approved')::text as scheduled_lessons,
              (select count(*) from month_lessons ml
                 join lessons l on l.id = ml.lesson_id
                 join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1 and pr.status = 'completed'
               where ml.framework_id = d.framework_id and ml.status = 'approved')::text as completed_lessons,
              (select count(*) from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
               where cs.learner_id = $1 and ct.speaker = 'learner'
                 and ct.created_at >= date_trunc('month', d.system_date)
                 and ct.created_at < date_trunc('month', d.system_date) + interval '1 month'
                 and (ct.created_at at time zone 'Asia/Ho_Chi_Minh')::date < d.exam_date
                 and coalesce((ct.feedback->'evaluation'->>'countsTowardGoal')::boolean, coalesce((ct.feedback->>'relevant')::boolean, true)))::text as season_turns,
              exists(select 1 from assessment_definitions ad join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
                where ad.organization_id = d.organization_id and ad.kind = 'final'
                  and ad.assessment_key = ('monthly-final-' || d.month || '-' || lower(d.cefr))) as form_published,
              exists(select 1 from learner_complaints lc where lc.learner_id = $1 and lc.kind = 'exam_eligibility'
                and lc.status in ('approved', 'auto_approved') and lc.submitted_at >= date_trunc('month', d.system_date)
                and lc.submitted_at < date_trunc('month', d.system_date) + interval '1 month') as attendance_appeal_approved
       from dates d
     )
     select f.system_date::text, f.month, f.exam_date::text,
            (select count(distinct attendance_date)::text from (
              select (pr.completed_at at time zone 'Asia/Ho_Chi_Minh')::date as attendance_date
                from progress_records pr
               where pr.learner_id = $1 and pr.status = 'completed'
                 and (pr.completed_at at time zone 'Asia/Ho_Chi_Minh')::date >= (f.month || '-01')::date
                 and (pr.completed_at at time zone 'Asia/Ho_Chi_Minh')::date < f.exam_date
                 and extract(isodow from (pr.completed_at at time zone 'Asia/Ho_Chi_Minh')::date) <= 5
              union
              select oh.holiday_date as attendance_date
                from organization_holidays oh
               where oh.organization_id = f.organization_id
                 and oh.holiday_date >= (f.month || '-01')::date
                 and oh.holiday_date < f.exam_date
                 and oh.holiday_date <= f.system_date
            ) attendance) as attended_days,
            max(f.scheduled_lessons)::text as scheduled_lessons, max(f.completed_lessons)::text as completed_lessons,
            max(f.season_turns)::text as season_turns, bool_or(f.framework_approved) as framework_approved,
            bool_or(f.form_published) as form_published, bool_or(f.attendance_appeal_approved) as attendance_appeal_approved
     from facts f
     group by f.system_date, f.month, f.exam_date, f.organization_id`, [learnerId]
  );
  const row = result.rows[0]; if (!row) throw new Error('LEARNER_MONTHLY_ELIGIBILITY_NOT_FOUND');
  const systemDate = row.system_date; const examDate = row.exam_date ?? lastWeekdayOfMonth(systemDate.slice(0, 7));
  const effectiveDates = weekdaysBeforeExam(systemDate.slice(0, 7), examDate); const elapsedDates = effectiveDates.filter((date) => date <= systemDate);
  const eligibility = evaluateMonthlyExamEligibility({
    systemDate, examDate, effectiveDays: effectiveDates.length, elapsedEffectiveDays: elapsedDates.length,
    attendedDays: Number(row.attended_days) || 0, scheduledLessons: Number(row.scheduled_lessons) || 0,
    completedLessons: Number(row.completed_lessons) || 0, seasonTurns: Number(row.season_turns) || 0,
    attendanceOverride: Boolean(row.attendance_appeal_approved),
    frameworkApproved: Boolean(row.framework_approved), formPublished: Boolean(row.form_published)
  });
  return { month: row.month, systemDate, examDate, ...eligibility, opensAt: `${examDate}T00:00:00`, closesAt: null };
}
function weekdaysBeforeExam(month: string, examDate: string): string[] { const result: string[] = []; const start = new Date(`${month}-01T00:00:00Z`); const end = new Date(`${examDate}T00:00:00Z`); for (let current = new Date(start); current < end; current.setUTCDate(current.getUTCDate() + 1)) { const weekday = current.getUTCDay(); if (weekday >= 1 && weekday <= 5) result.push(current.toISOString().slice(0, 10)); } return result; }
function lastWeekdayOfMonth(month: string): string { const [year, monthNumber] = month.split('-').map(Number); const current = new Date(Date.UTC(year!, monthNumber!, 0)); while (current.getUTCDay() === 0 || current.getUTCDay() === 6) current.setUTCDate(current.getUTCDate() - 1); return current.toISOString().slice(0, 10); }


