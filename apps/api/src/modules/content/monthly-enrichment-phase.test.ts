import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import { MonthlyCorePhaseShortfallError, runMonthlyCorePhase } from "./monthly-core-phase.js";
import { runMonthlyEnrichmentWithRefill, type MonthlyCoreEnrichmentOutcome } from "./monthly-enrichment-phase.js";
import { screenCachedMonthlyCoreSupports, selectMonthlySupportCandidates } from "./monthly-resource-generation.js";

type CoreTerm = MonthlyResourcePlanTaskOutput["coreTerms"][number];
type SupportTerm = MonthlyResourcePlanTaskOutput["expandedTerms"][number];

const support = (word: string, relation: SupportTerm["relation"], coreId: string, type = "noun"): SupportTerm => ({ id: `${coreId}-${relation}-${word}`, word, meaning: "nghĩa", type, relation, relatesToCoreId: coreId });

const letters = (index: number) => {
  let value = index;
  let result = "";
  do { result = String.fromCharCode(97 + (value % 26)) + result; value = Math.floor(value / 26) - 1; } while (value >= 0);
  return result;
};

/** A candidate noun core with umbrella, synonym and a word family that the deterministic checks accept. */
function candidate(word: string, id: string) {
  const core: CoreTerm = { id, word, meaning: `nghĩa ${word}`, type: "noun", ipa: "/x/" };
  return { core, edges: [support(`umb${word}`, "umbrella", id), support(`syn${word}`, "synonym", id), support(`${word}ness`, "word_family", id)] };
}

/** Fake core-phase runner: every generation call returns fresh synthetic candidates; the audit keeps everything. */
function fakeCorePhase(options: { produce?: (count: number) => boolean } = {}) {
  let counter = 0;
  const prompts: string[] = [];
  const generate = async (prompt: string, coreTermBatch: CoreTerm[], targets: { vocabularyCount: number }): Promise<MonthlyResourcePlanTaskOutput> => {
    if (coreTermBatch.length) return { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [] };
    prompts.push(prompt);
    if (options.produce && !options.produce(targets.vocabularyCount)) return { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [] };
    const entries = Array.from({ length: targets.vocabularyCount }, (_value, position) => candidate(`qun${letters(counter++)}x`, `ai-${position}`));
    return { coreTerms: entries.map((entry) => entry.core), expandedTerms: entries.flatMap((entry) => entry.edges), grammarTopics: [], pronunciationTargets: [] };
  };
  const audit = async (_core: CoreTerm, candidates: SupportTerm[]): Promise<MonthlyResourcePlanTaskOutput> => ({ coreTerms: [], expandedTerms: candidates, grammarTopics: [], pronunciationTargets: [] });
  const refill = (initial: { coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }, avoidWords: readonly string[]) => runMonthlyCorePhase({
    cefr: "A1",
    theme: { title: "Client meetings", communicationGoal: "Agree next steps" },
    neededCount: 4,
    maxRepeatedPlacements: 100,
    maxPhrasePlacements: 100,
    supportTargetPerCore: 3,
    generate,
    audit,
    candidatesPerCall: 3,
    maxParallelCalls: 2,
    concurrency: 2,
    maxRounds: 2,
    overProvision: 1.5,
    minRequest: 2,
    initial,
    avoidWords
  });
  return { refill, prompts };
}

/** Four accepted cores with their supports, as the core phase hands them to enrichment. */
function acceptedMonth() {
  const words = ["quax", "qubx", "qucx", "qudx"];
  const coreTerms = words.map((word, index) => ({ ...candidate(word, `a1-core-${index + 1}`).core }));
  const expandedTerms = coreTerms.flatMap((core) => candidate(core.word, core.id).edges);
  return { coreTerms, expandedTerms };
}

/**
 * Fake enrichment shaped like the route's enrichCore: it takes the core's
 * supports out of the shared pool and puts them back on success; a failing core
 * leaves none behind.
 */
function fakeEnrich(state: { coreTerms: CoreTerm[]; expandedTerms: SupportTerm[] }, fails: (word: string) => boolean) {
  const calls: string[] = [];
  const enrichCore = async (coreIndex: number): Promise<MonthlyCoreEnrichmentOutcome> => {
    const core = state.coreTerms[coreIndex]!;
    calls.push(core.word);
    const own = state.expandedTerms.filter((term) => term.relatesToCoreId === core.id);
    for (let index = state.expandedTerms.length - 1; index >= 0; index -= 1) if (state.expandedTerms[index]!.relatesToCoreId === core.id) state.expandedTerms.splice(index, 1);
    await Promise.resolve();
    if (fails(core.word)) return { ok: false, issue: `Expanded vocabulary generation failed for core ${core.id} (${core.word}): every word_family candidate failed the deterministic check` };
    state.expandedTerms.push(...own, support(`extra${core.word}`, "antonym", core.id));
    return { ok: true };
  };
  return { enrichCore, calls };
}

