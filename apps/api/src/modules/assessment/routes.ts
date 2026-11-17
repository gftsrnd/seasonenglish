import { randomUUID } from "node:crypto";
import type {
  AssessmentDeletionRequestView,
  AssessmentAttemptView,
  AssessmentDecisionView,
  AssessmentEvidenceType,
  AssessmentKind,
  AssessmentLevelFormSlotView,
  AssessmentLevelFormDetailView,
  AssessmentLevelFormDeleteView,
  AssessmentLevelFormTarget,
  AssessmentPlacementRetakeGrantView,
  AssessmentPlacementRetakeRequestView,
  AssessmentPlacementRetakeView,
  AssessmentLevelFormUpdateInput,
  AssessmentFormPreviewCollectionView,
  AssessmentFormPreviewView,
  AssessmentReviewOverviewView,
  AssessmentReviewAttemptDetailView,
  AssessmentReviewChallengeView,
  AssessmentReviewLearnerView,
  AssessmentReviewQueueItem,
  AssessmentRuntimeView,
  AssessmentSectionCode,
  AssessmentSectionStatus,
  AssessmentView,
  CefrLevel
} from "@e4s/contracts";
import { assessmentGradingOutputSchema, levelFormOutputSchema, type AiTaskRunner, type LevelFormTaskOutput } from "@e4s/ai";
import {
  createRepositories,
  findPlacementRetakeGrant,
  createPlacementRetakeRequest,
  findPlacementRetakeRequestState,
  findPublishedPlacementRetakeForm,
  grantPlacementRetake,
  listPlacementRetakeStates,
  normalizeLevelFormQuestionPrompts,
  PlacementRetakeError,
  PLACEMENT_RETAKE_ASSESSMENT_KEY,
  placementRetakeStatus, readPlacementRetakeActivity,
  startPlacementRetakeAttempt,
  publicAssessmentDefinition,
  sectionByCode,
  type AssessmentAttemptRecord,
  type PublishedAssessmentRecord,
  type StoredAssessmentDefinition,
  type StoredAssessmentTask
} from "@e4s/database";
import { calculateAutomaticSectionScore } from "@e4s/domain/assessment";
import { monthlyLearnerWindow } from "@e4s/domain/progression";
import { isLearnerProfileComplete } from "@e4s/domain/learning";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { requestEvidenceFields } from "../manager/request-evidence.js";
import type { EdgeTtsRunner } from "./edge-tts.js";
import type { ObjectStorage } from "@e4s/storage";
import { synthesizeListeningScript } from "./dialogue-tts.js";
import { blueprintListeningAudioIndex, listeningAudioServiceFor, withBlueprintListeningAudio } from "./listening-audio.js";
import { monthlyFinalTitle, registerMonthlyFinalRoutes } from "./monthly-final-routes.js";
import { createRoleGuard } from "../identity/policy.js";
import { monthlyExamEligibility } from "../learning/routes.js";
import { gradeProductiveAssessment } from "./productive-grading.js";
import { rebalanceAnswerPositions } from "../shared/answer-order.js";
import {
  evaluateLevelFormQuality, levelFormExamTitle, levelFormQualityInputFromOutput, levelFormQualityInputFromSections, LevelFormQualityError,
  splitLevelFormListeningParts, type LevelFormQualityRecord, type LevelFormQualityReport
} from "./level-form-quality.js";
import { autoFixLevelFormOutput } from "./level-form-auto-fix.js";
import {
  PASS_COURSE_RETAKE_ENABLED, PLACEMENT_RETAKE_FORM_PROMPT, PLACEMENT_RETAKE_READING_REPAIR_PROMPT, PLACEMENT_RETAKE_SLICE_GUIDANCE,
  PLACEMENT_RETAKE_TARGET, PLACEMENT_RETAKE_TITLE, placementRetakeAiInput, placementRetakeBlueprint, placementRetakeCopyIssues,
  placementRetakeQualityInput, placementRetakeStructureGateIssues
} from "./placement-retake-form.js";

/** A level-up target level, or the placement retake form slot. */
type LevelFormTarget = AssessmentLevelFormTarget;

const kindParam = z.object({ kind: z.enum(["placement", "levelup", "level-up", "monthly", "final", "pass-course", "passcourse"]) });
const formPreviewKindParam = z.object({ kind: z.enum(["placement", "level_up", "final", "pass_course"]) });
const attemptParam = z.object({ attemptId: z.uuid() });
const responseParam = z.object({
  attemptId: z.uuid(),
  section: z.enum(["listening", "reading", "writing", "speaking"]),
  taskKey: z.string().trim().min(1).max(80)
});
const sectionParam = z.object({
  attemptId: z.uuid(),
  section: z.enum(["listening", "reading", "writing", "speaking"])
});
const audioPlayParam = z.object({
  attemptId: z.uuid(),
  section: z.enum(["listening", "reading", "writing", "speaking"]),
  groupKey: z.string().trim().min(1).max(80)
});
const responseInput = z.object({
  value: z.string().max(20_000),
  evidenceType: z.enum(["choice", "text", "audio", "transcript", "typed_proxy", "technical_failure"]),
  artifactKey: z.string().trim().min(1).max(500).optional()
});
const decisionInput = z.object({
  status: z.enum(["approved", "needs_retry"]),
  approvedLevel: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(),
  reason: z.string().trim().min(1).max(2_000),
  grantRetake: z.boolean().optional()
}).superRefine((value, context) => {
  if (value.status === "needs_retry" && value.approvedLevel) {
    context.addIssue({ code: "custom", path: ["approvedLevel"], message: "approvedLevel is not allowed" });
  }
  if (value.grantRetake && value.status !== "needs_retry") {
    context.addIssue({ code: "custom", path: ["grantRetake"], message: "grantRetake requires needs_retry" });
  }
});
const placementRetakeGrantInput = z.object({ reason: z.string().trim().min(1).max(2_000), kind: z.enum(["placement", "pass_course"]).optional() });
const appealInput = z.object({ reason: z.string().trim().min(10).max(2_000), proposedLevel: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(), ...requestEvidenceFields });
const appealResolutionInput = z.object({ status: z.enum(["accepted", "rejected"]), resolution: z.string().trim().min(1).max(2_000) });
const learnerReviewParam = z.object({ learnerId: z.uuid() });
const reviewLevelInput = z.object({
  mode: z.enum(["direct", "scheduled", "recommend_lower"]),
  targetLevel: z.enum(["A1", "A2", "B1", "B2", "C1"]),
  reason: z.string().trim().min(1).max(2_000),
  evidence: z.string().trim().min(1).max(5_000)
});
const monthlyGoalInput = z.object({ monthlyGoal: z.string().trim().min(1).max(2_000) });
const deletionRequestInput = z.object({ reason: z.string().trim().min(1).max(2_000) });
const rescoreInput = z.object({ requestId: z.string().trim().min(1).max(160) });
const writingManualScoreValue = z.number().int().min(0).max(4);
const speakingManualScoreValue = z.number().int().min(0).max(5);
const manualScoreInput = z.object({
  writingTasks: z.array(z.object({
    taskKey: z.string().trim().min(1).max(80),
    criteria: z.object({
      taskCompletion: writingManualScoreValue,
      organization: writingManualScoreValue,
      vocabulary: writingManualScoreValue,
      grammar: writingManualScoreValue,
      workplaceRegister: writingManualScoreValue
    }).strict()
  }).strict()).max(10),
  speakingTasks: z.array(z.object({
    taskKey: z.string().trim().min(1).max(80),
    evidenceType: z.enum(["audio", "transcript", "typed_proxy", "technical_failure", "skipped"]),
    criteria: z.object({
      taskCompletionRelevance: speakingManualScoreValue,
      grammarVocabulary: speakingManualScoreValue,
      coherenceClarity: speakingManualScoreValue,
      interactionProfessionalRegister: speakingManualScoreValue
    }).strict().nullable()
  }).strict()).max(10),
  rubricScores: z.array(z.object({ code: z.string().trim().min(1).max(80), score: z.number().min(0).max(25) }).strict()).min(1).max(50).optional(),
  comment: z.string().trim().max(5_000)
}).superRefine((value, context) => {
  if (value.rubricScores) {
    if (value.writingTasks.length || value.speakingTasks.length) context.addIssue({ code: "custom", path: ["rubricScores"], message: "Send only one scoring format" });
    return;
  }
  const writingKeys = new Set(value.writingTasks.map((task) => task.taskKey));
  const speakingKeys = new Set(value.speakingTasks.map((task) => task.taskKey));
  if (value.writingTasks.length !== 2 || writingKeys.size !== 2 || !writingKeys.has("W1") || !writingKeys.has("W2")) context.addIssue({ code: "custom", path: ["writingTasks"], message: "Writing tasks must be W1 and W2" });
  if (value.speakingTasks.length !== 4 || speakingKeys.size !== 4 || ["S1", "S2", "S3", "S4"].some((key) => !speakingKeys.has(key))) context.addIssue({ code: "custom", path: ["speakingTasks"], message: "Speaking tasks must be S1 through S4" });
  value.speakingTasks.forEach((task, index) => {
    if (task.evidenceType === "technical_failure" && task.criteria !== null) context.addIssue({ code: "custom", path: ["speakingTasks", index, "criteria"], message: "Technical failures cannot be scored" });
    if (task.evidenceType !== "technical_failure" && task.evidenceType !== "skipped" && task.criteria === null) context.addIssue({ code: "custom", path: ["speakingTasks", index, "criteria"], message: "Speaking evidence requires criteria" });
  });
});
const violationInput = z.object({
  requestId: z.string().trim().min(1).max(160),
  reason: z.enum(["visibility_hidden", "window_blur", "context_menu", "copy", "paste", "new_window", "logout"]),
  occurredAt: z.string().datetime({ offset: true })
});

const sectionOrder: AssessmentSectionCode[] = ["listening", "reading", "writing", "speaking"];
const levelFormParam = z.object({ targetLevel: z.enum(["A2", "B1", "B2", "C1", PLACEMENT_RETAKE_TARGET]) });
const levelFormVersionParam = z.object({ versionId: z.uuid() });
// D3: a level-up form is published only after the Operator confirms a human read of every answer key.
const levelFormPublicationInput = z.object({ answersReviewed: z.literal(true) });
const levelFormTaskInput = z.object({
  key: z.string().trim().min(1).max(80), prompt: z.string().trim().max(20_000),
  responseType: z.enum(["single_choice", "long_text", "speaking_evidence"]), maxScore: z.number().positive().max(100),
  options: z.array(z.object({ value: z.string().trim().min(1).max(80), label: z.string().trim().max(2_000) })).max(10).optional(),
  correctAnswer: z.string().trim().min(1).max(2_000).nullable().optional(), minWords: z.number().int().min(0).max(5_000).optional(), maxWords: z.number().int().min(1).max(5_000).optional()
}).passthrough();
const levelFormStimulusInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("passage"), text: z.string().trim().max(30_000) }).passthrough(),
  z.object({ type: z.literal("audio_script"), audioSrc: z.string().max(2_000).optional(), lines: z.array(z.object({ speaker: z.string().trim().min(1).max(200), text: z.string().trim().max(10_000) })).min(1).max(50) }).passthrough()
]);
const levelFormUpdateInput = z.object({
  title: z.string().trim().min(3).max(300),
  sections: z.array(z.object({
    code: z.enum(["listening", "reading", "writing", "speaking"]), title: z.string().trim().min(1).max(200),
    durationMinutes: z.number().int().positive().max(120), maxScore: z.number().positive().max(100),
    instructions: z.array(z.string().trim().max(2_000)).min(1).max(20),
    groups: z.array(z.object({
      key: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(200), instruction: z.string().trim().max(2_000),
      stimulus: levelFormStimulusInput.optional(), maxPlays: z.number().int().min(1).max(10).optional(), tasks: z.array(levelFormTaskInput).min(1).max(50)
    }).passthrough()).min(1).max(20)
  }).passthrough()).length(4)
}).superRefine((value, context) => {
  const codes = new Set(value.sections.map((section) => section.code));
  if (codes.size !== 4) context.addIssue({ code: "custom", path: ["sections"], message: "Each level form must contain four distinct sections" });
  value.sections.forEach((section, sectionIndex) => section.groups.forEach((group, groupIndex) => group.tasks.forEach((task, taskIndex) => {
    if (task.responseType === "single_choice" && task.correctAnswer && (!task.options?.length || !task.options.some((option) => option.value === task.correctAnswer))) {
      context.addIssue({ code: "custom", path: ["sections", sectionIndex, "groups", groupIndex, "tasks", taskIndex], message: "Choice tasks require options and a matching answer" });
    }
  })));
});

const DEFAULT_LEVEL_FORM_PROMPT = `Create a complete 75-minute, 100-point Workplace English CEFR promotion test for the requested target level. Return exactly four sections with the placement structure: Listening 20 multiple-choice questions for 20 points, Reading 40 multiple-choice questions for 40 points, Writing 2 tasks for 20 points, and Speaking 4 tasks for 20 points. The content must be new and target-level appropriate, never copied from placement or another level. Use realistic workplace situations, unambiguous answer keys, and the required JSON schema exactly.`;
const LEVEL_FORM_QUESTION_GUIDANCE = "Each question prompt must contain only the question text. Omit part labels such as Part 1: and question numbering.";
const LEVEL_FORM_READING_REPAIR_PROMPT = `Generate exactly one new multiple-choice reading-comprehension question for the supplied passage. It must be appropriate for the target CEFR level, have four concise options, an unambiguous correctIndex, and must not duplicate any existing prompt. ${LEVEL_FORM_QUESTION_GUIDANCE} Return only the structured tool input.`;

