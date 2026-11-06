import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import { MONTHLY_CORE_SUB_AREAS, MonthlyCorePhaseShortfallError, runMonthlyCorePhase, type MonthlyPhaseTargets } from "./monthly-core-phase.js";
import {
  buildMonthlyCoreCandidatesPrompt,
  buildMonthlySupportRelationAuditPrompt,
  collocationContainsCoreWord,
  findMonthlyCoreSynonymConflict,
  isMonthlyInflectionalVariant,
  MonthlyResourcePlanError,
  prefilterMonthlySupportCandidatesForAudit,
  selectMonthlySupportCandidates
} from "./monthly-resource-generation.js";

type CoreTerm = MonthlyResourcePlanTaskOutput["coreTerms"][number];
type SupportTerm = MonthlyResourcePlanTaskOutput["expandedTerms"][number];

const support = (word: string, relation: SupportTerm["relation"], coreId = "core-a", type = "noun"): SupportTerm => ({ id: `${coreId}-${relation}-${word}`, word, meaning: "nghĩa", type, relation, relatesToCoreId: coreId });

const select = (coreWord: string, candidates: SupportTerm[], coreType = "noun", needed = 9) => selectMonthlySupportCandidates({
  candidates,
  coreId: "core-a",
  coreWord,
  coreType,
  coreWords: new Set([coreWord]),
  sameCoreWords: new Set(),
  sameCoreRelations: new Set(),
  existingSupportWords: [],
  maxRepeatedPlacements: 50,
  maxPhrasePlacements: 50,
  needed
});

describe("quality rule A: collocations contain the core word", () => {
  it("accepts the core word, its inflections, and word-family forms as whole words", () => {
    expect(collocationContainsCoreWord("decide", "make a decision")).toBe(true);
    expect(collocationContainsCoreWord("meet", "attend a meeting")).toBe(true);
    expect(collocationContainsCoreWord("report", "send the reports")).toBe(true);
    expect(collocationContainsCoreWord("help", "ask for help")).toBe(true);
  });

  it("rejects topic-only words and single words", () => {
    expect(collocationContainsCoreWord("review", "feedback")).toBe(false);
    expect(collocationContainsCoreWord("review", "give feedback")).toBe(false);
    expect(collocationContainsCoreWord("meet", "agenda")).toBe(false);
    expect(collocationContainsCoreWord("meet", "set the agenda")).toBe(false);
    expect(collocationContainsCoreWord("decide", "decision")).toBe(false);
  });

  it("is enforced when supports are selected, including enrichment", () => {
    const result = select("review", [
      support("assessment", "umbrella"),
      support("check", "synonym"),
      support("reviewer", "word_family"),
      support("give feedback", "collocation"),
      support("review the draft", "collocation")
    ]);
    expect(result.selected.map((term) => term.word)).toEqual(["assessment", "check", "reviewer", "review the draft"]);
    expect(result.rejected.join(" ")).toContain("give feedback -> give feedback (a collocation must be a phrase containing the core word");
  });

  it("tells the audit prompt that a collocation must co-occur with the core word", () => {
    const prompt = buildMonthlySupportRelationAuditPrompt({ core: { word: "decide", meaning: "quyết định", type: "verb" }, candidates: [] });
    expect(prompt).toContain("naturally co-occurs WITH the core word itself");
    expect(prompt).toContain("decide → make a decision");
  });
});

