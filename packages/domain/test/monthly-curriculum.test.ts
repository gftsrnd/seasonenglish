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
  withMonthlyExpandedTerms,
  backfillMonthlyCurriculumPlan,
  resolveMonthlyExamOutcome,
  recommendedPendingBatch,
  validateMonthlyCurriculum,
  allowedMonthlySupportLevels,
  maxMonthlySupportRepeats,
  monthlySupportLevelBand,
  isMonthlyCoreLevelAllowed,
  isMonthlySupportLevelAllowed,
  maxMonthlyWordFamilyLevel,
  MONTHLY_MIN_SUPPORTS_PER_CORE,
  MONTHLY_MAX_SUPPORTS_PER_CORE,
  hasRequiredMonthlySupportRelations,
  monthlyCorePartOfSpeech,
  requiredSupportRelationsFor,
  type MonthlyCurriculumInput
} from "../src/monthly/index.js";

function inputFor(month = "2026-11"): MonthlyCurriculumInput {
  const calendar = buildMonthlyCalendar(month);
  const newDays = calendar.effectiveDays.flatMap((_date, index) => monthlyDayKind(index + 1, calendar) === "new" ? [index + 1] : []);
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
    supportTerms: Array.from({ length: newDays.length * 27 }, (_, index) => {
      const coreIndex = Math.floor(index / 9);
      const relation = (["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const)[index % 9]!;
      return {
        id: `support-${index + 1}`,
        word: `support${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`,
        meaning: `Từ mở rộng ${index + 1}`,
        type: "noun",
        relation,
        source: (relation === "umbrella" ? "group" : relation === "word_family" ? "family" : relation === "collocation" ? "example" : relation) as "example" | "family" | "synonym" | "antonym" | "group",
        dayNumber: newDays[Math.floor(coreIndex / 3)]!,
        relatedCoreTermId: `core-${coreIndex + 1}`
      };
    }),
    grammarTopics: Array.from({ length: 2 }, (_, index) => ({
      id: `grammar-${index + 1}`,
      title: `Grammar ${index + 1}`,
      steps: [1, 2, 3].map((step) => ({ id: `grammar-${index + 1}-step-${step}`, focus: `Focus ${index + 1}.${step}`, formula: "subject + verb", usage: "Use in a work sentence.", examples: ["I check the cost.", "We review the budget.", "They confirm the forecast."] }))
    })),
    sounds: Array.from({ length: 4 }, (_, index) => ({
      id: `sound-${index + 1}`,
      ipa: ["/iː/", "/ɪ/", "/θ/", "/ʃ/"][index]!,
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
    supportTerms: Array.from({ length: 432 }, (_, index) => ({
      id: `support-${index + 1}`,
      word: `support${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`,
      meaning: `Từ mở rộng ${index + 1}`,
      type: "noun",
      relation: (["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const)[index % 9]!,
      source: (["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const)[index % 9] === "umbrella" ? "group" as const : (["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const)[index % 9] === "word_family" ? "family" as const : (["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const)[index % 9] === "collocation" ? "example" as const : (["umbrella", "synonym", "antonym", "word_family", "umbrella", "synonym", "antonym", "word_family", "collocation"] as const)[index % 9] as "synonym" | "antonym",
      component: "expanded" as const,
      relatedCoreTermId: `core-${Math.floor(index / 9) + 1}`
    })),
    grammarTopics: input.grammarTopics,
    sounds: input.sounds
  };
}

describe("monthly curriculum contract", () => {
  it.each(["A1", "A2", "B1", "B2", "C1"] as const)("carries frozen illustrations from the %s pool into daily and review vocabulary", (cefr) => {
    const pool = poolFor();
    pool.cefr = cefr;
    const imageUrl = "/api/v1/files/content-media/read?artifactKey=content-media%2Fclient.png";
    pool.coreTerms[0]!.imageUrl = imageUrl;
    const contract = planMonthlyResourcePool(pool);
    expect(contract.coreTerms[0]!.imageUrl).toBe(imageUrl);
    for (const kind of ["new", "review"] as const) {
      const day = contract.daySpecs.find(day => (kind === "new" ? day.coreTermIds : day.reviewTermIds).includes(pool.coreTerms[0]!.id))!;
      expect(day.kind).toBe(kind);
      const ids = kind === "new" ? day.coreTermIds : day.reviewTermIds;
      const cores = contract.coreTerms.filter(core => ids.includes(core.id));
      const [part] = withMonthlyExpandedTerms([{ code: "vocabulary", content: { items: [{ word: pool.coreTerms[0]!.word }] } }], cores, []);
      expect(part!.content.items[0]).toMatchObject({ imageUrl, imageAttribution: { licence: "Nội dung nội bộ" } });
    }
  });

  it("rejects plans with unbalanced semantic coverage or incorrect grammar and pronunciation progression", () => {
    const contract = planMonthlyResourcePool(poolFor());
    const invalidRelations = structuredClone(contract);
    const linkedSupports = invalidRelations.supportTerms.filter((term) => term.relatedCoreTermId === invalidRelations.coreTerms[0]!.id);
    // A noun core needs an umbrella and a synonym; drop both of its umbrellas.
    linkedSupports[0]!.relation = "collocation";
    linkedSupports[4]!.relation = "collocation";
    expect(validateMonthlyCurriculum(invalidRelations).join(" ")).toContain("needs umbrella and synonym supports");

    const invalidGrammar = structuredClone(contract);
    invalidGrammar.daySpecs[2]!.grammarStepIds = ["grammar-1-step-1"];
    expect(validateMonthlyCurriculum(invalidGrammar).join(" ")).toContain("does not follow the monthly grammar progression");

    const invalidSound = structuredClone(contract);
    invalidSound.daySpecs[3]!.soundId = "grammar-1-step-1";
    expect(validateMonthlyCurriculum(invalidSound).join(" ")).toContain("does not follow the pronunciation roadmap");
  });

  it("reports a plan stored before skillExercises existed instead of crashing", () => {
    const legacy = structuredClone(planMonthlyResourcePool(poolFor())) as unknown as { daySpecs: Array<Record<string, unknown>> };
    for (const day of legacy.daySpecs) delete day.skillExercises;
    const errors = validateMonthlyCurriculum(legacy as unknown as Parameters<typeof validateMonthlyCurriculum>[0]);
    expect(errors.join(" ")).toContain("has no skill exercise plan");
  });

  it("allocates nine linked supports per core, grammar progression, reviews, and six exercise slots on approval", () => {
    const contract = planMonthlyResourcePool(poolFor());
    const newDays = contract.daySpecs.filter((day) => day.kind === "new");
    const reviewDays = contract.daySpecs.filter((day) => day.kind === "review");

    expect(newDays).toHaveLength(16);
    const exerciseCodes = ["listening", "reading", "writing", "word_class", "word_use", "speaking"];
    expect(newDays.every((day) => day.skillExercises.map((item) => item.exerciseCode).sort().join(",") === exerciseCodes.toSorted().join(","))).toBe(true);
    expect(contract.grammarTopics).toHaveLength(2);
    expect(contract.grammarTopics.every((topic) => topic.steps.length === 3)).toBe(true);
    expect(contract.sounds.map((sound) => newDays.slice(0, 12).filter((day) => day.soundId === sound.id).length)).toEqual([3, 3, 3, 3]);
    expect(newDays.slice(12).every(day => day.pronunciationPlan?.targetIds.length === 4)).toBe(true);
    expect(newDays[0]?.grammarStepIds).toEqual(["grammar-1-step-1"]);
    expect(newDays[5]?.grammarStepIds).toEqual(["grammar-1-step-3"]);
    expect(newDays[6]?.grammarStepIds).toEqual(["grammar-2-step-1"]);
    expect(newDays[11]?.grammarStepIds).toEqual(["grammar-2-step-3"]);
    expect(newDays[12]?.grammarStepIds).toEqual(["grammar-1-step-3", "grammar-2-step-3"]);
    expect(newDays[15]?.grammarStepIds).toEqual(["grammar-1-step-3", "grammar-2-step-3"]);
    for (const day of newDays) {
      expect(day.coreTermIds).toHaveLength(3);
      expect(new Set(day.coreTermIds).size).toBe(3);
      expect(day.expandedTermIds).toHaveLength(27);
      expect(day.expandedTermIds.every((id) => contract.supportTerms.find((term) => term.id === id)?.relatedCoreTermId && day.coreTermIds.includes(contract.supportTerms.find((term) => term.id === id)!.relatedCoreTermId))).toBe(true);
      for (const coreId of day.coreTermIds) {
        const linked = contract.supportTerms.filter((term) => term.relatedCoreTermId === coreId);
        expect(linked).toHaveLength(9);
        expect(new Set(linked.map((term) => term.relation))).toEqual(new Set(["umbrella", "synonym", "antonym", "word_family", "collocation"]));
      }
      expect(day.skillExercises).toHaveLength(6);
      expect(day.skillExercises.every((exercise) => exercise.focus.length > 0 && exercise.resourceIds.length > 0 && exercise.resourceIds.every((id) => [...day.coreTermIds, ...day.expandedTermIds].includes(id)))).toBe(true);
    }
    expect(reviewDays.map((day) => day.lessonNumber)).toEqual([5, 10, 15, 20]);
    for (const day of reviewDays) {
      expect(day.reviewTermIds).toHaveLength(12);
      expect(day.reviewExpandedTermIds).toHaveLength(108);
      expect(day.coreTermIds).toEqual([]);
      expect(day.expandedTermIds).toEqual([]);
      expect(day.skillExercises).toHaveLength(6);
      expect(day.skillExercises.every((exercise) => exercise.resourceIds.every((id) => [...day.reviewTermIds, ...day.reviewExpandedTermIds].includes(id)))).toBe(true);
    }
  });

  it("schedules weekly reviews on Fridays and leaves a month-start Friday as a non-gating carryover review", () => {
    const november = buildMonthlyCalendar("2026-11");
    const novemberReviews = november.effectiveDays.filter((_, index) => monthlyDayKind(index + 1, november) === "review");
    expect(novemberReviews).toEqual(["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);

    const mayInput = inputFor("2026-05");
    const may = buildMonthlyCurriculum(mayInput);
    expect(may.daySpecs[0]).toMatchObject({
      date: "2026-05-01",
      kind: "review",
      reviewFromPreviousMonth: true,
      reviewGatesNextWeek: false,
      reviewTermIds: [],
      reviewExpandedTermIds: []
    });
    expect(may.daySpecs.find((day) => day.date === "2026-05-08")?.kind).toBe("review");
  });

  it("idempotently repairs a legacy approved plan only when resource IDs prove its links", () => {
    const current = planMonthlyResourcePool(poolFor());
    const legacy = structuredClone(current) as unknown as { cefr: string; coreTerms: Array<Record<string, unknown>>; supportTerms: Array<Record<string, unknown>>; daySpecs: Array<Record<string, unknown>> };
    legacy.cefr = "A2";
    const coreId = (id: unknown) => `a2-core-${String(id).replace("core-", "")}`;
    const supportId = (id: unknown) => `a2-expanded-${String(id).replace("support-", "")}`;
    legacy.coreTerms.forEach((term) => { term.id = coreId(term.id); });
    for (const term of legacy.supportTerms) { delete term.relatedCoreTermId; delete term.relation; }
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
    expect(repaired.daySpecs.filter((day) => day.kind === "new").every((day) => day.expandedTermIds.length === 27 && day.skillExercises.length === 6)).toBe(true);
    expect(repaired.coreTerms.map(({ word, meaning, type, ipa }) => ({ word, meaning, type, ipa }))).toEqual(current.coreTerms.map(({ word, meaning, type, ipa }) => ({ word, meaning, type, ipa })));
    expect(repaired.supportTerms.map(({ word, meaning, type, source, relation }) => ({ word, meaning, type, source, relation }))).toEqual(current.supportTerms.map(({ word, meaning, type, source, relation }) => ({ word, meaning, type, source, relation })));
    expect(repaired.grammarTopics).toEqual(current.grammarTopics);
    expect(repaired.sounds).toEqual(current.sounds);
    expect(backfillMonthlyCurriculumPlan(repaired)).toEqual(repaired);

    const unsafe = structuredClone(legacy);
    unsafe.supportTerms[0]!.id = "a2-expanded-99";
    expect(() => backfillMonthlyCurriculumPlan(unsafe)).toThrow(/IDs do not prove/u);

    const oldThreeSupportPool = structuredClone(legacy);
    oldThreeSupportPool.supportTerms.splice(144);
    for (const day of oldThreeSupportPool.daySpecs) {
      delete day.expandedTermIds;
      delete day.reviewExpandedTermIds;
      delete day.skillExercises;
    }
    expect(() => backfillMonthlyCurriculumPlan(oldThreeSupportPool)).toThrow(/complete nine-supports-per-core pool/u);
  });

  it("reserves the final weekday in November 2026 for the monthly exam, with 48 core terms and scheduled reviews", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());

    expect(curriculum.daySpecs).toHaveLength(20);
    expect(curriculum.coreTerms).toHaveLength(48);
    expect(curriculum.coreTerms[0]).toMatchObject({ source: "core_registry", component: "core", dayNumber: 1 });
    expect(curriculum.supportTerms[0]).toMatchObject({ type: "noun", source: "group", component: "expanded", dayNumber: 1, relatedCoreTermId: "core-1", relation: "umbrella" });
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
      expect(day.reviewExpandedTermIds).toHaveLength(108);
      const earlierNewTerms = curriculum.daySpecs
        .filter((candidate) => candidate.lessonNumber < day.lessonNumber && candidate.kind === "new")
        .flatMap((candidate) => candidate.coreTermIds);
      expect(day.reviewTermIds.every((id) => earlierNewTerms.includes(id))).toBe(true);
    }
    expect(validateMonthlyCurriculum(curriculum)).toEqual([]);
  });

  it("uses calendar Fridays for weekly review slots and new lesson ordinals", () => {
    const calendar = buildMonthlyCalendar("2026-11");
    const reviewDates = calendar.effectiveDays.filter((_, index) => monthlyDayKind(index + 1, calendar) === "review");
    expect(reviewDates).toEqual(["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
    expect(calendar.effectiveDays.filter((_, index) => monthlyDayKind(index + 1, calendar) === "new")).toHaveLength(16);
    expect(monthlyNewLessonOrdinal(6, calendar)).toBe(5);
    expect(monthlyNewLessonOrdinal(20, calendar)).toBeNull();
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
      vocabularyCount: 48, expandedVocabularyCount: 432, grammarTopicCount: 2, pronunciationSoundCount: 4
    });
    expect(recommendedMonthlyResourceCriteria("2026-11", "C1")).toEqual({
      vocabularyCount: 48, expandedVocabularyCount: 432, grammarTopicCount: 2, pronunciationSoundCount: 4
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

  it("allows no more than thirty-five percent repeated expanded entries while keeping all core terms distinct", () => {
    const input = inputFor();
    const curriculum = buildMonthlyCurriculum(input);
    const allowed = structuredClone(curriculum);
    for (let index = 0; index < 151; index += 1) allowed.supportTerms[allowed.supportTerms.length - 1 - index]!.word = allowed.supportTerms[0]!.word;
    expect(validateMonthlyCurriculum(allowed)).toEqual([]);

    const excessive = structuredClone(allowed);
    excessive.supportTerms[excessive.supportTerms.length - 152]!.word = excessive.supportTerms[0]!.word;
    expect(validateMonthlyCurriculum(excessive)).toContain("Expanded resources repeat more than 35% of the monthly total");
  });

  describe("VH-R33 support pool rules", () => {
    /** One umbrella, one synonym and one word_family per core (positions 0, 1, 3 of the fixture relation cycle). */
    function threeSupportPool(): Parameters<typeof planMonthlyResourcePool>[0] {
      const pool = poolFor();
      return { ...pool, supportTerms: pool.supportTerms.filter((_term, index) => [0, 1, 3].includes(index % 9)) };
    }

    it("keeps three supports as the per-core minimum and nine as the maximum", () => {
      expect(MONTHLY_MIN_SUPPORTS_PER_CORE).toBe(3);
      expect(MONTHLY_MAX_SUPPORTS_PER_CORE).toBe(9);
    });

    it("derives the required relations from the core's part of speech (WordNet model)", () => {
      expect(requiredSupportRelationsFor("noun")).toEqual(["umbrella", "synonym"]);
      expect(requiredSupportRelationsFor("verb")).toEqual(["synonym", "word_family"]);
      expect(requiredSupportRelationsFor("adjective")).toEqual(["synonym", "word_family"]);
      expect(requiredSupportRelationsFor("Adverb")).toEqual(["synonym", "word_family"]);
      // An unknown or mixed label keeps the strict legacy trio.
      expect(requiredSupportRelationsFor("noun/verb")).toEqual(["umbrella", "synonym", "word_family"]);
      expect(requiredSupportRelationsFor("")).toEqual(["umbrella", "synonym", "word_family"]);
      expect(monthlyCorePartOfSpeech("adj.")).toBe("adjective");
      expect(monthlyCorePartOfSpeech("phrasal verb")).toBe("verb");

      const relations = (...list: string[]) => list.map((relation) => ({ relation }));
      expect(hasRequiredMonthlySupportRelations("noun", relations("umbrella", "synonym", "antonym"))).toBe(true);
      expect(hasRequiredMonthlySupportRelations("noun", relations("synonym", "word_family", "antonym"))).toBe(false);
      expect(hasRequiredMonthlySupportRelations("verb", relations("synonym", "word_family", "collocation"))).toBe(true);
      expect(hasRequiredMonthlySupportRelations("verb", relations("umbrella", "synonym", "collocation"))).toBe(false);
      expect(hasRequiredMonthlySupportRelations("adjective", relations("umbrella", "synonym", "antonym"))).toBe(false);
    });

    it("accepts a noun core without a word family and a verb core without an umbrella", () => {
      const pool = threeSupportPool();
      // core-1 (noun): umbrella, synonym, antonym — no word family.
      pool.supportTerms[2]!.relation = "antonym";
      // core-2 becomes a verb: synonym, word family, collocation — no umbrella.
      pool.coreTerms[1]!.type = "verb";
      pool.supportTerms[3]!.relation = "collocation";
      const contract = planMonthlyResourcePool(pool);
      expect(validateMonthlyCurriculum(contract)).toEqual([]);
    });

    it("rejects a verb core without a word family and a noun core without an umbrella", () => {
      const verbWithoutFamily = threeSupportPool();
      verbWithoutFamily.coreTerms[0]!.type = "verb";
      verbWithoutFamily.supportTerms[2]!.relation = "antonym";
      expect(() => planMonthlyResourcePool(verbWithoutFamily)).toThrow(/core-1 needs synonym and word-family supports/u);

      const nounWithoutUmbrella = threeSupportPool();
      nounWithoutUmbrella.supportTerms[0]!.relation = "antonym";
      expect(() => planMonthlyResourcePool(nounWithoutUmbrella)).toThrow(/core-1 needs umbrella and synonym supports/u);

      const contract = planMonthlyResourcePool(threeSupportPool());
      const verbContract = structuredClone(contract);
      verbContract.coreTerms.find((core) => core.id === "core-2")!.type = "verb";
      verbContract.supportTerms.find((term) => term.relatedCoreTermId === "core-2" && term.relation === "word_family")!.relation = "collocation";
      expect(validateMonthlyCurriculum(verbContract)).toContain("Core term core-2 needs synonym and word-family supports");
    });

    it("accepts a pool with exactly three supports per core, one per required relation", () => {
      const contract = planMonthlyResourcePool(threeSupportPool());
      expect(contract.supportTerms).toHaveLength(48 * 3);
      expect(validateMonthlyCurriculum(contract)).toEqual([]);
      expect(contract.daySpecs.filter((day) => day.kind === "new").every((day) => day.expandedTermIds.length === 9)).toBe(true);
    });

    it("still accepts previously valid six-to-nine support pools", () => {
      const pool = poolFor();
      const sixPerCore = { ...pool, supportTerms: pool.supportTerms.filter((_term, index) => index % 9 < 6) };
      expect(validateMonthlyCurriculum(planMonthlyResourcePool(sixPerCore))).toEqual([]);
      expect(validateMonthlyCurriculum(planMonthlyResourcePool(pool))).toEqual([]);
    });

    it("rejects a core that misses a required relation or has fewer than three supports", () => {
      const missingSynonym = threeSupportPool();
      missingSynonym.supportTerms[1]!.relation = "antonym";
      expect(() => planMonthlyResourcePool(missingSynonym)).toThrow(/core-1 needs umbrella and synonym supports/u);

      const contract = planMonthlyResourcePool(threeSupportPool());
      const invalid = structuredClone(contract);
      invalid.supportTerms.find((term) => term.relatedCoreTermId === "core-2" && term.relation === "umbrella")!.relation = "collocation";
      expect(validateMonthlyCurriculum(invalid)).toContain("Core term core-2 needs umbrella and synonym supports");

      // A core whose part of speech cannot be read keeps the legacy trio.
      const unknownType = threeSupportPool();
      unknownType.coreTerms[0]!.type = "noun/verb";
      unknownType.supportTerms[2]!.relation = "antonym";
      expect(() => planMonthlyResourcePool(unknownType)).toThrow(/core-1 needs umbrella, synonym, and word-family supports/u);

      const twoSupports = threeSupportPool();
      twoSupports.supportTerms.splice(0, 1);
      expect(() => planMonthlyResourcePool(twoSupports)).toThrow(/core-1 must have 3-9 related expanded terms/u);
    });

    it("accepts repeated supports at the 35% boundary and rejects one more", () => {
      const total = 48 * 3;
      const ceiling = maxMonthlySupportRepeats(total);
      expect(ceiling).toBe(50);
      const withRepeats = (repeats: number) => {
        const pool = threeSupportPool();
        for (let index = 3; index < 3 + repeats; index += 1) pool.supportTerms[index]!.word = pool.supportTerms[0]!.word;
        return pool;
      };
      const atCeiling = planMonthlyResourcePool(withRepeats(ceiling));
      expect(validateMonthlyCurriculum(atCeiling)).toEqual([]);
      expect(() => planMonthlyResourcePool(withRepeats(ceiling + 1))).toThrow(/repeat more than 35% of the monthly total/u);
      const overCeiling = structuredClone(atCeiling);
      overCeiling.supportTerms[3 + ceiling]!.word = overCeiling.supportTerms[0]!.word;
      expect(validateMonthlyCurriculum(overCeiling)).toContain("Expanded resources repeat more than 35% of the monthly total");
    });

    it("classifies support levels within one CEFR step, clamped at A1 and C1", () => {
      expect(allowedMonthlySupportLevels("A1")).toEqual(["A1", "A2"]);
      expect(allowedMonthlySupportLevels("B1")).toEqual(["A2", "B1", "B2"]);
      expect(allowedMonthlySupportLevels("C1")).toEqual(["B2", "C1"]);
      expect(monthlySupportLevelBand("B1", undefined)).toBe("same");
      expect(monthlySupportLevelBand("B1", "B1")).toBe("same");
      expect(monthlySupportLevelBand("B1", "A2")).toBe("adjacent");
      expect(monthlySupportLevelBand("B1", "B2")).toBe("adjacent");
      expect(monthlySupportLevelBand("B1", "C1")).toBe("out_of_range");
      expect(monthlySupportLevelBand("A1", "B1")).toBe("out_of_range");
    });

    it("allows word family up to two levels above the month (clamped at C1) and any lower level", () => {
      expect(maxMonthlyWordFamilyLevel("A1")).toBe("B1");
      expect(maxMonthlyWordFamilyLevel("A2")).toBe("B2");
      expect(maxMonthlyWordFamilyLevel("B1")).toBe("C1");
      expect(maxMonthlyWordFamilyLevel("B2")).toBe("C1");
      expect(maxMonthlyWordFamilyLevel("C1")).toBe("C1");
      const family = (cefr?: "A1" | "A2" | "B1" | "B2" | "C1") => ({ relation: "word_family", cefr });
      expect(isMonthlySupportLevelAllowed("A1", family("B1"))).toBe(true);
      expect(isMonthlySupportLevelAllowed("A1", family("B2"))).toBe(false);
      expect(isMonthlySupportLevelAllowed("A2", family("B2"))).toBe(true);
      expect(isMonthlySupportLevelAllowed("A2", family("C1"))).toBe(false);
      expect(isMonthlySupportLevelAllowed("B2", family("A1"))).toBe(true);
      expect(isMonthlySupportLevelAllowed("A1", family(undefined))).toBe(true);
      // Other relations stay within one level.
      expect(isMonthlySupportLevelAllowed("A1", { relation: "synonym", cefr: "B1" })).toBe(false);
    });

    it("rejects a core level above the month and accepts the month level, lower levels and a missing label", () => {
      expect(isMonthlyCoreLevelAllowed("A1", "A2")).toBe(false);
      expect(isMonthlyCoreLevelAllowed("A1", "B2")).toBe(false);
      expect(isMonthlyCoreLevelAllowed("A1", "A1")).toBe(true);
      expect(isMonthlyCoreLevelAllowed("B1", "A2")).toBe(true);
      expect(isMonthlyCoreLevelAllowed("B1", undefined)).toBe(true);
    });

    it("accepts a word-family support two levels above and rejects one three levels above", () => {
      const pool = threeSupportPool();
      const familyIndex = pool.supportTerms.findIndex((term) => term.relation === "word_family");
      pool.supportTerms[familyIndex] = { ...pool.supportTerms[familyIndex]!, cefr: "B1" };
      expect(validateMonthlyCurriculum(planMonthlyResourcePool(pool))).toEqual([]);
      pool.supportTerms[familyIndex] = { ...pool.supportTerms[familyIndex]!, cefr: "B2" };
      expect(() => planMonthlyResourcePool(pool)).toThrow(/is CEFR B2; supports must be within one level of A1; word family may be up to B1/u);
    });

    it("accepts and records an adjacent-level support and rejects one two levels away", () => {
      const adjacent = threeSupportPool();
      adjacent.supportTerms[0] = { ...adjacent.supportTerms[0]!, cefr: "A2" };
      const contract = planMonthlyResourcePool(adjacent);
      expect(contract.supportTerms[0]!.cefr).toBe("A2");
      expect(contract.supportTerms[1]).not.toHaveProperty("cefr");
      expect(validateMonthlyCurriculum(contract)).toEqual([]);

      const tooFar = threeSupportPool();
      tooFar.supportTerms[0] = { ...tooFar.supportTerms[0]!, cefr: "B1" };
      expect(() => planMonthlyResourcePool(tooFar)).toThrow(/support-1 is CEFR B1; supports must be within one level of A1; word family may be up to B1/u);
      const tamperedContract = structuredClone(contract);
      tamperedContract.supportTerms[0]!.cefr = "B2";
      expect(validateMonthlyCurriculum(tamperedContract)).toContain("Expanded term support-1 is CEFR B2; supports must be within one level of A1; word family may be up to B1");
    });
  });

  it("keeps support terms outside core and proposes the first ten pending days without replacing authored days", () => {
    const curriculum = buildMonthlyCurriculum(inputFor());
    const statuses = new Map(curriculum.daySpecs.map((day) => [day.lessonNumber, day.lessonNumber === 2 ? "draft" : day.lessonNumber === 3 ? "approved" : "pending"] as const));

    expect(curriculum.supportTerms.map((term) => term.id)).toHaveLength(432);
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
