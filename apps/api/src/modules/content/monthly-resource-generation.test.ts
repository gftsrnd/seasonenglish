import { buildMonthlyCalendar, validateMonthlyCurriculum } from "@e4s/domain";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import {
  buildMonthlyResourcesFromAiPlan,
  MonthlyResourceCriteriaError,
  MonthlyResourcePlanError
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
      dayNumber,
      word: `core ${dayIndex + 1} ${itemIndex + 1}`,
      meaning: `Từ cốt lõi ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      ipa: "/kɔːr/"
    }))),
    expandedTerms: newLessonDays.flatMap((dayNumber, dayIndex) => Array.from({ length: 9 }, (_, itemIndex) => ({
      id: `expanded-${dayIndex + 1}-${itemIndex + 1}`,
      dayNumber,
      word: `expanded ${dayIndex + 1} ${itemIndex + 1}`,
      meaning: `Từ mở rộng ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      relation: itemIndex < 3 ? "umbrella" as const : itemIndex < 7 ? "synonym" as const : "word_family" as const,
      relatesToCoreId: `core-${dayIndex + 1}-${(itemIndex % 3) + 1}`
    }))),
    grammarTopics: [
      { id: "grammar-a", title: "Ngữ pháp A", formula: "S + V", usage: "Dùng trong giao tiếp cơ bản.", examples: ["I confirm the plan.", "We check the file.", "They send the note."], dayNumbers: [...newLessonDays.slice(0, 6), ...newLessonDays.slice(12).filter((_day, index) => index % 2 === 0)] },
      { id: "grammar-b", title: "Ngữ pháp B", formula: "S + will + V", usage: "Dùng để nói về kế hoạch.", examples: ["I will call the client.", "We will review the file.", "They will share an update."], dayNumbers: [...newLessonDays.slice(6, 12), ...newLessonDays.slice(12).filter((_day, index) => index % 2 === 1)] }
    ],
    pronunciationTargets: Array.from({ length: 4 }, (_, targetIndex) => ({
      id: `sound-${targetIndex + 1}`,
      ipa: ["/iː/", "/ɪ/", "/e/", "/æ/"][targetIndex]!,
      label: `Âm mục tiêu ${targetIndex + 1}`,
      explanation: "Luyện nhận biết và sử dụng âm trong câu.",
      dayNumbers: newLessonDays.slice(targetIndex * 3, targetIndex * 3 + 3),
      words: Array.from({ length: 9 }, (_, wordIndex) => ({ word: `sound${targetIndex + 1}word${wordIndex + 1}`, ipa: "/s/" }))
    }))
  };
}

describe("monthly AI resource generation", () => {
  it("builds a two-grammar, four-pronunciation monthly contract from a valid AI plan", () => {
    const contract = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());

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