describe("quality rule C: no inflection-only supports", () => {
  it("detects plural, -s, -ed and -ing variants", () => {
    expect(isMonthlyInflectionalVariant("customers", "customer")).toBe(true);
    expect(isMonthlyInflectionalVariant("replies", "reply")).toBe(true);
    expect(isMonthlyInflectionalVariant("processes", "process")).toBe(true);
    expect(isMonthlyInflectionalVariant("planned", "plan")).toBe(true);
    expect(isMonthlyInflectionalVariant("scheduling", "schedule")).toBe(true);
    expect(isMonthlyInflectionalVariant("client meetings", "client meeting")).toBe(true);
    expect(isMonthlyInflectionalVariant("customer", "customer")).toBe(false);
    expect(isMonthlyInflectionalVariant("manager", "manage")).toBe(false);
    expect(isMonthlyInflectionalVariant("status", "stat")).toBe(false);
  });

  it("rejects a support that only inflects another support or the core", () => {
    const result = select("client", [
      support("person", "umbrella"),
      support("customer", "synonym"),
      support("customers", "synonym"),
      support("clientele", "word_family"),
      support("clients", "synonym")
    ]);
    expect(result.selected.map((term) => term.word)).toEqual(["person", "customer", "clientele"]);
    expect(result.rejected.some((entry) => entry.startsWith("customers -> customers (is only an inflected form"))).toBe(true);
    expect(result.rejected.some((entry) => entry.startsWith("clients -> clients (is only an inflected form"))).toBe(true);
  });

  it("keeps a lexicalised -ing noun as a word-family item of the core", () => {
    const result = select("plan", [support("planning", "word_family"), support("planned", "word_family", "core-a", "adjective")], "verb");
    expect(result.selected.map((term) => term.word)).toEqual(["planning"]);
  });
});

describe("quality rule B: no synonym pairs among cores", () => {
  it("finds a conflict in either direction", () => {
    const acceptedCores = [{ word: "start", synonyms: ["begin", "launch"] }];
    expect(findMonthlyCoreSynonymConflict({ candidateWord: "begin", candidateSynonyms: [], acceptedCores })).toBe("start");
    expect(findMonthlyCoreSynonymConflict({ candidateWord: "complete", candidateSynonyms: ["finish"], acceptedCores: [{ word: "finish", synonyms: [] }] })).toBe("finish");
    expect(findMonthlyCoreSynonymConflict({ candidateWord: "report", candidateSynonyms: ["account"], acceptedCores })).toBeUndefined();
  });
});

describe("word-family pre-filter before AI audit", () => {
  it("drops non-family word_family items and topic-only collocations without an AI call", () => {
    const { kept, rejected } = prefilterMonthlySupportCandidatesForAudit({ word: "manage" }, [
      support("manager", "word_family"),
      support("boss", "word_family"),
      support("supervise", "synonym"),
      support("deadline", "collocation"),
      support("manage a team", "collocation")
    ]);
    expect(kept.map((term) => term.word)).toEqual(["manager", "supervise", "manage a team"]);
    expect(rejected).toHaveLength(2);
  });
});

describe("month-wide core candidate prompt", () => {
  it("asks for 2-3 options per required relation and a sub-area", () => {
    const prompt = buildMonthlyCoreCandidatesPrompt({ cefr: "A1", theme: "Client meetings", communicationGoal: "Agree next steps", existingCoreWords: ["client"], batchNumber: 1, candidateCount: 12, neededCount: 12, preflightRelations: true, relationOptionsPerRequired: 3, subArea: MONTHLY_CORE_SUB_AREAS[1] });
    expect(prompt).toContain("two to three distinct authentic options for EACH required relation");
    expect(prompt).toContain(`draw every candidate from this sub-area only: ${MONTHLY_CORE_SUB_AREAS[1]}`);
    expect(prompt).toContain("client");
  });

  it("asks for each core's own level, keeps it at or below the month and on theme", () => {
    const prompt = buildMonthlyCoreCandidatesPrompt({ cefr: "A1", theme: "Office communication", communicationGoal: "Send simple messages", existingCoreWords: [], batchNumber: 1, candidateCount: 8, neededCount: 8, preflightRelations: true, relationOptionsPerRequired: 3 });
    expect(prompt).toContain("Every core word itself must be at CEFR A1 or below, never above it; set each coreTerms item's cefr field");
    expect(prompt).toContain("never return a word that is off-theme or only loosely tied to it");
    expect(prompt).not.toContain("update → updater");
    expect(prompt).toContain("never a narrower kind of the core (computer -> laptop)");
  });
});

