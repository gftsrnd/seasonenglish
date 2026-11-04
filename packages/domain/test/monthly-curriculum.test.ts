import { describe, expect, it } from "vitest";
import {
  buildMonthlyCalendar,
  monthlyDayKind,
  monthlyNewLessonOrdinal,
  buildMonthlyCurriculum,
  buildMonthlyExamScope,
  monthlyScopeHash,
  recommendedMonthlyResourceCriteria,
  planMonthlyResourcePool,
  backfillMonthlyCurriculumPlan,
  resolveMonthlyExamOutcome,
  recommendedPendingBatch,
  validateMonthlyCurriculum,
  type MonthlyCurriculumInput
} from "../src/monthly/index.js";

function inputFor(month = "2026-11"): MonthlyCurriculumInput {
  const calendar = buildMonthlyCalendar(month);
  const newDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
  const coreTerms = Array.from({ length: newDays.length * 3 }, (_, index) => ({
    id: `core-${index + 1}`,
    word: `term${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`,
    meaning: `Nghĩa ${index + 1}`,
    type: "noun",
    ipa: "/tɜːm/"
  }));
  return {
    month,
    cefr: "A1",
    theme: { version: 1, title: "Preparing a budget review", brief: "Prepare a simple budget review at work.", context: "Office", communicationGoal: "State a cost and ask for an update." },
    coreTerms,
    supportTerms: Array.from({ length: newDays.length * 9 }, (_, index) => {
      const coreIndex = Math.floor(index / 3);
      return {
        id: `support-${index + 1}`,
        word: `support${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`,
        meaning: `Từ mở rộng ${index + 1}`,
        type: "noun",
        source: "example" as const,
        dayNumber: newDays[Math.floor(coreIndex / 3)]!,
        relatedCoreTermId: `core-${coreIndex + 1}`
      };
    }),
    grammarTopics: Array.from({ length: 2 }, (_, index) => ({
      id: `grammar-${index + 1}`,
      title: `Grammar ${index + 1}`,
      steps: [1, 2, 3].map((step) => ({ id: `grammar-${index + 1}-step-${step}`, focus: `Focus ${index + 1}.${step}`, formula: "subject + verb", usage: "Use in a work sentence.", examples: ["I check the cost."] }))
    })),
    sounds: Array.from({ length: 4 }, (_, index) => ({
      id: `sound-${index + 1}`,
      ipa: ["iː", "ɪ", "θ", "ʃ"][index]!,
      label: `Sound ${index + 1}`,
      examples: Array.from({ length: Math.ceil(calendar.lessonCount / 4) * 3 }, (_, exampleIndex) => ({ id: `sound-${index + 1}-example-${exampleIndex + 1}`, word: `sound-${index + 1}-word-${exampleIndex + 1}`, ipa: "/x/" }))
    }))
  };
}

function poolFor(): Parameters<typeof planMonthlyResourcePool>[0] {
  const input = inputFor();
  return {
    month: input.month,
    cefr: input.cefr,
    theme: input.theme,
    version: input.theme.version,
    coreTerms: input.coreTerms.map((term) => ({ ...term, source: "core_registry" as const, component: "core" as const })),
    supportTerms: Array.from({ length: 144 }, (_, index) => ({
      id: `support-${index + 1}`,
      word: `support${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`,
      meaning: `Từ mở rộng ${index + 1}`,
      type: "noun",
      source: "example" as const,
      component: "expanded" as const,
      relatedCoreTermId: `core-${Math.floor(index / 3) + 1}`
    })),
    grammarTopics: input.grammarTopics,
    sounds: input.sounds
  };
}

