import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { placementDefinition } from "@e4s/database";
import { aiSlices, neutralQuestions } from "./support/level-form-fixture.js";

const LEARNER_ID = "00000000-0000-4000-8000-0000000000bb";
const OLD_ATTEMPT_ID = "00000000-0000-4000-8000-000000000a01";
const RETAKE_ATTEMPT_ID = "00000000-0000-4000-8000-000000000a02";
const RETAKE_VERSION_ID = "00000000-0000-4000-8000-000000000b02";

const repositories = vi.hoisted(() => ({
  assessments: {
    createLevelFormDraft: vi.fn(),
    listLevelForms: vi.fn(),
    getLevelFormDetail: vi.fn(),
    decide: vi.fn(),
    findAttempt: vi.fn(),
    findPublishedByVersion: vi.fn(),
    findPublished: vi.fn(),
    resumePlacementAttempt: vi.fn(),
    startAttempt: vi.fn(),
    assessmentViolationLimit: vi.fn(),
    claimAttemptSession: vi.fn(),
    findAppeal: vi.fn(),
    listAppealableResults: vi.fn()
  },
  aiRuns: { activeTaskPrompt: vi.fn(), recordSucceeded: vi.fn() }
}));
const retakeDb = vi.hoisted(() => ({
  findPlacementRetakeGrant: vi.fn(),
  findPublishedPlacementRetakeForm: vi.fn(),
  grantPlacementRetake: vi.fn(),
  startPlacementRetakeAttempt: vi.fn(),
  listPlacementRetakeStates: vi.fn()
}));
vi.mock("@e4s/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@e4s/database")>()),
  ...retakeDb,
  createRepositories: () => new Proxy(repositories, { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? new Proxy({}, { get: () => vi.fn() }) })
}));
vi.mock("../src/modules/identity/policy.js", () => ({
  createRoleGuard: (_pool: unknown, roles: string[]) => async (request: { e4sSession?: unknown; e4sSessionId?: string }) => {
    request.e4sSession = { user: { id: roles.includes("learner") ? LEARNER_ID : "00000000-0000-4000-8000-0000000000aa", role: roles[0] } };
    request.e4sSessionId = "session-1";
  }
}));

const { PlacementRetakeError } = await import("@e4s/database");
const { registerAssessmentRoutes } = await import("../src/modules/assessment/routes.js");

function fakeRunner(slices: ReturnType<typeof aiSlices>) {
  const runTask = vi.fn(async (taskId: string, _input: unknown, _options: { systemPrompt?: string }) => ({
    output: taskId === "level_form_listening_generation" ? slices.listening
      : taskId === "level_form_reading_generation" ? slices.reading
        : slices.production,
    metadata: {}
  }));
  return { runner: { runTask } as unknown as AiTaskRunner, runTask };
}

async function app(runner?: AiTaskRunner) {
  const instance = Fastify();
  registerAssessmentRoutes(instance, {} as never, runner);
  await instance.ready();
  return instance;
}

const retakeForm = {
  definitionId: "00000000-0000-4000-8000-000000000c01", versionId: RETAKE_VERSION_ID, assessmentKey: "placement-retake",
  kind: "placement" as const, title: "Test đầu vào – đề thi lại", version: 1,
  blueprint: { ...placementDefinition, key: "placement-retake", title: "Test đầu vào – đề thi lại" }
};

function attempt(id: string, status: string, versionId: string) {
  return {
    id, assessmentVersionId: versionId, learnerId: LEARNER_ID, status, currentSection: status === "in_progress" ? "listening" : null,
    timingState: {}, integrityEvents: [], violationCount: 0, violationLimit: 3, submitReason: null,
    deviceEvidence: { microphoneSupported: null, microphoneState: "unknown", soundCheck: "unknown" },
    mediaEvidence: { recordings: {}, uploads: [] }, startedAt: new Date("2026-11-16T01:00:00Z"), submittedAt: null,
    updatedAt: new Date("2026-11-16T01:00:00Z"), responses: [], scores: [], audioPlayCounts: {}, suggestedLevel: null
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repositories.aiRuns.activeTaskPrompt.mockResolvedValue(null);
  repositories.assessments.createLevelFormDraft.mockImplementation(async (_actor: string, targetLevel: string) => ({ versionId: RETAKE_VERSION_ID, targetLevel, status: "draft" }));
  repositories.assessments.listLevelForms.mockResolvedValue([]);
  repositories.assessments.assessmentViolationLimit.mockResolvedValue(3);
  repositories.assessments.claimAttemptSession.mockResolvedValue(true);
  repositories.assessments.findAppeal.mockResolvedValue(null);
  repositories.assessments.listAppealableResults.mockResolvedValue([]);
  repositories.assessments.findPublishedByVersion.mockResolvedValue(retakeForm);
  retakeDb.listPlacementRetakeStates.mockResolvedValue(new Map());
});

