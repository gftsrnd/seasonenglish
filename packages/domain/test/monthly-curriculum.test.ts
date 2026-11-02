import { describe, expect, it } from "vitest";
import {
  buildMonthlyCalendar,
  buildMonthlyCurriculum,
  buildMonthlyExamScope,
  monthlyScopeHash,
  recommendedMonthlyResourceCriteria,
  resolveMonthlyExamOutcome,
  recommendedPendingBatch,
  validateMonthlyCurriculum,
  type MonthlyCurriculumInput
} from "../src/monthly/index.js";

function inputFor(month = "2026-11"): MonthlyCurriculumInput {
  const calendar = buildMonthlyCalendar(month);
  const newDays = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() !== 5);
  const coreTerms = Array.from({ length: newDays.length * 3 }, (_, index) => ({
    id: `core-${index + 1}`,
    word: `term-${index + 1}`,
    meaning: `Nghĩa ${index + 1}`,
    type: "noun",
    ipa: "/tɜːm/"
  }));
  return {
    month,
    cefr: "A1",
    theme: { version: 1, title: "Preparing a budget review", brief: "Prepare a simple budget review at work.", context: "Office", communicationGoal: "State a cost and ask for an update." },
    coreTerms,
    supportTerms: [{ id: "support-1", word: "worksheet", meaning: "bảng tính", type: "noun", source: "example", dayNumber: 1 }],
    grammarTopics: Array.from({ length: 4 }, (_, index) => ({
      id: `grammar-${index + 1}`,
      title: `Grammar ${index + 1}`,
      steps: [{ id: `grammar-${index + 1}-step-1`, focus: `Focus ${index + 1}`, formula: "subject + verb", usage: "Use in a work sentence.", examples: ["I check the cost."] }]
    })),
    sounds: Array.from({ length: 4 }, (_, index) => ({
      id: `sound-${index + 1}`,
      ipa: ["iː", "ɪ", "θ", "ʃ"][index]!,
      label: `Sound ${index + 1}`,
      examples: Array.from({ length: Math.ceil(calendar.lessonCount / 4) * 3 }, (_, exampleIndex) => ({ id: `sound-${index + 1}-example-${exampleIndex + 1}`, word: `sound-${index + 1}-word-${exampleIndex + 1}`, ipa: "/x/" }))
    }))
  };
}

