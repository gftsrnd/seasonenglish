import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMonthlyCalendar, monthlyDayKind } from "@e4s/domain";
import type { MonthlyResourceEditInput, SharedMonthBriefView } from "@e4s/contracts";
import { applyMonthlyResourceEdit, blankMonthlyResourcePool, prefillMonthlyResourcePoolFromCheckpoint } from "./monthly-resource-manual-edit.js";
import { CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS, describeMonthlyResourceCheckpointProgress, MonthlyAiCallBudgetError, monthlyResourcePartialProgressMessage, readMonthlyResourceFailedAttempts } from "./monthly-resource-generation.js";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";

const repository = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getResourceGenerationCheckpoint: vi.fn(),
  saveResourceDraft: vi.fn()
}));
vi.mock("@e4s/database", () => ({ createRepositories: () => ({ monthlyContent: repository, aiRuns: {} }) }));
vi.mock("../identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown }) => { request.e4sSession = { user: { id: "operator-1" } }; }
}));

const MONTH = "2026-11";
const RELATIONS = ["umbrella", "synonym", "antonym", "word_family", "collocation"] as const;
const letters = (index: number) => `${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`;
const brief: SharedMonthBriefView = { month: MONTH, title: "Budget review", brief: "Prepare a budget review.", context: "Office", communicationGoal: "State a cost.", version: 1, status: "approved" } as SharedMonthBriefView;
const coreCount = (() => {
  const calendar = buildMonthlyCalendar(MONTH);
  return calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length * 3;
})();
const lineage = (key: keyof typeof CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS) => ({ schemaVersion: CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS[key], briefVersion: 1, promptKey: "monthly_resource_generation", status: "draft_checkpoint", generatedAt: "2026-11-04T00:00:00.000Z" });

/** A checkpoint as the generator stores it: plan-shaped rows per category. */
function checkpointFixture(options: { grammar?: boolean; sounds?: boolean; supportsPerCore?: number } = {}) {
  const perCore = options.supportsPerCore ?? 5;
  const coreTerms = Array.from({ length: coreCount }, (_, index) => ({ id: `a1-core-${index + 1}`, word: `term${letters(index)}`, meaning: `Nghĩa ${index + 1}`, type: "noun", ipa: "/tɜːm/" }));
  const expandedTerms = coreTerms.flatMap((core, coreIndex) => Array.from({ length: perCore }, (_, index) => ({
    id: `a1-expanded-${coreIndex * perCore + index + 1}`, word: `support${letters(coreIndex * perCore + index)}`, meaning: `Từ mở rộng ${coreIndex * perCore + index + 1}`,
    type: "noun", relation: RELATIONS[index % RELATIONS.length]!, relatesToCoreId: core.id
  })));
  const grammarTopics = [1, 2].map((topic) => ({
    id: `grammar-${topic}`, title: `Grammar ${topic}`,
    steps: [1, 2, 3].map((step) => ({ id: `grammar-${topic}-${step}`, focus: `Focus ${topic}.${step}`, formula: "subject + verb", usage: "Use at work.", examples: ["I check it.", "We review it.", "They send it."] }))
  }));
  const pronunciationTargets = ["/iː/", "/ɪ/", "/θ/", "/ʃ/"].map((ipa, soundIndex) => ({
    id: `sound-${soundIndex + 1}`, ipa, label: `Sound ${soundIndex + 1}`, explanation: "Say it clearly.",
    words: Array.from({ length: 9 }, (_, exampleIndex) => ({ word: `zz${letters(soundIndex * 9 + exampleIndex)}`, ipa: `/z${ipa.slice(1, -1)}z/` }))
  }));
  return {
    id: "checkpoint-1", generationId: "generation-1", briefVersion: 1, version: 7, updatedAt: "2026-11-04T00:00:00.000Z",
    categories: { coreTerms, expandedTerms, ...(options.grammar ? { grammarTopics } : {}), ...(options.sounds ? { pronunciationTargets } : {}) },
    sourceLineage: { coreTerms: lineage("coreTerms"), expandedTerms: lineage("expandedTerms"), ...(options.grammar ? { grammarTopics: lineage("grammarTopics") } : {}), ...(options.sounds ? { pronunciationTargets: lineage("pronunciationTargets") } : {}) }
  };
}

