import { buildMonthlyCalendar, validateMonthlyCurriculum } from "@e4s/domain";
import { describe, expect, it } from "vitest";
import { generateMonthlyResources, MonthlyResourceCriteriaError } from "./monthly-resource-generation.js";

const month = "2026-11";
const calendar = buildMonthlyCalendar(month);
const vocabularyCount = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() !== 5).length * 3;
const expandedVocabularyCount = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() !== 5).length * 9;
const theme = {
  version: 1,
  title: "Customer handover",
  brief: "Prepare a customer handover.",
  context: "Customer success",
  communicationGoal: "Explain handover risks."
};

describe("monthly resource generation", () => {
  it("builds a valid resource set from four numeric criteria without placing a daily lesson on the exam date", () => {
    const contract = generateMonthlyResources(month, "A1", theme, {
      vocabularyCount,
      expandedVocabularyCount,
      grammarTopicCount: 3,
      pronunciationSoundCount: 2
    });

    expect(validateMonthlyCurriculum(contract)).toEqual([]);
    expect(contract.coreTerms).toHaveLength(vocabularyCount);
    expect(new Set(contract.coreTerms.map((term) => term.word.toLowerCase())).size).toBe(vocabularyCount);
    expect(contract.supportTerms).toHaveLength(expandedVocabularyCount);
    expect(new Set(contract.supportTerms.map((term) => term.word.toLowerCase())).size).toBe(expandedVocabularyCount);
    expect(contract.supportTerms.some((term) => contract.coreTerms.some((core) => core.word.toLowerCase() === term.word.toLowerCase()))).toBe(false);
    expect(contract.supportTerms.filter((term) => term.source === "group")).toHaveLength(48);
    expect(contract.supportTerms.filter((term) => term.source === "family")).toHaveLength(32);
    expect(contract.supportTerms.every((term) => contract.daySpecs.some((day) => day.lessonNumber === term.dayNumber))).toBe(true);
    expect(new Set(contract.daySpecs.map((day) => day.grammarStepId))).toEqual(new Set(contract.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id))));
    expect(new Set(contract.daySpecs.map((day) => day.soundId))).toEqual(new Set(contract.sounds.map((sound) => sound.id)));
    expect(contract.grammarTopics[0]?.steps[0]).toMatchObject({ formula: "I am + verb-ing", usage: expect.stringContaining("cập nhật") });
    expect(contract.sounds[0]).toMatchObject({ ipa: "/iː/", label: expect.stringContaining("cuộc họp") });
    expect(contract.grammarTopics).toHaveLength(3);
    expect(contract.sounds).toHaveLength(2);
    expect(contract.daySpecs).toHaveLength(calendar.lessonCount);
    expect(contract.daySpecs.some((day) => day.date === calendar.examDate)).toBe(false);
  });

  it("returns the required vocabulary count when the criterion cannot fill every new daily lesson", () => {
    expect(() => generateMonthlyResources(month, "A1", theme, {
      vocabularyCount: vocabularyCount - 1,
      expandedVocabularyCount: 0,
      grammarTopicCount: 4,
      pronunciationSoundCount: 4
    })).toThrow(MonthlyResourceCriteriaError);
  });

  it("uses distinct CEFR resources, grammar plans, and pronunciation plans", () => {
    const criteria = { vocabularyCount, expandedVocabularyCount, grammarTopicCount: 4, pronunciationSoundCount: 4 };
    const a1 = generateMonthlyResources(month, "A1", theme, criteria);
    const a2 = generateMonthlyResources(month, "A2", theme, criteria);
    const a1Words = new Set(a1.coreTerms.map((term) => term.word));
    expect(a2.coreTerms.some((term) => a1Words.has(term.word))).toBe(false);
    expect(a1.grammarTopics.map((topic) => topic.steps[0]?.formula)).not.toEqual(a2.grammarTopics.map((topic) => topic.steps[0]?.formula));
    expect(a1.sounds.map((sound) => sound.ipa)).not.toEqual(a2.sounds.map((sound) => sound.ipa));
    expect(a2.grammarTopics).toHaveLength(4);
  });
});