describe("monthly curriculum contract", () => {
  it("reserves the final weekday in November 2026 for the monthly exam, with 48 core terms and Friday review only", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());

    expect(curriculum.daySpecs).toHaveLength(20);
    expect(curriculum.coreTerms).toHaveLength(48);
    expect(curriculum.coreTerms[0]).toMatchObject({ source: "core_registry", component: "core", dayNumber: 1 });
    expect(curriculum.supportTerms[0]).toMatchObject({ type: "noun", source: "example", component: "expanded", dayNumber: 1 });
    expect(curriculum.daySpecs.filter((day) => day.kind === "new")).toHaveLength(16);
    expect(curriculum.daySpecs.filter((day) => day.kind === "review")).toHaveLength(4);
    expect(curriculum.daySpecs.at(-1)?.date).toBe("2026-11-27");
    expect(buildMonthlyCalendar("2026-11")).toMatchObject({ examDate: "2026-11-30", lessonCount: 20 });
    expect(curriculum.daySpecs.some((day) => day.date === "2026-11-30")).toBe(false);
    expect(curriculum.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.coreTermIds)).toHaveLength(48);
    expect(new Set(curriculum.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.coreTermIds)).size).toBe(48);
    for (const day of curriculum.daySpecs.filter((entry) => entry.kind === "review")) {
      expect(day.coreTermIds).toEqual([]);
      expect(day.reviewTermIds).toHaveLength(3);
      const earlierNewTerms = curriculum.daySpecs
        .filter((candidate) => candidate.lessonNumber < day.lessonNumber && candidate.kind === "new")
        .flatMap((candidate) => candidate.coreTermIds);
      expect(day.reviewTermIds.every((id) => earlierNewTerms.includes(id))).toBe(true);
    }
    expect(validateMonthlyCurriculum(curriculum)).toEqual([]);
  });

  it("uses the final weekday as the exam date and excludes it from daily lessons", () => {
    const february2024 = buildMonthlyCalendar("2024-02");
    const february2026 = buildMonthlyCalendar("2026-02");

    expect(february2024).toMatchObject({ examDate: "2024-02-29", lessonCount: 20 });
    expect(february2026).toMatchObject({ examDate: "2026-02-27", lessonCount: 19 });
    expect(february2024.effectiveDays).not.toContain(february2024.examDate);
    expect(february2026.effectiveDays).not.toContain(february2026.examDate);
    expect([...february2024.effectiveDays, ...february2026.effectiveDays].every((date) => {
      const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return day >= 1 && day <= 5;
    })).toBe(true);
  });

  it("proposes resource counts from effective learning days and CEFR", () => {
    expect(recommendedMonthlyResourceCriteria("2026-11", "A1")).toEqual({
      vocabularyCount: 48, expandedVocabularyCount: 144, grammarTopicCount: 4, pronunciationSoundCount: 4
    });
    expect(recommendedMonthlyResourceCriteria("2026-11", "C1")).toEqual({
      vocabularyCount: 48, expandedVocabularyCount: 144, grammarTopicCount: 7, pronunciationSoundCount: 5
    });
    expect(recommendedMonthlyResourceCriteria("2026-02", "B1").vocabularyCount).toBe(48);
  });

  it("rejects DaySpecs whose date, grammar step, sound, or vocabulary assignment escapes the locked resources", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());
    const invalid = structuredClone(curriculum);
    invalid.daySpecs[0]!.date = "2026-11-01";
    invalid.daySpecs[0]!.grammarStepId = "unlocked-step";
    invalid.daySpecs[0]!.soundId = "unlocked-sound";
    invalid.coreTerms[0]!.dayNumber = 2;

    const errors = validateMonthlyCurriculum(invalid);
    expect(errors).toEqual(expect.arrayContaining([
      "Lesson 1 does not match its calendar date",
      "Lesson 1 references an unlocked grammar step",
      "Lesson 1 references an unlocked sound",
      "New lesson 1 does not match its core term day assignments"
    ]));
  });

  it("rejects duplicate monthly vocabulary across core and expanded resources", () => {
    const duplicateCore = structuredClone(buildMonthlyCurriculum(inputFor()));
    duplicateCore.coreTerms[1]!.word = duplicateCore.coreTerms[0]!.word;
    expect(validateMonthlyCurriculum(duplicateCore)).toContain(`Duplicate core term: ${duplicateCore.coreTerms[0]!.word}`);

    const overlap = structuredClone(buildMonthlyCurriculum(inputFor()));
    overlap.supportTerms[0]!.word = overlap.coreTerms[0]!.word;
    expect(validateMonthlyCurriculum(overlap)).toContain(`Expanded term ${overlap.supportTerms[0]!.id} duplicates a core term`);
  });

  it("keeps support terms outside core and proposes the first ten pending days without replacing authored days", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());
    const statuses = new Map(curriculum.daySpecs.map((day) => [day.lessonNumber, day.lessonNumber === 2 ? "draft" : day.lessonNumber === 3 ? "approved" : "pending"] as const));

    expect(curriculum.supportTerms.map((term) => term.id)).toEqual(["support-1"]);
    expect(recommendedPendingBatch(curriculum.daySpecs, statuses)).toEqual([1, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("changes the scope hash whenever the approved theme version changes", () => {
    const first = buildMonthlyCurriculum(inputFor());
    const changed = inputFor();
    changed.theme.version = 2;

    expect(monthlyScopeHash(first)).not.toBe(monthlyScopeHash(buildMonthlyCurriculum(changed)));
  });

  it("builds an exam scope solely from approved core terms, grammar steps, and sounds", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());
    const scope = buildMonthlyExamScope(curriculum);

    expect(scope).toEqual({
      month: "2026-11", cefr: "A1", contractVersion: 1,
      coreTermIds: curriculum.coreTerms.map((term) => term.id),
      grammarStepIds: curriculum.grammarTopics.flatMap((topic) => topic.steps.map((step) => step.id)),
      soundIds: curriculum.sounds.map((sound) => sound.id)
    });
    expect(scope.coreTermIds).not.toContain("support-1");
  });

  it("recommends reinforcement after a failed monthly exam without automatically lowering the learner", () => {
    expect(resolveMonthlyExamOutcome({ currentLevel: "B2", passed: false })).toEqual({
      levelChange: null, recommendation: "reinforce_lower_level", certificateEligible: false
    });
    expect(resolveMonthlyExamOutcome({ currentLevel: "C1", passed: true })).toEqual({
      levelChange: null, recommendation: "continue_current_level", certificateEligible: true
    });
  });
});