// ---------------------------------------------------------------------------
// Fake runner for the month-wide core phase.

const letters = (index: number) => {
  let value = index;
  let result = "";
  do { result = String.fromCharCode(97 + (value % 26)) + result; value = Math.floor(value / 26) - 1; } while (value >= 0);
  return result;
};

/** Synthetic headword with a family form that isGenuineWordFamily accepts (xxx → xxxness). */
const syntheticCore = (key: string) => `qu${key}x`;

function candidateWithEdges(word: string, id: string, options: { family?: string; synonym?: string; umbrella?: string } = {}) {
  const core: CoreTerm = { id, word, meaning: `nghĩa ${word}`, type: "noun", ipa: "/x/" };
  const edges: SupportTerm[] = [
    support(options.umbrella ?? `umb${word}`, "umbrella", id),
    support(options.synonym ?? `syn${word}`, "synonym", id),
    support(options.family ?? `${word}ness`, "word_family", id)
  ];
  return { core, edges };
}

function fakeRunner(script: (call: { round: number; callIndex: number; count: number; prompt: string }) => Array<{ core: CoreTerm; edges: SupportTerm[] }>, gapFill: (core: CoreTerm, prompt: string) => SupportTerm[] = () => []) {
  const generationCalls: Array<{ count: number; prompt: string }> = [];
  const gapFillCalls: string[] = [];
  const auditedWords: string[] = [];
  let lastRoundMarker = -1;
  let round = -1;
  let callIndex = 0;
  const generate = async (prompt: string, coreTermBatch: CoreTerm[], targets: MonthlyPhaseTargets): Promise<MonthlyResourcePlanTaskOutput> => {
    if (coreTermBatch.length) {
      gapFillCalls.push(coreTermBatch[0]!.word);
      return { coreTerms: [], expandedTerms: gapFill(coreTermBatch[0]!, prompt), grammarTopics: [], pronunciationTargets: [] };
    }
    const marker = Number(/RETRY FOR CORE BATCH (\d+)/u.exec(prompt)?.[1] ?? 1);
    if (marker !== lastRoundMarker) { lastRoundMarker = marker; round += 1; callIndex = 0; }
    generationCalls.push({ count: targets.vocabularyCount, prompt });
    const entries = script({ round, callIndex, count: targets.vocabularyCount, prompt });
    callIndex += 1;
    return { coreTerms: entries.map((entry) => entry.core), expandedTerms: entries.flatMap((entry) => entry.edges), grammarTopics: [], pronunciationTargets: [] };
  };
  const audit = async (_core: CoreTerm, candidates: SupportTerm[]): Promise<MonthlyResourcePlanTaskOutput> => {
    auditedWords.push(...candidates.map((term) => term.word));
    return { coreTerms: [], expandedTerms: candidates, grammarTopics: [], pronunciationTargets: [] };
  };
  return { generate, audit, generationCalls, gapFillCalls, auditedWords };
}

const phaseInput = (runner: ReturnType<typeof fakeRunner>, neededCount: number, overrides: Partial<Parameters<typeof runMonthlyCorePhase>[0]> = {}) => ({
  cefr: "A1" as const,
  theme: { title: "Client meetings", communicationGoal: "Agree next steps" },
  neededCount,
  maxRepeatedPlacements: 100,
  maxPhrasePlacements: 100,
  supportTargetPerCore: 3,
  generate: runner.generate,
  audit: runner.audit,
  candidatesPerCall: 3,
  maxParallelCalls: 4,
  concurrency: 3,
  // Pin the round sizing these fixtures were written for (production defaults are larger).
  maxRounds: 3,
  overProvision: 1.5,
  minRequest: 4,
  ...overrides
});

