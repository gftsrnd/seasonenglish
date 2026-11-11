import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { answerPositionShares } from "../src/modules/shared/answer-order.js";
import { aiSlices, B1_HANDOVER_PASSAGE, neutralQuestions, WRONG_KEY_NOT_LISTED } from "./support/level-form-fixture.js";

const repositories = vi.hoisted(() => ({
  assessments: {
    publishLevelForm: vi.fn(),
    createLevelFormDraft: vi.fn(),
    getLevelFormDetail: vi.fn()
  },
  aiRuns: {
    activeTaskPrompt: vi.fn(),
    recordSucceeded: vi.fn()
  }
}));
vi.mock("@e4s/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@e4s/database")>()),
  createRepositories: () => new Proxy(repositories, { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? new Proxy({}, { get: () => vi.fn() }) })
}));
vi.mock("../src/modules/identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown; e4sSessionId?: string }) => {
    request.e4sSession = { user: { id: "00000000-0000-4000-8000-0000000000aa", role: "operator" } };
    request.e4sSessionId = "session-1";
  }
}));

const { assembleLevelFormFromAi, registerAssessmentRoutes, withLevelFormQualityWarnings } = await import("../src/modules/assessment/routes.js");

const VERSION_ID = "00000000-0000-4000-8000-000000000901";
const LETTERS = ["A", "B", "C", "D"];

function fakeRunner(slices: ReturnType<typeof aiSlices>): AiTaskRunner {
  return {
    runTask: vi.fn(async (taskId: string) => ({
      output: taskId === "level_form_listening_generation" ? slices.listening
        : taskId === "level_form_reading_generation" ? slices.reading
          : slices.production,
      metadata: {}
    }))
  } as unknown as AiTaskRunner;
}

async function app(runner?: AiTaskRunner) {
  const instance = Fastify();
  registerAssessmentRoutes(instance, {} as never, runner);
  await instance.ready();
  return instance;
}

beforeEach(() => {
  vi.clearAllMocks();
  repositories.aiRuns.activeTaskPrompt.mockResolvedValue(null);
  repositories.assessments.createLevelFormDraft.mockImplementation(async (_actor: string, targetLevel: string) => ({ versionId: VERSION_ID, targetLevel, status: "draft" }));
  repositories.assessments.publishLevelForm.mockResolvedValue({ versionId: VERSION_ID, status: "published", publishedAt: new Date("2026-11-11T00:00:00Z") });
});

describe("assembleLevelFormFromAi (WP2 level-up shuffle)", () => {
  it("shuffles answer positions deterministically and remaps every key to the same option text", () => {
    const slices = aiSlices();
    const first = assembleLevelFormFromAi("B1", slices, { now: new Date("2026-11-11T00:00:00Z") });
    const again = assembleLevelFormFromAi("B1", aiSlices(), { now: new Date("2026-11-11T00:00:00Z") });
    expect(again).toEqual(first);
    expect(first.output.listening.questions).toHaveLength(20);
    for (const section of ["listening", "reading"] as const) {
      const keys = first.shuffled[section].questions.map((question) => question.correctIndex);
      for (const share of answerPositionShares(keys, 4)) {
        expect(share).toBeGreaterThanOrEqual(0.2);
        expect(share).toBeLessThanOrEqual(0.3);
      }
      first.shuffled[section].questions.forEach((question, index) => {
        const original = first.output[section].questions[index]!;
        expect(question.prompt).toBe(original.prompt);
        expect([...question.options].sort()).toEqual([...original.options].sort());
        expect(question.options[question.correctIndex]).toBe(original.options[original.correctIndex]);
      });
    }
    // The blueprint is built from the shuffled order: letter keys point at the original correct text.
    const readingTasks = first.blueprint.sections.find((section) => section.code === "reading")!.groups.flatMap((group) => group.tasks);
    readingTasks.forEach((task, index) => {
      const original = first.output.reading.questions[index]!;
      expect(task.options!.find((option) => option.value === task.correctAnswer)!.label).toBe(original.options[original.correctIndex]);
    });
    expect(new Set(readingTasks.map((task) => task.correctAnswer))).toEqual(new Set(LETTERS));
    expect(first.quality.passed).toBe(true);
    expect(first.blueprint.levelFormQuality).toEqual({ checkedAt: "2026-11-11T00:00:00.000Z", warnings: [] });
  });

  it("stores light gate warnings on the draft blueprint", () => {
    const reading = neutralQuestions("reading", 40, () => 1);
    reading[13] = { prompt: "How many training sessions are listed per day?", options: ["Once", "Twice", "Three times", "Four times"], correctIndex: 2 };
    const assembled = assembleLevelFormFromAi("B1", aiSlices(reading));
    expect(assembled.quality.passed).toBe(true);
    expect(assembled.blueprint.levelFormQuality.warnings).toEqual([expect.objectContaining({ code: "LEVEL_FORM_HOW_MANY_MISMATCH", severity: "light" })]);
  });

  it("stores the exam title, not the listening slice's section label", () => {
    for (const raw of [
      "Season English – Workplace English Promotion Test (A2) – Listening Section",
      "Workplace English B1 Promotion Test – Listening Section (20 points)",
      "Workplace English B1 Promotion Test: Listening Section"
    ]) {
      const slices = aiSlices();
      const assembled = assembleLevelFormFromAi("B1", { ...slices, listening: { ...slices.listening, title: raw } });
      expect(assembled.output.title).not.toMatch(/listening/i);
      expect(assembled.output.title).toBe(raw.replace(/\s*[–:]\s*Listening Section.*$/, ""));
    }
    const slices = aiSlices();
    expect(assembleLevelFormFromAi("B1", { ...slices, listening: { ...slices.listening, title: "Listening Section" } }).output.title).toBe("Workplace English B1 Promotion Test");
    expect(assembleLevelFormFromAi("B1", slices).output.title).toBe("Workplace English B1 Promotion Test");
  });
});