export function registerAssessmentRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner, aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>, edgeTtsRunner?: EdgeTtsRunner, storage?: ObjectStorage): void {
  const repositories = createRepositories(pool);
  const listeningAudio = listeningAudioServiceFor(pool, edgeTtsRunner, storage);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const sessionConflict = { code: "ASSESSMENT_ACTIVE_ON_OTHER_DEVICE", message: "Bài đang được làm trên thiết bị khác." };
  const appealLevelNotApproved = { code: "APPEAL_LEVEL_NOT_APPROVED", message: "Kháng nghị mở sau khi trình độ của bạn được duyệt." };
  const canUseAttempt = (request: FastifyRequest, attempt: AssessmentAttemptRecord) =>
    attempt.status !== "in_progress" || repositories.assessments.claimAttemptSession(
      request.e4sSession!.user.id, attempt.id, request.e4sSessionId!
    );
  const assessmentReaders = createRoleGuard(pool, ["operator", "manager"]);
  const assessmentReviewers = createRoleGuard(pool, ["operator"]);
  const assessmentOperators = createRoleGuard(pool, ["operator"]);
  const levelFormOperators = createRoleGuard(pool, ["operator"]);
  const monthlyFinalOperators = createRoleGuard(pool, ["operator"]);

  app.post("/api/v1/assessment-audio/edge-tts", { preHandler: monthlyFinalOperators }, async (request, reply) => {
    const body = z.object({ text: z.string().trim().min(1).max(20_000), voice: z.string().trim().min(1).max(200) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: "EDGE_TTS_INPUT_INVALID" });
    if (!edgeTtsRunner) return reply.code(503).send({ code: "EDGE_TTS_UNAVAILABLE" });
    try {
      // Dialogue-aware: speaker labels are never spoken and each speaker keeps one voice.
      const audio = await synthesizeListeningScript(edgeTtsRunner, { script: body.data.text, voice: body.data.voice });
      return { filename: audio.filename, mimeType: audio.mimeType, base64: Buffer.from(audio.bytes).toString("base64") };
    } catch (error) {
      return reply.code(503).send({ code: assessmentErrorCode(error, "EDGE_TTS_FAILED") });
    }
  });

  registerMonthlyFinalRoutes(app, pool, monthlyFinalOperators, runnerFor, listeningAudio);

  /**
   * One read-model for the Operator's assessment viewer.  This reads stored
   * versions only: placement and Pass Course expose their fixed published
   * definitions, while generated final/level-up forms expose their actual
   * draft or published blueprints and lifecycle state.
   */
  app.get("/api/v1/assessment-form-previews/:kind", { preHandler: assessmentReaders }, async (request, reply): Promise<AssessmentFormPreviewCollectionView | void> => {
    const params = formPreviewKindParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_FORM_KIND" });
    return assessmentFormPreviews(pool, request.e4sSession!.user.id, params.data.kind);
  });

  app.get("/api/v1/assessment-reviews/pending", { preHandler: assessmentReaders }, async (request) => {
    const [pending, retakes] = await Promise.all([
      repositories.assessments.listPending(request.e4sSession!.user.id),
      listPlacementRetakeStates(pool, request.e4sSession!.user.id)
    ]);
    return pending.map((item): AssessmentReviewQueueItem => ({
      ...item,
      submittedAt: item.submittedAt.toISOString(),
      ...placementRetakeQueueFields(item, retakes)
    }));
  });

  app.get("/api/v1/assessment-reviews/overview", { preHandler: assessmentReaders }, async (request): Promise<AssessmentReviewOverviewView> => {
    let overview = await repositories.assessments.getReviewOverview(request.e4sSession!.user.id);
    const repaired = await Promise.all(overview.pending
      .filter((item) => item.sectionScores.listening == null || item.sectionScores.reading == null)
      .map((item) => repairReviewObjectiveScores(repositories.assessments, request.e4sSession!.user.id, item.attemptId)));
    if (repaired.some(Boolean)) overview = await repositories.assessments.getReviewOverview(request.e4sSession!.user.id);
    const [topicReports, learnerDashboards, weakSignalRows, publication] = await Promise.all([pool.query<{
      id: string; learner_id: string; learner_name: string; topic: string; reason: string;
      strike_count: number; status: "open" | "resolved"; created_at: Date;
    }>(
      `select tr.id, tr.learner_id, learner.display_name as learner_name, tr.topic, tr.reason,
              tr.strike_count, tr.status, tr.created_at
       from topic_reports tr join users learner on learner.id = tr.learner_id and learner.status = 'active'
       join users reviewer on reviewer.id = $1 and reviewer.organization_id = learner.organization_id
      order by (tr.status = 'open') desc, tr.created_at desc limit 50`,
      [request.e4sSession!.user.id]
    ), Promise.all(overview.approvedLearners.map((learner) => repositories.learning.getProgressDashboard(learner.learnerId))), pool.query<{
      learner_id: string; learner_name: string; current_level: CefrLevel; week_number: number;
      part_count: string; wrong_count: string;
    }>(
      `with learner_weeks as (
         select learner.id as learner_id, learner.display_name as learner_name, e.cefr as current_level,
                p.id as program_id,
                coalesce(p.current_week_override,
                  least(p.week_count, greatest(1, floor((current_date - p.start_date) / 7.0)::int + 1))) as current_week
         from users reviewer
         join users learner on learner.organization_id = reviewer.organization_id
           and learner.role = 'learner' and learner.status = 'active'
         join enrollments e on e.learner_id = learner.id and e.cefr_approved = true
         join programs p on p.id = e.program_id
         where reviewer.id = $1
       )
       select lw.learner_id, lw.learner_name, lw.current_level, pw.week_number,
              count(*)::text as part_count,
              count(*) filter (where coalesce((part.value->>'attempts')::int, 0) >= 3
                and coalesce((part.value->>'score')::numeric, 0) < 80)::text as wrong_count
       from learner_weeks lw
       join program_weeks pw on pw.program_id = lw.program_id
         and pw.week_number between lw.current_week - 1 and lw.current_week
       join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr = lw.current_level
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       join progress_records pr on pr.lesson_id = l.id and pr.learner_id = lw.learner_id
       cross join lateral jsonb_each(case when jsonb_typeof(pr.evidence->'evidence') = 'object'
         then pr.evidence->'evidence' else '{}'::jsonb end) part
       group by lw.learner_id, lw.learner_name, lw.current_level, pw.week_number
       order by lw.learner_id, pw.week_number`,
      [request.e4sSession!.user.id]
    ), pool.query<{ month: string; exam_date: string; today: string; cefr: CefrLevel }>(
      `select pm.month, pm.exam_date::text, organization_system_date(pm.organization_id)::text as today, f.cefr
       from users reviewer
       join program_months pm on pm.organization_id = reviewer.organization_id
         and pm.month = to_char(organization_system_date(pm.organization_id), 'YYYY-MM')
       join month_frameworks f on f.program_month_id = pm.id and f.status = 'approved' and f.published_at is not null
       where reviewer.id = $1`,
      [request.e4sSession!.user.id]
    )]);
    const current = publication.rows[0];
    const placementWindow = current ? monthlyLearnerWindow(current.month, current.exam_date, current.today) : null;
    const approvedById = new Map(learnerDashboards.flatMap(dashboard => {
      const countsFrom = dashboard?.monthlyProgress?.uncounted?.countsFrom;
      return dashboard && countsFrom ? [[dashboard.learner.id, countsFrom] as const] : [];
    }));

    const retakes = await listPlacementRetakeStates(pool, request.e4sSession!.user.id);
    const retakeOf = (learnerId: string) => retakes.get(learnerId)?.status ?? "not_granted";
    const queueView = (item: typeof overview.pending[number]): AssessmentReviewQueueItem => ({
      ...item,
      submittedAt: item.submittedAt.toISOString(),
      ...placementRetakeQueueFields(item, retakes)
    });
    const ready = learnerDashboards.flatMap((dashboard) => dashboard?.levelReadiness.eligible && dashboard.levelReadiness.targetLevel ? [{
      learnerId: dashboard.learner.id,
      learnerName: dashboard.learner.displayName,
      currentLevel: dashboard.learner.cefr!,
      targetLevel: dashboard.levelReadiness.targetLevel,
      metrics: dashboard.levelReadiness.criteria
    }] : []);
    const weakByLearner = new Map<string, typeof weakSignalRows.rows>();
    for (const row of weakSignalRows.rows) weakByLearner.set(row.learner_id, [...(weakByLearner.get(row.learner_id) ?? []), row]);
    const weak = [...weakByLearner.values()].flatMap((rows) => {
      const wrongWeeks = rows.map((row) => ({
        weekNumber: row.week_number,
        partCount: Number(row.part_count),
        wrongPercent: Number(row.part_count) ? Math.round(Number(row.wrong_count) / Number(row.part_count) * 100) : 0
      }));
      const learner = rows[0];
      return learner && learner.current_level !== "A1" && wrongWeeks.length === 2
        && wrongWeeks.every((week) => week.partCount >= 4 && week.wrongPercent > 30)
        ? [{ learnerId: learner.learner_id, learnerName: learner.learner_name, currentLevel: learner.current_level, wrongWeeks }]
        : [];
    });
    return {
      openAppeals: overview.openAppeals,
      ...(current && placementWindow && !placementWindow.canStudy ? {
        placementTrial: { month: current.month, countsFrom: placementWindow.startDate, levels: publication.rows.map(row => row.cefr) }
      } : {}),
      pendingAssessments: overview.pending.filter((item) => item.kind !== "level-up").map(queueView),
      pendingLevelUp: overview.pending.filter((item) => item.kind === "level-up").map(queueView),
      approvedLearners: overview.approvedLearners.map((learner) => {
        const trialCountsFrom = approvedById.get(learner.learnerId);
        return { ...learner, placementRetake: retakeOf(learner.learnerId), ...(trialCountsFrom ? { trialCountsFrom } : {}) };
      }),
      unassessedLearners: overview.unassessedLearners.map((learner) => ({ ...learner, lastAttemptAt: learner.lastAttemptAt?.toISOString() ?? null, placementRetake: retakeOf(learner.learnerId) })),
      inProgressLearners: overview.inProgressLearners.map((learner) => ({ ...learner, lastAttemptAt: learner.lastAttemptAt?.toISOString() ?? null, placementRetake: retakeOf(learner.learnerId) })),
      retryLearners: overview.retryLearners.map((learner) => ({ ...learner, lastAttemptAt: learner.lastAttemptAt?.toISOString() ?? null, placementRetake: retakeOf(learner.learnerId) })),
      levelSignals: { windowDays: 14, ready, weak, inFlow: overview.inFlow },
      topicReports: topicReports.rows.map((item) => ({
        id: item.id, learnerId: item.learner_id, learnerName: item.learner_name, topic: item.topic,
        reason: item.reason, strikeCount: item.strike_count, status: item.status, createdAt: item.created_at.toISOString()
      }))
    };
  });

  app.post("/api/v1/assessment-reviews/learners/:learnerId/weekly-practice", { preHandler: assessmentOperators }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_LEARNER" });
    const assignment = await repositories.engagement.assignWeeklyPractice({
      staffId: request.e4sSession!.user.id,
      learnerId: params.data.learnerId
    });
    return assignment ?? reply.code(409).send({ code: "WEEKLY_PRACTICE_NOT_ELIGIBLE" });
  });

  app.get("/api/v1/assessment-reviews/learners/:learnerId", { preHandler: assessmentReaders }, async (request, reply): Promise<AssessmentReviewLearnerView | void> => {
    const params = learnerReviewParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_LEARNER" });
    const view = await repositories.assessments.getReviewLearner(request.e4sSession!.user.id, params.data.learnerId);
    return view ?? reply.code(404).send({ code: "ASSESSMENT_LEARNER_NOT_FOUND" });
  });

  app.get("/api/v1/assessment-reviews/attempts/:attemptId", { preHandler: assessmentReaders }, async (request, reply): Promise<AssessmentReviewAttemptDetailView | void> => {
    const params = attemptParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_ATTEMPT" });
    const reviewerId = request.e4sSession!.user.id;
    await repairReviewObjectiveScores(repositories.assessments, reviewerId, params.data.attemptId);
    const view = await repositories.assessments.getReviewAttempt(reviewerId, params.data.attemptId);
    return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
  });

  app.get("/api/v1/assessment-reviews/challenges/:attemptId", { preHandler: assessmentReaders }, async (request, reply): Promise<AssessmentReviewChallengeView | void> => {
    const params = attemptParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_CHALLENGE" });
    const view = await repositories.assessments.getReviewChallenge(request.e4sSession!.user.id, params.data.attemptId);
    return view ?? reply.code(404).send({ code: "ASSESSMENT_CHALLENGE_NOT_FOUND" });
  });

  app.post("/api/v1/assessment-reviews/:attemptId/manual-score", { preHandler: assessmentOperators }, async (request, reply): Promise<AssessmentReviewAttemptDetailView | void> => {
    const params = attemptParam.safeParse(request.params);
    const body = manualScoreInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_MANUAL_SCORE" });
    const saved = await repositories.assessments.saveManualAssessmentScore({
      actorId: request.e4sSession!.user.id,
      attemptId: params.data.attemptId,
      writingTasks: body.data.writingTasks,
      speakingTasks: body.data.speakingTasks,
      comment: body.data.comment,
      ...(body.data.rubricScores ? { rubricScores: body.data.rubricScores } : {})
    });
    if (!saved) return reply.code(409).send({ code: "ASSESSMENT_MANUAL_SCORE_NOT_ALLOWED" });
    const view = await repositories.assessments.getReviewAttempt(request.e4sSession!.user.id, params.data.attemptId);
    return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
  });

  app.post("/api/v1/assessment-reviews/:attemptId/rescore", {
    preHandler: assessmentOperators,
    config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply): Promise<AssessmentReviewAttemptDetailView | void> => {
    const params = attemptParam.safeParse(request.params);
    const body = rescoreInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_RESCORE" });
    const actorId = request.e4sSession!.user.id;
    const context = await repositories.assessments.getRescoreContext(actorId, params.data.attemptId);
    if (!context) return reply.code(409).send({ code: "ASSESSMENT_RESCORE_NOT_ALLOWED" });
    const scoring = await repositories.assessments.beginAssessmentAiScoring(actorId, params.data.attemptId, body.data.requestId);
    if (!scoring) return reply.code(409).send({ code: "ASSESSMENT_RESCORE_NOT_ALLOWED" });
    if (!scoring.started) {
      const view = await repositories.assessments.getReviewAttempt(actorId, params.data.attemptId);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
    }
    const failScoring = async (code: string, statusCode: 502 | 503 = 502) => {
      await repositories.assessments.failAssessmentAiScoring(actorId, params.data.attemptId, body.data.requestId, code);
      return reply.code(statusCode).send({ code });
    };
    const runner = await runnerFor(actorId);
    if (!runner) return failScoring("AI_UNAVAILABLE", 503);

    const aiRequestKey = `${params.data.attemptId}:${body.data.requestId}`;
    const existing = await repositories.aiRuns.findSucceededOutputForOrganization(actorId, aiRequestKey, "assessment_scoring");
    if (existing) {
      await repositories.assessments.completeAssessmentAiScoring(actorId, params.data.attemptId, body.data.requestId);
      const view = await repositories.assessments.getReviewAttempt(actorId, params.data.attemptId);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
    }
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "assessment_scoring");
    if (!task) return failScoring("AI_PROMPT_NOT_READY", 503);
    const writing = sectionByCode(context.definition, "writing");
    const speaking = sectionByCode(context.definition, "speaking");
    if (!writing || !speaking) {
      await repositories.assessments.failAssessmentAiScoring(actorId, params.data.attemptId, body.data.requestId, "ASSESSMENT_PRODUCTIVE_SECTIONS_MISSING");
      return reply.code(409).send({ code: "ASSESSMENT_PRODUCTIVE_SECTIONS_MISSING" });
    }
    try {
      const { output, metadata } = await gradeAssessment(runner, context.definition, context.attempt, task.prompt, artifactKey =>
        assessmentAudioTranscript(repositories.files, actorId, context.attempt, artifactKey));
      const saved = await repositories.assessments.saveAssessmentRescore({
        actorId,
        attemptId: params.data.attemptId,
        requestId: body.data.requestId,
        aiRequestKey,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output,
        metadata: {
          traceId: metadata.traceId,
          provider: metadata.provider,
          model: metadata.model,
          inputHash: metadata.inputHash,
          usage: metadata.usage,
          latencyMs: metadata.latencyMs
        }
      });
      if (saved === null) {
        await repositories.assessments.failAssessmentAiScoring(actorId, params.data.attemptId, body.data.requestId, "ASSESSMENT_RESCORE_NOT_ALLOWED");
        return reply.code(409).send({ code: "ASSESSMENT_RESCORE_NOT_ALLOWED" });
      }
      await repositories.assessments.completeAssessmentAiScoring(actorId, params.data.attemptId, body.data.requestId);
      const view = await repositories.assessments.getReviewAttempt(actorId, params.data.attemptId);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
    } catch (error) {
      request.log.warn({ error }, "Assessment AI rescore failed");
      return failScoring(assessmentErrorCode(error, "ASSESSMENT_RESCORE_FAILED"));
    }
  });

  app.patch("/api/v1/assessment-reviews/learners/:learnerId/level", { preHandler: assessmentOperators }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    const body = reviewLevelInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_LEVEL_CHANGE" });
    try {
      const view = await repositories.assessments.changeLearnerLevel(request.e4sSession!.user.id, params.data.learnerId, body.data);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_LEARNER_NOT_FOUND" });
    } catch (error) {
      return reply.code(409).send({ code: assessmentErrorCode(error, "ASSESSMENT_LEVEL_CHANGE_FAILED") });
    }
  });

  // Staff exception: open (or close) the level-up test for one learner now. Operator and Manager.
  app.put("/api/v1/assessment-reviews/learners/:learnerId/level-up-override", { preHandler: assessmentReaders }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    const body = z.object({ allowed: z.boolean(), reason: z.string().trim().max(1000).default("") })
      .refine((input) => !input.allowed || input.reason.length > 0)
      .safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LEVEL_UP_OVERRIDE" });
    try {
      const view = await repositories.assessments.setLevelUpOverride(request.e4sSession!.user.id, params.data.learnerId, body.data);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_LEARNER_NOT_FOUND" });
    } catch (error) {
      return reply.code(409).send({ code: assessmentErrorCode(error, "LEVEL_UP_OVERRIDE_FAILED") });
    }
  });

  app.patch("/api/v1/assessment-reviews/learners/:learnerId/monthly-goal", { preHandler: assessmentOperators }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    const body = monthlyGoalInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_MONTHLY_GOAL" });
    const view = await repositories.assessments.updateLearnerMonthlyGoal(request.e4sSession!.user.id, params.data.learnerId, body.data.monthlyGoal);
    return view ?? reply.code(404).send({ code: "ASSESSMENT_LEARNER_NOT_FOUND" });
  });

  app.get("/api/v1/assessment-reviews/deletion-requests", { preHandler: assessmentOperators }, async (request, reply) => {
    const session = request.e4sSession!;
    if (session.role !== "operator") return reply.code(403).send({ code: "FORBIDDEN" });
    reply.header("Cache-Control", "private, no-store");
    return { requests: await repositories.assessments.listOwnDeletionRequests(session.user.id) };
  });

  app.post("/api/v1/assessment-reviews/learners/:learnerId/deletion-requests", { preHandler: assessmentOperators }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    const body = deletionRequestInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_DELETION_REQUEST" });
    const view = await repositories.assessments.requestLearnerDeletion(request.e4sSession!.user.id, params.data.learnerId, body.data.reason);
    if (!view) return reply.code(404).send({ code: "ASSESSMENT_LEARNER_NOT_FOUND" });
    const typedView: AssessmentDeletionRequestView = view;
    return reply.code(201).send(typedView);
  });

  app.post("/api/v1/assessment-reviews/topic-reports/:reportId/resolution", { preHandler: assessmentReviewers }, async (request, reply) => {
    const params = z.object({ reportId: z.uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "TOPIC_REPORT_INVALID" });
    const resolved = await pool.query(
      `update topic_reports tr set status = 'resolved', resolved_by = $1, resolved_at = now()
       from users learner, users reviewer
       where tr.id = $2 and tr.learner_id = learner.id and reviewer.id = $1
         and reviewer.organization_id = learner.organization_id and tr.status = 'open'
       returning tr.id`,
      [request.e4sSession!.user.id, params.data.reportId]
    );
    return resolved.rowCount ? { saved: true } : reply.code(404).send({ code: "TOPIC_REPORT_NOT_FOUND" });
  });

  app.get("/api/v1/assessment-level-forms", { preHandler: assessmentReaders }, async (request): Promise<AssessmentLevelFormSlotView[]> => {
    const forms = await repositories.assessments.listLevelForms(request.e4sSession!.user.id);
    return (["A2", "B1", "B2", "C1", PLACEMENT_RETAKE_TARGET] as const).map((targetLevel) => {
      const form = forms.find((candidate) => candidate.targetLevel === targetLevel && candidate.status === "published");
      return {
        targetLevel,
        publishedForm: form ? { ...form, publishedAt: form.publishedAt?.toISOString() ?? null } : null,
        draftForm: (() => { const draft = forms.find((candidate) => candidate.targetLevel === targetLevel && candidate.status === "draft"); return draft ? { ...draft, publishedAt: null } : null; })()
      };
    });
  });

  app.get("/api/v1/assessment-level-forms/:versionId", { preHandler: assessmentReaders }, async (request, reply): Promise<AssessmentLevelFormDetailView | void> => {
    const params = levelFormVersionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LEVEL_FORM_VERSION" });
    const form = await repositories.assessments.getLevelFormDetail(request.e4sSession!.user.id, params.data.versionId);
    return form ? withLevelFormQualityWarnings(form) : reply.code(404).send({ code: "LEVEL_FORM_NOT_FOUND" });
  });

  app.get("/api/v1/assessment-level-forms/:targetLevel/versions", { preHandler: assessmentReaders }, async (request, reply) => {
    const params = levelFormParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_TARGET_LEVEL" });
    const versions = await repositories.assessments.listLevelFormVersions(request.e4sSession!.user.id, params.data.targetLevel);
    return versions.map((version) => ({ ...version, publishedAt: version.publishedAt?.toISOString() ?? null }));
  });

  app.put("/api/v1/assessment-level-forms/:versionId", { preHandler: levelFormOperators }, async (request, reply): Promise<AssessmentLevelFormDetailView | void> => {
    const params = levelFormVersionParam.safeParse(request.params);
    const body = levelFormUpdateInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_LEVEL_FORM_UPDATE" });
    try {
      const updated = await repositories.assessments.updateLevelFormDraft(request.e4sSession!.user.id, params.data.versionId, body.data as AssessmentLevelFormUpdateInput);
      return updated ? withLevelFormQualityWarnings(updated) : reply.code(409).send({ code: "LEVEL_FORM_NOT_EDITABLE" });
    } catch (error) {
      if (error instanceof PlacementRetakeError && error.code === "PLACEMENT_RETAKE_QUESTION_INCOMPLETE") {
        return reply.code(400).send({ code: error.code, issue: error.issue });
      }
      throw error;
    }
  });

  app.post("/api/v1/assessment-level-forms/:versionId/draft", { preHandler: levelFormOperators }, async (request, reply): Promise<AssessmentLevelFormDetailView | void> => {
    const params = levelFormVersionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LEVEL_FORM_VERSION" });
    const draft = await repositories.assessments.copyLevelFormToDraft(request.e4sSession!.user.id, params.data.versionId);
    return draft ? reply.code(201).send(draft) : reply.code(409).send({ code: "LEVEL_FORM_NOT_COPYABLE" });
  });

  app.post("/api/v1/assessment-level-forms/:targetLevel/manual-draft", { preHandler: levelFormOperators }, async (request, reply) => {
    const params = levelFormParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_TARGET_LEVEL" });
    const form = await repositories.assessments.createLevelFormDraft(
      request.e4sSession!.user.id,
      params.data.targetLevel,
      { ...manualLevelFormBlueprint(params.data.targetLevel),
        ...(params.data.targetLevel === PLACEMENT_RETAKE_TARGET ? { placementRetakeSource: "manual" as const } : {}) }
    );
    return reply.code(201).send({ ...form, publishedAt: null });
  });
  app.post("/api/v1/assessment-level-forms/:targetLevel/generate", {
    preHandler: levelFormOperators, config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const params = levelFormParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_TARGET_LEVEL" });
    const actorId = request.e4sSession!.user.id;
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "level_form_generation");
    // Placement retake mode: same generator, slices, token budget and guards, with a placement
    // scope (mixed A1–C1 banding) instead of one target level, and never placement-a's items.
    const placementRetake = params.data.targetLevel === PLACEMENT_RETAKE_TARGET;
    try {
      const input = placementRetake
        ? placementRetakeAiInput()
        : { targetLevel: params.data.targetLevel as Exclude<LevelFormTarget, typeof PLACEMENT_RETAKE_TARGET>, context: "workplace_english" as const, listeningQuestions: 20 as const, readingQuestions: 40 as const };
      const basePrompt = placementRetake ? PLACEMENT_RETAKE_FORM_PROMPT : task?.prompt ?? DEFAULT_LEVEL_FORM_PROMPT;
      const sliceGuidance = placementRetake ? PLACEMENT_RETAKE_SLICE_GUIDANCE : {
        listening: "Generate only the title of the whole promotion test (never a section name such as \"Listening Section\"), the listening script, and exactly 20 listening questions. The script must contain exactly five clearly labelled parts (Part 1 through Part 5), with four questions for each part in the same order.",
        reading: "Generate only the reading passage and exactly 40 reading questions. Keep every prompt and option concise; questions 1–10, 11–20, 21–30 and 31–40 must each form a distinct workplace-reading part.",
        production: "Generate only exactly two writing prompts and four speaking prompts."
      };
      // One 60-question tool result regularly hits the provider's practical
      // output ceiling. Generate three independently schema-checked slices,
      // then validate their assembled canonical form before persistence.
      const [listening, reading, production] = await Promise.all([
        runner.runTask("level_form_listening_generation", input, { systemPrompt: `${basePrompt}\n${sliceGuidance.listening} ${LEVEL_FORM_QUESTION_GUIDANCE}`, maxOutputTokens: 7_000 }),
        runner.runTask("level_form_reading_generation", input, { systemPrompt: `${basePrompt}\n${sliceGuidance.reading} ${LEVEL_FORM_QUESTION_GUIDANCE}`, maxOutputTokens: 12_000 }),
        runner.runTask("level_form_production_generation", input, { systemPrompt: `${basePrompt}\n${sliceGuidance.production}`, maxOutputTokens: 2_000 })
      ]);
      const completedReading = await completeLevelFormReading(runner, params.data.targetLevel, reading.output as { passage: string; questions: LevelFormTaskOutput["reading"]["questions"][number][] });
      // Auto-fix before the draft is shown: answer positions (deterministic) and one or two
      // targeted AI repair rounds for the offending questions only; the rest stays for the Operator.
      const assembled = await autoFixAssembledLevelForm(runner, assembleLevelFormFromAi(params.data.targetLevel, { listening: listening.output, reading: completedReading, production: production.output }),
        (message, details) => request.log.warn(details, message));
      const completeOutput = assembled.output;
      if (task) await repositories.aiRuns.recordSucceeded({
        userId: actorId,
        requestId: `level-form:${params.data.targetLevel}:${Date.now()}`,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output: completeOutput,
        metadata: listening.metadata
      });
      if (!assembled.quality.passed) throw new LevelFormQualityError(assembled.quality.severe);
      if (placementRetake) {
        // Deterministic: placement-a's exact structure and scoring, and nothing copied from it.
        const issues = [...placementRetakeStructureGateIssues(assembled.blueprint), ...placementRetakeCopyIssues(assembled.shuffled)];
        if (issues.length) throw new LevelFormQualityError(issues);
      }
      // Listening audio right after generation; a TTS failure keeps the form (marked on the group) for the manual buttons.
      // An unchanged part script keeps the audio of the earlier draft/published form (no new synthesis).
      const previous = await previousLevelFormAudio(repositories.assessments, actorId, params.data.targetLevel);
      const withAudio = await withBlueprintListeningAudio(assembled.blueprint, listeningAudio, actorId, { previous });
      if (withAudio.failed) request.log.warn({ failed: withAudio.failed }, "Level form listening audio synthesis failed");
      const form = await repositories.assessments.createLevelFormDraft(actorId, params.data.targetLevel, {
        ...withAudio.blueprint, ...(placementRetake ? { placementRetakeSource: "ai" as const } : {})
      });
      return reply.code(201).send({ ...form, publishedAt: null });
    } catch (error) {
      if (error instanceof LevelFormQualityError) {
        request.log.warn({ issues: error.issues }, "Level form generation failed the content gate");
        return reply.code(502).send({ code: "LEVEL_FORM_GENERATION_FAILED", issues: error.issues });
      }
      const code = assessmentErrorCode(error, "LEVEL_FORM_GENERATION_FAILED");
      request.log.warn({ errorCode: code }, "Level form generation failed");
      if (placementRetake && (code === "AI_TIMEOUT" || code === "AI_OUTPUT_INVALID")) return reply.code(502).send({ code });
      return reply.code(502).send({ code: "LEVEL_FORM_GENERATION_FAILED" });
    }
  });

  app.post("/api/v1/assessment-level-forms/:versionId/publication", { preHandler: levelFormOperators }, async (request, reply) => {
    const params = levelFormVersionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LEVEL_FORM_VERSION" });
    if (!levelFormPublicationInput.safeParse(request.body ?? {}).success) return reply.code(400).send({ code: "LEVEL_FORM_ANSWER_REVIEW_REQUIRED" });
    try {
      const form = await repositories.assessments.publishLevelForm(request.e4sSession!.user.id, params.data.versionId);
      return form ? { ...form, publishedAt: form.publishedAt?.toISOString() ?? null } : reply.code(409).send({ code: "LEVEL_FORM_NOT_PUBLISHABLE" });
    } catch (error) {
      const code = assessmentErrorCode(error, "LEVEL_FORM_NOT_PUBLISHABLE");
      return reply.code(409).send({ code });
    }
  });

  app.delete("/api/v1/assessment-level-forms/:versionId", { preHandler: levelFormOperators }, async (request, reply): Promise<AssessmentLevelFormDeleteView | void> => {
    const params = levelFormVersionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LEVEL_FORM_VERSION" });
    try {
      const deleted = await repositories.assessments.deleteLevelForm(request.e4sSession!.user.id, params.data.versionId);
      return deleted ?? reply.code(404).send({ code: "LEVEL_FORM_NOT_FOUND" });
    } catch (error) {
      const code = assessmentErrorCode(error, "LEVEL_FORM_NOT_DELETABLE");
      return reply.code(code === "LEVEL_FORM_IN_USE" ? 409 : 400).send({ code });
    }
  });

  app.post("/api/v1/assessment-reviews/:attemptId/decision", { preHandler: assessmentReviewers }, async (request, reply) => {
    const params = attemptParam.safeParse(request.params);
    const body = decisionInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_DECISION" });
    let decision: Awaited<ReturnType<typeof repositories.assessments.decide>>;
    try {
      decision = await repositories.assessments.decide({
        attemptId: params.data.attemptId,
        reviewerId: request.e4sSession!.user.id,
        status: body.data.status,
        approvedLevel: body.data.approvedLevel ?? null,
        reason: body.data.reason,
        ...(body.data.grantRetake ? { grantRetake: true } : {})
      });
    } catch (error) {
      if (error instanceof PlacementRetakeError) return reply.code(409).send({ code: error.code });
      throw error;
    }
    if (!decision) return reply.code(409).send({ code: "ASSESSMENT_NOT_REVIEWABLE" });
    const view: AssessmentDecisionView = { ...decision, decidedAt: decision.decidedAt.toISOString() };
    return view;
  });

  /**
   * "Cho thi lại 1 lần": the Operator grants a learner's one placement retake, after a placement
   * result (sent back, or approved and disputed by the learner, e.g. in an appeal). A second grant
   * is refused (409 PLACEMENT_RETAKE_ALREADY_GRANTED); the retake needs a published retake form.
   */
  app.post("/api/v1/assessment-reviews/learners/:learnerId/placement-retake", { preHandler: assessmentReviewers }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    const body = placementRetakeGrantInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_PLACEMENT_RETAKE_GRANT" });
    if (body.data.kind === "pass_course" && !PASS_COURSE_RETAKE_ENABLED) return reply.code(404).send({ code: "RETAKE_KIND_DISABLED" });
    try {
      const grant = await grantPlacementRetake(pool, { learnerId: params.data.learnerId, reviewerId: request.e4sSession!.user.id, reason: body.data.reason });
      const view: AssessmentPlacementRetakeGrantView = {
        learnerId: grant.learnerId, status: "granted", sourceAttemptId: grant.sourceAttemptId, reason: grant.reason,
        grantedBy: grant.grantedBy ?? request.e4sSession!.user.id, grantedAt: grant.grantedAt.toISOString()
      };
      return reply.code(201).send(view);
    } catch (error) {
      if (error instanceof PlacementRetakeError) return reply.code(409).send({ code: error.code });
      throw error;
    }
  });

  /**
   * The learner's granted placement retake: the published retake form (not started yet) or the
   * retake attempt with its own form version. Null when no retake was ever granted.
   */
  const placementRetakeContext = async (learnerId: string): Promise<{
    view: AssessmentPlacementRetakeView;
    definition: PublishedAssessmentRecord | null;
    attempt: AssessmentAttemptRecord | null;
  } | null> => {
    const grant = await findPlacementRetakeGrant(pool, learnerId);
    if (!grant) return null;
    const status = placementRetakeStatus(grant);
    const view: AssessmentPlacementRetakeView = {
      status: status === "used" ? "used" : "granted", reason: grant.reason, grantedAt: grant.grantedAt.toISOString(),
      usedAt: grant.usedAt?.toISOString() ?? null, retakeAttemptId: grant.retakeAttemptId
    };
    if (grant.retakeAttemptId) {
      const attempt = await repositories.assessments.findAttempt(learnerId, grant.retakeAttemptId);
      return { view, attempt, definition: attempt ? await definitionForAttempt(repositories.assessments, attempt) : null };
    }
    return { view, attempt: null, definition: status === "granted" ? await findPublishedPlacementRetakeForm(pool, learnerId) : null };
  };
  const placementRetakeNotReady = { code: "PLACEMENT_RETAKE_FORM_NOT_PUBLISHED", message: "Đề thi lại đang được chuẩn bị. Vận hành sẽ báo khi bạn có thể bắt đầu." };

  app.get("/api/v1/assessments/:kind", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = kindParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_KIND" });
    const kind = normalizeKind(parsed.data.kind);
    if (kind === "pass-course" && !await repositories.assessments.passCourseEligibility(request.e4sSession!.user.id)) {
      return reply.code(409).send({ code: "PASS_COURSE_C1_NOT_READY" });
    }
    const learnerId = request.e4sSession!.user.id;
    const retake = kind === "placement" ? await placementRetakeContext(learnerId) : null;
    if (retake?.definition) {
      // A granted retake never resumes the old attempt: it shows the retake form (preparation)
      // until the learner starts it, then the NEW retake attempt.
      let attempt = retake.attempt;
      if (attempt && !await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
      attempt = await advanceExpiredSections(repositories.assessments, learnerId, retake.definition, attempt);
      const view = { ...assessmentView(retake.definition, attempt), placementRetake: retake.view };
      if (!attempt) return view;
      const [appeal, [appealTarget]] = await Promise.all([
        repositories.assessments.findAppeal(learnerId, attempt.id),
        repositories.assessments.listAppealableResults(learnerId, attempt.id)
      ]);
      return { ...view, appealTarget: appealTarget ?? null, appeal: appeal ? {
        ...appeal, createdAt: appeal.createdAt.toISOString(), resolvedAt: appeal.resolvedAt?.toISOString() ?? null
      } : null };
    }
    let activeAttempt = kind === "level-up" ? await repositories.assessments.findInProgressLevelUpAttempt(learnerId) : null;
    let definition: PublishedAssessmentRecord | null;
    if (kind === "final") {
      activeAttempt = await repositories.assessments.findMonthlyFinalAttempt(learnerId);
      if (!activeAttempt) {
        const eligibility = await monthlyExamEligibility(pool, learnerId);
        if (!eligibility.accessEligible) return reply.code(409).send(monthlyExamLocked(eligibility.entryClosed));
        activeAttempt = await repositories.assessments.findMonthlyFinalAttempt(learnerId, eligibility.month);
        definition = activeAttempt
          ? await definitionForAttempt(repositories.assessments, activeAttempt)
          : await findPublishedMonthlyFinal(pool, learnerId, eligibility.month);
      } else {
        definition = await definitionForAttempt(repositories.assessments, activeAttempt);
      }
    } else {
      definition = activeAttempt
        ? await definitionForAttempt(repositories.assessments, activeAttempt)
        : await repositories.assessments.findPublished(kind);
    }
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    const resumed = kind === "placement"
      ? await repositories.assessments.resumePlacementAttempt(learnerId, definition, request.e4sSessionId)
      : null;
    if (resumed?.state === "session_conflict") return reply.code(409).send(sessionConflict);
    if (resumed?.state === "restart_required") {
      return reply.code(409).send({
        code: "PLACEMENT_ATTEMPT_RESTART_REQUIRED",
        message: "Bài test cũ không thể chuyển an toàn sang phiên bản mới. Hãy bắt đầu lại để tránh trộn đề và điểm."
      });
    }
    let attempt = resumed ? resumed.attempt : activeAttempt ?? await repositories.assessments.findActiveAttempt(learnerId, definition.versionId);
    if (!resumed && attempt && !await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    attempt = await advanceExpiredSections(repositories.assessments, request.e4sSession!.user.id, definition, attempt);
    // A granted retake whose form is not published yet still tells the learner it was granted.
    const view = { ...assessmentView(definition, attempt), ...(retake ? { placementRetake: retake.view } : {}) };
    if (!attempt) return view;
    const [appeal, [appealTarget]] = await Promise.all([
      repositories.assessments.findAppeal(learnerId, attempt.id),
      repositories.assessments.listAppealableResults(learnerId, attempt.id)
    ]);
    return { ...view, appealTarget: appealTarget ?? null, appeal: appeal ? {
      ...appeal, createdAt: appeal.createdAt.toISOString(), resolvedAt: appeal.resolvedAt?.toISOString() ?? null
    } : null };
  });

  app.get("/api/v1/learner/appealable-assessments", { preHandler: learnerOnly }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const learnerId = request.e4sSession!.user.id;
    if (!await repositories.assessments.hasApprovedLevel(learnerId)) return { results: [] };
    return { results: await repositories.assessments.listAppealableResults(learnerId) };
  });

  /**
   * Learners may ask for a retake after a send-back or within 72 hours of an approval.
   * The Operator accepts the request and grants one retake, or rejects it.
   */
  const placementRetakeRequestView = async (learnerId: string): Promise<AssessmentPlacementRetakeRequestView> => {
    const state = await findPlacementRetakeRequestState(pool, learnerId);
    const activity = state.retake === "used" ? await readPlacementRetakeActivity(pool, learnerId) : null;
    const submission = async (source: typeof state.original, retake: boolean) => {
      const attempt = source ? await repositories.assessments.findAttempt(learnerId, source.attemptId) : null;
      if (!attempt || attempt.learnerId !== learnerId || attempt.status === "in_progress"
        || (retake && attempt.status !== "approved")) return null;
      const definition = await definitionForAttempt(repositories.assessments, attempt);
      if (definition?.kind !== "placement") return null;
      const blueprint = definition.blueprint;
      const isRetake = definition.assessmentKey === PLACEMENT_RETAKE_ASSESSMENT_KEY || blueprint.key === PLACEMENT_RETAKE_ASSESSMENT_KEY;
      if (isRetake !== retake) return null;
      return {
        definition: publicAssessmentDefinition(blueprint),
        objectiveAnswerKeys: Object.fromEntries(blueprint.sections
          .filter(section => section.code === "listening" || section.code === "reading")
          .map(section => [section.code, Object.fromEntries(section.groups.flatMap(group => group.tasks.flatMap(task => task.correctAnswer ? [[task.key, task.correctAnswer]] : [])))])),
        attempt: attemptView(attempt),
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        feedback: source?.feedback ?? null
      };
    };
    const [original, completedRetake] = await Promise.all([
      submission(state.original, false), submission(state.completedRetake ?? null, true)
    ]);
    return {
      original,
      ...(completedRetake ? { completedRetake: { ...completedRetake, approvedLevel: state.completedRetake?.approvedLevel ?? null } } : {}),
      target: state.target ? { ...state.target, availableUntil: state.target.availableUntil?.toISOString() ?? null } : null,
      request: state.request ? { ...state.request, createdAt: state.request.createdAt.toISOString(), resolvedAt: state.request.resolvedAt?.toISOString() ?? null } : null,
      retake: state.retake,
      ...(activity === "in_progress" || activity === "pending_review" ? { retakeActivity: activity } : {})
    };
  };

  app.get("/api/v1/learner/placement-retake-request", { preHandler: learnerOnly }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    return placementRetakeRequestView(request.e4sSession!.user.id);
  });

  app.post("/api/v1/learner/placement-retake-request", { preHandler: learnerOnly }, async (request, reply) => {
    const learnerId = request.e4sSession!.user.id;
    const body = z.object({ reason: z.string().trim().min(1).max(2_000) }).safeParse(request.body === undefined ? {} : request.body);
    if (!body.success) return reply.code(400).send({ code: "PLACEMENT_RETAKE_REQUEST_INVALID" });
    const created = await createPlacementRetakeRequest(pool, learnerId, body.data.reason);
    if (!created) return reply.code(409).send({ code: "PLACEMENT_RETAKE_REQUEST_NOT_AVAILABLE", message: "Đã hết thời hạn xin thi lại hoặc bạn đã gửi yêu cầu." });
    return reply.code(201).send(await placementRetakeRequestView(learnerId));
  });

  app.post("/api/v1/assessment-attempts/:attemptId/appeals", { preHandler: learnerOnly }, async (request, reply) => {
    const params = attemptParam.safeParse(request.params);
    const body = appealInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "ASSESSMENT_APPEAL_INVALID" });
    if (!await repositories.assessments.hasApprovedLevel(request.e4sSession!.user.id)) return reply.code(409).send(appealLevelNotApproved);
    const appeal = await repositories.assessments.createAppeal(
      request.e4sSession!.user.id, params.data.attemptId, body.data.reason, body.data
    );
    return appeal ? reply.code(201).send({
      ...appeal, createdAt: appeal.createdAt.toISOString(), resolvedAt: null
    }) : reply.code(409).send({ code: "ASSESSMENT_APPEAL_NOT_AVAILABLE" });
  });

  app.post("/api/v1/assessment-appeals/:appealId/decision", { preHandler: assessmentReviewers }, async (request, reply) => {
    const appealId = z.uuid().safeParse((request.params as { appealId?: string }).appealId);
    const body = appealResolutionInput.safeParse(request.body);
    if (!appealId.success || !body.success) return reply.code(400).send({ code: "ASSESSMENT_APPEAL_DECISION_INVALID" });
    let resolved: Awaited<ReturnType<typeof repositories.assessments.resolveAssessmentAppeal>>;
    try {
      resolved = await repositories.assessments.resolveAssessmentAppeal({
        appealId: appealId.data,
        reviewerId: request.e4sSession!.user.id,
        ...body.data
      });
    } catch (error) {
      // Accepting a "Xin thi lại" request grants the retake; its rules can refuse it.
      if (error instanceof PlacementRetakeError) return reply.code(409).send({ code: error.code });
      throw error;
    }
    return resolved
      ? { ...resolved, resolvedAt: resolved.resolvedAt.toISOString() }
      : reply.code(409).send({ code: "ASSESSMENT_APPEAL_NOT_RESOLVABLE" });
  });

  app.post("/api/v1/assessment-attempts/:attemptId/violations", { preHandler: learnerOnly }, async (request, reply): Promise<AssessmentRuntimeView> => {
    const params = attemptParam.safeParse(request.params);
    const body = violationInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "ASSESSMENT_VIOLATION_INVALID" });
    const learnerId = request.e4sSession!.user.id;
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    attempt = await advanceExpiredSections(repositories.assessments, learnerId, definition, attempt);
    if (!attempt) return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    const runtime = await repositories.assessments.recordAssessmentViolation({
      learnerId,
      attemptId: params.data.attemptId,
      requestId: body.data.requestId,
      reason: body.data.reason,
      occurredAt: body.data.occurredAt
    });
    if (runtime?.autoSubmitted) {
      const submittedAttempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
      if (submittedAttempt) await ensureObjectiveSectionScores(repositories.assessments, learnerId, definition, submittedAttempt);
    }
    return runtime ?? reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
  });

  app.post("/api/v1/assessments/:kind/start", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = kindParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_KIND" });
    const kind = normalizeKind(parsed.data.kind);
    const learnerId = request.e4sSession!.user.id;
    const retake = kind === "placement" ? await placementRetakeContext(learnerId) : null;
    if (retake && !retake.definition && retake.view.status === "granted") return reply.code(409).send(placementRetakeNotReady);
    if (retake?.definition) {
      if (retake.attempt) {
        if (!await canUseAttempt(request, retake.attempt)) return reply.code(409).send(sessionConflict);
        return reply.code(201).send({ ...assessmentView(retake.definition, retake.attempt), placementRetake: retake.view });
      }
      const first = retake.definition.blueprint.sections[0];
      if (!first) return reply.code(409).send({ code: "ASSESSMENT_BLUEPRINT_EMPTY" });
      // Uses the grant: a NEW attempt on the published retake form, never the old attempt.
      const attemptId = await startPlacementRetakeAttempt(pool, {
        learnerId,
        assessmentVersionId: retake.definition.versionId,
        firstSection: first.code,
        durationMinutes: first.durationMinutes,
        violationLimit: await repositories.assessments.assessmentViolationLimit(learnerId),
        ownerSessionId: request.e4sSessionId ?? null
      });
      const attempt = attemptId ? await repositories.assessments.findAttempt(learnerId, attemptId) : null;
      if (!attempt) return reply.code(409).send({ code: "PLACEMENT_RETAKE_NOT_AVAILABLE" });
      if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
      const used = await placementRetakeContext(learnerId);
      return reply.code(201).send({ ...assessmentView(retake.definition, attempt), placementRetake: used?.view ?? retake.view });
    }
    let definition: PublishedAssessmentRecord | null;
    if (kind === "level-up") {
      const active = await repositories.assessments.findInProgressLevelUpAttempt(learnerId);
      if (active) {
        if (!await canUseAttempt(request, active)) return reply.code(409).send(sessionConflict);
        const published = await definitionForAttempt(repositories.assessments, active);
        if (published) return reply.code(201).send(assessmentView(published, active));
      }
      const context = await repositories.assessments.levelUpStartContext(learnerId);
      if (context.currentLevel === "C1") return reply.code(409).send({ code: "LEVEL_UP_TOP_LEVEL" });
      if (context.active) return reply.code(409).send({ code: "LEVEL_UP_ALREADY_ACTIVE" });
      if (context.retryEligibleAt && context.retryEligibleAt.getTime() > Date.now()) {
        return reply.code(409).send({ code: "LEVEL_UP_RETRY_NOT_READY", eligibleAt: context.retryEligibleAt.toISOString() });
      }
      const progress = await repositories.learning.getProgressDashboard(learnerId);
      if (!progress?.levelReadiness.eligible || !progress.levelReadiness.targetLevel) {
        return reply.code(409).send({ code: "LEVEL_UP_NOT_READY" });
      }
      definition = await repositories.assessments.findPublishedLevelUpForLearner(learnerId, progress.levelReadiness.targetLevel);
    } else if (kind === "final") {
      let active = await repositories.assessments.findMonthlyFinalAttempt(learnerId);
      if (!active) {
        const eligibility = await monthlyExamEligibility(pool, learnerId);
        if (!eligibility.accessEligible) return reply.code(409).send(monthlyExamLocked(eligibility.entryClosed));
        active = await repositories.assessments.findMonthlyFinalAttempt(learnerId, eligibility.month);
        definition = await findPublishedMonthlyFinal(pool, learnerId, eligibility.month);
      } else {
        definition = await definitionForAttempt(repositories.assessments, active);
      }
      if (active) {
        if (!await canUseAttempt(request, active)) return reply.code(409).send(sessionConflict);
        const original = await definitionForAttempt(repositories.assessments, active);
        if (!original) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
        return reply.code(201).send(assessmentView(original, active));
      }
    } else if (kind === "pass-course") {
      if (!await repositories.assessments.passCourseEligibility(learnerId)) {
        return reply.code(409).send({ code: "PASS_COURSE_C1_NOT_READY" });
      }
      definition = await repositories.assessments.findPublished(kind);
    } else {
      definition = await repositories.assessments.findPublished(kind);
    }
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    if (kind === "placement") {
      const resumed = await repositories.assessments.resumePlacementAttempt(learnerId, definition, request.e4sSessionId);
      if (resumed.state === "session_conflict") return reply.code(409).send(sessionConflict);
      if (resumed.state === "restart_required") {
        return reply.code(409).send({
          code: "PLACEMENT_ATTEMPT_RESTART_REQUIRED",
          message: "Bài test cũ không thể chuyển an toàn sang phiên bản mới. Bấm bắt đầu lại để dùng đúng cấu trúc đề mới."
        });
      }
      if (resumed.attempt) return reply.code(201).send(assessmentView(definition, resumed.attempt));
      const profile = await repositories.learning.getProfile(learnerId);
      if (!profile || !isLearnerProfileComplete(profile.profile)) {
        return reply.code(409).send({ code: "PLACEMENT_PROFILE_INCOMPLETE", message: "Hãy lưu đủ các mục bắt buộc trong hồ sơ trước khi làm bài kiểm tra đầu vào." });
      }
    }
    const first = definition.blueprint.sections[0];
    if (!first) return reply.code(409).send({ code: "ASSESSMENT_BLUEPRINT_EMPTY" });
    const violationLimit = await repositories.assessments.assessmentViolationLimit(learnerId);
    const attempt = await repositories.assessments.startAttempt({
      learnerId,
      assessmentVersionId: definition.versionId,
      firstSection: first.code,
      durationMinutes: first.durationMinutes,
      violationLimit,
      ownerSessionId: request.e4sSessionId!
    });
    if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    return reply.code(201).send(assessmentView(definition, attempt));
  });

  app.put("/api/v1/assessment-attempts/:attemptId/responses/:section/:taskKey", { preHandler: learnerOnly }, async (request, reply) => {
    const params = responseParam.safeParse(request.params);
    const body = responseInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_RESPONSE" });
    const learnerId = request.e4sSession!.user.id;
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    attempt = await advanceExpiredSections(repositories.assessments, learnerId, definition, attempt);
    if (!attempt || attempt.status !== "in_progress" || attempt.currentSection !== params.data.section) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    const task = taskFor(definition, params.data.section, params.data.taskKey);
    if (!task || !validEvidence(task, body.data.evidenceType, body.data.value)) {
      return reply.code(400).send({ code: "ASSESSMENT_TASK_MISMATCH" });
    }
    if (body.data.evidenceType === "audio") {
      if (!body.data.artifactKey) {
        return reply.code(400).send({ code: "ASSESSMENT_AUDIO_ARTIFACT_REQUIRED" });
      }
      const owned = await repositories.files.ownedBy(learnerId, "assessment_audio", body.data.artifactKey);
      if (!owned) return reply.code(400).send({ code: "ASSESSMENT_ARTIFACT_NOT_OWNED" });
    }
    const saved = await repositories.assessments.saveResponse({
      learnerId,
      attemptId: attempt.id,
      section: params.data.section,
      taskKey: params.data.taskKey,
      value: body.data.value,
      evidenceType: body.data.evidenceType,
      ...(body.data.artifactKey ? { artifactKey: body.data.artifactKey } : {})
    });
    if (saved && body.data.evidenceType === "audio" && body.data.artifactKey) {
      await repositories.files.linkAudioToSource({
        ownerUserId: learnerId,
        audio: { artifactKey: body.data.artifactKey },
        sourceFlow: "placement",
        sourceEntityId: attempt.id,
        taskKey: params.data.taskKey
      });
    }
    return saved ? responseView(saved) : reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
  });

  app.post("/api/v1/assessment-attempts/:attemptId/sections/:section/groups/:groupKey/audio-play", { preHandler: learnerOnly }, async (request, reply) => {
    const params = audioPlayParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_AUDIO_GROUP" });
    const learnerId = request.e4sSession!.user.id;
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    attempt = await advanceExpiredSections(repositories.assessments, learnerId, definition, attempt);
    if (!attempt || attempt.status !== "in_progress" || attempt.currentSection !== params.data.section) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    const group = sectionByCode(definition.blueprint, params.data.section)?.groups
      .find((candidate) => candidate.key === params.data.groupKey);
    if (!group?.maxPlays) return reply.code(400).send({ code: "ASSESSMENT_AUDIO_GROUP_NOT_PLAYABLE" });
    const playCount = await repositories.assessments.recordAudioPlay({
      learnerId,
      attemptId: attempt.id,
      section: params.data.section,
      groupKey: group.key,
      maxPlays: group.maxPlays
    });
    return playCount === null
      ? reply.code(409).send({ code: "ASSESSMENT_AUDIO_PLAY_LIMIT_REACHED" })
      : { playCount, remaining: Math.max(0, group.maxPlays - playCount) };
  });

  app.post("/api/v1/assessment-attempts/:attemptId/sections/:section/complete", { preHandler: learnerOnly }, async (request, reply) => {
    const params = sectionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_SECTION" });
    if (params.data.section === "speaking") return reply.code(400).send({ code: "USE_ASSESSMENT_SUBMIT" });
    const learnerId = request.e4sSession!.user.id;
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    // A stale browser may finish a section after the server has already
    // auto-submitted it (timer/anti-cheat). Return the authoritative final
    // view so the prototype can leave its countdown instead of surfacing a
    // dead-end conflict.
    if (attempt.status !== "in_progress") return assessmentView(definition, attempt);
    if (attempt.currentSection !== params.data.section) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    attempt = await advanceExpiredSections(repositories.assessments, learnerId, definition, attempt);
    if (!attempt || attempt.status !== "in_progress" || attempt.currentSection !== params.data.section) {
      return attempt ? assessmentView(definition, attempt) : reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    const currentIndex = sectionOrder.indexOf(params.data.section);
    const nextCode = sectionOrder[currentIndex + 1];
    const next = nextCode ? sectionByCode(definition.blueprint, nextCode) : null;
    if (!next || !nextCode) return reply.code(409).send({ code: "ASSESSMENT_SECTION_ORDER_INVALID" });
    const updated = await repositories.assessments.advanceSection({
      learnerId, attemptId: attempt.id, currentSection: params.data.section,
      nextSection: nextCode, nextDurationMinutes: next.durationMinutes
    });
    return updated ? assessmentView(definition, updated) : reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
  });

  const scoringWorkerId = `assessment-api:${randomUUID()}`;
  let scoringWork: Promise<void> | undefined;
  let scoringTimer: ReturnType<typeof setInterval> | undefined;
  function processQueuedAssessment() {
    if (scoringWork) return;
    scoringWork = (async () => {
      const job = await repositories.jobs.leaseNext(scoringWorkerId, 600, ["assessment.ai-score-auto"]);
      if (!job) return;
      try {
        const { learnerId, attemptId } = z.object({ learnerId: z.uuid(), attemptId: z.uuid() }).parse(job.payload);
        const attempt = await repositories.assessments.findAttempt(learnerId, attemptId);
        if (attempt?.status === "pending_review") {
          const definition = await definitionForAttempt(repositories.assessments, attempt);
          const runner = await runnerFor(learnerId);
          if (!runner) throw Object.assign(new Error("AI is unavailable"), { code: "AI_UNAVAILABLE" });
          const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "assessment_scoring");
          if (!task) throw Object.assign(new Error("Missing assessment prompt"), { code: "AI_PROMPT_NOT_READY" });
          if (!definition || !sectionByCode(definition.blueprint, "writing") || !sectionByCode(definition.blueprint, "speaking")) {
            throw Object.assign(new Error("Missing productive sections"), { code: "ASSESSMENT_PRODUCTIVE_SECTIONS_MISSING" });
          }
          if (!await repositories.aiRuns.requestExists(learnerId, attemptId, "assessment_scoring")) {
            const { output, metadata } = await gradeAssessment(runner, definition.blueprint, attempt, task.prompt, artifactKey =>
              assessmentAudioTranscript(repositories.files, learnerId, attempt, artifactKey));
            await repositories.assessments.saveAssessmentRescore({
              actorId: learnerId, automatic: true, attemptId, requestId: attemptId, aiRequestKey: attemptId,
              taskId: task.taskId, promptVersionId: task.promptVersionId, output, metadata
            });
          }
        }
        await repositories.jobs.markSucceeded(job.id, scoringWorkerId);
      } catch (error) {
        const code = assessmentErrorCode(error, "ASSESSMENT_SCORING_FAILED");
        await repositories.jobs.markFailed(job.id, scoringWorkerId, code, false);
        app.log.warn({ jobId: job.id, code }, "Assessment AI grading failed; review remains pending");
      }
    })().catch((error) => {
      app.log.error({ code: assessmentErrorCode(error, "ASSESSMENT_SCORING_QUEUE_FAILED") }, "Could not process assessment queue");
    }).finally(() => { scoringWork = undefined; });
  }
  app.addHook("onReady", async () => {
    scoringTimer = setInterval(processQueuedAssessment, 1_000);
    scoringTimer.unref();
  });
  app.addHook("onClose", async () => {
    clearInterval(scoringTimer);
    await scoringWork;
  });

  app.post("/api/v1/assessment-attempts/:attemptId/submit", { preHandler: learnerOnly }, async (request, reply) => {
    const params = attemptParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_ATTEMPT" });
    const learnerId = request.e4sSession!.user.id;
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
    }
    if (!await canUseAttempt(request, attempt)) return reply.code(409).send(sessionConflict);
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    attempt = await advanceExpiredSections(repositories.assessments, learnerId, definition, attempt);
    if (!attempt) return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
    if (attempt.status === "pending_review" || attempt.status === "approved") {
      return assessmentView(definition, attempt);
    }
    if (attempt.status !== "in_progress" || attempt.currentSection !== "speaking") {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
    }

    await ensureObjectiveSectionScores(repositories.assessments, learnerId, definition, attempt);
    const submitted = await repositories.assessments.submitAssessmentAttempt({
      learnerId, attemptId: attempt.id, queueAiScoring: true
    });
    if (submitted) {
      processQueuedAssessment();
      return assessmentView(definition, submitted);
    }
    const raced = await repositories.assessments.findAttempt(learnerId, attempt.id);
    return raced && (raced.status === "pending_review" || raced.status === "approved")
      ? assessmentView(definition, raced)
      : reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
  });
}

