import type {
  AssessmentDeletionRequestView,
  AssessmentAttemptView,
  AssessmentDecisionView,
  AssessmentEvidenceType,
  AssessmentKind,
  AssessmentLevelFormSlotView,
  AssessmentLevelFormDetailView,
  AssessmentLevelFormDeleteView,
  AssessmentReviewOverviewView,
  AssessmentReviewAttemptDetailView,
  AssessmentReviewChallengeView,
  AssessmentReviewLearnerView,
  AssessmentReviewQueueItem,
  AssessmentRuntimeView,
  AssessmentSectionCode,
  AssessmentSectionStatus,
  AssessmentView,
  CefrLevel,
  ManualAssessmentScoreInput
} from "@e4s/contracts";
import { assessmentGradingOutputSchema, levelFormOutputSchema, type LevelFormTaskOutput } from "@e4s/ai";
import {
  createRepositories,
  publicAssessmentDefinition,
  sectionByCode,
  type AssessmentAttemptRecord,
  type PublishedAssessmentRecord,
  type StoredAssessmentDefinition,
  type StoredAssessmentTask
} from "@e4s/database";
import { calculateAutomaticSectionScore } from "@e4s/domain/assessment";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import type { AiTaskRunner } from "../coach/index.js";

const kindParam = z.object({ kind: z.enum(["placement", "final", "levelup", "level-up"]) });
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
  reason: z.string().trim().min(1).max(2_000)
}).superRefine((value, context) => {
  if (value.status === "approved" && !value.approvedLevel) {
    context.addIssue({ code: "custom", path: ["approvedLevel"], message: "approvedLevel is required" });
  }
  if (value.status === "needs_retry" && value.approvedLevel) {
    context.addIssue({ code: "custom", path: ["approvedLevel"], message: "approvedLevel is not allowed" });
  }
});
const appealInput = z.object({ reason: z.string().trim().min(10).max(2_000) });
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
const manualScoreValue = z.number().int().min(0).max(5);
const manualScoreInput = z.object({
  writingCriteria: z.object({
    taskAchievement: manualScoreValue,
    organization: manualScoreValue,
    vocabulary: manualScoreValue,
    grammar: manualScoreValue,
    workplaceCommunication: manualScoreValue
  }).strict(),
  speakingCriteria: z.object({
    fluency: manualScoreValue,
    grammar: manualScoreValue,
    vocabulary: manualScoreValue,
    professionalCommunication: manualScoreValue
  }).strict(),
  comment: z.string().trim().max(5_000)
}) satisfies z.ZodType<ManualAssessmentScoreInput>;
const violationInput = z.object({
  requestId: z.string().trim().min(1).max(160),
  reason: z.enum(["visibility_hidden", "window_blur"]),
  occurredAt: z.string().datetime({ offset: true })
});

const sectionOrder: AssessmentSectionCode[] = ["listening", "reading", "writing", "speaking"];
const levelFormParam = z.object({ targetLevel: z.enum(["A2", "B1", "B2", "C1"]) });
const levelFormVersionParam = z.object({ versionId: z.uuid() });

