import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMonthlyCalendar, monthlyDayKind } from "@e4s/domain";
import { CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS } from "./monthly-resource-generation.js";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";

const repository = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getResourceGenerationCheckpoint: vi.fn(),
  saveResourceGenerationCheckpoint: vi.fn(),
  saveResourceDraft: vi.fn(),
  activeTaskPrompt: vi.fn()
}));
// Any other repository read the generator makes (roadmap memory, history) answers empty.
vi.mock("@e4s/database", () => {
  const fallback = (target: Record<string, unknown>) => new Proxy(target, { get: (object, key) => key in object ? object[key as string] : (key === "then" ? undefined : async () => []) });
  return { createRepositories: () => ({ monthlyContent: fallback(repository), aiRuns: fallback({ activeTaskPrompt: repository.activeTaskPrompt }) }) };
});
vi.mock("../identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown }) => { request.e4sSession = { user: { id: "operator-1" } }; }
}));

const MONTH = "2026-12";
const newLessons = (() => { const calendar = buildMonthlyCalendar(MONTH); return calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length; })();
const lineage = (key: keyof typeof CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS) => ({ schemaVersion: CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS[key], briefVersion: 1 });
const checkpoint = (failedAttempts?: number) => ({
  id: "checkpoint-1", generationId: "generation-1", briefVersion: 1, version: 5, updatedAt: "2026-12-01T00:00:00.000Z",
  categories: {
    coreTerms: Array.from({ length: 2 }, (_, index) => ({ id: `a2-core-${index + 1}`, word: `zzword${index}`, meaning: "nghĩa", type: "noun", ipa: "/zɜːd/" })),
    expandedTerms: Array.from({ length: 240 }, (_, index) => ({ id: `a2-expanded-${index + 1}`, word: `support${index}`, meaning: "nghĩa", type: "noun", relation: "synonym", relatesToCoreId: "a2-core-1" }))
  },
  sourceLineage: { coreTerms: lineage("coreTerms"), expandedTerms: lineage("expandedTerms"), ...(failedAttempts ? { attempts: { failedAttempts } } : {}) }
});

describe("POST /api/v1/content/months/:month/resources/generate stopped by the AI-call cap", () => {
  const url = `/api/v1/content/months/${MONTH}/resources/generate`;
  const payload = { cefr: "A2", vocabularyCount: newLessons * 3, expandedVocabularyCount: newLessons * 27, grammarTopicCount: 2, pronunciationSoundCount: 4 };
  let info: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubEnv("MONTHLY_RESOURCE_AI_CALL_LIMIT", "1");
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const fn of Object.values(repository)) fn.mockReset();
    repository.getOverview.mockResolvedValue({ monthWindow: { writable: true }, brief: { month: MONTH, title: "Year-end", brief: "Plan the year end.", context: "Office", communicationGoal: "Agree dates", version: 1, status: "approved" }, frameworks: [] });
    repository.activeTaskPrompt.mockResolvedValue({ prompt: "Generate resources." });
    repository.saveResourceGenerationCheckpoint.mockImplementation(async () => checkpoint());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  const run = async (previousAttempts?: number) => {
    repository.getResourceGenerationCheckpoint.mockResolvedValue(checkpoint(previousAttempts));
    const runner = { runTask: vi.fn().mockRejectedValue(Object.assign(new Error("AI_OUTPUT_INVALID"), { code: "AI_OUTPUT_INVALID" })) };
    const app = Fastify();
    registerMonthlyContentRoutes(app, {} as never, runner as never);
    await app.ready();
    const response = await app.inject({ method: "POST", url, payload });
    await app.close();
    return response;
  };

  it("answers 422 with the calm budget message naming the saved progress, logs AI_CALL_BUDGET and counts the attempt", async () => {
    const response = await run(2);
    expect(response.statusCode, response.body).toBe(422);
    const body = response.json();
    expect(body.code).toBe("MONTHLY_RESOURCE_PLAN_INVALID");
    expect(body.issues[0]).toMatch(/^Đã dùng hết 1 lượt gọi AI cho lần này; phần đã làm được đã lưu \(.*240 từ mở rộng.*\)\. Bấm Tiếp tục để sinh tiếp\.$/u);
    expect(body).toMatchObject({ progressSaved: true, failedAttempts: 3 });
    expect(repository.saveResourceGenerationCheckpoint).toHaveBeenCalledWith("operator-1", expect.objectContaining({
      generationId: "generation-1", categories: {}, sourceLineage: { attempts: expect.objectContaining({ failedAttempts: 3 }) }
    }));
    const usage = (info.mock.calls as unknown[][]).find(([tag]) => tag === "[monthly-resource-usage]");
    expect(JSON.parse(String(usage?.[1])).outcome).toBe("AI_CALL_BUDGET");
  });

  it("starts the counter at 1 on the first unfinished run", async () => {
    const response = await run();
    expect(response.json()).toMatchObject({ progressSaved: true, failedAttempts: 1 });
  });
});
