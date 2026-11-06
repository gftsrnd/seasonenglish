import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMonthlyCalendar, monthlyDayKind, type MonthlyResourcePoolContract } from "@e4s/domain";
import type { MonthlyResourceEditInput } from "@e4s/contracts";
import { applyMonthlyResourceEdit, monthlyResourceEditInputSchema } from "./monthly-resource-manual-edit.js";
import { registerMonthlyContentRoutes } from "./monthly-routes.js";

const repository = vi.hoisted(() => ({
  getResourceDraftForEdit: vi.fn(),
  saveEditedResourceDraft: vi.fn()
}));
vi.mock("@e4s/database", () => ({ createRepositories: () => ({ monthlyContent: repository, aiRuns: {} }) }));
vi.mock("../identity/policy.js", () => ({
  createRoleGuard: () => async (request: { e4sSession?: unknown }) => { request.e4sSession = { user: { id: "operator-1" } }; }
}));

const RELATIONS = ["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const;
const letters = (index: number) => `${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`;

function draftPoolFixture(month = "2026-11"): MonthlyResourcePoolContract {
  const calendar = buildMonthlyCalendar(month);
  const coreCount = calendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, calendar) === "new").length * 3;
  return {
    month,
    cefr: "A1",
    version: 3,
    theme: { version: 1, title: "Budget review", brief: "Prepare a budget review.", context: "Office", communicationGoal: "State a cost." },
    coreTerms: Array.from({ length: coreCount }, (_, index) => ({ id: `a1-core-${index + 1}`, word: `term${letters(index)}`, meaning: `Nghĩa ${index + 1}`, type: "noun", ipa: "/tɜːm/", source: "core_registry", component: "core" })),
    supportTerms: Array.from({ length: coreCount * 9 }, (_, index) => ({
      id: `a1-expanded-${index + 1}`,
      word: `support${letters(index)}`,
      meaning: `Từ mở rộng ${index + 1}`,
      type: "noun",
      relation: RELATIONS[index % 9]!,
      source: "synonym",
      component: "expanded",
      relatedCoreTermId: `a1-core-${Math.floor(index / 9) + 1}`
    })),
    grammarTopics: [1, 2].map((topic) => ({
      id: `a1-grammar-${topic}`,
      title: `Grammar ${topic}`,
      steps: [1, 2, 3].map((step) => ({ id: `a1-grammar-${topic}-step-${step}`, focus: `Focus ${topic}.${step}`, formula: "subject + verb", usage: "Use at work.", examples: ["I check it.", "We review it.", "They send it."] }))
    })),
    sounds: ["/iː/", "/ɪ/", "/θ/", "/ʃ/"].map((ipa, soundIndex) => ({
      id: `a1-sound-${soundIndex + 1}`,
      ipa,
      label: `Sound ${soundIndex + 1}`,
      examples: Array.from({ length: 9 }, (_, exampleIndex) => ({ id: `a1-sound-${soundIndex + 1}-word-${exampleIndex + 1}`, word: `zz${letters(soundIndex * 9 + exampleIndex)}`, ipa: "/x/" }))
    }))
  };
}

function editInputFrom(pool: MonthlyResourcePoolContract): MonthlyResourceEditInput {
  return {
    expectedVersion: pool.version,
    coreTerms: pool.coreTerms.map(({ id, word, type, meaning, ipa }) => ({ id, word, type, meaning, ipa })),
    supportTerms: pool.supportTerms.map(({ id, word, meaning, type, relation, relatedCoreTermId, cefr }) => ({ id, word, meaning, type, relation, relatedCoreTermId, ...(cefr ? { cefr } : {}) })),
    grammarTopics: structuredClone(pool.grammarTopics),
    sounds: structuredClone(pool.sounds)
  };
}

