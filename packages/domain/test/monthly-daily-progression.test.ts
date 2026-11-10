import { describe, expect, it } from "vitest";
import { planMonthlyResourcePool, validateMonthlyCurriculum, monthlyScopeHash, type MonthlyResourcePoolContract } from "../src/index.js";
import type { CefrLevel } from "@e4s/contracts";
import { carryoverReviewContract } from "../src/monthly/carryover-review.js";
import { validateMonthlyGrammarObjectives, dailyTeachingPlan, formatMonthlyDayLabel } from "../src/monthly/daily-progression.js";
import { buildMonthlyTeachingCalendar } from "../src/monthly/calendar.js";

export function progressionPool(cefr: CefrLevel = "A1", month = "2026-11"): MonthlyResourcePoolContract {
  const count = buildMonthlyTeachingCalendar(month).filter(day => day.kind === "new").length * 3;
  return {
    month, cefr, version: 1, theme: { version: 1, title: "Updates", brief: "Explain progress", context: "Office", communicationGoal: "Agree next steps" },
    coreTerms: Array.from({ length: count }, (_, i) => ({ id: `c${i}`, word: `term${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, meaning: "nghĩa", type: "noun", ipa: "/t/", source: "core_registry", component: "core" })),
    supportTerms: Array.from({ length: count * 3 }, (_, i) => ({ id: `s${i}`, word: `support${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, meaning: "nghĩa", type: "noun", relation: (["umbrella", "synonym", "word_family"] as const)[i % 3]!, source: (["group", "synonym", "family"] as const)[i % 3]!, component: "expanded", relatedCoreTermId: `c${Math.floor(i / 3)}` })),
    grammarTopics: [0, 1].map(t => ({ id: `g${t}`, title: `Topic ${t}`, steps: [0, 1, 2].map(s => ({ id: `g${t}s${s}`, focus: `Focus ${t}.${s}`, formula: "Subject + verb", usage: "Apply the pattern", examples: ["I work here.", "We work here.", "They work here."] })) })),
    sounds: [0, 1, 2, 3].map(s => ({ id: `p${s}`, label: `Target ${s}`, ipa: `/p${s}/`, examples: Array.from({ length: 9 }, (_, i) => ({ id: `p${s}e${i}`, word: `word${s}${i}`, ipa: `/p${s}/` })) }))
  };
}

describe("monthly daily progression", () => {
  it("resolves an initial Friday from the preceding calendar week, without taking the new month's words", () => {
    const current = planMonthlyResourcePool(progressionPool("A1","2027-01"));
    const previous = planMonthlyResourcePool(progressionPool("A1","2026-12"));
    previous.coreTerms.forEach(term => {term.word = "previous" + term.word;});
    const scope = carryoverReviewContract(current,previous,1);
    const expected = previous.daySpecs.filter(day => day.kind === "new" && day.date >= "2026-12-28");
    expect(scope.daySpecs[0]!.reviewTermIds).toEqual(expected.flatMap(day => day.coreTermIds));
    expect(scope.daySpecs[0]!.reviewTermIds).toHaveLength(9);
    expect(scope.coreTerms.every(term => term.word.startsWith("previous"))).toBe(true);
    expect(scope.daySpecs[0]!.date).toBe("2027-01-01");
    expect(scope.version).toBe(current.version);
    expect(() => carryoverReviewContract(current,{...previous,cefr:"B1"},1)).toThrow();
  });
  it("requires six distinct reviewed daily objectives before approval", () => {
    const pool = progressionPool();
    expect(validateMonthlyGrammarObjectives(pool.grammarTopics)).toHaveLength(2);
    for (const topic of pool.grammarTopics) for (const [i,step] of topic.steps.entries()) step.dailyObjectives = ["Identify the planned form " + i,"Apply the planned form " + i];
    expect(validateMonthlyGrammarObjectives(pool.grammarTopics)).toEqual([]);
    pool.grammarTopics[0]!.steps[1]!.dailyObjectives = pool.grammarTopics[0]!.steps[0]!.dailyObjectives;
    expect(validateMonthlyGrammarObjectives(pool.grammarTopics).join(" ")).toContain("repeats");
  });
  it("handles every month length and start weekday, retaining only the optional M slots that exist", () => {
    const counts = new Set<number>();
    for (let year=2026; year<=2032; year++) for (let month=1; month<=12; month++) {
      const key = String(year) + "-" + String(month).padStart(2,"0");
      const pool = progressionPool("A2",key);
      const contract = planMonthlyResourcePool(pool);
      const days = contract.daySpecs.filter(day => day.kind === "new");
      counts.add(days.length);
      expect(days.map(day => day.newLessonNumber)).toEqual(Array.from({length:days.length},(_,i) => i+1));
      expect(days.slice(0,12).flatMap(day => day.pronunciationPlan!.exampleIds)).toHaveLength(36);
      expect(days.at(-1)!.grammarPlan!.code).toBe(days.length === 15 ? "K3" : "M" + (days.length - 15));
      expect(validateMonthlyCurriculum(contract)).toEqual([]);
    }
    expect([...counts].sort()).toEqual([15,16,17,18]);
  });
  it.each(["A1", "A2", "B1", "B2", "C1"] as const)("allocates all three pronunciation sets and daily objectives in %s", level => {
    const plan = planMonthlyResourcePool(progressionPool(level));
    expect(plan.planSchemaVersion).toBe(2);
    const newDays = plan.daySpecs.filter(day => day.kind === "new");
    expect(newDays.slice(0, 3).map(day => day.pronunciationExampleIds)).toEqual([["p0e0", "p0e1", "p0e2"], ["p0e3", "p0e4", "p0e5"], ["p0e6", "p0e7", "p0e8"]]);
    expect(newDays.slice(0, 3).map(day => day.pronunciationPlan?.stage)).toEqual(["recognize", "discriminate", "sentence"]);
    expect(newDays.slice(0, 6).map(day => day.grammarPlan?.code)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    expect(new Set(newDays.slice(0, 6).map(day => day.grammarPlan?.objective)).size).toBe(6);
    expect(newDays[7]!.grammarPlan?.recallMilestoneIds).toEqual(["g0s0"]);
    expect(validateMonthlyCurriculum(plan)).toEqual([]);
  });

  it("combines four targets in K days and gives K2 exactly eight read-aloud positions", () => {
    const plan = planMonthlyResourcePool(progressionPool());
    const days = plan.daySpecs.filter(day => day.kind === "new");
    for (const day of days.slice(12, 15)) expect(day.pronunciationPlan?.targetIds).toEqual(["p0", "p1", "p2", "p3"]);
    expect(days[13]!.pronunciationPlan?.requiredPositions).toHaveLength(8);
    expect(days[13]!.pronunciationPlan?.stage).toBe("read_aloud");
    expect(days[15]!.pronunciationPlan?.stage).toBe("personalize");
    const review = plan.daySpecs.find(day => day.date === "2026-11-06")!;
    expect(review.reviewPronunciationExampleIds).toEqual(["p0e0", "p0e1", "p0e2", "p0e3", "p0e4", "p0e5", "p0e6", "p0e7", "p0e8", "p1e0", "p1e1", "p1e2"]);
  });

  it("rejects a stale or duplicated set and leaves the hash unchanged by holiday annotations", () => {
    const plan = planMonthlyResourcePool(progressionPool());
    const hash = monthlyScopeHash(plan);
    const calendar = buildMonthlyTeachingCalendar(plan.month, [{ date: "2026-11-09" }]);
    expect(calendar.find(day => day.date === "2026-11-09")?.newLessonNumber).toBe(5);
    expect(monthlyScopeHash(plan)).toBe(hash);
    plan.daySpecs[1]!.pronunciationExampleIds = [...plan.daySpecs[0]!.pronunciationExampleIds];
    expect(validateMonthlyCurriculum(plan).join(" ")).toContain("pronunciation");
  });

  it("formats teaching numbers independently of calendar row IDs", () => {
    expect(formatMonthlyDayLabel({ kind: "new", newLessonNumber: 5 })).toBe("Bài 5");
    expect(formatMonthlyDayLabel({ kind: "review", reviewWeekNumber: 1 })).toBe("Ôn tuần 1");
    const pool = progressionPool("C1");
    expect(dailyTeachingPlan(3, pool.grammarTopics, pool.sounds, "C1").pronunciationPlan.objective).toContain("workplace");
  });
});
