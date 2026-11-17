import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { placementDefinition, placementRetakeStructureIssues } from "@e4s/database";
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
    listAppealableResults: vi.fn(),
    resolveAssessmentAppeal: vi.fn()
  },
  aiRuns: { activeTaskPrompt: vi.fn(), recordSucceeded: vi.fn() }
}));
const retakeDb = vi.hoisted(() => ({
  findPlacementRetakeGrant: vi.fn(),
  readPlacementRetakeActivity: vi.fn(),
  findPublishedPlacementRetakeForm: vi.fn(),
  grantPlacementRetake: vi.fn(),
  startPlacementRetakeAttempt: vi.fn(),
  listPlacementRetakeStates: vi.fn(),
  findPlacementRetakeRequestState: vi.fn(),
  createPlacementRetakeRequest: vi.fn()
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
  it("generates a draft placement-retake form with exactly placement-a's structure and scoring, from a mixed A1–C1 prompt", async () => {
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
    expect(blueprint).toEqual(expect.objectContaining({ key: "placement-retake", placementRetakeSource: "ai", kind: "placement", totalMinutes: 75, totalScore: 100 }));
    expect(blueprint.targetLevel).toBeUndefined();
    const count = (code: string) => blueprint.sections.find((section: { code: string }) => section.code === code)
      .groups.reduce((total: number, group: { tasks: unknown[] }) => total + group.tasks.length, 0);
    expect([count("listening"), count("reading"), count("writing"), count("speaking")]).toEqual([15, 40, 2, 4]);
    expect(blueprint.sections.map((section: { maxScore: number }) => section.maxScore)).toEqual([20, 40, 20, 20]);
    // Item scores and word limits are placement-a's: Listening 4 × 1 + 6 × 1 + 5 × 2, Writing 7 + 13.
    const scores = (code: string) => blueprint.sections.find((section: { code: string }) => section.code === code)
      .groups.map((group: { tasks: Array<{ maxScore: number }> }) => group.tasks.map((task) => task.maxScore));
    expect(scores("listening")).toEqual([[1, 1, 1, 1], [1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2]]);
    expect(scores("writing")).toEqual([[7], [13]]);
    expect(scores("speaking")).toEqual([[5], [5], [5], [5]]);
    expect(placementRetakeStructureIssues(blueprint)).toEqual([]);
    // Questions 1–4, 5–10 and 13–17 of the five 4-question parts are kept, in that order.
    const listeningPrompts = blueprint.sections[0].groups.flatMap((group: { tasks: Array<{ prompt: string }> }) => group.tasks.map((task) => task.prompt));
    expect(listeningPrompts[0]).toContain("item 1?");
    expect(listeningPrompts[10]).toContain("item 13?");
    await server.close();
  });

  it("enforces placement-a's counts deterministically on the retake form and its manual draft", async () => {
    expect(placementRetakeStructureIssues({ ...placementDefinition, sections: placementDefinition.sections.map((section) => section.code !== "listening" ? section : {
      ...section, groups: [...section.groups, { ...section.groups[0]!, key: "LX" }]
    }) })).toEqual([expect.stringContaining("Phần Nghe phải có 3 nhóm với 4 + 6 + 5 câu")]);
    const server = await app();
    const response = await server.inject({ method: "POST", url: "/api/v1/assessment-level-forms/placement-retake/manual-draft" });
    expect(response.statusCode).toBe(201);
    expect(repositories.assessments.createLevelFormDraft.mock.calls[0]![2].placementRetakeSource).toBe("manual");
    expect(placementRetakeStructureIssues(repositories.assessments.createLevelFormDraft.mock.calls[0]![2])).toEqual([]);
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
    expect(response.json().definition.sections[0].groups[0].stimulus).toEqual({ type: "audio_script", audioSrc: expect.any(String) });
    expect(JSON.stringify(response.json().definition)).not.toContain("correctAnswer");
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

describe("learner retake request ('Xin thi lại') and the Operator's decision", () => {
  const until = new Date("2026-11-19T02:00:00Z");

  it("shows the request button state while the 72 h window is open and creates the request", async () => {
    retakeDb.findPlacementRetakeRequestState.mockResolvedValueOnce({ target: { attemptId: OLD_ATTEMPT_ID, title: "Test đầu vào", availableUntil: until }, request: null, retake: "not_granted" })
      .mockResolvedValueOnce({ target: null, request: { id: "r1", status: "pending", resolution: null, createdAt: new Date("2026-11-16T03:00:00Z"), resolvedAt: null }, retake: "not_granted" });
    retakeDb.createPlacementRetakeRequest.mockResolvedValue({ id: "r1", createdAt: new Date() });
    const server = await app();
    const open = await server.inject({ method: "GET", url: "/api/v1/learner/placement-retake-request" });
    expect(open.json()).toEqual({ original: null, target: { attemptId: OLD_ATTEMPT_ID, title: "Test đầu vào", availableUntil: until.toISOString() }, request: null, retake: "not_granted" });
    const sent = await server.inject({ method: "POST", url: "/api/v1/learner/placement-retake-request", payload: { reason: "  Lý do  " } });
    expect(sent.statusCode, sent.body).toBe(201);
    expect(retakeDb.createPlacementRetakeRequest).toHaveBeenLastCalledWith(expect.anything(), LEARNER_ID, "Lý do");
    expect(sent.json().request).toEqual(expect.objectContaining({ id: "r1", status: "pending" }));
    await server.close();
  });

  it("trims the reason and refuses overlong input before creating a request", async () => {
    retakeDb.createPlacementRetakeRequest.mockResolvedValue(null);
    const server = await app();
    const url = "/api/v1/learner/placement-retake-request";
    const trimmed = await server.inject({ method: "POST", url, payload: { reason: "  Lý do  " } });
    expect(trimmed.statusCode).toBe(409);
    expect(retakeDb.createPlacementRetakeRequest).toHaveBeenLastCalledWith(expect.anything(), LEARNER_ID, "Lý do");
    retakeDb.createPlacementRetakeRequest.mockClear();
    for (const payload of [undefined, {}, { reason: "   " }, { reason: "x".repeat(2001) }]) {
      const invalid = await server.inject({ method: "POST", url, ...(payload === undefined ? {} : { payload }) });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().code).toBe("PLACEMENT_RETAKE_REQUEST_INVALID");
    }
    expect(retakeDb.createPlacementRetakeRequest).not.toHaveBeenCalled();
    await server.close();
  });

  it("loads the original attempt and Operator feedback independently of retake status", async () => {
    retakeDb.findPlacementRetakeRequestState.mockResolvedValueOnce({
      original: { attemptId: OLD_ATTEMPT_ID, feedback: "Phản hồi ban đầu" }, target: null, request: null, retake: "used"
    });
    retakeDb.readPlacementRetakeActivity.mockResolvedValueOnce("pending_review");
    const original = { ...attempt(OLD_ATTEMPT_ID, "approved", "original-version"), responses: [{ section: "writing", taskKey: "W1", value: "My submitted answer", evidenceType: "text", savedAt: new Date() }] };
    repositories.assessments.findAttempt.mockResolvedValueOnce(original);
    repositories.assessments.findPublishedByVersion.mockResolvedValueOnce({ ...retakeForm, assessmentKey: "placement-a", versionId: "original-version", blueprint: placementDefinition });
    const server = await app();
    const response = await server.inject({ method: "GET", url: "/api/v1/learner/placement-retake-request" });
    expect(response.json().original).toMatchObject({
      definition: { key: "placement-a" }, attempt: { id: OLD_ATTEMPT_ID, responses: [{ value: "My submitted answer" }] }, feedback: "Phản hồi ban đầu"
    });
    expect(response.json().original.definition.sections.map((section: { code: string }) => section.code)).toEqual(["listening", "reading", "writing", "speaking"]);
    expect(JSON.stringify(response.json().original)).not.toContain("correctAnswer");
    const keys = response.json().original.objectiveAnswerKeys;
    const first = placementDefinition.sections[0]!.groups[0]!.tasks[0]!;
    expect(keys.listening[first.key]).toEqual(first.correctAnswer);
    expect(keys.writing).toBeUndefined();
    expect(keys.speaking).toBeUndefined();
    expect(response.json().original.definition.sections[0].groups[0].stimulus).toMatchObject({ type: "audio_script", audioSrc: expect.any(String), lines: expect.arrayContaining([expect.objectContaining({ speaker: expect.any(String), text: expect.any(String) })]) });
    expect(repositories.assessments.findAttempt).toHaveBeenCalledExactlyOnceWith(LEARNER_ID, OLD_ATTEMPT_ID);
    await server.close();
  });

  it.each(["active", "other learner", "retake paper"] as const)("does not expose review keys for %s", async scenario => {
    retakeDb.findPlacementRetakeRequestState.mockResolvedValueOnce({
      original: { attemptId: OLD_ATTEMPT_ID, feedback: null }, target: null, request: null, retake: "not_granted"
    });
    const base = attempt(OLD_ATTEMPT_ID, scenario === "active" ? "in_progress" : "approved", RETAKE_VERSION_ID);
    repositories.assessments.findAttempt.mockResolvedValueOnce(scenario === "other learner" ? { ...base, learnerId: "other" } : base);
    if (scenario === "retake paper") repositories.assessments.findPublishedByVersion.mockResolvedValueOnce(retakeForm);
    const server = await app();
    const response = await server.inject({ url: "/api/v1/learner/placement-retake-request" });
    expect(response.statusCode).toBe(200);
    expect(response.json().original).toBeNull();
    if (scenario !== "retake paper") expect(repositories.assessments.findPublishedByVersion).not.toHaveBeenCalled();
    await server.close();
  });

  it.each(["approved", "pending_review"] as const)("exposes a separately versioned retake only after final approval (%s)", async status => {
    retakeDb.findPlacementRetakeRequestState.mockResolvedValueOnce({
      original: null, target: null, request: null, retake: "used",
      completedRetake: { attemptId: RETAKE_ATTEMPT_ID, feedback: "Quyết định cuối", approvedLevel: "B1" }
    });
    repositories.assessments.findAttempt.mockResolvedValueOnce(attempt(RETAKE_ATTEMPT_ID, status, RETAKE_VERSION_ID));
    const server = await app();
    const response = await server.inject({ url: "/api/v1/learner/placement-retake-request" });
    expect(response.statusCode).toBe(200);
    if (status === "approved") expect(response.json().completedRetake).toMatchObject({
      definition: { key: "placement-retake" }, attempt: { id: RETAKE_ATTEMPT_ID }, feedback: "Quyết định cuối", approvedLevel: "B1"
    });
    else expect(response.json().completedRetake).toBeUndefined();
    await server.close();
  });

  it("refuses the request once the window has expired", async () => {
    retakeDb.createPlacementRetakeRequest.mockResolvedValue(null);
    const server = await app();
    const response = await server.inject({ method: "POST", url: "/api/v1/learner/placement-retake-request", payload: { reason: "Lý do" } });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PLACEMENT_RETAKE_REQUEST_NOT_AVAILABLE");
    await server.close();
  });

  it("maps a refused grant on approval to 409 and passes approve/reject through the appeal decision", async () => {
    repositories.assessments.resolveAssessmentAppeal
      .mockResolvedValueOnce({ id: "r1", status: "rejected", resolution: "Kết quả phù hợp", resolvedAt: new Date() })
      .mockRejectedValueOnce(new PlacementRetakeError("PLACEMENT_RETAKE_FORM_NOT_PUBLISHED"));
    const server = await app();
    const url = "/api/v1/assessment-appeals/00000000-0000-4000-8000-0000000000r1/decision".replace("r1", "e1");
    const rejected = await server.inject({ method: "POST", url, payload: { status: "rejected", resolution: "Kết quả phù hợp" } });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const refused = await server.inject({ method: "POST", url, payload: { status: "accepted", resolution: "Cho thi lại" } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ code: "PLACEMENT_RETAKE_FORM_NOT_PUBLISHED" });
    await server.close();
  });
});