async function assessmentFormPreviews(
  pool: Pool,
  actorId: string,
  kind: AssessmentFormPreviewView["kind"]
): Promise<AssessmentFormPreviewCollectionView> {
  const fixedForm = kind === "placement" || kind === "pass_course";
  const result = await pool.query<{
    definition_id: string;
    assessment_key: string;
    version_id: string;
    kind: AssessmentFormPreviewView["kind"];
    title: string;
    version: number;
    status: "draft" | "published" | "retired";
    published_at: Date | null;
    blueprint: StoredAssessmentDefinition;
    system_month: string;
  }>(
    `select ad.id as definition_id, ad.assessment_key, av.id as version_id, ad.kind, ad.title,
            av.version, av.status, av.published_at, av.blueprint,
            to_char(organization_system_date(actor.organization_id), 'YYYY-MM') as system_month
       from assessment_definitions ad
       join assessment_versions av on av.definition_id = ad.id
       join users actor on actor.id = $1 and actor.organization_id = ad.organization_id
      where ad.kind = $2
        -- The legacy generic monthly-final seed is not a month-scoped exam.
        -- Only finals created from an approved month contract may appear here.
        and ($2 <> 'final' or (ad.assessment_key like 'monthly-final-%'
          and substring(ad.assessment_key from 15 for 7) between
            to_char(organization_system_date(actor.organization_id) - interval '1 month', 'YYYY-MM') and
            to_char(organization_system_date(actor.organization_id) + interval '1 month', 'YYYY-MM')))
        and ${fixedForm ? "av.status = 'published'" : "av.status in ('draft', 'published')"}
      order by ad.assessment_key asc,
               case av.status when 'draft' then 0 when 'published' then 1 else 2 end,
               av.version desc`,
    [actorId, kind]
  );
  // The old seed supplied a short B1 form and a Pass Course blueprint copied
  // from it. Neither is a valid form under the approved specifications. Keep
  // them out of the Operator viewer until a generated level form or canonical
  // fixed Form A has been persisted; presenting them would make the preview
  // look valid while serving the wrong assessment.
  const validRows = result.rows.filter((row) => {
    if (kind === "level_up") return row.assessment_key !== "levelup-b1";
    if (kind === "placement") return row.assessment_key !== PLACEMENT_RETAKE_TARGET;
    if (kind === "pass_course") return isCanonicalPassCourseForm(row.blueprint);
    return true;
  });
  return {
    kind,
    forms: validRows.map((row): AssessmentFormPreviewView => {
      const monthlyFrameworkId = kind === "final" ? row.blueprint.monthlyExam?.framework?.id : undefined;
      const monthlyTitle = kind === "final" ? monthlyFinalTitle(row.assessment_key) : undefined;
      const listeningGroups = row.blueprint.sections
        .filter((section) => section.code === "listening")
        .flatMap((section) => section.groups);
      return {
        definitionId: row.definition_id,
        versionId: row.version_id,
        ...(monthlyFrameworkId ? { monthlyFrameworkId } : {}),
        kind: row.kind,
        title: monthlyTitle ?? row.title,
        version: row.version,
        status: row.status,
        publishedAt: row.published_at?.toISOString() ?? null,
        targetLevel: row.blueprint.targetLevel ?? null,
        totalMinutes: row.blueprint.totalMinutes,
        totalScore: row.blueprint.totalScore,
        audioConfigured: listeningGroups.length > 0 && listeningGroups.every((group) => group.stimulus?.type === "audio_script" && Boolean(group.stimulus.audioSrc?.trim())),
        editable: row.status === "draft" && kind !== "placement" && kind !== "pass_course"
          && (kind !== "final" || row.assessment_key.slice(14, 21) >= row.system_month),
        sections: normalizeLevelFormQuestionPrompts(row.blueprint).sections.map((section) => ({
          ...section,
          groups: section.groups.map((group) => ({
            ...group,
            tasks: group.tasks.map((task) => ({ ...task, correctAnswer: task.correctAnswer ?? null }))
          }))
        }))
      };
    })
  };
}