describe("runMonthlyCorePhase (month-wide)", () => {
  it("generates in parallel, interleaves calls deterministically and assigns ordered core IDs", async () => {
    const runner = fakeRunner(({ callIndex, count }) => Array.from({ length: count }, (_value, position) => {
      const key = `${letters(callIndex)}${letters(position)}`;
      // Call 0 / position 0 has a bogus word_family that the pre-filter drops
      // and the gap-fill cannot repair.
      return candidateWithEdges(syntheticCore(key), `ai-${position}`, callIndex === 0 && position === 0 ? { family: "unrelated" } : {});
    }));
    const result = await runMonthlyCorePhase(phaseInput(runner, 6));

    // ceil(6 × 1.5) = 9 candidates over three parallel calls of three.
    expect(runner.generationCalls.map((call) => call.count)).toEqual([3, 3, 3]);
    expect(new Set(runner.generationCalls.map((call) => /sub-area only: ([^.]+)/u.exec(call.prompt)?.[1])).size).toBe(3);
    // Round-robin order c0p0(failed), c1p0, c2p0, c0p1, c1p1, c2p1, c0p2 …
    expect(result.coreTerms.map((term) => term.word)).toEqual(["qubax", "qucax", "quabx", "qubbx", "qucbx", "quacx"]);
    expect(result.coreTerms.map((term) => term.id)).toEqual(["a1-core-1", "a1-core-2", "a1-core-3", "a1-core-4", "a1-core-5", "a1-core-6"]);
    expect(result.supportTerms.every((term) => result.coreTerms.some((core) => core.id === term.relatesToCoreId))).toBe(true);
    expect(new Set(result.supportTerms.map((term) => term.id)).size).toBe(result.supportTerms.length);
    // The bogus family item never reached the AI audit; only its gap-fill ran.
    expect(runner.auditedWords).not.toContain("unrelated");
    expect(runner.gapFillCalls).toEqual(["quaax"]);
    expect(result.stats).toMatchObject({ rounds: 1, generationCalls: 3, gapFillCalls: 1 });
  });

  it("requests only the missing count in a follow-up round and keeps earlier cores in order", async () => {
    const runner = fakeRunner(({ round, callIndex, count }) => Array.from({ length: count }, (_value, position) => {
      const key = `${letters(round)}${letters(callIndex)}${letters(position)}`;
      // Round 0: only the first position of each call is usable (3 of 9).
      const broken = round === 0 && position > 0;
      return candidateWithEdges(syntheticCore(key), `ai-${position}`, broken ? { family: "nofamily" } : {});
    }));
    const result = await runMonthlyCorePhase(phaseInput(runner, 5));

    const roundOne = runner.generationCalls.filter((call) => !call.prompt.includes("RETRY FOR CORE BATCH"));
    const roundTwo = runner.generationCalls.filter((call) => call.prompt.includes("RETRY FOR CORE BATCH 2"));
    expect(roundOne.map((call) => call.count)).toEqual([3, 3, 2]); // ceil(5 × 1.5) = 8
    // Two cores are missing: max(4, ceil(2 × 1.5)) candidates, not the whole month again.
    expect(roundTwo.reduce((sum, call) => sum + call.count, 0)).toBe(4);
    expect(roundTwo[0]!.prompt).toContain("2 core slots unfilled");
    expect(roundTwo[0]!.prompt).toContain("quaabx"); // tried words are forbidden
    expect(result.coreTerms.map((term) => term.word)).toEqual(["quaaax", "quabax", "quacax", "qubaax", "qubbax"]);
    expect(result.coreTerms.map((term) => term.id)).toEqual(["a1-core-1", "a1-core-2", "a1-core-3", "a1-core-4", "a1-core-5"]);
    expect(result.stats.rounds).toBe(2);
  });

  it("rejects a core labelled above the month level, strips the label, and keeps later rounds on theme", async () => {
    const runner = fakeRunner(({ round, callIndex, count }) => Array.from({ length: count }, (_value, position) => {
      const entry = candidateWithEdges(syntheticCore(`${letters(round)}${letters(callIndex)}${letters(position)}`), `ai-${position}`);
      // Round 0: every candidate is labelled B2 (above A1) except one labelled A1.
      if (round === 0) entry.core.cefr = callIndex === 0 && position === 0 ? "A1" : "B2";
      return entry;
    }));
    const result = await runMonthlyCorePhase(phaseInput(runner, 3, { maxRounds: 4 }));
    expect(result.coreTerms[0]!.word).toBe("quaaax");
    expect(result.coreTerms.every((term) => !("cefr" in term))).toBe(true);
    expect(result.coreTerms.map((term) => term.word)).not.toContain("quaabx");
    const later = runner.generationCalls.filter((call) => call.prompt.includes("RETRY FOR CORE BATCH"));
    expect(later.length).toBeGreaterThan(0);
    for (const call of later) {
      expect(call.prompt).toMatch(/must start with one of these letters: [a-z, ]+, and must still belong to this sub-area of the approved theme/u);
      expect(call.prompt).not.toContain("even if only loosely tied to the theme");
    }
  });

  it("does not accept two cores that are synonyms of each other (rule B)", async () => {
    const runner = fakeRunner(({ round, count }) => round > 0 ? [] : [
      candidateWithEdges("start", "s", { umbrella: "action", synonym: "commence", family: "starter" }),
      // begin is not a support of start, and would pass on its own via "initiate",
      // but its audited synonym "start" is already an accepted core.
      (() => { const entry = candidateWithEdges("begin", "b", { umbrella: "process", synonym: "start", family: "beginner" }); entry.edges.push(support("initiate", "synonym", "b")); return entry; })(),
      ...Array.from({ length: count - 2 }, (_value, index) => candidateWithEdges(syntheticCore(letters(index)), `x${index}`))
    ]);
    const result = await runMonthlyCorePhase(phaseInput(runner, 3, { candidatesPerCall: 8, maxParallelCalls: 1 }));
    const words = result.coreTerms.map((term) => term.word);
    expect(words).toContain("start");
    expect(words).not.toContain("begin");
  });

  it("fails with a clear plan error after the bounded rounds", async () => {
    let counter = 0;
    const runner = fakeRunner(({ count }) => Array.from({ length: count }, (_value, position) => candidateWithEdges(syntheticCore(letters(counter++)), `ai-${position}`, { family: "nofamily" })));
    const error = await runMonthlyCorePhase(phaseInput(runner, 2, { maxRounds: 2 })).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MonthlyResourcePlanError);
    const message = (error as MonthlyResourcePlanError).errors.join(" ");
    expect(message).toContain("saved 0 of 2 cores after 2 rounds");
    expect(message).toContain("word_family=∅");
  });

  it("returns accepted cores on a shortfall and continues from them on the next run", async () => {
    let counter = 0;
    let produced = 0;
    // The first two candidates are valid; every later one lacks a word family.
    const runner = fakeRunner(({ count }) => Array.from({ length: count }, (_value, position) => {
      produced += 1;
      return candidateWithEdges(syntheticCore(letters(counter++)), `ai-${position}`, produced <= 2 ? {} : { family: "nofamily" });
    }));
    const first = await runMonthlyCorePhase(phaseInput(runner, 3, { maxRounds: 1 })).catch((caught: unknown) => caught);
    expect(first).toBeInstanceOf(MonthlyCorePhaseShortfallError);
    const partial = (first as MonthlyCorePhaseShortfallError).partial;
    expect(partial.coreTerms).toHaveLength(2);
    expect(partial.supportTerms.every((term) => partial.coreTerms.some((core) => core.id === term.relatesToCoreId))).toBe(true);

    const resumedRunner = fakeRunner(({ count }) => Array.from({ length: count }, (_value, position) => candidateWithEdges(syntheticCore(letters(counter++)), `ai-${position}`)));
    const second = await runMonthlyCorePhase(phaseInput(resumedRunner, 3, { initial: partial }));
    expect(second.coreTerms).toHaveLength(3);
    expect(second.coreTerms.slice(0, 2).map((term) => term.word)).toEqual(partial.coreTerms.map((term) => term.word));
  });
});