describe("placement retake form generation (level-up generator, placement mode)", () => {
  it("generates a draft placement-retake form with the 20/40/2/4 placement structure and a mixed A1–C1 prompt", async () => {
    const { runner, runTask } = fakeRunner(aiSlices());
    const server = await app(runner);
    const response = await server.inject({ method: "POST", url: "/api/v1/assessment-level-forms/placement-retake/generate" });
    expect(response.statusCode, response.body).toBe(201);
    // Same AI-call budget as a level-up form: three slices, no extra calls for a complete output.
    expect(runTask.mock.calls.map(([taskId]) => taskId).sort()).toEqual(["level_form_listening_generation", "level_form_production_generation", "level_form_reading_generation"]);
    for (const [, input, options] of runTask.mock.calls) {
      expect(input).toEqual(expect.objectContaining({ targetLevel: "A1-C1", scope: "placement_retake", listeningQuestions: 20, readingQuestions: 40 }));
      expect(options.systemPrompt).toContain("spread items across A1, A2, B1, B2 and C1");
      expect(options.systemPrompt).toContain("placement-a");
    }
    const [, target, blueprint] = repositories.assessments.createLevelFormDraft.mock.calls[0]!;
    expect(target).toBe("placement-retake");
    expect(blueprint).toEqual(expect.objectContaining({ key: "placement-retake", kind: "placement", totalMinutes: 75, totalScore: 100 }));
    expect(blueprint.targetLevel).toBeUndefined();
    const count = (code: string) => blueprint.sections.find((section: { code: string }) => section.code === code)
      .groups.reduce((total: number, group: { tasks: unknown[] }) => total + group.tasks.length, 0);
    expect([count("listening"), count("reading"), count("writing"), count("speaking")]).toEqual([20, 40, 2, 4]);
    expect(blueprint.sections.map((section: { maxScore: number }) => section.maxScore)).toEqual([20, 40, 20, 20]);
    await server.close();
  });

  it("refuses a generated retake form that copies a canonical placement-a item and saves nothing", async () => {
    const canonical = placementDefinition.sections.find((section) => section.code === "reading")!.groups[0]!.tasks[0]!;
    const options = canonical.options!.map((option) => option.label);
    const reading = neutralQuestions("reading", 40, () => 1);
    reading[5] = { prompt: canonical.prompt, options, correctIndex: options.indexOf(canonical.options!.find((option) => option.value === canonical.correctAnswer)!.label) };
    const { runner } = fakeRunner(aiSlices(reading));
    const server = await app(runner);
    const response = await server.inject({ method: "POST", url: "/api/v1/assessment-level-forms/placement-retake/generate" });
    expect(response.statusCode).toBe(502);
    expect(response.json().issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "LEVEL_FORM_COPIES_PLACEMENT", severity: "severe", section: "reading" })]));
    expect(repositories.assessments.createLevelFormDraft).not.toHaveBeenCalled();
    await server.close();
  });

  it("lists the placement-retake slot next to the level-up slots", async () => {
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/assessment-level-forms" });
    expect(response.json().map((slot: { targetLevel: string }) => slot.targetLevel)).toEqual(["A2", "B1", "B2", "C1", "placement-retake"]);
    await server.close();
  });
});