/** Placement queue items carry the learner's retake state; the retake attempt's decision is final. */
function placementRetakeQueueFields(
  item: { kind: AssessmentKind; learnerId: string; attemptId: string },
  retakes: Map<string, { status: AssessmentPlacementRetakeView["status"] | "not_granted"; retakeAttemptId: string | null }>
): Pick<AssessmentReviewQueueItem, "placementRetake" | "isPlacementRetake"> {
  if (item.kind !== "placement") return {};
  const retake = retakes.get(item.learnerId);
  return { placementRetake: retake?.status ?? "not_granted", isPlacementRetake: Boolean(retake?.retakeAttemptId && retake.retakeAttemptId === item.attemptId) };
}

function isCanonicalPassCourseForm(blueprint: StoredAssessmentDefinition) {
  if (blueprint.key !== "pass-course-form-a" || blueprint.totalMinutes !== 90 || blueprint.totalScore !== 100) return false;
  const count = (code: AssessmentSectionCode) => blueprint.sections.find((section) => section.code === code)?.groups.reduce((total, group) => total + group.tasks.length, 0) ?? 0;
  return count("listening") === 15 && count("reading") === 40 && count("writing") === 2 && count("speaking") === 4;
}

function assessmentErrorCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}

/** script hash → audioSrc over the target level's current draft and published forms; empty on any read error. */
async function previousLevelFormAudio(
  repository: ReturnType<typeof createRepositories>["assessments"], actorId: string, targetLevel: LevelFormTarget
): Promise<Map<string, string>> {
  try {
    const forms = (await repository.listLevelForms(actorId)).filter((form) => form.targetLevel === targetLevel);
    const details = await Promise.all(forms.map((form) => repository.getLevelFormDetail(actorId, form.versionId)));
    const index = new Map<string, string>();
    for (const detail of details) for (const [hash, url] of blueprintListeningAudioIndex(detail)) if (!index.has(hash)) index.set(hash, url);
    return index;
  } catch {
    return new Map();
  }
}