describe("runMonthlyEnrichmentWithRefill", () => {
  it("drops a core whose required relation cannot be found and refills its slot in the same request", async () => {
    const state = acceptedMonth();
    const { refill, prompts } = fakeCorePhase();
    const { enrichCore, calls } = fakeEnrich(state, (word) => word === "qubx");
    const saves: Array<{ coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }> = [];
    const stats = await runMonthlyEnrichmentWithRefill({
      cefr: "A1", neededCount: 4, coreTerms: state.coreTerms, expandedTerms: state.expandedTerms, firstPendingIndex: 0,
      enrichCore, refill, save: async (saved) => { saves.push(saved); }, concurrency: 3
    });

    expect(state.coreTerms).toHaveLength(4);
    // Existing cores keep their order; the refilled core takes the end slot.
    expect(state.coreTerms.map((core) => core.word).slice(0, 3)).toEqual(["quax", "qucx", "qudx"]);
    expect(state.coreTerms[3]!.word).toMatch(/^qun/u);
    expect(state.coreTerms.map((core) => core.id)).toEqual(["a1-core-1", "a1-core-2", "a1-core-3", "a1-core-4"]);
    // Supports are re-linked: the kept cores keep their enriched supports, the dropped core has none.
    expect(state.expandedTerms.every((term) => state.coreTerms.some((core) => core.id === term.relatesToCoreId))).toBe(true);
    expect(state.expandedTerms.some((term) => term.word.includes("qubx"))).toBe(false);
    expect(state.expandedTerms.filter((term) => term.relatesToCoreId === "a1-core-2").map((term) => term.word)).toEqual(["umbqucx", "synqucx", "qucxness", "extraqucx"]);
    expect(state.expandedTerms.filter((term) => term.relatesToCoreId === "a1-core-4").length).toBeGreaterThanOrEqual(3);
    // Only the new core is enriched in the second cycle.
    expect(calls.slice(4)).toEqual([state.coreTerms[3]!.word]);
    // The dropped word is forbidden to the refill run.
    expect(prompts[0]).toContain("qubx");
    expect(stats).toEqual({ refillCycles: 1, refilledCores: 1, droppedCores: [{ word: "qubx", issue: expect.stringContaining("word_family") }] });
    // The refilled core list was checkpointed.
    expect(saves.at(-1)!.coreTerms.map((core) => core.word)).toEqual(state.coreTerms.map((core) => core.word));
  });

  it("does nothing extra when every core enriches", async () => {
    const state = acceptedMonth();
    const { refill, prompts } = fakeCorePhase();
    const { enrichCore, calls } = fakeEnrich(state, () => false);
    const stats = await runMonthlyEnrichmentWithRefill({ cefr: "A1", neededCount: 4, coreTerms: state.coreTerms, expandedTerms: state.expandedTerms, firstPendingIndex: 2, enrichCore, refill, save: async () => {} });
    expect(calls).toEqual(["qucx", "qudx"]);
    expect(prompts).toEqual([]);
    expect(stats).toEqual({ refillCycles: 0, refilledCores: 0, droppedCores: [] });
  });

  it("saves the accepted cores and returns the shortfall error when refilled cores keep failing after the bounded cycles", async () => {
    const state = acceptedMonth();
    const { refill } = fakeCorePhase();
    // The original "qubx" and every refilled core fail enrichment.
    const { enrichCore } = fakeEnrich(state, (word) => word === "qubx" || word.startsWith("qun"));
    const saves: Array<{ coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }> = [];
    const error = await runMonthlyEnrichmentWithRefill({
      cefr: "A1", neededCount: 4, coreTerms: state.coreTerms, expandedTerms: state.expandedTerms, firstPendingIndex: 0,
      enrichCore, refill, save: async (saved) => { saves.push(saved); }, maxRefillCycles: 2
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MonthlyCorePhaseShortfallError);
    const shortfall = error as MonthlyCorePhaseShortfallError;
    expect(shortfall.errors.join(" ")).toContain("saved 3 of 4 cores after 2 enrichment refill cycles; run generation again to continue");
    expect(shortfall.errors.join(" ")).toContain("qubx:");
    expect(shortfall.partial.coreTerms.map((core) => core.word)).toEqual(["quax", "qucx", "qudx"]);
    expect(shortfall.partial.coreTerms.map((core) => core.id)).toEqual(["a1-core-1", "a1-core-2", "a1-core-3"]);
    expect(shortfall.partial.supportTerms.every((term) => shortfall.partial.coreTerms.some((core) => core.id === term.relatesToCoreId))).toBe(true);
    expect(shortfall.partial.supportTerms.some((term) => term.word.startsWith("umbqun") || term.word.includes("qubx"))).toBe(false);
    // The checkpoint holds exactly the shortfall data.
    expect(saves.at(-1)).toEqual(shortfall.partial);
    expect(state.coreTerms.map((core) => core.word)).toEqual(["quax", "qucx", "qudx"]);
  });

  it("checkpoints the core-phase partial when the refill itself ends short", async () => {
    const state = acceptedMonth();
    const { refill } = fakeCorePhase({ produce: () => false });
    const { enrichCore } = fakeEnrich(state, (word) => word === "qucx");
    const saves: Array<{ coreTerms: CoreTerm[]; supportTerms: SupportTerm[] }> = [];
    const error = await runMonthlyEnrichmentWithRefill({
      cefr: "A1", neededCount: 4, coreTerms: state.coreTerms, expandedTerms: state.expandedTerms, firstPendingIndex: 0,
      enrichCore, refill, save: async (saved) => { saves.push(saved); }
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MonthlyCorePhaseShortfallError);
    const shortfall = error as MonthlyCorePhaseShortfallError;
    expect(shortfall.errors.join(" ")).toContain("saved 3 of 4 cores");
    expect(shortfall.errors.join(" ")).toContain("Cores dropped during enrichment: qucx:");
    expect(shortfall.partial.coreTerms.map((core) => core.word)).toEqual(["quax", "qubx", "qudx"]);
    expect(saves.at(-1)).toEqual(shortfall.partial);
  });
});

describe("runMonthlyCorePhase avoidWords", () => {
  it("never re-accepts a dropped core word", async () => {
    const generate = async (_prompt: string, coreTermBatch: CoreTerm[]): Promise<MonthlyResourcePlanTaskOutput> => {
      if (coreTermBatch.length) return { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [] };
      const entries = [candidate("qubx", "c1"), candidate("qumx", "c2")];
      return { coreTerms: entries.map((entry) => entry.core), expandedTerms: entries.flatMap((entry) => entry.edges), grammarTopics: [], pronunciationTargets: [] };
    };
    const result = await runMonthlyCorePhase({
      cefr: "A1", theme: { title: "T", communicationGoal: "G" }, neededCount: 1, maxRepeatedPlacements: 100, maxPhrasePlacements: 100, supportTargetPerCore: 3,
      generate, audit: async (_core, candidates) => ({ coreTerms: [], expandedTerms: candidates, grammarTopics: [], pronunciationTargets: [] }),
      maxParallelCalls: 1, maxRounds: 1, avoidWords: ["qubx"]
    });
    expect(result.coreTerms.map((core) => core.word)).toEqual(["qumx"]);
  });
});

describe("screenCachedMonthlyCoreSupports", () => {
  const select = (core: { id: string; word: string; type: string }, candidates: SupportTerm[]) => selectMonthlySupportCandidates({
    candidates, coreId: core.id, coreWord: core.word, coreType: core.type, coreWords: new Set([core.word]), sameCoreWords: new Set(), sameCoreRelations: new Set(),
    existingSupportWords: [], maxRepeatedPlacements: 100, maxPhrasePlacements: 100, cefr: "A1", needed: 9
  }).selected;

  it("keeps every support the core phase selects under the same rules", () => {
    const cases: Array<{ core: { id: string; word: string; type: string }; candidates: SupportTerm[] }> = [
      { core: { id: "c1", word: "meet", type: "verb" }, candidates: [support("gather", "synonym", "c1", "verb"), support("meeting", "word_family", "c1"), support("sending", "word_family", "c1"), support("hold a meeting", "collocation", "c1"), support("assemble", "umbrella", "c1", "verb"), support("meets", "synonym", "c1", "verb")] },
      { core: { id: "c2", word: "plan", type: "noun" }, candidates: [support("proposal", "umbrella", "c2"), support("scheme", "synonym", "c2"), support("planning", "word_family", "c2"), support("make a plan", "collocation", "c2"), support("thing", "umbrella", "c2"), support("plans", "synonym", "c2")] },
      { core: { id: "c3", word: "small", type: "adjective" }, candidates: [support("little", "synonym", "c3", "adjective"), support("smallness", "word_family", "c3"), support("smaller", "word_family", "c3", "adjective"), support("size", "umbrella", "c3"), support("large", "antonym", "c3", "adjective")] },
      { core: { id: "c4", word: "look", type: "verb" }, candidates: [support("watch", "synonym", "c4", "verb"), support("looker", "word_family", "c4"), support("lookout", "word_family", "c4"), support("perceive", "umbrella", "c4", "verb"), support("look at", "collocation", "c4")] }
    ];
    for (const { core, candidates } of cases) {
      const selected = select(core, candidates);
      expect(selected.length, core.word).toBeGreaterThan(0);
      expect(screenCachedMonthlyCoreSupports(core, selected, new Set([core.word])), core.word).toEqual(selected);
    }
  });

  it("drops only the offending supports instead of every support of the core", () => {
    const core = { id: "c1", word: "review", type: "noun" };
    const supports = [support("evaluation", "umbrella", "c1"), support("check", "synonym", "c1"), support("give feedback", "collocation", "c1"), support("reviewer", "word_family", "c1"), support("check", "synonym", "c1"), support("deadline", "synonym", "c1")];
    const kept = screenCachedMonthlyCoreSupports(core, supports, new Set(["review", "deadline"]));
    expect(kept.map((term) => term.word)).toEqual(["evaluation", "check", "reviewer"]);
  });
});