describe("monthly curriculum contract", () => {
  it("allocates linked resources, weekly reviews, and balanced explicit writing/speaking tasks on approval", () => {
    const contract = planMonthlyResourcePool(poolFor());
    const newDays = contract.daySpecs.filter((day) => day.kind === "new");
    const reviewDays = contract.daySpecs.filter((day) => day.kind === "review");

    expect(newDays).toHaveLength(16);
    expect(newDays.filter((day) => day.primarySkillFocus === "writing")).toHaveLength(8);
    expect(newDays.filter((day) => day.primarySkillFocus === "speaking")).toHaveLength(8);
    expect(contract.grammarTopics).toHaveLength(2);
    expect(contract.grammarTopics.every((topic) => topic.steps.length === 3)).toBe(true);
    expect(contract.sounds.map((sound) => newDays.filter((day) => day.soundId === sound.id).length)).toEqual([4, 4, 4, 4]);
    for (const day of newDays) {
      expect(day.coreTermIds).toHaveLength(3);
      expect(new Set(day.coreTermIds).size).toBe(3);
      expect(day.expandedTermIds).toHaveLength(9);
      expect(day.expandedTermIds.every((id) => contract.supportTerms.find((term) => term.id === id)?.relatedCoreTermId && day.coreTermIds.includes(contract.supportTerms.find((term) => term.id === id)!.relatedCoreTermId))).toBe(true);
      expect(day.writingFocus).toContain("Write");
      expect(day.speakingFocus).toMatch(/^(Say|Give)/u);
    }
    expect(reviewDays.map((day) => day.lessonNumber)).toEqual([5, 10, 15, 20]);
    for (const day of reviewDays) {
      expect(day.reviewTermIds).toHaveLength(12);
      expect(day.reviewExpandedTermIds).toHaveLength(36);
      expect(day.coreTermIds).toEqual([]);
      expect(day.expandedTermIds).toEqual([]);
    }
  });

  it("idempotently repairs a legacy approved plan only when resource IDs prove its links", () => {
    const current = planMonthlyResourcePool(poolFor());
    const legacy = structuredClone(current) as unknown as { cefr: string; coreTerms: Array<Record<string, unknown>>; supportTerms: Array<Record<string, unknown>>; daySpecs: Array<Record<string, unknown>> };
    legacy.cefr = "A2";
    const coreId = (id: unknown) => `a2-core-${String(id).replace("core-", "")}`;
    const supportId = (id: unknown) => `a2-expanded-${String(id).replace("support-", "")}`;
    legacy.coreTerms.forEach((term) => { term.id = coreId(term.id); });
    for (const term of legacy.supportTerms) delete term.relatedCoreTermId;
    legacy.supportTerms.forEach((term, index) => { term.id = `a2-expanded-${index + 1}`; });
    for (const day of legacy.daySpecs) {
      day.coreTermIds = (day.coreTermIds as string[]).map(coreId);
      day.reviewTermIds = (day.reviewTermIds as string[]).map(coreId);
      if (Array.isArray(day.expandedTermIds)) day.expandedTermIds = (day.expandedTermIds as string[]).map(supportId);
      if (Array.isArray(day.reviewExpandedTermIds)) day.reviewExpandedTermIds = (day.reviewExpandedTermIds as string[]).map(supportId);
      delete day.expandedTermIds;
      delete day.reviewExpandedTermIds;
      delete day.primarySkillFocus;
      delete day.writingFocus;
      delete day.speakingFocus;
    }

    const repaired = backfillMonthlyCurriculumPlan(legacy);
    expect(repaired.supportTerms.every((term) => Boolean(term.relatedCoreTermId))).toBe(true);
    expect(repaired.daySpecs.filter((day) => day.kind === "new").every((day) => day.expandedTermIds.length === 9 && day.writingFocus && day.speakingFocus)).toBe(true);
    expect(repaired.coreTerms.map(({ word, meaning, type, ipa }) => ({ word, meaning, type, ipa }))).toEqual(current.coreTerms.map(({ word, meaning, type, ipa }) => ({ word, meaning, type, ipa })));
    expect(repaired.supportTerms.map(({ word, meaning, type, source }) => ({ word, meaning, type, source }))).toEqual(current.supportTerms.map(({ word, meaning, type, source }) => ({ word, meaning, type, source })));
    expect(repaired.grammarTopics).toEqual(current.grammarTopics);
    expect(repaired.sounds).toEqual(current.sounds);
    expect(backfillMonthlyCurriculumPlan(repaired)).toEqual(repaired);

    const unsafe = structuredClone(legacy);
    unsafe.supportTerms[0]!.id = "a2-expanded-99";
    expect(() => backfillMonthlyCurriculumPlan(unsafe)).toThrow(/IDs do not prove/u);
  });

  it("reserves the final weekday in November 2026 for the monthly exam, with 48 core terms and scheduled reviews", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());

    expect(curriculum.daySpecs).toHaveLength(20);
    expect(curriculum.coreTerms).toHaveLength(48);
    expect(curriculum.coreTerms[0]).toMatchObject({ source: "core_registry", component: "core", dayNumber: 1 });
    expect(curriculum.supportTerms[0]).toMatchObject({ type: "noun", source: "example", component: "expanded", dayNumber: 1, relatedCoreTermId: "core-1" });
    expect(curriculum.daySpecs.filter((day) => day.kind === "new")).toHaveLength(16);
    expect(curriculum.daySpecs.filter((day) => day.kind === "review")).toHaveLength(4);
    expect(curriculum.daySpecs.at(-1)?.date).toBe("2026-11-27");
    expect(buildMonthlyCalendar("2026-11")).toMatchObject({ examDate: "2026-11-30", lessonCount: 20 });
    expect(curriculum.daySpecs.some((day) => day.date === "2026-11-30")).toBe(false);
    expect(curriculum.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.coreTermIds)).toHaveLength(48);
    expect(new Set(curriculum.daySpecs.filter((day) => day.kind === "new").flatMap((day) => day.coreTermIds)).size).toBe(48);
    for (const day of curriculum.daySpecs.filter((entry) => entry.kind === "review")) {
      expect(day.coreTermIds).toEqual([]);
      expect(day.reviewTermIds).toHaveLength(12);
      expect(day.reviewExpandedTermIds).toHaveLength(36);
      const earlierNewTerms = curriculum.daySpecs
        .filter((candidate) => candidate.lessonNumber < day.lessonNumber && candidate.kind === "new")
        .flatMap((candidate) => candidate.coreTermIds);
      expect(day.reviewTermIds.every((id) => earlierNewTerms.includes(id))).toBe(true);
    }
    expect(validateMonthlyCurriculum(curriculum)).toEqual([]);
  });

  it("uses the fixed slot schedule for 20, 21, and 22 instructional slots", () => {
    const reviewSlots = (count: number) => Array.from({ length: count }, (_, index) => index + 1).filter((slot) => monthlyDayKind(slot, count) === "review");
    expect(reviewSlots(20)).toEqual([5, 10, 15, 20]);
    expect(reviewSlots(21)).toEqual([5, 10, 15, 21]);
    expect(reviewSlots(22)).toEqual([5, 10, 15, 22]);
    expect(Array.from({ length: 20 }, (_, index) => index + 1).filter((slot) => monthlyDayKind(slot, 20) === "new")).toHaveLength(16);
    expect(Array.from({ length: 21 }, (_, index) => index + 1).filter((slot) => monthlyDayKind(slot, 21) === "new")).toHaveLength(17);
    expect(Array.from({ length: 22 }, (_, index) => index + 1).filter((slot) => monthlyDayKind(slot, 22) === "new")).toHaveLength(18);
    expect(monthlyNewLessonOrdinal(6, 20)).toBe(5);
    expect(monthlyNewLessonOrdinal(20, 20)).toBeNull();
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
      vocabularyCount: 48, expandedVocabularyCount: 144, grammarTopicCount: 2, pronunciationSoundCount: 4
    });
    expect(recommendedMonthlyResourceCriteria("2026-11", "C1")).toEqual({
      vocabularyCount: 48, expandedVocabularyCount: 144, grammarTopicCount: 2, pronunciationSoundCount: 4
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

  it("assigns pronunciation targets in consecutive three-new-lesson blocks and combines the two grammar topics afterwards", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());
    const newDays = curriculum.daySpecs.filter((day) => day.kind === "new");

    expect(newDays.slice(0, 3).map((day) => day.soundId)).toEqual(["sound-1", "sound-1", "sound-1"]);
    expect(newDays.slice(3, 6).map((day) => day.soundId)).toEqual(["sound-2", "sound-2", "sound-2"]);
    expect(newDays.slice(6, 9).map((day) => day.soundId)).toEqual(["sound-3", "sound-3", "sound-3"]);
    expect(newDays.slice(9, 12).map((day) => day.soundId)).toEqual(["sound-4", "sound-4", "sound-4"]);
    expect(newDays.slice(0, 6).every((day) => ["grammar-1-step-1", "grammar-1-step-2", "grammar-1-step-3"].includes(day.grammarStepId))).toBe(true);
    expect(newDays.slice(6, 12).every((day) => ["grammar-2-step-1", "grammar-2-step-2", "grammar-2-step-3"].includes(day.grammarStepId))).toBe(true);
    expect(newDays.slice(12).map((day) => day.grammarStepId)).toEqual(["grammar-1-step-3", "grammar-1-step-3", "grammar-1-step-3", "grammar-1-step-3"]);
  });

  it("allows no more than twenty percent repeated expanded entries while keeping all core terms distinct", () => {
    const input = inputFor();
    const curriculum = buildMonthlyCurriculum(input);
    const allowed = structuredClone(curriculum);
    for (let index = 0; index < 28; index += 1) allowed.supportTerms[allowed.supportTerms.length - 1 - index]!.word = allowed.supportTerms[0]!.word;
    expect(validateMonthlyCurriculum(allowed)).toEqual([]);

    const excessive = structuredClone(allowed);
    excessive.supportTerms[excessive.supportTerms.length - 29]!.word = excessive.supportTerms[0]!.word;
    expect(validateMonthlyCurriculum(excessive)).toContain("Expanded resources repeat more than 20% of the monthly total");
  });

  it("keeps support terms outside core and proposes the first ten pending days without replacing authored days", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());
    const statuses = new Map(curriculum.daySpecs.map((day) => [day.lessonNumber, day.lessonNumber === 2 ? "draft" : day.lessonNumber === 3 ? "approved" : "pending"] as const));

    expect(curriculum.supportTerms.map((term) => term.id)).toHaveLength(144);
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