describe("manual monthly resource edit (VH-R30/VH-R35)", () => {
  it("accepts an unchanged draft pool and the request schema parses it", () => {
    const pool = draftPoolFixture();
    const input = editInputFrom(pool);
    expect(monthlyResourceEditInputSchema.safeParse(input).success).toBe(true);
    const result = applyMonthlyResourceEdit(pool, input);
    expect(result.ok).toBe(true);
  });

  it("replaces a core word in place, edits fields and adds a manual support", () => {
    const pool = draftPoolFixture();
    const input = editInputFrom(pool);
    input.coreTerms[0] = { ...input.coreTerms[0]!, word: "  invoice ", meaning: "hóa đơn", ipa: "/ˈɪnvɔɪs/" };
    // Core 2 currently has 9 supports; drop one so a new manual one fits within the 3–9 range.
    input.supportTerms = input.supportTerms.filter((term) => term.id !== "a1-expanded-18");
    input.supportTerms.push({ id: "a1-expanded-m-1", word: "receipt", meaning: "biên lai", type: "noun", relation: "synonym", relatedCoreTermId: "a1-core-2", cefr: "A2" });
    input.grammarTopics[0]!.steps[0]!.examples = ["One.", "Two.", "Three.", "Four."];
    const result = applyMonthlyResourceEdit(pool, input);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.pool.coreTerms[0]).toMatchObject({ id: "a1-core-1", word: "invoice", meaning: "hóa đơn", source: "core_registry", component: "core" });
    expect(result.pool.supportTerms.find((term) => term.id === "a1-expanded-m-1")).toMatchObject({ source: "manual", component: "expanded", cefr: "A2" });
    expect(result.pool.supportTerms.find((term) => term.id === "a1-expanded-1")).toMatchObject({ source: "synonym" });
    expect(result.pool.coreTerms).toHaveLength(pool.coreTerms.length);
  });

  it("anchors per-row errors to the line that caused them", () => {
    const pool = draftPoolFixture();
    const input = editInputFrom(pool);
    input.coreTerms[0]!.meaning = " ";
    input.coreTerms[2]!.word = input.coreTerms[1]!.word.toUpperCase();
    input.supportTerms.find((term) => term.id === "a1-expanded-10")!.word = "two words here now extra";
    input.sounds[0]!.examples[0]!.word = "communication";
    input.sounds[1]!.ipa = "/ˈ/";
    input.grammarTopics[1]!.steps[2]!.formula = "";
    const result = applyMonthlyResourceEdit(pool, input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "coreTerms", rowId: "a1-core-1", field: "meaning" }),
      expect.objectContaining({ section: "coreTerms", rowId: "a1-core-3", field: "word" }),
      expect.objectContaining({ section: "supportTerms", rowId: "a1-expanded-10", field: "word" }),
      expect.objectContaining({ section: "sounds", rowId: "a1-sound-1-word-1", field: "word", message: expect.stringContaining("3 âm tiết") }),
      expect.objectContaining({ section: "sounds", rowId: "a1-sound-2", field: "ipa" }),
      expect.objectContaining({ section: "grammarTopics", rowId: "a1-grammar-2-step-3", field: "formula" })
    ]));
  });

  it("enforces 3–9 supports and the relations required by the core's part of speech", () => {
    const pool = draftPoolFixture();
    const input = editInputFrom(pool);
    // Core 1 (noun) keeps only antonym/word_family/collocation: no umbrella or synonym.
    input.supportTerms = input.supportTerms.filter((term) => term.relatedCoreTermId !== "a1-core-1" || ["antonym", "word_family", "collocation"].includes(term.relation));
    // Core 2 keeps two supports only.
    input.supportTerms = input.supportTerms.filter((term) => term.relatedCoreTermId !== "a1-core-2" || ["a1-expanded-10", "a1-expanded-11"].includes(term.id));
    // Core 3 becomes a verb whose supports have no word family.
    input.coreTerms[2]!.type = "verb";
    input.supportTerms = input.supportTerms.filter((term) => term.relatedCoreTermId !== "a1-core-3" || term.relation !== "word_family");
    const result = applyMonthlyResourceEdit(pool, input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowId: "a1-core-1", field: "supports", message: expect.stringContaining("bao trùm") }),
      expect.objectContaining({ rowId: "a1-core-2", field: "supports", message: expect.stringContaining("3–9") }),
      expect.objectContaining({ rowId: "a1-core-3", field: "supports", message: expect.stringContaining("cùng họ từ") })
    ]));
  });

  it("keeps the core count, grammar and pronunciation structure fixed", () => {
    const pool = draftPoolFixture();
    const input = editInputFrom(pool);
    input.coreTerms.pop();
    input.sounds.pop();
    const result = applyMonthlyResourceEdit(pool, input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "pool", message: expect.stringContaining(`${pool.coreTerms.length}`) }),
      expect.objectContaining({ section: "sounds", message: expect.stringContaining("4 mục tiêu") })
    ]));
  });

  it("applies the 35% repeat and phrase caps and the support level rule", () => {
    const pool = draftPoolFixture();
    const input = editInputFrom(pool);
    // Every support of cores 1–20 reuses one word per relation slot: far more than 35% repeats.
    input.supportTerms = input.supportTerms.map((term, index) => index < 180 ? { ...term, word: `shared${letters(index % 9)}` } : term);
    input.supportTerms[200] = { ...input.supportTerms[200]!, cefr: "C1" };
    const result = applyMonthlyResourceEdit(pool, input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "pool", message: expect.stringContaining("lặp lại vượt giới hạn 35%") }),
      expect.objectContaining({ section: "supportTerms", rowId: input.supportTerms[200]!.id, field: "cefr" })
    ]));
  });
});