async function completeLevelFormReading(
  runner: AiTaskRunner,
  targetLevel: LevelFormTarget,
  reading: { passage: string; questions: LevelFormTaskOutput["reading"]["questions"][number][] }
): Promise<{ passage: string; questions: LevelFormTaskOutput["reading"]["questions"][number][] }> {
  const questions = [...reading.questions];
  while (questions.length < 40) {
    const repair = await runner.runTask("level_form_reading_repair", {
      targetLevel: aiTargetLevel(targetLevel), passage: reading.passage, existingPrompts: questions.map((question) => question.prompt)
    }, { systemPrompt: targetLevel === PLACEMENT_RETAKE_TARGET ? PLACEMENT_RETAKE_READING_REPAIR_PROMPT : LEVEL_FORM_READING_REPAIR_PROMPT, maxOutputTokens: 800, maxAttempts: 2 });
    const question = (repair.output as { question: LevelFormTaskOutput["reading"]["questions"][number] }).question;
    if (questions.some((item) => item.prompt.trim().toLocaleLowerCase() === question.prompt.trim().toLocaleLowerCase())) throw new Error("LEVEL_FORM_READING_REPAIR_DUPLICATE");
    questions.push(question);
  }
  return { passage: reading.passage, questions };
}

/** The AI-facing level: the placement retake spans A1–C1 instead of one target level. */
function aiTargetLevel(targetLevel: LevelFormTarget): Exclude<LevelFormTarget, typeof PLACEMENT_RETAKE_TARGET> | "A1-C1" {
  return targetLevel === PLACEMENT_RETAKE_TARGET ? "A1-C1" : targetLevel;
}