/** What the web editor sends back for an untouched pool (toMonthlyResourceEditInput). */
function editInputFrom(pool: ReturnType<typeof blankMonthlyResourcePool>): MonthlyResourceEditInput {
  return {
    expectedVersion: pool.theme.version,
    coreTerms: pool.coreTerms.map(({ id, word, type, meaning, ipa }) => ({ id, word, type, meaning, ipa })),
    supportTerms: pool.supportTerms.map(({ id, word, meaning, type, relation, relatedCoreTermId, cefr }) => ({ id, word, meaning, type, relation, relatedCoreTermId: relatedCoreTermId ?? "", ...(cefr ? { cefr } : {}) })),
    grammarTopics: structuredClone(pool.grammarTopics).map((topic) => ({ id: topic.id, title: topic.title, steps: topic.steps })),
    sounds: structuredClone(pool.sounds).map((sound) => ({ id: sound.id, ipa: sound.ipa, label: sound.label, examples: sound.examples }))
  };
}

describe("manual resource pool prefilled from a generation checkpoint", () => {
  it("loads saved cores and expanded words into the fixed manual slots and leaves missing grammar/pronunciation blank", () => {
    const { pool, prefill } = prefillMonthlyResourcePoolFromCheckpoint(blankMonthlyResourcePool(brief, "A1"), checkpointFixture());
    expect(prefill).toEqual({ source: "checkpoint", generationId: "generation-1", updatedAt: "2026-11-04T00:00:00.000Z", categories: { coreTerms: coreCount, expandedTerms: coreCount * 5, grammarTopics: 0, pronunciationTargets: 0 } });
    expect(pool.coreTerms[0]).toMatchObject({ id: "core-1", word: "termaa", meaning: "Nghĩa 1", type: "noun", ipa: "/tɜːm/" });
    expect(pool.coreTerms.map((core) => core.id)).toEqual(blankMonthlyResourcePool(brief, "A1").coreTerms.map((core) => core.id));
    expect(pool.supportTerms).toHaveLength(coreCount * 5);
    expect(pool.supportTerms[0]).toMatchObject({ relatedCoreTermId: "core-1", relation: "umbrella", source: "group" });
    expect(pool.grammarTopics.every((topic) => topic.title === "")).toBe(true);
    expect(pool.sounds.every((sound) => sound.examples.length === 0)).toBe(true);

    // Saving as-is reports only the missing grammar and pronunciation, in Vietnamese, on their rows.
    const result = applyMonthlyResourceEdit(pool, editInputFrom(pool));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.section === "coreTerms" || issue.section === "supportTerms")).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "grammarTopics", rowId: "grammar-1", field: "title", message: "Tên chủ điểm không được để trống." }),
      expect.objectContaining({ section: "sounds", rowId: "sound-1", field: "examples", message: "Cần ít nhất 9 từ ví dụ (hiện có 0)." })
    ]));
  });

  it("a complete checkpoint passes the manual-edit validation unchanged (save round-trip)", () => {
    const { pool } = prefillMonthlyResourcePoolFromCheckpoint(blankMonthlyResourcePool(brief, "A1"), checkpointFixture({ grammar: true, sounds: true }));
    const result = applyMonthlyResourceEdit(pool, editInputFrom(pool));
    expect(result.ok, JSON.stringify(!result.ok && result.issues.slice(0, 5))).toBe(true);
  });

  it("ignores categories from an outdated checkpoint schema and returns no prefill for an empty checkpoint", () => {
    const stale = checkpointFixture();
    (stale.sourceLineage as Record<string, unknown>).expandedTerms = { ...stale.sourceLineage.expandedTerms, schemaVersion: "old" };
    const { pool, prefill } = prefillMonthlyResourcePoolFromCheckpoint(blankMonthlyResourcePool(brief, "A1"), stale);
    expect(prefill?.categories).toMatchObject({ coreTerms: coreCount, expandedTerms: 0 });
    expect(pool.supportTerms).toEqual([]);
    expect(prefillMonthlyResourcePoolFromCheckpoint(blankMonthlyResourcePool(brief, "A1"), { generationId: "g", updatedAt: "t", categories: {}, sourceLineage: {} }).prefill).toBeNull();
    expect(prefillMonthlyResourcePoolFromCheckpoint(blankMonthlyResourcePool(brief, "A1"), null).prefill).toBeNull();
  });
});

