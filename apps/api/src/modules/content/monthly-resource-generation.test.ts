import { buildMonthlyCalendar, planMonthlyResourcePool, validateMonthlyCurriculum } from "@e4s/domain";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import {
  buildMonthlyResourcesFromAiPlan,
  MonthlyResourceCriteriaError,
  MonthlyResourcePlanError,
  selectMonthlyPronunciationCandidates,
  selectMonthlySupportCandidates
} from "./monthly-resource-generation.js";

const month = "2026-11";
const calendar = buildMonthlyCalendar(month);
const newLessonDays = calendar.effectiveDays
  .flatMap((date, index) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5 ? [] : [index + 1]);
const vocabularyCount = newLessonDays.length * 3;
const expandedVocabularyCount = newLessonDays.length * 9;
const theme = {
  version: 1,
  title: "Customer handover",
  brief: "Prepare a customer handover.",
  context: "Customer success",
  communicationGoal: "Explain handover risks."
};
const criteria = { vocabularyCount, expandedVocabularyCount, grammarTopicCount: 2, pronunciationSoundCount: 4 };

function planFor(): MonthlyResourcePlanTaskOutput {
  return {
    coreTerms: newLessonDays.flatMap((dayNumber, dayIndex) => Array.from({ length: 3 }, (_, itemIndex) => ({
      id: `core-${dayIndex + 1}-${itemIndex + 1}`,
      word: `core${String.fromCharCode(97 + dayIndex)}${String.fromCharCode(97 + itemIndex)}`,
      meaning: `Từ cốt lõi ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      ipa: "/kɔːr/"
    }))),
    expandedTerms: newLessonDays.flatMap((dayNumber, dayIndex) => Array.from({ length: 9 }, (_, itemIndex) => ({
      id: `expanded-${dayIndex + 1}-${itemIndex + 1}`,
      word: `support${String.fromCharCode(97 + dayIndex)}${String.fromCharCode(97 + itemIndex)}`,
      meaning: `Từ mở rộng ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      relation: (["umbrella", "synonym", "word_family"] as const)[itemIndex % 3]!,
      relatesToCoreId: `core-${dayIndex + 1}-${Math.floor(itemIndex / 3) + 1}`
    }))),
    grammarTopics: [
      { id: "grammar-a", title: "Ngữ pháp A", steps: [1, 2, 3].map((step) => ({ id: `a-${step}`, focus: `Nền tảng ${step}`, formula: "S + V", usage: "Dùng trong giao tiếp cơ bản.", examples: ["I confirm the plan.", "We check the file.", "They send the note."] })) },
      { id: "grammar-b", title: "Ngữ pháp B", steps: [1, 2, 3].map((step) => ({ id: `b-${step}`, focus: `Mở rộng ${step}`, formula: "S + will + V", usage: "Dùng để nói về kế hoạch.", examples: ["I will call the client.", "We will review the file.", "They will share an update."] })) }
    ],
    pronunciationTargets: Array.from({ length: 4 }, (_, targetIndex) => ({
      id: `sound-${targetIndex + 1}`,
      ipa: ["/iː/", "/ɪ/", "/e/", "/æ/"][targetIndex]!,
      label: `Âm mục tiêu ${targetIndex + 1}`,
      explanation: "Luyện nhận biết và sử dụng âm trong câu.",
      words: Array.from({ length: 9 }, (_, wordIndex) => ({ word: `term${targetIndex + 1}x${wordIndex + 1}`, ipa: "/s/" }))
    }))
  };
}

describe("monthly AI resource generation", () => {
  it("selects the first three valid linked support terms from an ordered AI candidate set", () => {
    const candidates = [
      { id: "x1", word: "core phrase", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x2", word: "annual report", meaning: "", type: "noun", relation: "collocation" as const, relatesToCoreId: "core-a" },
      { id: "x3", word: "schedule", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x4", word: "schedule", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x5", word: "update", meaning: "", type: "noun", relation: "word_family" as const, relatesToCoreId: "core-a" },
      { id: "x6", word: "coordinate", meaning: "", type: "verb", relation: "word_family" as const, relatesToCoreId: "core-a" }
    ];
    const result = selectMonthlySupportCandidates({
      candidates,
      coreId: "core-a",
      coreWords: new Set(["core phrase"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 3
    });

    expect(result.selected.map((term) => term.word)).toEqual(["annual report", "schedule", "update"]);
    expect(result.rejected).toHaveLength(2);
  });

  it("rejects a phrase once the monthly phrase budget is exhausted", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x1", word: "annual report", meaning: "", type: "noun", relation: "collocation", relatesToCoreId: "core-a" },
        { id: "x2", word: "schedule", meaning: "", type: "noun", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x3", word: "update", meaning: "", type: "noun", relation: "word_family", relatesToCoreId: "core-a" }
      ],
      coreId: "core-a",
      coreWords: new Set(["priority"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: ["client update"],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 1,
      needed: 2
    });

    expect(result.selected.map((term) => term.word)).toEqual(["schedule", "update"]);
    expect(result.rejected).toContain("annual report -> annual report (exceeds the monthly phrase ceiling; standalone words are required)");
  });

  it("selects pronunciation examples without prior collisions or more than three syllables", () => {
    const result = selectMonthlyPronunciationCandidates({
      candidates: [
        { word: "agenda", ipa: "/əˈdʒendə/" },
        { word: "team", ipa: "/tiːm/" },
        { word: "professional", ipa: "/prəˈfeʃənəl/" },
        { word: "lease", ipa: "/liːs/" }
      ],
      forbiddenWords: new Set(["agenda"]),
      needed: 2
    });

    expect(result.selected.map((candidate) => candidate.word)).toEqual(["team", "lease"]);
    expect(result.rejected).toEqual([
      "agenda -> agenda (duplicates a pronunciation example already used)",
      "professional -> professional (has 4 syllables)"
    ]);
  });

  it("builds a two-grammar, four-pronunciation monthly contract from a valid AI plan", () => {
    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    const contract = planMonthlyResourcePool(pool);

    expect(validateMonthlyCurriculum(contract)).toEqual([]);
    expect(contract.coreTerms).toHaveLength(vocabularyCount);
    expect(contract.supportTerms).toHaveLength(expandedVocabularyCount);
    expect(contract.grammarTopics).toHaveLength(2);
    expect(contract.sounds).toHaveLength(4);
    expect(contract.daySpecs.filter((day) => day.kind === "new").slice(0, 12).map((day) => day.soundId)).toEqual([
      "a1-sound-1", "a1-sound-1", "a1-sound-1", "a1-sound-2", "a1-sound-2", "a1-sound-2",
      "a1-sound-3", "a1-sound-3", "a1-sound-3", "a1-sound-4", "a1-sound-4", "a1-sound-4"
    ]);
  });

  it("rejects a plan that has anything other than two grammar topics", () => {
    const plan = planFor();
    plan.grammarTopics.push(structuredClone(plan.grammarTopics[0]!));

    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, plan)).toThrow(MonthlyResourcePlanError);
  });

  it("rejects pronunciation words longer than three syllables", () => {
    const plan = planFor();
    plan.pronunciationTargets[0]!.words[0] = { word: "responsibility", ipa: "/rɪˌspɒnsəˈbɪləti/" };

    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, plan)).toThrow(MonthlyResourcePlanError);
  });

  it("rejects a manual criterion that cannot provide three core and nine expanded terms per new day", () => {
    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, {
      ...criteria,
      vocabularyCount: vocabularyCount - 1
    }, planFor())).toThrow(MonthlyResourceCriteriaError);
  });
});
