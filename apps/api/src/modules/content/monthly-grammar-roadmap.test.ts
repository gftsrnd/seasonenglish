import { describe, expect, it } from "vitest";
import { monthlyGrammarCatalog, type MonthlyDaySpec } from "@e4s/domain";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { buildMonthlyGrammarPhasePrompt, getMonthlyGrammarPhaseIssues, runMonthlyGrammarPhaseWithRetry } from "./monthly-resource-generation.js";
import { monthlyGrammarRoadmapDayContract, monthlyGrammarRoadmapDayIssues } from "./monthly-grammar-roadmap.js";

const pair = monthlyGrammarCatalog("A2")[1]!; // Hiện tại hoàn thành 1 + 2 (extension)
const b1Pair = monthlyGrammarCatalog("B1")[0]!; // Present simple vs continuous / past (contrast)

/** A grammar phase result whose steps mention every roadmap item of the pair. */
function coveringResult(target = pair, english = false): MonthlyResourcePlanTaskOutput {
  return {
    coreTerms: [], expandedTerms: [], pronunciationTargets: [],
    grammarTopics: [target.topicA, target.topicB].map((side, topicIndex) => ({
      id: `t${topicIndex}`,
      title: `AI title ${topicIndex}`,
      steps: [0, 1, 2].map((stepIndex) => ({
        id: `t${topicIndex}s${stepIndex}`,
        focus: `Focus ${topicIndex}.${stepIndex}`,
        formula: `S + pattern ${stepIndex}`,
        usage: english ? "Use it for work updates." : "Dùng để cập nhật công việc.",
        examples: side.contents.filter((_item, index) => index % 3 === stepIndex).concat([`We sent report ${stepIndex}.`, `They checked plan ${stepIndex}.`, `She booked room ${stepIndex}.`]).slice(0, 6),
        dailyObjectives: english
          ? [`Step ${stepIndex * 2 + 1}: notice idea ${topicIndex}.${stepIndex}`, `Step ${stepIndex * 2 + 2}: practise idea ${topicIndex}.${stepIndex}`]
          : [`Bước ${stepIndex * 2 + 1}: nhận ra ý ${topicIndex}.${stepIndex}`, `Bước ${stepIndex * 2 + 2}: luyện ý ${topicIndex}.${stepIndex}`]
      }))
    }))
  } as MonthlyResourcePlanTaskOutput;
}

describe("roadmap grammar resource phase", () => {
  it("locks the pair, its contents, pair type and situation in the phase prompt", () => {
    const prompt = buildMonthlyGrammarPhasePrompt([], "A2", pair);
    expect(prompt).toContain("ROADMAP PAIR LOCKED BY THE APPLICATION");
    expect(prompt).toContain('Topic A title exactly "Hiện tại hoàn thành 1"');
    expect(prompt).toContain('Topic B title exactly "Hiện tại hoàn thành 2"');
    expect(prompt).toContain("1) have/has + V3; 2) just/already/yet");
    expect(prompt).toContain("extension (B builds on A)");
    expect(prompt).toContain("work updates and work experience");
    expect(prompt).toContain("K1 asks learners to join A and B in one sentence");
    expect(prompt).toContain("Write usage and dailyObjectives in Vietnamese");
    const b1 = buildMonthlyGrammarPhasePrompt([], "B1", b1Pair);
    expect(b1).toContain('Topic A title exactly "Present simple vs present continuous"');
    expect(b1).toContain("K1 asks learners to choose A or B for each situation");
    expect(b1).toContain("simple English with short sentences");
    // Without a pair the legacy prompt is unchanged.
    expect(buildMonthlyGrammarPhasePrompt([], "A2")).toContain("PHASE 3 — GRAMMAR ONLY. Return exactly two grammarTopics");
  });

  it("rejects wrong titles and uncovered roadmap content, and accepts a covering result", () => {
    const result = coveringResult();
    const issues = getMonthlyGrammarPhaseIssues(result, "A2", pair);
    expect(issues).toContain('grammarTopics[0] must be the locked roadmap topic A "Hiện tại hoàn thành 1"');
    const titled = { ...result, grammarTopics: result.grammarTopics.map((topic, index) => ({ ...topic, title: index === 0 ? "Hiện tại hoàn thành 1" : "Hiện tại hoàn thành 2" })) };
    expect(getMonthlyGrammarPhaseIssues(titled, "A2", pair)).toEqual([]);
    const missing = structuredClone(titled);
    missing.grammarTopics[0]!.steps.forEach((step) => { step.examples = step.examples.filter((example) => !/been vs gone/u.test(example)); });
    expect(getMonthlyGrammarPhaseIssues(missing, "A2", pair).join(" ")).toMatch(/does not cover roadmap content: "been vs gone" \(use at least one of: been, gone\)/u);
    // Legacy callers (no pair) are not affected by roadmap gates.
    expect(getMonthlyGrammarPhaseIssues(result, "A2")).toEqual([]);
  });

  it("writes the locked titles itself and repairs coverage with the listed items", async () => {
    const first = coveringResult();
    first.grammarTopics[1]!.steps.forEach((step) => { step.examples = step.examples.filter((example) => example !== "for/since"); });
    const prompts: string[] = [];
    const result = await runMonthlyGrammarPhaseWithRetry(async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? first : coveringResult(); }, "A2", pair);
    expect(result.grammarTopics.map((topic) => topic.title)).toEqual(["Hiện tại hoàn thành 1", "Hiện tại hoàn thành 2"]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('"for/since" (use at least one of: since)');
  });

  it("keeps B1+ objectives English under the roadmap prompt", () => {
    const vietnamese = coveringResult(b1Pair);
    const english = coveringResult(b1Pair, true);
    expect(getMonthlyGrammarPhaseIssues({ ...vietnamese, grammarTopics: vietnamese.grammarTopics.map((topic, index) => ({ ...topic, title: index ? b1Pair.topicB.titleEn : b1Pair.topicA.titleEn })) }, "B1", b1Pair).join(" ")).toContain("must be in simple English for B1");
    expect(getMonthlyGrammarPhaseIssues({ ...english, grammarTopics: english.grammarTopics.map((topic, index) => ({ ...topic, title: index ? b1Pair.topicB.titleEn : b1Pair.topicA.titleEn })) }, "B1", b1Pair)).toEqual([]);
  });
});

