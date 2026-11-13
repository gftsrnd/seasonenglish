import { describe, expect, it } from "vitest";
import type { StoredAssessmentDefinition } from "@e4s/database";
import { buildManualMonthlyFinalDraft } from "../src/modules/assessment/monthly-final-builder.js";
import { monthlyFinalDraftView, monthlyFinalRegenerationBlock } from "../src/modules/assessment/monthly-final-routes.js";
import { monthlyFinalScopeHash, monthlyFinalScopeStale } from "../src/modules/assessment/monthly-final-scope.js";
import { frameworkRef, monthlyFinalContract } from "./support/monthly-final-fixture.js";

/** 4175: an exam generated at framework v16, the plan reopened and re-approved as v18 with the same tested scope. */
function scenario() {
  const contract = monthlyFinalContract("A1");
  const blueprint = buildManualMonthlyFinalDraft(contract, frameworkRef);
  const bumped = { ...structuredClone(contract), version: contract.version + 2 };
  return { contract, blueprint, bumped };
}
const current = (contract: ReturnType<typeof monthlyFinalContract>, scopeHash = "monthly-new-version-hash") => ({ frameworkId: frameworkRef.id, scopeHash, contract });
const withExamScope = (blueprint: StoredAssessmentDefinition, contract: ReturnType<typeof monthlyFinalContract>): StoredAssessmentDefinition =>
  ({ ...blueprint, monthlyExam: { ...blueprint.monthlyExam!, framework: { ...blueprint.monthlyExam!.framework, examScopeHash: monthlyFinalScopeHash(contract) } } });

describe("monthly final staleness follows the tested scope, not the plan version", () => {
  it("is not stale after a version bump that keeps the scope (legacy exam without examScopeHash)", () => {
    const { blueprint, bumped } = scenario();
    expect(blueprint.monthlyExam!.framework.examScopeHash).toBeUndefined();
    expect(monthlyFinalScopeStale(blueprint.monthlyExam!, current(bumped))).toBe(false);
  });

  it("is not stale after a version bump when the exam carries its scope hash", () => {
    const { contract, blueprint, bumped } = scenario();
    expect(monthlyFinalScopeHash(bumped)).toBe(monthlyFinalScopeHash(contract));
    expect(monthlyFinalScopeStale(withExamScope(blueprint, contract).monthlyExam!, current(bumped))).toBe(false);
  });

  it("is stale when a tested word, grammar step, sound or the theme changed", () => {
    const { contract, blueprint } = scenario();
    const changes: Array<(next: ReturnType<typeof monthlyFinalContract>) => void> = [
      (next) => { next.coreTerms[0]!.word = "changed"; },
      (next) => { next.grammarTopics[0]!.steps[0]!.formula = "S + changed"; },
      (next) => { next.sounds[0]!.ipa = "/zz/"; },
      (next) => { next.theme.title = "Another theme"; }
    ];
    for (const change of changes) {
      const next = structuredClone(contract);
      change(next);
      expect(monthlyFinalScopeStale(withExamScope(blueprint, contract).monthlyExam!, current(next))).toBe(true);
    }
    // Legacy exams compare what they recorded: words, grammar steps and sounds.
    const changedWord = structuredClone(contract);
    changedWord.coreTerms[0]!.meaning = "nghĩa khác";
    expect(monthlyFinalScopeStale(blueprint.monthlyExam!, current(changedWord))).toBe(true);
  });

  it("is stale for another framework row and never for the same framework scopeHash", () => {
    const { contract, blueprint } = scenario();
    expect(monthlyFinalScopeStale(blueprint.monthlyExam!, { ...current(contract), frameworkId: "22222222-2222-4222-8222-222222222222" })).toBe(true);
    const changed = structuredClone(contract);
    changed.coreTerms[0]!.word = "changed";
    expect(monthlyFinalScopeStale(blueprint.monthlyExam!, current(changed, frameworkRef.scopeHash))).toBe(false);
  });
});

describe("regenerating a published monthly final", () => {
  const context = (contract: ReturnType<typeof monthlyFinalContract>) => ({ framework: { ...frameworkRef, version: 5, scopeHash: "monthly-v5" }, contract });

  it("is allowed only when the published exam is truly stale and nobody has started it", () => {
    const { contract, blueprint } = scenario();
    const changed = structuredClone(contract);
    changed.coreTerms[0]!.word = "changed";
    expect(monthlyFinalRegenerationBlock(null, context(contract))).toBeNull();
    expect(monthlyFinalRegenerationBlock({ blueprint, startedLearners: 0 }, context(changed))).toBeNull();
    expect(monthlyFinalRegenerationBlock({ blueprint, startedLearners: 2 }, context(changed))).toEqual({ code: "MONTHLY_FINAL_ALREADY_STARTED", startedLearners: 2 });
    expect(monthlyFinalRegenerationBlock({ blueprint, startedLearners: 0 }, context(contract))).toEqual({ code: "MONTHLY_FINAL_ALREADY_PUBLISHED" });
  });

  it("marks the view regenerable, or reports how many learners started it", () => {
    const { contract, blueprint } = scenario();
    const changed = structuredClone(contract);
    changed.coreTerms[0]!.word = "changed";
    const row = { definition_id: "definition-1", version_id: "version-6", version: 6, status: "published" as const };
    const viewContext = { examDate: "2026-11-30", today: "2026-11-13", ...context(changed) };
    const fresh = monthlyFinalDraftView(row, blueprint, viewContext, { versionId: "version-6", version: 6, startedLearners: 0 });
    expect(fresh).toMatchObject({ stale: true, regenerable: true, startedLearners: 0, editable: false, livePublishedVersion: null });
    const started = monthlyFinalDraftView(row, blueprint, viewContext, { versionId: "version-6", version: 6, startedLearners: 3 });
    expect(started).toMatchObject({ stale: true, regenerable: false, startedLearners: 3 });
    const unchanged = monthlyFinalDraftView(row, blueprint, { examDate: "2026-11-30", today: "2026-11-13", ...context(contract) }, { versionId: "version-6", version: 6, startedLearners: 0 });
    expect(unchanged).toMatchObject({ stale: false, regenerable: false });
    const replacement = monthlyFinalDraftView({ ...row, version_id: "version-7", version: 7, status: "draft" }, blueprint, viewContext, { versionId: "version-6", version: 6, startedLearners: 0 });
    expect(replacement).toMatchObject({ status: "draft", livePublishedVersion: 6, regenerable: false });
  });
});
