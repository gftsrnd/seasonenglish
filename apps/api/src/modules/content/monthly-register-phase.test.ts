import { AI_TASKS, monthlyRegisterTermsOutputJsonSchema, monthlyRegisterTermsOutputSchema, type AiTaskRunner } from "@e4s/ai";
import { describe, expect, it, vi } from "vitest";
import {
  buildMonthlyRegisterTermsAuditPrompt,
  buildMonthlyRegisterTermsPrompt,
  keepAuditedMonthlyRegisterTerms,
  monthlyRegisterCheckpointSchema,
  resumeMonthlyRegisterCheckpoint,
  runMonthlyRegisterTermsPhase
} from "./monthly-register-phase.js";

const cores = [
  { id: "core-1", word: "meet", meaning: "gặp mặt", type: "verb" },
  { id: "core-2", word: "estimate", meaning: "ước tính", type: "noun" },
  { id: "core-3", word: "start", meaning: "bắt đầu", type: "verb" }
];
const supports = [{ word: "begin", relatesToCoreId: "core-3" }, { word: "gather", relatesToCoreId: "core-1" }];

/** Mocked AI: each call returns the next queued output (or throws it when it is an Error). */
function mockRunner(...outputs: Array<unknown>) {
  const runTask = vi.fn(async (_taskId: string, _input: unknown, _options?: unknown) => {
    const next = outputs.shift();
    if (next instanceof Error) throw next;
    return { output: next, metadata: {} } as Awaited<ReturnType<AiTaskRunner["runTask"]>>;
  });
  return { runTask } as unknown as Pick<AiTaskRunner, "runTask"> & { runTask: typeof runTask };
}