describe("resource generation Operator messages", () => {
  it("gives the AI-call budget error a code and names what the checkpoint kept", () => {
    const error = new MonthlyAiCallBudgetError(400, describeMonthlyResourceCheckpointProgress({ coreTerms: 54, expandedTerms: 240, grammarTopics: 0 }));
    expect(error.code).toBe("AI_CALL_BUDGET");
    expect(error.errors[0]).toBe("Đã dùng hết 400 lượt gọi AI cho lần này; phần đã làm được đã lưu (54 từ cốt lõi, 240 từ mở rộng). Bấm Tiếp tục để sinh tiếp.");
    expect(monthlyResourcePartialProgressMessage("243 từ mở rộng")).toBe("Đã sinh thêm một phần (243 từ mở rộng). Bấm Tiếp tục để sinh tiếp.");
  });

  it("reads the consecutive unfinished-run counter from the checkpoint lineage", () => {
    expect(readMonthlyResourceFailedAttempts(undefined)).toBe(0);
    expect(readMonthlyResourceFailedAttempts({ attempts: { failedAttempts: 3 } })).toBe(3);
    expect(readMonthlyResourceFailedAttempts({ attempts: { failedAttempts: "3" } })).toBe(0);
  });
});

describe("GET/PUT /api/v1/content/months/:month/resources/manual with a checkpoint", () => {
  const url = `/api/v1/content/months/${MONTH}/resources/manual?cefr=A1`;
  const build = async () => {
    const app = Fastify();
    registerMonthlyContentRoutes(app, {} as never);
    await app.ready();
    return app;
  };
  beforeEach(() => {
    repository.getOverview.mockReset().mockResolvedValue({ monthWindow: { writable: true }, brief, frameworks: [] });
    repository.getResourceGenerationCheckpoint.mockReset();
    repository.saveResourceDraft.mockReset();
  });

  it("opens the editor with the checkpoint categories and saves the completed pool as a manual draft", async () => {
    repository.getResourceGenerationCheckpoint.mockResolvedValue(checkpointFixture({ grammar: true }));
    repository.saveResourceDraft.mockResolvedValue({ id: "framework-1", cefr: "A1", version: 1, status: "draft" });
    const app = await build();
    const loaded = await app.inject({ method: "GET", url });
    expect(loaded.statusCode, loaded.body).toBe(200);
    const body = loaded.json();
    expect(body.prefill.categories).toEqual({ coreTerms: coreCount, expandedTerms: coreCount * 5, grammarTopics: 2, pronunciationTargets: 0 });
    expect(body.coreTerms[0]).toMatchObject({ id: "core-1", word: "termaa" });
    expect(body.grammarTopics[0].title).toBe("Grammar 1");

    // The Operator completes only the missing pronunciation targets, then saves.
    const { prefill: _prefill, ...pool } = body;
    const input = editInputFrom(pool);
    input.sounds = ["/iː/", "/ɪ/", "/θ/", "/ʃ/"].map((ipa, soundIndex) => ({
      id: `sound-${soundIndex + 1}`, ipa, label: `Sound ${soundIndex + 1}`,
      examples: Array.from({ length: 9 }, (_, exampleIndex) => ({ id: `sound-${soundIndex + 1}-word-${exampleIndex + 1}`, word: `zz${letters(soundIndex * 9 + exampleIndex)}`, ipa: `/z${ipa.slice(1, -1)}z/` }))
    }));
    const saved = await app.inject({ method: "PUT", url, payload: input });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(repository.saveResourceDraft).toHaveBeenCalledWith("operator-1", expect.objectContaining({
      coreTerms: expect.arrayContaining([expect.objectContaining({ id: "core-1", word: "termaa" })]),
      supportTerms: expect.arrayContaining([expect.objectContaining({ relatedCoreTermId: "core-1", source: "group" })])
    }), "manual");
    await app.close();
  });

  it("keeps the blank pool when there is no checkpoint", async () => {
    repository.getResourceGenerationCheckpoint.mockResolvedValue(null);
    const app = await build();
    const loaded = await app.inject({ method: "GET", url });
    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().prefill).toBeUndefined();
    expect(loaded.json().supportTerms).toEqual([]);
    await app.close();
  });
});