describe("PUT /api/v1/content/month-frameworks/:id/resources", () => {
  const frameworkId = "7f1f5b8e-8d2a-4a64-9a39-5d6f0f7c1a11";
  const url = `/api/v1/content/month-frameworks/${frameworkId}/resources`;
  const build = async () => {
    const app = Fastify();
    registerMonthlyContentRoutes(app, {} as never);
    await app.ready();
    return app;
  };
  const draft = (overrides: Record<string, unknown> = {}) => ({ id: frameworkId, month: "2026-11", cefr: "A1", version: 3, status: "draft", writable: true, pool: draftPoolFixture(), ...overrides });
  beforeEach(() => {
    repository.getResourceDraftForEdit.mockReset();
    repository.saveEditedResourceDraft.mockReset();
  });

  it("saves a valid edit as the next draft version", async () => {
    repository.getResourceDraftForEdit.mockResolvedValue(draft());
    repository.saveEditedResourceDraft.mockResolvedValue({ id: frameworkId, cefr: "A1", version: 4, status: "draft", scopeHash: "hash" });
    const app = await build();
    const input = editInputFrom(draftPoolFixture());
    input.coreTerms[0]!.word = "invoice";
    const response = await app.inject({ method: "PUT", url, payload: input });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ version: 4, status: "draft" });
    expect(repository.saveEditedResourceDraft).toHaveBeenCalledWith("operator-1", frameworkId, 3, expect.objectContaining({ coreTerms: expect.arrayContaining([expect.objectContaining({ id: "a1-core-1", word: "invoice" })]) }));
    await app.close();
  });

  it("returns per-row issues and saves nothing when the edit breaks a rule", async () => {
    repository.getResourceDraftForEdit.mockResolvedValue(draft());
    const app = await build();
    const input = editInputFrom(draftPoolFixture());
    input.supportTerms[0]!.meaning = "";
    const response = await app.inject({ method: "PUT", url, payload: input });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "MONTHLY_RESOURCE_EDIT_INVALID", issues: [expect.objectContaining({ section: "supportTerms", rowId: "a1-expanded-1", field: "meaning" })] });
    expect(repository.saveEditedResourceDraft).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects approved resources, read-only months, stale versions and unknown frameworks", async () => {
    const app = await build();
    const input = editInputFrom(draftPoolFixture());
    repository.getResourceDraftForEdit.mockResolvedValueOnce(draft({ status: "approved" }));
    expect((await app.inject({ method: "PUT", url, payload: input })).json()).toMatchObject({ code: "MONTHLY_FRAMEWORK_IMMUTABLE" });
    repository.getResourceDraftForEdit.mockResolvedValueOnce(draft({ writable: false }));
    expect((await app.inject({ method: "PUT", url, payload: input })).json()).toMatchObject({ code: "MONTHLY_CONTENT_READ_ONLY" });
    repository.getResourceDraftForEdit.mockResolvedValueOnce(draft({ version: 5 }));
    const stale = await app.inject({ method: "PUT", url, payload: input });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "MONTHLY_FRAMEWORK_VERSION_CONFLICT", currentVersion: 5 });
    repository.getResourceDraftForEdit.mockResolvedValueOnce(draft({ status: "retired" }));
    expect((await app.inject({ method: "PUT", url, payload: input })).statusCode).toBe(404);
    repository.getResourceDraftForEdit.mockResolvedValueOnce(null);
    expect((await app.inject({ method: "PUT", url, payload: input })).statusCode).toBe(404);
    expect(repository.saveEditedResourceDraft).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a malformed body before loading the draft", async () => {
    const app = await build();
    const response = await app.inject({ method: "PUT", url, payload: { expectedVersion: 0, coreTerms: "nope" } });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "MONTHLY_RESOURCE_EDIT_INVALID" });
    expect(repository.getResourceDraftForEdit).not.toHaveBeenCalled();
    await app.close();
  });
});