describe("monthly register alternatives phase (L-042)", () => {
  it("prompts ask for optional, workplace-safe, real alternatives with a simple-English definition and no quota", () => {
    const prompt = buildMonthlyRegisterTermsPrompt({ cefr: "B2", theme: "Project kickoff" });
    expect(prompt).toContain("at most one \"slang\" item and at most one \"poetic\" item");
    expect(prompt).toContain("touch base");
    expect(prompt).toContain("commence");
    expect(prompt).toContain("never vulgar");
    expect(prompt).toContain("returning nothing for a core is correct and preferred");
    expect(prompt).toContain("no Vietnamese");
    expect(prompt).not.toMatch(/must return|at least one/iu);
    const audit = buildMonthlyRegisterTermsAuditPrompt({ cefr: "B2" });
    expect(audit).toContain("AUDIT ONLY");
    expect(audit).toContain("Reject anything invented");
    expect(audit).toContain("no minimum count or quota");
  });

  it("schema: the task is registered and items may be empty", () => {
    expect(AI_TASKS.get("monthly_register_terms")).toBeTruthy();
    expect(monthlyRegisterTermsOutputSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(() => monthlyRegisterTermsOutputSchema.parse({ items: [{ coreId: "c", kind: "neutral", word: "x", definition: "y z" }] })).toThrow();
    expect(monthlyRegisterTermsOutputJsonSchema.properties.items.items.required).toEqual(["coreId", "kind", "word", "definition"]);
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
    expect((runner.runTask.mock.calls[0]![1] as { cores: unknown[] }).cores).toHaveLength(3);
  });

  it("screens deterministically (filter, taken words) before ONE batched audit, which rejects invented items", async () => {
    const generated = { items: [
      { coreId: "core-1", kind: "slang", word: "touch base", definition: "talk briefly to check on progress" },
      { coreId: "core-1", kind: "slang", word: "fuck around", definition: "waste time at work" },
      { coreId: "core-2", kind: "slang", word: "ballpark", definition: "a rough guess of a number" },
      { coreId: "core-3", kind: "poetic", word: "begin", definition: "start something new" },
      { coreId: "core-3", kind: "poetic", word: "commence", definition: "begin, in formal writing" },
      { coreId: "core-3", kind: "slang", word: "kickoffify", definition: "an invented way to say begin" },
      { coreId: "core-9", kind: "slang", word: "whatever", definition: "unknown core item here" }
    ] };
    // The audit keeps everything except the invented word (and echoes one item with a new definition: matched by core/kind/word).
    const audited = { items: [
      { coreId: "core-1", kind: "slang", word: "Touch base", definition: "changed by the audit" },
      { coreId: "core-2", kind: "slang", word: "ballpark", definition: "a rough guess of a number" },
      { coreId: "core-3", kind: "poetic", word: "commence", definition: "begin, in formal writing" }
    ] };
    const runner = mockRunner(generated, audited);
    const result = await runMonthlyRegisterTermsPhase({ runner, cefr: "C1", theme: "t", cores, supports });
    expect(runner.runTask).toHaveBeenCalledTimes(2);
    const auditInput = runner.runTask.mock.calls[1]![1] as { candidates: Array<{ word: string }> };
    expect(auditInput.candidates.map((item) => item.word)).toEqual(["touch base", "ballpark", "commence", "kickoffify"]);
    expect(result.items).toEqual([
      { coreId: "core-1", kind: "slang", word: "touch base", definition: "talk briefly to check on progress" },
      { coreId: "core-2", kind: "slang", word: "ballpark", definition: "a rough guess of a number" },
      { coreId: "core-3", kind: "poetic", word: "commence", definition: "begin, in formal writing" }
    ]);
    expect(result.rejected.join(" | ")).toContain("not workplace-appropriate");
    expect(result.rejected.join(" | ")).toContain("already a core or support word");
    expect(result.rejected.join(" | ")).toContain("kickoffify: rejected by the audit");
    expect(result.rejected.join(" | ")).toContain("unknown core core-9");
    expect(result.failed).toBeUndefined();
  });

  it("never blocks: a failed generation or audit yields no alternatives (never unaudited ones)", async () => {
    const failedGeneration = await runMonthlyRegisterTermsPhase({ runner: mockRunner(new Error("AI_OUTPUT_INVALID")), cefr: "B2", theme: "t", cores, supports });
    expect(failedGeneration.items).toEqual([]);
    expect(failedGeneration.failed).toContain("generation");
    const failedAudit = await runMonthlyRegisterTermsPhase({ runner: mockRunner({ items: [{ coreId: "core-2", kind: "slang", word: "ballpark", definition: "a rough guess of a number" }] }, new Error("timeout")), cefr: "B2", theme: "t", cores, supports });
    expect(failedAudit.items).toEqual([]);
    expect(failedAudit.failed).toContain("audit");
  });

  it("keepAudited matches core, kind and word only", () => {
    const candidate = { coreId: "core-2", kind: "slang" as const, word: "ballpark", definition: "a rough guess" };
    expect(keepAuditedMonthlyRegisterTerms([candidate], [{ coreId: "core-2", kind: "poetic", word: "ballpark" }])).toEqual([]);
    expect(keepAuditedMonthlyRegisterTerms([candidate], [{ coreId: "core-1", kind: "slang", word: "ballpark" }])).toEqual([]);
    expect(keepAuditedMonthlyRegisterTerms([candidate], [{ coreId: "core-2", kind: "slang", word: " Ballpark " }])).toEqual([candidate]);
  });

  it("resume reuses checked cores with the same word and re-checks changed or new ones", () => {
    const checkpoint = monthlyRegisterCheckpointSchema.parse({
      checkedCores: [{ id: "core-1", word: "meet" }, { id: "core-2", word: "budget" }],
      items: [{ coreId: "core-1", kind: "slang", word: "touch base", definition: "talk briefly to check on progress" }, { coreId: "core-2", kind: "slang", word: "kitty", definition: "shared money for small costs" }]
    });
    const resume = resumeMonthlyRegisterCheckpoint(checkpoint, cores);
    expect(resume.items.map((item) => item.word)).toEqual(["touch base"]);
    expect(resume.pending.map((core) => core.id)).toEqual(["core-2", "core-3"]);
    expect(resumeMonthlyRegisterCheckpoint(undefined, cores).pending).toHaveLength(3);
  });
});
