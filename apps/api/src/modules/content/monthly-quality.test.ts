import { describe, expect, it } from "vitest";
import type { MonthlyCurriculumContract } from "@e4s/domain";
import { evaluateMonthlyLessonQuality } from "./monthly-quality.js";

const requiredCodes = ["objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"];

describe("monthly lesson quality", () => {
  it("marks missing learner components and scope drift as severe", () => {
    const report = evaluateMonthlyLessonQuality(contract(), 1, lesson({
      parts: requiredCodes.filter((code) => code !== "speaking").map((code) => part(code))
    }));

    expect(report.severe.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "MONTHLY_COMPONENT_MISSING",
      "MONTHLY_CORE_TERM_MISSING",
      "MONTHLY_GRAMMAR_SCOPE_MISMATCH",
      "MONTHLY_SOUND_SCOPE_MISMATCH"
    ]));
    expect(report.light).toEqual([]);
  });

  it("permits only the scheduled core terms and classifies a missing lexical relation as light", () => {
    const result = evaluateMonthlyLessonQuality(contract(), 1, lesson());
    expect(result.severe).toEqual([]);
    expect(result.light).toEqual([{ severity: "light", code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: "core-one is missing a synonym or antonym", dayNumber: 1, component: "vocabulary" }]);
  });

  it("does not let a review day introduce a new core term or a support term as a card", () => {
    const result = evaluateMonthlyLessonQuality(contract(), 2, lesson({
      parts: requiredCodes.map((code) => code === "vocabulary"
        ? part(code, { items: [{ word: "core-four", synonyms: ["fourth"], antonyms: ["first"] }, { word: "support-one", synonyms: ["helper"], antonyms: ["blocker"] }] })
        : code === "grammar" ? part(code, { formula: "Core formula" })
          : code === "pronunciation" ? part(code, { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] })
            : part(code))
    }));

    expect(result.severe.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      "MONTHLY_REVIEW_INTRODUCES_CORE_TERM",
      "MONTHLY_SUPPORT_TERM_AS_CORE_CARD"
    ]));
  });

  it("marks malformed assessment shapes and missing listening content as severe", () => {
    const result = evaluateMonthlyLessonQuality(contract(), 1, lesson({
      parts: requiredCodes.map((code) => code === "listening"
        ? part(code, { prompt: "What is the amount?", options: ["A", "B", "C", "D"], answer: "E" })
        : code === "reading" ? part(code, { text: "A short passage.", prompt: "What is it?", options: ["A", "B", "C", "D"], answer: "A" })
          : code === "vocabulary" ? part(code, { items: [
            { word: "core-one", synonyms: ["first"], antonyms: ["last"] },
            { word: "core-two", synonyms: ["second"], antonyms: ["last"] },
            { word: "core-three", synonyms: ["third"], antonyms: ["last"] }
          ] })
            : part(code))
    }));

    expect(result.severe.map((finding) => finding.code)).toContain("MONTHLY_CONTENT_INVALID");
  });
});

function contract(): MonthlyCurriculumContract {
  return {
    month: "2026-11", cefr: "A1", version: 1,
    theme: { version: 1, title: "Budget", brief: "Brief", context: "Context", communicationGoal: "Goal" },
    coreTerms: [
      { id: "core-1", word: "core-one", meaning: "một", type: "noun", ipa: "/kɔːr/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-2", word: "core-two", meaning: "hai", type: "noun", ipa: "/tuː/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-3", word: "core-three", meaning: "ba", type: "noun", ipa: "/θriː/", source: "core_registry", component: "core", dayNumber: 1 },
      { id: "core-4", word: "core-four", meaning: "bốn", type: "noun", ipa: "/fɔːr/", source: "core_registry", component: "core", dayNumber: 3 }
    ],
    supportTerms: [{ id: "support-1", word: "support-one", meaning: "hỗ trợ", type: "noun", relation: "collocation", source: "example", component: "expanded", dayNumber: 1, relatedCoreTermId: "core-1" }],
    grammarTopics: [{ id: "grammar-1", title: "Grammar", steps: [{ id: "grammar-step", focus: "focus", formula: "Core formula", usage: "usage", examples: ["Example."] }] }],
    sounds: [{ id: "sound-1", ipa: "/k/", label: "K", examples: [{ id: "sound-example-1", word: "cost", ipa: "/kɒst/" }, { id: "sound-example-2", word: "can", ipa: "/kæn/" }, { id: "sound-example-3", word: "key", ipa: "/kiː/" }] }],
    daySpecs: [
      { lessonNumber: 1, date: "2026-11-02", kind: "new", coreTermIds: ["core-1", "core-2", "core-3"], expandedTermIds: ["support-1"], reviewTermIds: [], reviewExpandedTermIds: [], skillExercises: exercises(["core-1", "core-2", "core-3", "support-1"]), grammarStepId: "grammar-step", soundId: "sound-1", pronunciationExampleIds: ["sound-example-1", "sound-example-2", "sound-example-3"] },
      { lessonNumber: 2, date: "2026-11-06", kind: "review", coreTermIds: [], expandedTermIds: [], reviewTermIds: ["core-1", "core-2", "core-3"], reviewExpandedTermIds: ["support-1"], skillExercises: exercises(["core-1", "core-2", "core-3", "support-1"]), grammarStepId: "grammar-step", soundId: "sound-1", pronunciationExampleIds: ["sound-example-1", "sound-example-2", "sound-example-3"] }
    ]
  };
}

function lesson(overrides: { parts?: Array<{ code: string; content: Record<string, unknown> }> } = {}) {
  return { title: "A usable title", parts: overrides.parts ?? requiredCodes.map((code) => {
    if (code === "objective") return part(code, { text: "Identify three budget words." });
    if (code === "instruction") return part(code, { steps: ["Read the example.", "Answer the question."] });
    if (code === "vocabulary") return part(code, { items: [
      { word: "core-one", synonyms: [], antonyms: [] },
      { word: "core-two", synonyms: ["second"], antonyms: [] },
      { word: "core-three", synonyms: ["third"], antonyms: [] }
    ] });
    if (code === "grammar") return part(code, { formula: "Core formula" });
    if (code === "pronunciation") return part(code, { focus: "/k/", words: [{ word: "cost", ipa: "/kɒst/" }, { word: "can", ipa: "/kæn/" }, { word: "key", ipa: "/kiː/" }] });
    if (["listening", "reading", "word_class", "word_use"].includes(code)) return part(code, {
      ...(code === "listening" ? { script: "The cost is high." } : code === "reading" ? { text: "The cost is high." } : {}),
      prompt: "What is high?", options: ["The cost", "The room", "The plan", "The date"], answer: "The cost"
    });
    if (code === "writing") return part(code, { prompt: "Write one sentence about cost.", answer: "The cost is high." });
    if (code === "speaking") return part(code, { prompt: "Say a sentence about cost.", sample: "The cost is high." });
    return part(code);
  }) };
}

function part(code: string, content: Record<string, unknown> = {}) { return { code, content }; }

function exercises(resourceIds: string[]) {
  return ["listening", "reading", "writing", "word_class", "word_use", "speaking"].map((exerciseCode) => ({ exerciseCode: exerciseCode as "listening" | "reading" | "writing" | "word_class" | "word_use" | "speaking", focus: "Use assigned materials.", resourceIds }));
}