/** Key, kind and title of a level form: a level-up form, or the placement retake form. */
function levelFormIdentity(targetLevel: LevelFormTarget, manual = false): Pick<StoredAssessmentDefinition, "key" | "kind" | "title" | "targetLevel"> & { speakingInstruction: string } {
  if (targetLevel === PLACEMENT_RETAKE_TARGET) {
    return { key: PLACEMENT_RETAKE_TARGET, kind: "placement", title: manual ? `${PLACEMENT_RETAKE_TITLE} — bản soạn tay` : PLACEMENT_RETAKE_TITLE, speakingInstruction: "Hoàn thành bốn nhiệm vụ nói; độ khó tăng dần từ A1 đến C1." };
  }
  return { key: `level-up-${targetLevel.toLowerCase()}`, kind: "level-up", title: manual ? `Đề thi lên mức ${targetLevel} — bản soạn tay` : `Đề thi lên mức ${targetLevel}`, targetLevel, speakingInstruction: "Hoàn thành bốn nhiệm vụ nói ở mức đích." };
}

function manualLevelFormBlueprint(targetLevel: LevelFormTarget): StoredAssessmentDefinition {
  if (targetLevel === PLACEMENT_RETAKE_TARGET) return placementRetakeBlueprint(null, { manual: true });
  const { speakingInstruction, ...identity } = levelFormIdentity(targetLevel, true);
  const choices = () => ["A", "B", "C", "D"].map((value) => ({ value, label: "" }));
  const choiceTasks = (prefix: "L" | "R", count: number) => Array.from({ length: count }, (_, index) => ({
    key: `${prefix}${index + 1}`, prompt: "", responseType: "single_choice" as const, maxScore: 1, options: choices()
  }));
  return {
    ...identity, version: 1,
    totalMinutes: 75, totalScore: 100,
    sections: [
      { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Nghe tối đa 2 lần và chọn đáp án đúng."], groups: [{ key: "L", title: "Workplace listening", instruction: "", maxPlays: 2, stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: "" }] }, tasks: choiceTasks("L", 20) }] },
      { code: "reading", title: "Đọc", durationMinutes: 25, maxScore: 40, instructions: ["Đọc và chọn đáp án đúng."], groups: [{ key: "R", title: "Workplace reading", instruction: "", stimulus: { type: "passage", text: "" }, tasks: choiceTasks("R", 40) }] },
      { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Hoàn thành cả hai nhiệm vụ viết."], groups: [{ key: "W", title: "Writing", instruction: "", tasks: [
        { key: "W1", prompt: "", responseType: "long_text" as const, maxScore: 7, minWords: 50, maxWords: 80 },
        { key: "W2", prompt: "", responseType: "long_text" as const, maxScore: 13, minWords: 120, maxWords: 150 }
      ] }] },
      { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: [speakingInstruction], groups: Array.from({ length: 4 }, (_, index) => ({ key: `S${index + 1}`, title: `Speaking ${index + 1}`, instruction: "", tasks: [{ key: `S${index + 1}`, prompt: "", responseType: "speaking_evidence" as const, maxScore: 5 }] })) }
    ]
  };
}
/** The three AI slices of one level-up form (reading already completed to 40 questions). */
export interface LevelFormAiSlices {
  listening: unknown;
  reading: { passage: string; questions: LevelFormTaskOutput["reading"]["questions"][number][] };
  production: unknown;
}