describe("roadmap daily lesson contract and gates", () => {
  const day = (stage?: NonNullable<MonthlyDaySpec["grammarPlan"]>["stage"], code = "A5") => ({
    lessonNumber: 7, date: "2026-12-09", kind: "new", newLessonNumber: 5, coreTermIds: ["c1", "c2", "c3"], expandedTermIds: [], reviewTermIds: [], reviewExpandedTermIds: [],
    skillExercises: [], grammarStepId: "s", soundId: "p", pronunciationExampleIds: [],
    grammarPlan: { code, objective: "Bước 5", mode: "recognize", milestoneIds: ["s"], recallMilestoneIds: [], ...(stage ? { stage } : {}) }
  }) as unknown as MonthlyDaySpec;
  const coreWords = ["budget", "client", "report"];
  const item = (prompt: string) => ({ id: "q", prompt, options: ["a", "b", "c", "d"], answer: "a", explanation: "x" });

  it("adds the stage's exercise type and the 60-word explanation rule only on roadmap days", () => {
    const text = monthlyGrammarRoadmapDayContract(day("common_errors"), "A2");
    expect(text).toContain("GRAMMAR ROADMAP DAY A5 (Common errors)");
    expect(text).toContain("Vietnamese-influenced errors");
    expect(text).toContain("at most 60 words");
    expect(text).toContain("written in Vietnamese");
    expect(monthlyGrammarRoadmapDayContract(day("mixed_practice", "K2"), "B2")).toContain("4–6 sentences with gaps that need both topic A and topic B");
    expect(monthlyGrammarRoadmapDayContract(day(), "A2")).toBe("");
  });

  it("gates explanation length and language and the core word in an item", () => {
    const ok = { text: "Lỗi hay gặp: dùng V2 thay V3. Công thức: have/has + V3.", items: [item("Tìm lỗi: I have went to the client."), item("Chọn: She has ___")] };
    expect(monthlyGrammarRoadmapDayIssues(day("common_errors"), "A2", ok, coreWords)).toEqual([]);
    const long = { ...ok, text: `Giải thích ${"rất dài ".repeat(40)}` };
    expect(monthlyGrammarRoadmapDayIssues(day("common_errors"), "A2", long, coreWords).map((issue) => issue.code)).toEqual(["MONTHLY_GRAMMAR_ROADMAP_EXPLANATION_LENGTH"]);
    const english = { ...ok, text: "Use have or has with the past participle." };
    expect(monthlyGrammarRoadmapDayIssues(day("common_errors"), "A2", english, coreWords).map((issue) => issue.code)).toEqual(["MONTHLY_GRAMMAR_ROADMAP_EXPLANATION_LANGUAGE"]);
    expect(monthlyGrammarRoadmapDayIssues(day("common_errors"), "B1", english, coreWords)).toEqual([]);
    expect(monthlyGrammarRoadmapDayIssues(day("common_errors"), "B1", ok, coreWords).map((issue) => issue.code)).toEqual(["MONTHLY_GRAMMAR_ROADMAP_EXPLANATION_LANGUAGE"]);
    const noCore = { ...ok, items: [item("Chọn: She has ___ the file.")] };
    expect(monthlyGrammarRoadmapDayIssues(day("common_errors"), "A2", noCore, coreWords).map((issue) => issue.code)).toEqual(["MONTHLY_GRAMMAR_ROADMAP_ITEM_CORE_WORD"]);
    expect(monthlyGrammarRoadmapDayIssues(day(), "A2", { ...long, items: noCore.items }, coreWords)).toEqual([]);
  });
});