describe("granting the one placement retake", () => {
  it("grants once and refuses a second grant", async () => {
    retakeDb.grantPlacementRetake
      .mockResolvedValueOnce({ id: "g1", organizationId: "o", learnerId: LEARNER_ID, sourceAttemptId: OLD_ATTEMPT_ID, retakeAttemptId: null, reason: "Học viên chưa hài lòng", grantedBy: "00000000-0000-4000-8000-0000000000aa", grantedAt: new Date("2026-11-16T02:00:00Z"), usedAt: null })
      .mockRejectedValueOnce(new PlacementRetakeError("PLACEMENT_RETAKE_ALREADY_GRANTED"));
    const server = await app();
    const url = `/api/v1/assessment-reviews/learners/${LEARNER_ID}/placement-retake`;
    const first = await server.inject({ method: "POST", url, payload: { reason: "Học viên chưa hài lòng" } });
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toEqual(expect.objectContaining({ learnerId: LEARNER_ID, status: "granted", sourceAttemptId: OLD_ATTEMPT_ID }));
    const second = await server.inject({ method: "POST", url, payload: { reason: "Lần nữa" } });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ code: "PLACEMENT_RETAKE_ALREADY_GRANTED" });
    await server.close();
  });

  it("keeps the exit (pass-course) retake hidden behind its disabled flag", async () => {
    const server = await app();
    const response = await server.inject({ method: "POST", url: `/api/v1/assessment-reviews/learners/${LEARNER_ID}/placement-retake`, payload: { reason: "x", kind: "pass_course" } });
    expect(response.statusCode).toBe(404);
    expect(retakeDb.grantPlacementRetake).not.toHaveBeenCalled();
    await server.close();
  });

  it("passes 'Cho thi lại 1 lần' with the needs_retry decision and maps the final-placement refusal", async () => {
    repositories.assessments.decide.mockResolvedValueOnce({ attemptId: OLD_ATTEMPT_ID, status: "needs_retry", approvedLevel: null, reason: "r", decidedBy: "x", decidedAt: new Date() })
      .mockRejectedValueOnce(new PlacementRetakeError("PLACEMENT_RETAKE_FINAL"));
    const server = await app();
    const url = `/api/v1/assessment-reviews/${OLD_ATTEMPT_ID}/decision`;
    const granted = await server.inject({ method: "POST", url, payload: { status: "needs_retry", reason: "r", grantRetake: true } });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(repositories.assessments.decide).toHaveBeenCalledWith(expect.objectContaining({ status: "needs_retry", grantRetake: true }));
    const final = await server.inject({ method: "POST", url, payload: { status: "needs_retry", reason: "again" } });
    expect(final.statusCode).toBe(409);
    expect(final.json()).toEqual({ code: "PLACEMENT_RETAKE_FINAL" });
    const invalid = await server.inject({ method: "POST", url, payload: { status: "approved", approvedLevel: "B1", reason: "r", grantRetake: true } });
    expect(invalid.statusCode).toBe(400);
    await server.close();
  });
});

describe("learner placement lifecycle with a granted retake", () => {
  const grant = { id: "g1", organizationId: "o", learnerId: LEARNER_ID, sourceAttemptId: OLD_ATTEMPT_ID, retakeAttemptId: null, reason: "Cho thi lại", grantedBy: "op", grantedAt: new Date("2026-11-16T02:00:00Z"), usedAt: null };

  it("shows the retake form with the granted notice instead of the old needs_retry attempt", async () => {
    retakeDb.findPlacementRetakeGrant.mockResolvedValue(grant);
    retakeDb.findPublishedPlacementRetakeForm.mockResolvedValue(retakeForm);
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/assessments/placement" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ screenState: "preparation", attempt: null, placementRetake: expect.objectContaining({ status: "granted" }) }));
    expect(repositories.assessments.resumePlacementAttempt).not.toHaveBeenCalled();
    await server.close();
  });

  it("starts a NEW attempt on the published retake form and never resumes the old attempt", async () => {
    retakeDb.findPlacementRetakeGrant.mockResolvedValueOnce(grant).mockResolvedValue({ ...grant, retakeAttemptId: RETAKE_ATTEMPT_ID, usedAt: new Date() });
    retakeDb.findPublishedPlacementRetakeForm.mockResolvedValue(retakeForm);
    retakeDb.startPlacementRetakeAttempt.mockResolvedValue(RETAKE_ATTEMPT_ID);
    repositories.assessments.findAttempt.mockImplementation(async (_learner: string, id: string) => id === RETAKE_ATTEMPT_ID ? attempt(RETAKE_ATTEMPT_ID, "in_progress", RETAKE_VERSION_ID) : null);
    const server = await app();
    const response = await server.inject({ method: "POST", url: "/api/v1/assessments/placement/start" });
    expect(response.statusCode, response.body).toBe(201);
    expect(retakeDb.startPlacementRetakeAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ learnerId: LEARNER_ID, assessmentVersionId: RETAKE_VERSION_ID, firstSection: "listening" }));
    expect(response.json().attempt.id).toBe(RETAKE_ATTEMPT_ID);
    expect(response.json().placementRetake).toEqual(expect.objectContaining({ status: "used", retakeAttemptId: RETAKE_ATTEMPT_ID }));
    expect(repositories.assessments.resumePlacementAttempt).not.toHaveBeenCalled();
    expect(repositories.assessments.startAttempt).not.toHaveBeenCalled();
    await server.close();
  });

  it("refuses to start while the granted retake has no published form", async () => {
    retakeDb.findPlacementRetakeGrant.mockResolvedValue(grant);
    retakeDb.findPublishedPlacementRetakeForm.mockResolvedValue(null);
    const server = await app();
    const response = await server.inject({ method: "POST", url: "/api/v1/assessments/placement/start" });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PLACEMENT_RETAKE_FORM_NOT_PUBLISHED");
    await server.close();
  });
});