export interface AssembledLevelForm {
  /** Canonical, schema-checked AI output in the order the model returned it (recorded on the AI run). */
  output: LevelFormTaskOutput;
  /** The same output after the seeded answer-position shuffle; the blueprint is built from this. */
  shuffled: LevelFormTaskOutput;
  quality: LevelFormQualityReport;
  /** Draft blueprint; light gate warnings are stored on it as `levelFormQuality`. */
  blueprint: StoredAssessmentDefinition & { levelFormQuality: LevelFormQualityRecord };
  /** Seed of the answer shuffle (the auto-fix rebalances repaired questions with the same seed). */
  seed: string;
  targetLevel: LevelFormTarget;
  checkedAt: string;
}

/**
 * AI slices -> canonical output -> seeded answer shuffle (correctIndex remapped)
 * -> content gate -> draft blueprint. Pure: the route persists the result only
 * when `quality.passed`; the quality harness calls this same function.
 */
export function assembleLevelFormFromAi(
  targetLevel: LevelFormTarget, slices: LevelFormAiSlices, options: { seed?: string; now?: Date } = {}
): AssembledLevelForm {
  const listening = slices.listening as { title: string; script: string; questions: unknown[] };
  const production = slices.production as { writingPrompts: string[]; speakingPrompts: string[] };
  const output = levelFormOutputSchema.parse({
    title: levelFormExamTitle(listening.title, targetLevel === PLACEMENT_RETAKE_TARGET ? "Placement Retake" : targetLevel),
    listening: { ...listening, questions: listening.questions.slice(0, 20) },
    reading: slices.reading,
    writingPrompts: production.writingPrompts,
    speakingPrompts: production.speakingPrompts
  });
  const seed = options.seed ?? `level-form:${targetLevel}:${output.title}\n${output.listening.script}\n${output.reading.passage}`;
  const shuffled: LevelFormTaskOutput = {
    ...output,
    listening: { ...output.listening, questions: rebalanceAnswerPositions(output.listening.questions, `${seed}:listening`, 4) },
    reading: { ...output.reading, questions: rebalanceAnswerPositions(output.reading.questions, `${seed}:reading`, 4) }
  };
  const quality = evaluateLevelFormQuality(levelFormQualityInputFromOutput(shuffled));
  const checkedAt = (options.now ?? new Date()).toISOString();
  const blueprint = levelFormDraftBlueprint(targetLevel, shuffled, { checkedAt, warnings: quality.light });
  return { output, shuffled, quality, blueprint, seed, targetLevel, checkedAt };
}

function levelFormDraftBlueprint(targetLevel: LevelFormTarget, shuffled: LevelFormTaskOutput, record: LevelFormQualityRecord): AssembledLevelForm["blueprint"] {
  return { ...normalizeLevelFormQuestionPrompts(levelFormBlueprint(targetLevel, shuffled)), levelFormQuality: record };
}

/**
 * Applies the generation auto-fix (level-form-auto-fix.ts) to an assembled
 * form and rebuilds the blueprint; the notes are stored as
 * `levelFormQuality.autoFixed` and shown as "Hệ thống đã tự sửa: …".
 */
export async function autoFixAssembledLevelForm(
  runner: AiTaskRunner | undefined, assembled: AssembledLevelForm, log?: (message: string, details: Record<string, unknown>) => void
): Promise<AssembledLevelForm & { autoFixed: string[] }> {
  const fixed = await autoFixLevelFormOutput(runner, { targetLevel: aiTargetLevel(assembled.targetLevel), original: assembled.output, shuffled: assembled.shuffled, seed: assembled.seed, ...(log ? { log } : {}) });
  const record: LevelFormQualityRecord = { checkedAt: assembled.checkedAt, warnings: fixed.quality.light, ...(fixed.autoFixed.length ? { autoFixed: fixed.autoFixed } : {}) };
  return { ...assembled, shuffled: fixed.output, quality: fixed.quality, blueprint: levelFormDraftBlueprint(assembled.targetLevel, fixed.output, record), autoFixed: fixed.autoFixed };
}

/**
 * Re-runs the content gate on the saved (possibly Operator-edited) sections and
 * adds its findings to the detail warnings. Skipped while choice questions are
 * still blank: the completeness warnings already cover that state.
 */
export function withLevelFormQualityWarnings(detail: AssessmentLevelFormDetailView): AssessmentLevelFormDetailView {
  const choiceTasks = detail.sections.filter((section) => section.code === "listening" || section.code === "reading")
    .flatMap((section) => section.groups.flatMap((group) => group.tasks.filter((task) => task.responseType === "single_choice")));
  const complete = choiceTasks.length > 0 && choiceTasks.every((task) => task.prompt.trim() && task.correctAnswer && (task.options ?? []).length >= 2 && (task.options ?? []).every((option) => option.label.trim()));
  const retake = detail.targetLevel === PLACEMENT_RETAKE_TARGET;
  // The retake form must keep placement-a's exact structure, also after Operator edits.
  const structure = retake ? placementRetakeStructureGateIssues({
    key: PLACEMENT_RETAKE_TARGET, kind: "placement", title: detail.title, version: detail.version,
    totalMinutes: detail.sections.reduce((total, section) => total + section.durationMinutes, 0),
    totalScore: detail.sections.reduce((total, section) => total + section.maxScore, 0),
    sections: detail.sections as StoredAssessmentDefinition["sections"]
  }).map((issue) => ({ code: "quality_check" as const, message: issue.message, severity: "error" as const })) : [];
  if (!complete) return structure.length ? { ...detail, warnings: [...detail.warnings, ...structure] } : detail;
  const report = evaluateLevelFormQuality(retake ? placementRetakeQualityInput(detail.sections) : levelFormQualityInputFromSections(detail.sections));
  return {
    ...detail,
    warnings: [
      ...detail.warnings,
      ...structure,
      ...[...report.severe, ...report.light].map((issue) => ({ code: "quality_check" as const, message: issue.message, severity: issue.severity === "severe" ? "error" as const : "warning" as const }))
    ]
  };
}

function levelFormBlueprint(targetLevel: LevelFormTarget, output: LevelFormTaskOutput): StoredAssessmentDefinition {
  const options = ["A", "B", "C", "D"] as const;
  const choiceTasks = (prefix: string, questions: LevelFormTaskOutput["listening"]["questions"], maxScore: number) => questions.map((question, index) => ({
    key: `${prefix}${index + 1}`, prompt: question.prompt, responseType: "single_choice" as const, maxScore,
    options: question.options.map((label, optionIndex) => ({ value: options[optionIndex]!, label })),
    correctAnswer: options[question.correctIndex]!
  }));
  if (targetLevel === PLACEMENT_RETAKE_TARGET) return placementRetakeBlueprint(output);
  const listeningParts = splitLevelFormListeningParts(output.listening.script);
  const { speakingInstruction, ...identity } = levelFormIdentity(targetLevel);
  return {
    ...identity,
    version: 1, totalMinutes: 75, totalScore: 100,
    sections: [
      { code: "listening", title: "Nghe", durationMinutes: 15, maxScore: 20, instructions: ["Nghe tối đa 2 lần và chọn đáp án đúng."], groups: listeningParts.map((part, index) => ({ key: `L${index + 1}`, title: `Part ${String.fromCharCode(65 + index)} – ${part.title}`, instruction: `Nghe phần ${String.fromCharCode(65 + index)} và trả lời câu ${index * 4 + 1}–${index * 4 + 4}.`, maxPlays: 2, stimulus: { type: "audio_script", lines: [{ speaker: "Narrator", text: part.script }] }, tasks: choiceTasks(`L${index + 1}_`, output.listening.questions.slice(index * 4, index * 4 + 4), 1) })) },
      { code: "reading", title: "Đọc", durationMinutes: 25, maxScore: 40, instructions: ["Đọc và chọn đáp án đúng."], groups: Array.from({ length: 4 }, (_, index) => ({ key: `R${index + 1}`, title: `Part ${String.fromCharCode(65 + index)} – Questions ${index * 10 + 1}–${index * 10 + 10}`, instruction: "Đọc và chọn một đáp án đúng nhất.", ...(index === 0 ? { stimulus: { type: "passage" as const, text: output.reading.passage } } : {}), tasks: choiceTasks(`R${index + 1}_`, output.reading.questions.slice(index * 10, index * 10 + 10), 1) })) },
      { code: "writing", title: "Viết", durationMinutes: 20, maxScore: 20, instructions: ["Hoàn thành cả hai nhiệm vụ viết."], groups: [
        { key: "W1", title: "Task 1 – Phản hồi nhanh", instruction: "Hoàn thành nhiệm vụ viết thứ nhất.", tasks: [{ key: "W1", prompt: output.writingPrompts[0]!, responseType: "long_text", maxScore: 7, minWords: 50, maxWords: 80 }] },
        { key: "W2", title: "Task 2 – Email / đề xuất", instruction: "Hoàn thành nhiệm vụ viết thứ hai.", tasks: [{ key: "W2", prompt: output.writingPrompts[1]!, responseType: "long_text", maxScore: 13, minWords: 120, maxWords: 150 }] }
      ] },
      { code: "speaking", title: "Nói", durationMinutes: 15, maxScore: 20, instructions: [speakingInstruction], groups: output.speakingPrompts.map((prompt, index) => ({ key: `S${index + 1}`, title: `Speaking ${index + 1}`, instruction: "Hoàn thành nhiệm vụ nói.", tasks: [{ key: `S${index + 1}`, prompt, responseType: "speaking_evidence" as const, maxScore: 5 }] })) }
    ]
  };
}

