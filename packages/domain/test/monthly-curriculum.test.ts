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
  const newDays = calendar.effectiveDays.filter((date) => !date.endsWith("06") && !date.endsWith("13") && !date.endsWith("20") && !date.endsWith("27"));
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
    supportTerms: [{ id: "support-1", word: "worksheet", meaning: "bảng tính", source: "example" }],
    grammarTopics: Array.from({ length: 4 }, (_, index) => ({
      id: `grammar-${index + 1}`,
      title: `Grammar ${index + 1}`,
      steps: [{ id: `grammar-${index + 1}-step-1`, focus: `Focus ${index + 1}`, formula: "subject + verb", usage: "Use in a work sentence.", examples: ["I check the cost."] }]
    })),
    sounds: Array.from({ length: 4 }, (_, index) => ({
      id: `sound-${index + 1}`,
      ipa: ["iː", "ɪ", "θ", "ʃ"][index]!,
      label: `Sound ${index + 1}`,
      examples: Array.from({ length: 15 }, (_, exampleIndex) => ({ id: `sound-${index + 1}-example-${exampleIndex + 1}`, word: `sound-${index + 1}-word-${exampleIndex + 1}`, ipa: "/x/" }))
    }))
  };
}

describe("monthly curriculum contract", () => {
  it("uses Monday to Thursday for 48 new core terms and Friday only for review in November 2026", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());

    expect(curriculum.daySpecs).toHaveLength(20);
    expect(curriculum.coreTerms).toHaveLength(48);
    expect(curriculum.daySpecs.filter((day) => day.kind === "new")).toHaveLength(16);
    expect(curriculum.daySpecs.filter((day) => day.kind === "review")).toHaveLength(4);
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
