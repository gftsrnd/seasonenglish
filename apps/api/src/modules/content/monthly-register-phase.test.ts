import { AI_TASKS, monthlyRegisterTermsOutputJsonSchema, monthlyRegisterTermsOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { describe, expect, it, vi } from "vitest";
import {
  budgetedMonthlyRegisterRunner,
  buildMonthlyRegisterTermsAuditPrompt,
  buildMonthlyRegisterTermsPrompt,
  keepAuditedMonthlyRegisterTerms,
  monthlyRegisterCheckpointSchema,
  regenerateMonthlyRegisterTerms,
  resumeMonthlyRegisterCheckpoint,
  runMonthlyRegisterTermsPhase
} from "./monthly-register-phase.js";

const cores = [
  { id: "core-1", word: "dollar", meaning: "đô la", type: "noun" },
  { id: "core-2", word: "cancel", meaning: "hủy bỏ", type: "verb" },
  { id: "core-3", word: "morning", meaning: "buổi sáng", type: "noun" },
  { id: "core-4", word: "report", meaning: "báo cáo", type: "noun" },
  { id: "core-5", word: "start", meaning: "bắt đầu", type: "verb" }
];
const supports = [{ word: "dawn", relatesToCoreId: "core-3" }, { word: "invoice", relatesToCoreId: "core-1" }];
const usage = "Fine in casual chat with colleagues; do not use it in reports or client emails.";
const source = "Common in older poetry, Shakespeare and the King James Bible.";

/** Mocked AI: each call returns the next queued output (or throws it when it is an Error). */
function mockRunner(...outputs: Array<unknown>) {
  const runTask = vi.fn(async (_taskId: string, _input: unknown, _options?: unknown) => {
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    return { output: next, metadata: { usage: { inputTokens: 100, outputTokens: 20 } } } as unknown as Awaited<ReturnType<AiTaskRunner["runTask"]>>;
  });
  return { runTask } as unknown as Pick<AiTaskRunner, "runTask"> & { runTask: typeof runTask };
}

describe("monthly slang / poetic phase (L-042, 12/11 definition)", () => {
  it("prompts define slang and poetic as genuine synonyms, reject formal-as-poetic and specific sources, and set no quota", () => {
    const prompt = buildMonthlyRegisterTermsPrompt({ cefr: "B2", theme: "Project kickoff" });
    expect(prompt).toContain("at most one \"slang\" item and at most one \"poetic\" item");
    for (const example of ["dollar -> buck", "cancel -> scrap", "morning -> morn", "horse -> steed", "sleep -> slumber", "report -> update is wrong", "start -> commence", "never vulgar", "returning nothing for a core is correct and preferred", "No Vietnamese", "British English (RP)", "never name a specific title"]) expect(prompt).toContain(example);
    expect(prompt).not.toMatch(/must return|at least one/iu);
    const audit = buildMonthlyRegisterTermsAuditPrompt({ cefr: "B2" });
    expect(audit).toContain("AUDIT ONLY");
    expect(audit).toContain("Reject anything invented");
    expect(audit).toContain("no minimum count or quota");
    expect(audit).toContain("reject related ideas such as report -> update");
    expect(audit).toContain("NOT merely formal");
  });

  it("schema: the task is registered, items may be empty, every item carries ipa and note", () => {
    expect(AI_TASKS.get("monthly_register_terms")).toBeTruthy();
    expect(monthlyRegisterTermsOutputSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(() => monthlyRegisterTermsOutputSchema.parse({ items: [{ coreId: "c", kind: "formal", word: "x", ipa: "/x/", definition: "y z", note: "n" }] })).toThrow();
    expect(() => monthlyRegisterTermsOutputSchema.parse({ items: [{ coreId: "c", kind: "slang", word: "x", definition: "y z" }] })).toThrow();
    expect(monthlyRegisterTermsOutputJsonSchema.properties.items.items.required).toEqual(["coreId", "kind", "word", "ipa", "definition", "note"]);
    expect(monthlyRegisterTermsOutputJsonSchema.properties.items.items.properties.kind.enum).toEqual(["slang", "poetic"]);
  });

  it("A1–A2 make no AI call", async () => {
    for (const cefr of ["A1", "A2"]) {
      const runner = mockRunner();
      const result = await runMonthlyRegisterTermsPhase({ runner, cefr, theme: "t", cores, supports });
      expect(result).toEqual({ items: [], calls: 0, generated: 0, rejected: [] });
      expect(runner.runTask).not.toHaveBeenCalled();
    }
  });

  it("an empty generation is fine: one call, no audit, no failure", async () => {
    const runner = mockRunner({ items: [] });
    const result = await runMonthlyRegisterTermsPhase({ runner, cefr: "B1", theme: "t", cores, supports });
    expect(result).toEqual({ items: [], calls: 1, generated: 0, rejected: [] });
    expect(runner.runTask).toHaveBeenCalledTimes(1);
    expect(runner.runTask.mock.calls[0]![0]).toBe("monthly_register_terms");
    // All cores go in ONE batched call.
    expect((runner.runTask.mock.calls[0]![1] as { cores: unknown[] }).cores).toHaveLength(5);
  });

  it("screens deterministically (formal-as-poetic, American IPA, taken words, notes) before ONE batched audit, which rejects non-synonyms", async () => {
    const generated = { items: [
      { coreId: "core-1", kind: "slang", word: "buck", ipa: "/bʌk/", definition: "one dollar of money", note: usage },
      { coreId: "core-1", kind: "slang", word: "fuck all", ipa: "/fʌk ɔːl/", definition: "no money at all", note: usage },
      { coreId: "core-2", kind: "slang", word: "scrap", ipa: "/skræp/", definition: "decide not to go ahead", note: usage },
      { coreId: "core-3", kind: "poetic", word: "dawn", ipa: "/dɔːn/", definition: "the first light of day", note: source },
      { coreId: "core-3", kind: "poetic", word: "morn", ipa: "/mɔːrn/", definition: "the early part of the day", note: source },
      { coreId: "core-4", kind: "slang", word: "update", ipa: "/ˈʌpdeɪt/", definition: "new facts about a task", note: usage },
      { coreId: "core-5", kind: "poetic", word: "commence", ipa: "/kəˈmens/", definition: "to begin something", note: "Used in formal writing and official letters." },
      { coreId: "core-9", kind: "slang", word: "whatever", ipa: "/wɒtˈevə/", definition: "unknown core item here", note: usage }
    ] };
    // The audit rejects the non-synonym report -> update (and echoes buck with another definition: matched by core/kind/word).
    const audited = { items: [
      { coreId: "core-1", kind: "slang", word: "Buck", ipa: "/bʌk/", definition: "changed by the audit", note: usage },
      { coreId: "core-2", kind: "slang", word: "scrap", ipa: "/skræp/", definition: "decide not to go ahead", note: usage }
    ] };
    const runner = mockRunner(generated, audited);
    const result = await runMonthlyRegisterTermsPhase({ runner, cefr: "C1", theme: "t", cores, supports });
    expect(runner.runTask).toHaveBeenCalledTimes(2);
    const auditInput = runner.runTask.mock.calls[1]![1] as { candidates: Array<{ word: string; ipa: string; note: string }> };
    expect(auditInput.candidates.map((item) => item.word)).toEqual(["buck", "scrap", "update"]);
    expect(auditInput.candidates[0]).toEqual({ coreId: "core-1", kind: "slang", word: "buck", ipa: "/bʌk/", definition: "one dollar of money", note: usage });
    expect(result.items).toEqual([
      { coreId: "core-1", kind: "slang", word: "buck", definition: "one dollar of money", ipa: "/bʌk/", usage },
      { coreId: "core-2", kind: "slang", word: "scrap", definition: "decide not to go ahead", ipa: "/skræp/", usage }
    ]);
    const reasons = result.rejected.join(" | ");
    expect(reasons).toContain("not workplace-appropriate");
    expect(reasons).toContain("already a core or support word"); // dawn is a support of morning
    expect(reasons).toMatch(/morn.*\/r\//u); // American rhotic IPA
    expect(reasons).toMatch(/commence.*formal/u);
    expect(reasons).toContain("update: rejected by the audit");
    expect(reasons).toContain("unknown core core-9");
    expect(result.failed).toBeUndefined();
  });

  it("never blocks: a failed generation or audit yields no alternatives (never unaudited ones)", async () => {
    const failedGeneration = await runMonthlyRegisterTermsPhase({ runner: mockRunner(new Error("AI_OUTPUT_INVALID")), cefr: "B2", theme: "t", cores, supports });
    expect(failedGeneration.items).toEqual([]);
    expect(failedGeneration.failed).toContain("generation");
    const failedAudit = await runMonthlyRegisterTermsPhase({ runner: mockRunner({ items: [{ coreId: "core-2", kind: "slang", word: "scrap", ipa: "/skræp/", definition: "decide not to go ahead", note: usage }] }, new Error("timeout")), cefr: "B2", theme: "t", cores, supports });
    expect(failedAudit.items).toEqual([]);
    expect(failedAudit.failed).toContain("audit");
  });

  it("register-only regeneration replaces ONLY registerTerms of the cores, within the AI-call ceiling", async () => {
    const pool = [
      { id: "core-1", word: "dollar", meaning: "đô la", type: "noun", ipa: "/ˈdɒlə/", source: "core_registry", registerTerms: [{ kind: "slang", word: "greenback", definition: "an old US banknote", register: "x" }] },
      { id: "core-5", word: "start", meaning: "bắt đầu", type: "verb", ipa: "/stɑːt/", source: "core_registry", registerTerms: [{ kind: "poetic", word: "commence", definition: "begin, in formal writing", register: "Formal: formal or literary writing" }] }
    ];
    const item = { coreId: "core-1", kind: "slang", word: "buck", ipa: "/bʌk/", definition: "one dollar of money", note: usage };
    const { runner, usage: spent } = budgetedMonthlyRegisterRunner(mockRunner({ items: [item] }, { items: [item] }), 400);
    const { coreTerms, phase } = await regenerateMonthlyRegisterTerms({ runner, cefr: "B1", theme: "t", coreTerms: pool, supportTerms: [{ word: "invoice", relatedCoreTermId: "core-1" }] });
    expect(phase.calls).toBe(2);
    expect(spent).toMatchObject({ calls: 2, inputTokens: 200, outputTokens: 40 });
    expect(coreTerms.map(({ registerTerms: _r, ...rest }) => rest)).toEqual(pool.map(({ registerTerms: _r, ...rest }) => rest));
    expect(coreTerms[0]!.registerTerms).toEqual([{ kind: "slang", word: "buck", definition: "one dollar of money", register: expect.stringMatching(/^Slang/u), ipa: "/bʌk/", usage }]);
    expect("registerTerms" in coreTerms[1]!).toBe(false);
    // A failed phase replaces nothing.
    const failed = await regenerateMonthlyRegisterTerms({ runner: mockRunner(new Error("down")), cefr: "B1", theme: "t", coreTerms: pool, supportTerms: [] });
    expect(failed.coreTerms).toEqual(pool);
    // The ceiling: no call is made once the budget is spent.
    const capped = budgetedMonthlyRegisterRunner(mockRunner({ items: [] }), 0);
    const cappedRun = await runMonthlyRegisterTermsPhase({ runner: capped.runner, cefr: "B1", theme: "t", cores, supports });
    expect(cappedRun.failed).toContain("generation");
    expect(capped.usage.calls).toBe(0);
  });

  it("keepAudited matches core, kind and word only", () => {
    const candidate = { coreId: "core-2", kind: "slang" as const, word: "scrap", definition: "decide not to go ahead", ipa: "/skræp/", usage };
    expect(keepAuditedMonthlyRegisterTerms([candidate], [{ coreId: "core-2", kind: "poetic", word: "scrap" }])).toEqual([]);
    expect(keepAuditedMonthlyRegisterTerms([candidate], [{ coreId: "core-1", kind: "slang", word: "scrap" }])).toEqual([]);
    expect(keepAuditedMonthlyRegisterTerms([candidate], [{ coreId: "core-2", kind: "slang", word: " Scrap " }])).toEqual([candidate]);
  });

  it("resume reuses checked cores with the same word and re-checks changed or new ones", () => {
    const checkpoint = monthlyRegisterCheckpointSchema.parse({
      checkedCores: [{ id: "core-1", word: "dollar" }, { id: "core-2", word: "budget" }],
      items: [{ coreId: "core-1", kind: "slang", word: "buck", definition: "one dollar of money", ipa: "/bʌk/", usage }, { coreId: "core-2", kind: "slang", word: "kitty", definition: "shared money for small costs" }]
    });
    const resume = resumeMonthlyRegisterCheckpoint(checkpoint, cores);
    expect(resume.items.map((item) => item.word)).toEqual(["buck"]);
    expect(resume.pending.map((core) => core.id)).toEqual(["core-2", "core-3", "core-4", "core-5"]);
    expect(resumeMonthlyRegisterCheckpoint(undefined, cores).pending).toHaveLength(5);
  });
});
