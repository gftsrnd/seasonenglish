import type {
  AssessmentAttemptView,
  AssessmentEvidenceType,
  AssessmentKind,
  AssessmentSectionCode,
  AssessmentSectionStatus,
  AssessmentView
} from "@e4s/contracts";
import {
  createRepositories,
  publicAssessmentDefinition,
  sectionByCode,
  type AssessmentAttemptRecord,
  type PublishedAssessmentRecord,
  type StoredAssessmentTask
} from "@e4s/database";
import { calculateAutomaticSectionScore } from "@e4s/domain/assessment";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

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
const responseInput = z.object({
  value: z.string().max(20_000),
  evidenceType: z.enum(["choice", "text", "audio", "transcript", "typed_proxy", "technical_failure"]),
  artifactKey: z.string().trim().min(1).max(500).optional()
});

const sectionOrder: AssessmentSectionCode[] = ["listening", "reading", "writing", "speaking"];

export function registerAssessmentRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/assessments/:kind", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = kindParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_KIND" });
    const kind = normalizeKind(parsed.data.kind);
    const definition = await repositories.assessments.findPublished(kind);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    let attempt = await repositories.assessments.findActiveAttempt(request.e4sSession!.user.id, definition.versionId);
    attempt = await advanceExpiredSections(repositories.assessments, request.e4sSession!.user.id, definition, attempt);
    return assessmentView(definition, attempt);
  });

  app.post("/api/v1/assessments/:kind/start", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = kindParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_KIND" });
    const kind = normalizeKind(parsed.data.kind);
    const definition = await repositories.assessments.findPublished(kind);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    const first = definition.blueprint.sections[0];
    if (!first) return reply.code(409).send({ code: "ASSESSMENT_BLUEPRINT_EMPTY" });
    const attempt = await repositories.assessments.startAttempt({
      learnerId: request.e4sSession!.user.id,
      assessmentVersionId: definition.versionId,
      firstSection: first.code,
      durationMinutes: first.durationMinutes
    });
    return reply.code(201).send(assessmentView(definition, attempt));
  });

  app.put("/api/v1/assessment-attempts/:attemptId/responses/:section/:taskKey", { preHandler: learnerOnly }, async (request, reply) => {
    const params = responseParam.safeParse(request.params);
    const body = responseInput.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_RESPONSE" });
    const learnerId = request.e4sSession!.user.id;
    const attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt || attempt.status !== "in_progress" || attempt.currentSection !== params.data.section) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
    const task = taskFor(definition, params.data.section, params.data.taskKey);
    if (!task || !validEvidence(task, body.data.evidenceType, body.data.value)) {
      return reply.code(400).send({ code: "ASSESSMENT_TASK_MISMATCH" });
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

  app.post("/api/v1/assessment-attempts/:attemptId/sections/:section/complete", { preHandler: learnerOnly }, async (request, reply) => {
    const params = sectionParam.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_ASSESSMENT_SECTION" });
    if (params.data.section === "speaking") return reply.code(400).send({ code: "USE_ASSESSMENT_SUBMIT" });
    const learnerId = request.e4sSession!.user.id;
    const attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt || attempt.status !== "in_progress" || attempt.currentSection !== params.data.section) {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_EDITABLE" });
    }
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });
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
    const attempt = await repositories.assessments.findAttempt(learnerId, params.data.attemptId);
    if (!attempt || attempt.status !== "in_progress" || attempt.currentSection !== "speaking") {
      return reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
    }
    const definition = await definitionForAttempt(repositories.assessments, attempt);
    if (!definition) return reply.code(404).send({ code: "ASSESSMENT_NOT_PUBLISHED" });

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
    const submitted = await repositories.assessments.submitAttempt(learnerId, attempt.id);
    return submitted ? assessmentView(definition, submitted) : reply.code(409).send({ code: "ASSESSMENT_ATTEMPT_NOT_SUBMITTABLE" });
  });
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
  return { definition: publicDefinition, screenState, attempt: attemptView(attempt) };
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
  return {
    id: attempt.id,
    status: attempt.status,
    currentSection: attempt.currentSection,
    startedAt: attempt.startedAt.toISOString(),
    sectionEndsAt,
    responses: attempt.responses.map(responseView),
    sectionStatuses: statuses,
    sectionScores: attempt.scores,
    totalScore,
    suggestedLevel: attempt.suggestedLevel
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
      attempt = await repository.submitAttempt(learnerId, attempt.id);
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