export function registerAssessmentRoutes(app: FastifyInstance, pool: Pool, aiRunner?: AiTaskRunner, aiRunnerFactory?: (actorId: string) => Promise<AiTaskRunner | undefined>): void {
  const repositories = createRepositories(pool);
  const runnerFor = (actorId: string) => aiRunnerFactory ? aiRunnerFactory(actorId) : Promise.resolve(aiRunner);
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const assessmentReaders = createRoleGuard(pool, ["operator", "manager"]);
  const assessmentReviewers = createRoleGuard(pool, ["operator", "manager"]);
  const assessmentOperators = createRoleGuard(pool, ["operator", "manager"]);

  app.get("/api/v1/assessment-reviews/pending", { preHandler: assessmentReaders }, async (request) => {
    const pending = await repositories.assessments.listPending(request.e4sSession!.user.id);
    return pending.map((item): AssessmentReviewQueueItem => ({
      ...item,
      submittedAt: item.submittedAt.toISOString()
    }));
  });

  app.get("/api/v1/assessment-reviews/overview", { preHandler: assessmentReaders }, async (request): Promise<AssessmentReviewOverviewView> => {
    const overview = await repositories.assessments.getReviewOverview(request.e4sSession!.user.id);
    const [topicReports, learnerDashboards, weakSignalRows] = await Promise.all([pool.query<{
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
    )]);
    const queueView = (item: typeof overview.pending[number]): AssessmentReviewQueueItem => ({
      ...item,
      submittedAt: item.submittedAt.toISOString()
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
      pendingAssessments: overview.pending.filter((item) => item.kind !== "level-up").map(queueView),
      pendingLevelUp: overview.pending.filter((item) => item.kind === "level-up").map(queueView),
      approvedLearners: overview.approvedLearners,
      unassessedLearners: overview.unassessedLearners.map((learner) => ({ ...learner, lastAttemptAt: learner.lastAttemptAt?.toISOString() ?? null })),
      inProgressLearners: overview.inProgressLearners.map((learner) => ({ ...learner, lastAttemptAt: learner.lastAttemptAt?.toISOString() ?? null })),
      retryLearners: overview.retryLearners.map((learner) => ({ ...learner, lastAttemptAt: learner.lastAttemptAt?.toISOString() ?? null })),
      levelSignals: { windowDays: 14, ready, weak, inFlow: overview.inFlow },
      topicReports: topicReports.rows.map((item) => ({
        id: item.id, learnerId: item.learner_id, learnerName: item.learner_name, topic: item.topic,
        reason: item.reason, strikeCount: item.strike_count, status: item.status, createdAt: item.created_at.toISOString()
      }))
    };
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
    const view = await repositories.assessments.getReviewAttempt(request.e4sSession!.user.id, params.data.attemptId);
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
      ...body.data
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
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });

    const aiRequestKey = `${params.data.attemptId}:${body.data.requestId}`;
    const existing = await repositories.aiRuns.findSucceededOutput(actorId, aiRequestKey, "assessment_scoring");
    if (existing) {
      const view = await repositories.assessments.getReviewAttempt(actorId, params.data.attemptId);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
    }
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "assessment_scoring");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    const writing = sectionByCode(context.definition, "writing");
    const speaking = sectionByCode(context.definition, "speaking");
    if (!writing || !speaking) return reply.code(409).send({ code: "ASSESSMENT_PRODUCTIVE_SECTIONS_MISSING" });
    const answerFor = (section: AssessmentSectionCode, taskKey: string) => context.attempt.responses.find((response) => response.section === section && response.taskKey === taskKey);
    try {
      const result = await runner.runTask("assessment_scoring", {
        kind: context.definition.kind,
        writing: writing.groups.flatMap((group) => group.tasks).map((item) => ({ prompt: item.prompt, answer: answerFor("writing", item.key)?.value ?? "" })),
        speaking: speaking.groups.flatMap((group) => group.tasks).map((item) => {
          const answer = answerFor("speaking", item.key);
          return { prompt: item.prompt, answer: answer?.value ?? "", evidenceType: answer?.evidenceType ?? "technical_failure" };
        }),
        writingMaxScore: writing.maxScore,
        speakingMaxScore: speaking.maxScore
      }, { systemPrompt: task.prompt });
      const parsed = assessmentGradingOutputSchema.safeParse(result.output);
      if (!parsed.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      const output = {
        ...parsed.data,
        writingScore: Math.min(writing.maxScore, parsed.data.writingScore),
        speakingScore: Math.min(speaking.maxScore, parsed.data.speakingScore)
      };
      const saved = await repositories.assessments.saveAssessmentRescore({
        actorId,
        attemptId: params.data.attemptId,
        requestId: body.data.requestId,
        aiRequestKey,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output,
        metadata: {
          traceId: result.metadata.traceId,
          provider: result.metadata.provider,
          model: result.metadata.model,
          inputHash: result.metadata.inputHash,
          usage: result.metadata.usage,
          latencyMs: result.metadata.latencyMs
        }
      });
      if (saved === null) return reply.code(409).send({ code: "ASSESSMENT_RESCORE_NOT_ALLOWED" });
      const view = await repositories.assessments.getReviewAttempt(actorId, params.data.attemptId);
      return view ?? reply.code(404).send({ code: "ASSESSMENT_ATTEMPT_NOT_FOUND" });
    } catch (error) {
      request.log.warn({ error }, "Assessment AI rescore failed");
      return reply.code(502).send({ code: "ASSESSMENT_RESCORE_FAILED" });
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

  app.patch("/api/v1/assessment-reviews/learners/:learnerId/monthly-goal", { preHandler: assessmentOperators }, async (request, reply) => {
    const params = learnerReviewParam.safeParse(request.params);
    const body = monthlyGoalInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_MONTHLY_GOAL" });
    const view = await repositories.assessments.updateLearnerMonthlyGoal(request.e4sSession!.user.id, params.data.learnerId, body.data.monthlyGoal);
    return view ?? reply.code(404).send({ code: "ASSESSMENT_LEARNER_NOT_FOUND" });
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
    return (["A2", "B1", "B2", "C1"] as const).map((targetLevel) => {
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
    return form ?? reply.code(404).send({ code: "LEVEL_FORM_NOT_FOUND" });
  });

  app.get("/api/v1/assessment-level-forms/:targetLevel/versions", { preHandler: assessmentReaders }, async (request, reply) => {
    const params = levelFormParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_TARGET_LEVEL" });
    const versions = await repositories.assessments.listLevelFormVersions(request.e4sSession!.user.id, params.data.targetLevel);
    return versions.map((version) => ({ ...version, publishedAt: version.publishedAt?.toISOString() ?? null }));
  });

  app.post("/api/v1/assessment-level-forms/:targetLevel/generate", {
    preHandler: assessmentOperators, config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const params = levelFormParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_TARGET_LEVEL" });
    const actorId = request.e4sSession!.user.id;
    const runner = await runnerFor(actorId);
    if (!runner) return reply.code(503).send({ code: "AI_UNAVAILABLE" });
    const task = await repositories.aiRuns.activeTaskPrompt(actorId, "level_form_generation");
    if (!task) return reply.code(503).send({ code: "AI_PROMPT_NOT_READY" });
    try {
      const result = await runner.runTask("level_form_generation", {
        targetLevel: params.data.targetLevel, context: "workplace_english", listeningQuestions: 5, readingQuestions: 5
      }, { systemPrompt: task.prompt });
      const output = levelFormOutputSchema.safeParse(result.output);
      if (!output.success) return reply.code(502).send({ code: "AI_OUTPUT_INVALID" });
      await repositories.aiRuns.recordSucceeded({
        userId: actorId,
        requestId: `level-form:${params.data.targetLevel}:${Date.now()}`,
        taskId: task.taskId,
        promptVersionId: task.promptVersionId,
        output: output.data,
        metadata: result.metadata
      });
      const form = await repositories.assessments.createLevelFormDraft(actorId, params.data.targetLevel, levelFormBlueprint(params.data.targetLevel, output.data));
      return reply.code(201).send({ ...form, publishedAt: null });
    } catch (error) {
      request.log.warn({ error }, "Level form generation failed");
      return reply.code(502).send({ code: "LEVEL_FORM_GENERATION_FAILED" });
    }
  });

  app.post("/api/v1/assessment-level-forms/:versionId/publication", { preHandler: assessmentOperators }, async (request, reply) => {
    const params = levelFormVersionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_LEVEL_FORM_VERSION" });
    const form = await repositories.assessments.publishLevelForm(request.e4sSession!.user.id, params.data.versionId);
    return form ? { ...form, publishedAt: form.publishedAt?.toISOString() ?? null } : reply.code(409).send({ code: "LEVEL_FORM_NOT_PUBLISHABLE" });
  });

  app.delete("/api/v1/assessment-level-forms/:versionId", { preHandler: assessmentOperators }, async (request, reply): Promise<AssessmentLevelFormDeleteView | void> => {
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
    const decision = await repositories.assessments.decide({
      attemptId: params.data.attemptId,
      reviewerId: request.e4sSession!.user.id,
      status: body.data.status,
      approvedLevel: body.data.approvedLevel ?? null,
      reason: body.data.reason
    });
    if (!decision) return reply.code(409).send({ code: "ASSESSMENT_NOT_REVIEWABLE" });
    const view: AssessmentDecisionView = { ...decision, decidedAt: decision.decidedAt.toISOString() };
    return view;
  });

  app.get("/api/v1/assessments/:kind", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = kindParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_KIND" });
    const kind = normalizeKind(parsed.data.kind);
    const definition = await repositories.assessments.findPublished(kind);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    let attempt = await repositories.assessments.findActiveAttempt(request.e4sSession!.user.id, definition.versionId);
    attempt = await advanceExpiredSections(repositories.assessments, request.e4sSession!.user.id, definition, attempt);
    const view = assessmentView(definition, attempt);
    if (!attempt) return view;
    const appeal = await repositories.assessments.findAppeal(request.e4sSession!.user.id, attempt.id);
    return { ...view, appeal: appeal ? {
      ...appeal, createdAt: appeal.createdAt.toISOString(), resolvedAt: appeal.resolvedAt?.toISOString() ?? null
    } : null };
  });

  app.post("/api/v1/assessment-attempts/:attemptId/appeals", { preHandler: learnerOnly }, async (request, reply) => {
    const params = attemptParam.safeParse(request.params);
    const body = appealInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "ASSESSMENT_APPEAL_INVALID" });
    const appeal = await repositories.assessments.createAppeal(
      request.e4sSession!.user.id, params.data.attemptId, body.data.reason
    );
    return appeal ? reply.code(201).send({
      ...appeal, createdAt: appeal.createdAt.toISOString(), resolvedAt: null
    }) : reply.code(409).send({ code: "ASSESSMENT_APPEAL_NOT_AVAILABLE" });
  });

  app.post("/api/v1/assessment-attempts/:attemptId/violations", { preHandler: learnerOnly }, async (request, reply): Promise<AssessmentRuntimeView> => {
    const params = attemptParam.safeParse(request.params);
    const body = violationInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "ASSESSMENT_VIOLATION_INVALID" });
    const learnerId = request.e4sSession!.user.id;
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
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
    return runtime ?? reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
  });

  app.post("/api/v1/assessments/:kind/start", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = kindParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_KIND" });
    const kind = normalizeKind(parsed.data.kind);
    const definition = await repositories.assessments.findPublished(kind);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    const first = definition.blueprint.sections[0];
    if (!first) return reply.code(409).send({ code: "ASSESSMENT_BLUEPRINT_EMPTY" });
    const violationLimit = await repositories.assessments.assessmentViolationLimit(request.e4sSession!.user.id);
    const attempt = await repositories.assessments.startAttempt({
      learnerId: request.e4sSession!.user.id,
      assessmentVersionId: definition.versionId,
      firstSection: first.code,
      durationMinutes: first.durationMinutes,
      violationLimit
    });
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

  app.post("/api/v1/assessment-attempts/:attemptId/submit", { preHandler: learnerOnly }, async (request, reply) => {
    const params = attemptParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_ATTEMPT" });
    const learnerId = request.e4sSession!.user.id;
    const runner = await runnerFor(learnerId);
    let attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
    }
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

    for (const sectionCode of ["listening", "reading"] as const) {
      const section = sectionByCode(definition.blueprint, sectionCode);
      if (!section) continue;
      const responseMap = new Map(attempt.responses.filter((response) => response.section === sectionCode)
        .map((response) => [response.taskKey, response.value]));
      const items = section.groups.flatMap((group) => group.tasks)
        .filter((task): task is StoredAssessmentTask & { correctAnswer: string } => Boolean(task.correctAnswer))
        .map((task) => ({ taskKey: task.key, answer: responseMap.get(task.key), correctAnswer: task.correctAnswer, maxScore: task.maxScore }));
      const score = calculateAutomaticSectionScore(items);
      await repositories.assessments.upsertSectionScore({
        learnerId, attemptId: attempt.id, section: sectionCode, score: score.score,
        criteria: { answered: score.answered, total: score.total, maxScore: score.maxScore }, source: "deterministic"
      });
    }
    if (runner && !await repositories.aiRuns.requestExists(learnerId, attempt.id, "assessment_scoring")) {
      const task = await repositories.aiRuns.activeTaskPrompt(learnerId, "assessment_scoring");
      const writing = sectionByCode(definition.blueprint, "writing");
      const speaking = sectionByCode(definition.blueprint, "speaking");
      if (task && writing && speaking) {
        const answerFor = (section: AssessmentSectionCode, taskKey: string) => attempt.responses.find((response) => response.section === section && response.taskKey === taskKey);
        try {
          const result = await runner.runTask("assessment_scoring", {
            kind: definition.blueprint.kind,
            writing: writing.groups.flatMap((group) => group.tasks).map((item) => ({ prompt: item.prompt, answer: answerFor("writing", item.key)?.value ?? "" })),
            speaking: speaking.groups.flatMap((group) => group.tasks).map((item) => { const answer = answerFor("speaking", item.key); return { prompt: item.prompt, answer: answer?.value ?? "", evidenceType: answer?.evidenceType ?? "technical_failure" }; }),
            writingMaxScore: writing.maxScore, speakingMaxScore: speaking.maxScore
          }, { systemPrompt: task.prompt });
          const output = assessmentGradingOutputSchema.safeParse(result.output);
          if (output.success) {
            await repositories.assessments.upsertSectionScore({ learnerId, attemptId: attempt.id, section: "writing", score: Math.min(writing.maxScore, output.data.writingScore), criteria: { rationale: output.data.rationale, monthlyGoal: output.data.monthlyGoal }, source: "ai" });
            await repositories.assessments.upsertSectionScore({ learnerId, attemptId: attempt.id, section: "speaking", score: Math.min(speaking.maxScore, output.data.speakingScore), criteria: { rationale: output.data.rationale, evidencePolicy: "Pronunciation is scored only when audio evidence exists." }, source: "ai" });
            await repositories.assessments.saveSuggestedDecision({ attemptId: attempt.id, learnerId, suggestedLevel: output.data.suggestedLevel, reason: output.data.rationale });
            await repositories.aiRuns.recordSucceeded({ userId: learnerId, requestId: attempt.id, taskId: task.taskId, promptVersionId: task.promptVersionId, output: output.data, metadata: result.metadata });
          }
        } catch (error) { request.log.warn({ error }, "Assessment AI grading failed; review remains pending"); }
      }
    }
    const submitted = await repositories.assessments.submitAttempt(learnerId, attempt.id);
    if (submitted) return assessmentView(definition, submitted);
    const raced = await repositories.assessments.findAttempt(learnerId, attempt.id);
    return raced && (raced.status === "pending_review" || raced.status === "approved")
      ? assessmentView(definition, raced)
      : reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
  });
}

function assessmentErrorCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}

function levelFormBlueprint(targetLevel: "A2" | "B1" | "B2" | "C1", output: LevelFormTaskOutput): StoredAssessmentDefinition {
  const options = ["A", "B", "C", "D"] as const;
  const tasks = (prefix: string, questions: LevelFormTaskOutput["listening"]["questions"]) => questions.map((question, index) => ({
    key: `${prefix}${index + 1}`, prompt: question.prompt, responseType: "single_choice" as const, maxScore: 5,
    options: question.options.map((label, optionIndex) => ({ value: options[optionIndex]!, label })),
    correctAnswer: options[question.correctIndex]!
  }));
  return {
    key: `level-up-${targetLevel.toLowerCase()}`, kind: "level-up", title: output.title,
    version: 1, totalMinutes: 38, totalScore: 100, targetLevel,
    sections: [
      { code: "listening", title: "Nghe", durationMinutes: 8, maxScore: 25, instructions: ["Nghe tối đa 2 lần và chọn đáp án đúng."], groups: [{ key: "L", title: "Workplace listening", instruction: "Nghe đoạn hội thoại và trả lời 5 câu.", maxPlays: 2, stimulus: { type: "audio_script", lines: [{ speaker: "Speaker", text: output.listening.script }] }, tasks: tasks("L", output.listening.questions) }] },
      { code: "reading", title: "Đọc", durationMinutes: 13, maxScore: 25, instructions: ["Đọc và chọn đáp án đúng."], groups: [{ key: "R", title: "Workplace reading", instruction: "Đọc đoạn văn và trả lời 5 câu.", stimulus: { type: "passage", text: output.reading.passage }, tasks: tasks("R", output.reading.questions) }] },
      { code: "writing", title: "Viết", durationMinutes: 10, maxScore: 25, instructions: ["Viết 80–120 từ."], groups: [{ key: "W", title: "Writing", instruction: "Hoàn thành một task.", tasks: [{ key: "W1", prompt: output.writingPrompt, responseType: "long_text", maxScore: 25, minWords: 80, maxWords: 120 }] }] },
      { code: "speaking", title: "Nói", durationMinutes: 7, maxScore: 25, instructions: ["Nộp bằng chứng nói ở mức đích."], groups: [{ key: "S", title: "Speaking", instruction: "Hoàn thành tình huống nói.", tasks: [{ key: "S1", prompt: output.speakingPrompt, responseType: "speaking_evidence", maxScore: 25 }] }] }
    ]
  };
}

function normalizeKind(kind: "placement" | "final" | "levelup" | "level-up"): AssessmentKind {
  return kind === "levelup" ? "level-up" : kind;
}

async function definitionForAttempt(
  repository: ReturnType<typeof createRepositories>["assessments"],
  attempt: AssessmentAttemptRecord
): Promise<PublishedAssessmentRecord | null> {
  for (const kind of ["placement", "final", "level-up"] as const) {
    const definition = await repository.findPublished(kind);
    if (definition?.versionId === attempt.assessmentVersionId) return definition;
  }
  return null;
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
  return ["audio", "transcript", "typed_proxy", "technical_failure"].includes(evidence)
    && (evidence === "technical_failure" || value.trim().length > 0);
}

function assessmentView(definition: PublishedAssessmentRecord, attempt: AssessmentAttemptRecord | null): AssessmentView {
  const publicDefinition = publicAssessmentDefinition(definition.blueprint);
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
