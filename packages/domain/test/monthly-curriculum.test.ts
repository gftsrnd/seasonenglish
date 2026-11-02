import { describe, expect, it } from "vitest";
import {
  buildMonthlyCalendar,
  buildMonthlyCurriculum,
  monthlyScopeHash,
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
  it("keeps every weekday in November 2026, with 51 core terms and Friday review only", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());

    expect(curriculum.daySpecs).toHaveLength(21);
    expect(curriculum.coreTerms).toHaveLength(51);
    expect(curriculum.coreTerms[0]).toMatchObject({ source: "core_registry", component: "core", dayNumber: 1 });
    expect(curriculum.supportTerms[0]).toMatchObject({ type: "noun", source: "example", component: "expanded", dayNumber: 1 });
    expect(curriculum.daySpecs.filter((day) => day.kind === "new")).toHaveLength(17);
    expect(curriculum.daySpecs.filter((day) => day.kind === "review")).toHaveLength(4);
    expect(curriculum.daySpecs.at(-1)?.date).toBe("2026-11-30");
    expect(curriculum.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.coreTermIds)).toHaveLength(51);
    expect(new Set(curriculum.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.coreTermIds)).size).toBe(51);
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

  it("derives lesson counts from the selected month and never includes weekend lessons", () => {
    const february2024 = buildMonthlyCalendar("2024-02");
    const february2026 = buildMonthlyCalendar("2026-02");

    expect(february2024.lessonCount).toBe(21);
    expect(february2026.lessonCount).toBe(20);
    expect([...february2024.effectiveDays, ...february2026.effectiveDays].every((date) => {
      const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
      return day >= 1 && day <= 5;
    })).toBe(true);
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
});



