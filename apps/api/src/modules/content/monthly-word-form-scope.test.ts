import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract, MonthlyDaySpec } from "@e4s/domain";
import { monthlyRegularForms, monthlyWordFormScopeFindings } from "./monthly-word-form-scope.js";

const core = (id: string, word: string, type: string) => ({ id, word, type, meaning: word, ipa: "", source: "core_registry", component: "core", dayNumber: 3 });
const contract = {
  cefr: "A2",
  coreTerms: [core("colleague", "colleague", "noun"), core("send", "send", "verb"), core("decide", "decide", "verb")],
  supportTerms: [{ id: "s1", word: "decision", type: "noun", meaning: "quyết định", relation: "word_family", source: "family", component: "expanded", dayNumber: 3, relatedCoreTermId: "decide" }],
  grammarTopics: [], sounds: [], daySpecs: []
} as unknown as MonthlyCurriculumContract;
const day = { lessonNumber: 3, kind: "new", coreTermIds: ["colleague", "send", "decide"] } as unknown as MonthlyDaySpec;
const lesson = (options: string[], family: Array<{ word: string; type: string }> = []) => [
  { code: "vocabulary", content: { items: [{ word: "colleague", family: [] }, { word: "decide", family }] } },
  { code: "word_class", content: { prompt: "Chọn dạng đúng: My ____ helps me every day.", options, answer: options[0] } }
];

describe("Word form options stay inside the lesson's words (A2 L3, December 2026)", () => {
  it("rejects invented derivations of a noun without a family and lists its allowed forms", () => {
    const findings = monthlyWordFormScopeFindings(contract, day, 3, lesson(["colleague", "colleagues", "colleagueship", "colleagueing"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "severe", code: "MONTHLY_WORD_FORM_OUTSIDE_LESSON", component: "word_class" });
    expect(findings[0]!.message).toContain("word_class (colleagueship, colleagueing)");
    expect(findings[0]!.message).toContain("colleague: colleague, colleagues");
  });
  it("accepts verb inflections and words with a family", () => {
    expect(monthlyWordFormScopeFindings(contract, day, 3, lesson(["sent", "send", "sends", "sending"]))).toEqual([]);
    expect(monthlyWordFormScopeFindings(contract, day, 3, lesson(["decision", "decide", "decisive", "decisively"], [{ word: "decisive", type: "adjective" }]))).toEqual([]);
  });
  it("does not judge Friday reviews (their Word form words come from the plan)", () => {
    expect(monthlyWordFormScopeFindings(contract, { ...day, kind: "review", reviewTermIds: ["colleague"] } as MonthlyDaySpec, 4, lesson(["colleague", "colleagues", "colleagueship", "colleagueing"]))).toEqual([]);
  });
  it("builds regular forms", () => {
    expect(monthlyRegularForms("plan", "verb")).toEqual(expect.arrayContaining(["plans", "planned", "planning"]));
    expect(monthlyRegularForms("careful", "adjective")).toContain("carefully");
    expect(monthlyRegularForms("colleague", "noun")).not.toContain("colleagueship");
  });
});