describe("level-form routes", () => {
  it("rejects generation with the gate issues and saves nothing when a severe rule fails", async () => {
    const reading = neutralQuestions("reading", 40, () => 1);
    reading[20] = WRONG_KEY_NOT_LISTED;
    const server = await app(fakeRunner(aiSlices(reading, B1_HANDOVER_PASSAGE)));
    const response = await server.inject({ method: "POST", url: "/api/v1/assessment-level-forms/B1/generate" });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: "LEVEL_FORM_GENERATION_FAILED", issues: [expect.objectContaining({ code: "LEVEL_FORM_NOT_QUESTION_KEY", severity: "severe", section: "reading" })] });
    expect(repositories.assessments.createLevelFormDraft).not.toHaveBeenCalled();
    await server.close();
  });

  it("saves a passing generated draft with balanced keys and the stored quality record", async () => {
    const server = await app(fakeRunner(aiSlices()));
    const response = await server.inject({ method: "POST", url: "/api/v1/assessment-level-forms/B1/generate" });
    expect(response.statusCode, response.body).toBe(201);
    const blueprint = repositories.assessments.createLevelFormDraft.mock.calls[0]![2];
    expect(blueprint.levelFormQuality.warnings).toEqual([]);
    const keys = blueprint.sections.find((section: { code: string }) => section.code === "listening").groups.flatMap((group: { tasks: Array<{ correctAnswer: string }> }) => group.tasks.map((task) => LETTERS.indexOf(task.correctAnswer)));
    expect(answerPositionShares(keys, 4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    await server.close();
  });

  it("rejects publishing a level-up form without the answer-review confirmation (D3)", async () => {
    const server = await app();
    for (const payload of [undefined, {}, { answersReviewed: false }, { answersReviewed: "yes" }]) {
      const response = await server.inject({ method: "POST", url: `/api/v1/assessment-level-forms/${VERSION_ID}/publication`, ...(payload ? { payload } : {}) });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: "LEVEL_FORM_ANSWER_REVIEW_REQUIRED" });
    }
    expect(repositories.assessments.publishLevelForm).not.toHaveBeenCalled();
    const published = await server.inject({ method: "POST", url: `/api/v1/assessment-level-forms/${VERSION_ID}/publication`, payload: { answersReviewed: true } });
    expect(published.statusCode, published.body).toBe(200);
    expect(repositories.assessments.publishLevelForm).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000aa", VERSION_ID);
    await server.close();
  });

  it("adds live gate findings to the Operator detail warnings once questions are complete", () => {
    const assembled = assembleLevelFormFromAi("B1", aiSlices());
    const detailOf = (sections: unknown) => ({ sections, warnings: [{ code: "missing_audio", message: "x", severity: "error" }] }) as unknown as Parameters<typeof withLevelFormQualityWarnings>[0];
    const sections = structuredClone(assembled.blueprint.sections);
    const task = sections.find((section) => section.code === "reading")!.groups[0]!.tasks[0]!;
    task.options = [{ value: "A", label: "Same" }, { value: "B", label: "same" }, { value: "C", label: "Other" }, { value: "D", label: "Fourth" }];
    const withIssues = withLevelFormQualityWarnings(detailOf(sections));
    expect(withIssues.warnings).toEqual([
      { code: "missing_audio", message: "x", severity: "error" },
      expect.objectContaining({ code: "quality_check", severity: "error" })
    ]);
    task.prompt = "";
    expect(withLevelFormQualityWarnings(detailOf(sections)).warnings).toHaveLength(1);
  });
});