function normalizeKind(kind: "placement" | "levelup" | "level-up" | "monthly" | "final" | "pass-course" | "passcourse"): AssessmentKind {
  if (kind === "levelup") return "level-up";
  if (kind === "passcourse") return "pass-course";
  return kind === "monthly" ? "final" : kind;
}

async function definitionForAttempt(
  repository: ReturnType<typeof createRepositories>["assessments"],
  attempt: AssessmentAttemptRecord
): Promise<PublishedAssessmentRecord | null> {
  return repository.findPublishedByVersion(attempt.assessmentVersionId);
}

function monthlyExamLocked(entryClosed?: boolean) {
  return { code: entryClosed ? "MONTHLY_EXAM_ENTRY_CLOSED" : "MONTHLY_EXAM_LOCKED", ...(entryClosed ? { message: "Đã hết giờ vào thi." } : {}) };
}

async function findPublishedMonthlyFinal(pool: Pool, learnerId: string, month: string): Promise<PublishedAssessmentRecord | null> {
  const result = await pool.query<{
    definition_id: string; version_id: string; assessment_key: string; kind: "final"; title: string; version: number; blueprint: StoredAssessmentDefinition;
  }>(
    `select ad.id as definition_id, av.id as version_id, ad.assessment_key, ad.kind, ad.title, av.version, av.blueprint
     from users learner
     join enrollments enrollment on enrollment.learner_id = learner.id
     join program_months pm on pm.organization_id = learner.organization_id
       and pm.month = $2
     join assessment_definitions ad on ad.organization_id = learner.organization_id and ad.kind = 'final'
       and ad.assessment_key = ('monthly-final-' || pm.month || '-' || lower(enrollment.cefr))
     join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
     where learner.id = $1 and enrollment.cefr_approved = true
     order by enrollment.enrolled_at desc, av.published_at desc nulls last limit 1`, [learnerId, month]
  );
  const row = result.rows[0];
  return row ? { definitionId: row.definition_id, versionId: row.version_id, assessmentKey: row.assessment_key, kind: row.kind, title: row.title, version: row.version, blueprint: row.blueprint } : null;
}

function taskFor(definition: PublishedAssessmentRecord, sectionCode: AssessmentSectionCode, taskKey: string): StoredAssessmentTask | null {
  const section = sectionByCode(definition.blueprint, sectionCode);
  return section?.groups.flatMap((group) => group.tasks).find((task) => task.key === taskKey) ?? null;
}

function validEvidence(task: StoredAssessmentTask, evidence: AssessmentEvidenceType, value: string): boolean {
  if (task.responseType === "single_choice") {
    return evidence === "choice" && Boolean(task.options?.some((option) => option.value === value));
  }
  if (task.responseType === "long_text") return evidence === "text" && value.trim().length > 0;
  // Speaking accepts a real recording only: typed answers ("Nói bằng chữ") belonged to the old system and the
  // learner app has no way to send them. Older stored transcript/typed_proxy rows stay readable for review.
  return evidence === "audio" && value.trim().length > 0;
}

function assessmentView(definition: PublishedAssessmentRecord, attempt: AssessmentAttemptRecord | null): AssessmentView {
  const publicDefinition = publicAssessmentDefinition(definition.blueprint, { hideListeningScript: definition.kind === "placement" });
  if (!attempt) return { definition: publicDefinition, screenState: "preparation", attempt: null };
  const screenState = attempt.status === "in_progress"
    ? attempt.currentSection ?? "submitting"
    : "pending";
  const runtime = runtimeView(attempt);
  return { definition: publicDefinition, screenState, attempt: { ...attemptView(attempt), runtime }, runtime };
}

function attemptView(attempt: AssessmentAttemptRecord): AssessmentAttemptView {
  const statuses = Object.fromEntries(sectionOrder.map((section) => {
    const timing = attempt.timingState.sections?.[section];
    const status: AssessmentSectionStatus = timing?.completedAt ? "completed"
      : attempt.currentSection === section ? "in_progress"
        : timing ? "not_started" : "locked";
    return [section, status];
  })) as Record<AssessmentSectionCode, AssessmentSectionStatus>;
  const sectionEndsAt = attempt.currentSection
    ? attempt.timingState.sections?.[attempt.currentSection]?.endsAt ?? null
    : null;
  const values = Object.values(attempt.scores);
  const totalScore = values.length === 4 ? values.reduce<number>((total, score) => total + Number(score), 0) : null;
  const runtime = runtimeView(attempt);
  return {
    id: attempt.id,
    status: attempt.status,
    currentSection: attempt.currentSection,
    startedAt: attempt.startedAt.toISOString(),
    sectionEndsAt,
    responses: attempt.responses.map(responseView),
    sectionStatuses: statuses,
    sectionScores: attempt.scores,
    audioPlayCounts: attempt.audioPlayCounts,
    runtime,
    totalScore,
    suggestedLevel: attempt.suggestedLevel
  };
}

function runtimeView(attempt: AssessmentAttemptRecord): AssessmentRuntimeView {
  const timing = attempt.currentSection ? attempt.timingState.sections?.[attempt.currentSection] : undefined;
  return {
    remainingSeconds: attempt.status === "in_progress"
      ? timing?.endsAt ? Math.max(0, Math.ceil((new Date(timing.endsAt).getTime() - Date.now()) / 1000)) : null
      : 0,
    violationCount: attempt.violationCount,
    violationLimit: attempt.violationLimit,
    submitReason: attempt.submitReason,
    status: attempt.status,
    currentSection: attempt.currentSection,
    audioPlayCounts: attempt.audioPlayCounts,
    deviceEvidence: attempt.deviceEvidence,
    mediaEvidence: attempt.mediaEvidence
  };
}

function responseView(response: AssessmentAttemptRecord["responses"][number]) {
  return {
    section: response.section,
    taskKey: response.taskKey,
    value: response.value,
    evidenceType: response.evidenceType,
    ...(response.artifactKey ? { artifactKey: response.artifactKey } : {}),
    savedAt: response.savedAt.toISOString()
  };
}

async function advanceExpiredSections(
  repository: ReturnType<typeof createRepositories>["assessments"],
  learnerId: string,
  definition: PublishedAssessmentRecord,
  initial: AssessmentAttemptRecord | null
): Promise<AssessmentAttemptRecord | null> {
  let attempt = initial;
  while (attempt?.status === "in_progress" && attempt.currentSection) {
    const timing = attempt.timingState.sections?.[attempt.currentSection];
    if (!timing || new Date(timing.endsAt).getTime() > Date.now()) break;
    const index = sectionOrder.indexOf(attempt.currentSection);
    const nextCode = sectionOrder[index + 1];
    if (!nextCode) {
      await ensureObjectiveSectionScores(repository, learnerId, definition, attempt);
      attempt = await repository.submitAttempt(learnerId, attempt.id, "timeout");
      break;
    }
    const next = sectionByCode(definition.blueprint, nextCode);
    if (!next) break;
    attempt = await repository.advanceSection({
      learnerId, attemptId: attempt.id, currentSection: attempt.currentSection,
      nextSection: nextCode, nextDurationMinutes: next.durationMinutes, auto: true
    });
  }
  return attempt;
}

async function ensureObjectiveSectionScores(
  repository: ReturnType<typeof createRepositories>["assessments"],
  learnerId: string,
  definition: PublishedAssessmentRecord,
  attempt: AssessmentAttemptRecord
): Promise<boolean> {
  let changed = false;
  for (const sectionCode of ["listening", "reading"] as const) {
    const section = sectionByCode(definition.blueprint, sectionCode);
    if (!section) continue;
    const responseMap = new Map(attempt.responses.filter((response) => response.section === sectionCode)
      .map((response) => [response.taskKey, response.value]));
    const items = (section.groups ?? []).flatMap((group) => group.tasks)
      .filter((task): task is StoredAssessmentTask & { correctAnswer: string } => Boolean(task.correctAnswer))
      .map((task) => ({ taskKey: task.key, answer: responseMap.get(task.key), correctAnswer: task.correctAnswer, maxScore: task.maxScore }));
    const score = calculateAutomaticSectionScore(items);
    changed = await repository.upsertSectionScore({
      learnerId, attemptId: attempt.id, section: sectionCode, score: score.score,
      criteria: { answered: score.answered, total: score.total, maxScore: score.maxScore }, source: "deterministic"
    }) || changed;
  }
  return changed;
}

async function gradeAssessment(
  runner: AiTaskRunner, definition: StoredAssessmentDefinition, attempt: AssessmentAttemptRecord, prompt: string,
  transcriptFor: (artifactKey: string) => Promise<string | null>
): Promise<{
  metadata: Awaited<ReturnType<AiTaskRunner["runTask"]>>["metadata"];
  output: { writingScore: number; speakingScore: number | null; rationale: string; suggestedLevel?: CefrLevel; monthlyGoal?: string; writingCriteria?: Record<string, unknown>; speakingCriteria?: Record<string, unknown> };
}> {
  if (definition.kind === "final" || definition.kind === "pass-course") return gradeProductiveAssessment(runner, definition, attempt, transcriptFor);
  const result = await runner.runTask("assessment_scoring", assessmentGradingInput(definition, attempt), { systemPrompt: prompt });
  const parsed = assessmentGradingOutputSchema.safeParse(result.output);
  if (!parsed.success) throw new Error("AI_OUTPUT_INVALID");
  return { metadata: result.metadata, output: {
    ...parsed.data,
    writingScore: Math.min(sectionByCode(definition, "writing")!.maxScore, parsed.data.writingScore),
    speakingScore: Math.min(sectionByCode(definition, "speaking")!.maxScore, parsed.data.speakingScore)
  } };
}

async function assessmentAudioTranscript(
  files: ReturnType<typeof createRepositories>["files"], viewerId: string, attempt: AssessmentAttemptRecord, artifactKey: string
) {
  const file = await files.findAssessmentAudioForViewer(viewerId, artifactKey);
  return file?.sourceEntityId === attempt.id && file.ownerUserId === attempt.learnerId && !file.deletedAt
    ? file.transcript
    : null;
}

function assessmentGradingInput(definition: StoredAssessmentDefinition, attempt: AssessmentAttemptRecord) {
  const answerFor = (section: AssessmentSectionCode, taskKey: string) =>
    attempt.responses.find((response) => response.section === section && response.taskKey === taskKey);
  const objectiveScore = (sectionCode: "listening" | "reading") => {
    const section = sectionByCode(definition, sectionCode);
    if (!section) throw new Error("ASSESSMENT_OBJECTIVE_SECTION_MISSING");
    const responseMap = new Map(attempt.responses
      .filter((response) => response.section === sectionCode)
      .map((response) => [response.taskKey, response.value]));
    const items = section.groups.flatMap((group) => group.tasks)
      .filter((task): task is StoredAssessmentTask & { correctAnswer: string } => Boolean(task.correctAnswer))
      .map((task) => ({ taskKey: task.key, answer: responseMap.get(task.key), correctAnswer: task.correctAnswer, maxScore: task.maxScore }));
    const score = calculateAutomaticSectionScore(items);
    return {
      ...score,
      groups: section.groups.map((group) => ({ groupKey: group.key, taskKeys: group.tasks.map((task) => task.key) }))
    };
  };
  const writing = sectionByCode(definition, "writing");
  const speaking = sectionByCode(definition, "speaking");
  if (!writing || !speaking) throw new Error("ASSESSMENT_PRODUCTIVE_SECTIONS_MISSING");
  return {
    kind: definition.kind,
    objectiveScores: { listening: objectiveScore("listening"), reading: objectiveScore("reading") },
    writing: writing.groups.flatMap((group) => group.tasks).map((item) => ({
      prompt: item.prompt,
      answer: answerFor("writing", item.key)?.value ?? ""
    })),
    speaking: speaking.groups.flatMap((group) => group.tasks).map((item) => {
      const answer = answerFor("speaking", item.key);
      return { prompt: item.prompt, answer: answer?.value ?? "", evidenceType: answer?.evidenceType ?? "technical_failure" };
    }),
    writingMaxScore: writing.maxScore,
    speakingMaxScore: speaking.maxScore
  };
}

async function repairReviewObjectiveScores(
  repository: ReturnType<typeof createRepositories>["assessments"],
  reviewerId: string,
  attemptId: string
): Promise<boolean> {
  const view = await repository.getReviewAttempt(reviewerId, attemptId);
  if (!view || view.status === "in_progress") return false;
  let changed = false;
  for (const sectionCode of ["listening", "reading"] as const) {
    const section = view.sections?.find((candidate) => candidate.section === sectionCode);
    if (!section || section.score != null) continue;
    const items = (section.groups ?? []).flatMap((group) => group.tasks)
      .filter((task): task is typeof task & { correctAnswer: string } => Boolean(task.correctAnswer))
      .map((task) => ({ taskKey: task.taskKey, answer: task.answer ?? undefined, correctAnswer: task.correctAnswer, maxScore: task.maxScore ?? 0 }));
    const score = calculateAutomaticSectionScore(items);
    changed = await repository.upsertSectionScore({
      learnerId: view.learnerId, attemptId, section: sectionCode, score: score.score,
      criteria: { answered: score.answered, total: score.total, maxScore: score.maxScore, repaired: true }, source: "deterministic"
    }) || changed;
  }
  return changed;
}
