import { buildMonthlyCalendar, monthlyDayKind, planMonthlyResourcePool, validateMonthlyCurriculum } from "@e4s/domain";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import { isValidMonthlyPronunciationIpaTarget } from "./monthly-resource-plan-spec.js";
import {
  buildMonthlyResourcesFromAiPlan,
  getMonthlyGrammarPhaseIssues,
  buildMonthlyGrammarPhasePrompt,
  runMonthlyGrammarPhaseWithRetry,
  MonthlyResourceCriteriaError,
  MonthlyResourcePlanError,
  buildMonthlyPronunciationDistinctnessConstraint,
  buildMonthlyPronunciationSchemaRepairIssue,
  getMonthlyPronunciationTargetIssue,
  buildMonthlyCoreCandidatesPrompt,
  selectMonthlyCoreCandidates,
  selectMonthlyPronunciationCandidates,
  selectMonthlySupportCandidates
} from "./monthly-resource-generation.js";

const month = "2026-11";
const calendar = buildMonthlyCalendar(month);
const newLessonDays = calendar.effectiveDays
  .flatMap((_date, index) => monthlyDayKind(index + 1, calendar.lessonCount) === "new" ? [index + 1] : []);
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
function criteriaFor(targetMonth: string) {
  const targetCalendar = buildMonthlyCalendar(targetMonth);
  const newCount = targetCalendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, targetCalendar.lessonCount) === "new").length;
  return { vocabularyCount: newCount * 3, expandedVocabularyCount: newCount * 9, grammarTopicCount: 2, pronunciationSoundCount: 4 };
}

function planFor(targetMonth = month): MonthlyResourcePlanTaskOutput {
  const targetCalendar = buildMonthlyCalendar(targetMonth);
  const targetNewLessonDays = targetCalendar.effectiveDays
    .flatMap((_date, index) => monthlyDayKind(index + 1, targetCalendar.lessonCount) === "new" ? [index + 1] : []);
  return {
    coreTerms: targetNewLessonDays.flatMap((_dayNumber, dayIndex) => Array.from({ length: 3 }, (_, itemIndex) => ({
      id: `core-${dayIndex + 1}-${itemIndex + 1}`,
      word: `core${String.fromCharCode(97 + dayIndex)}${String.fromCharCode(97 + itemIndex)}`,
      meaning: `Từ cốt lõi ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      ipa: "/kɔːr/"
    }))),
    expandedTerms: targetNewLessonDays.flatMap((_dayNumber, dayIndex) => Array.from({ length: 9 }, (_, itemIndex) => ({
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
      words: Array.from({ length: Math.ceil(targetCalendar.lessonCount / 4) * 3 }, (_, wordIndex) => ({ word: `term${targetIndex + 1}${String.fromCharCode(97 + Math.floor(wordIndex / 26))}${String.fromCharCode(97 + wordIndex % 26)}`, ipa: "/s/" }))
    }))
  };
}

function planErrors(action: () => unknown): string[] {
  try {
    action();
  } catch (error) {
    if (error instanceof MonthlyResourcePlanError) return [...error.errors];
    throw error;
  }
  throw new Error("Expected resource plan validation to fail");
}

describe("monthly AI resource generation", () => {
  it("selects three unique core headwords from ordered AI candidates and reports collisions", () => {
    const result = selectMonthlyCoreCandidates({
      candidates: [
        { id: "c1", word: "accomplish", meaning: "", type: "verb", ipa: "/əˈkɑːmplɪʃ/" },
        { id: "c2", word: "review", meaning: "", type: "noun", ipa: "/rɪˈvjuː/" },
        { id: "c3", word: "review", meaning: "", type: "noun", ipa: "/rɪˈvjuː/" },
        { id: "c4", word: "incremental improvement", meaning: "", type: "noun", ipa: "/ˌɪnkrəˈmentəl/" },
        { id: "c5", word: "mitigate", meaning: "", type: "verb", ipa: "/ˈmɪtɪɡeɪt/" },
        { id: "c6", word: "allocate", meaning: "", type: "verb", ipa: "/ˈæləkeɪt/" },
        { id: "c7", word: "constraint", meaning: "", type: "noun", ipa: "/kənˈstreɪnt/" }
      ],
      existingCoreWords: new Set(["accomplish", "incremental", "tangible"]),
      needed: 3
    });

    expect(result.selected.map((term) => term.word)).toEqual(["review", "mitigate", "allocate"]);
    expect(result.rejected).toContain("accomplish -> accomplish (duplicates an existing core term)");
    expect(result.rejected).toContain("review -> review (duplicates another candidate in this core batch)");
    expect(result.rejected).toContain("incremental improvement -> incremental improvement (must be one standalone lexical headword)");
  });

  it("repairs a six-word collision on a later core slice without relaxing uniqueness", () => {
    const collisions = ["articulate", "ambiguous", "candid", "contingency", "scrutinise", "pragmatic"];
    const existingCoreWords = new Set([...collisions, ...Array.from({ length: 18 }, (_, index) => `earlier${index}`)]);
    const rejected = selectMonthlyCoreCandidates({
      candidates: collisions.map((word, index) => ({ id: `candidate-${index}`, word, meaning: "", type: "noun", ipa: "/t/" })),
      existingCoreWords,
      needed: 3
    });
    expect(rejected.selected).toHaveLength(0);
    expect(rejected.rejected).toHaveLength(6);

    const retryPrompt = buildMonthlyCoreCandidatesPrompt({
      cefr: "C1",
      theme: "Project delivery",
      communicationGoal: "Report risks and negotiate changes",
      existingCoreWords: [...existingCoreWords],
      batchNumber: 9,
      rejectedWords: collisions,
      previousIssue: "six candidates collided with existing core terms"
    });
    for (const word of collisions) expect(retryPrompt).toContain(word);
    expect(retryPrompt).toContain("RETRY FOR CORE BATCH 9");
    expect(retryPrompt).toContain("six entirely different authentic standalone headwords");
    expect(retryPrompt).toContain("authentic, appropriate to CEFR C1");
  });

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

  it("selects at most one phrase and one support per relation for a core", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x1", word: "annual report", meaning: "", type: "noun", relation: "collocation", relatesToCoreId: "core-a" },
        { id: "x2", word: "client update", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x3", word: "priority", meaning: "", type: "noun", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x4", word: "schedule", meaning: "", type: "noun", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x5", word: "team", meaning: "", type: "noun", relation: "word_family", relatesToCoreId: "core-a" }
      ],
      coreId: "core-a",
      coreWords: new Set(["account"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 3
    });

    expect(result.selected.map((term) => term.word)).toEqual(["annual report", "priority", "team"]);
    expect(result.rejected).toContain("client update -> client update (allows only one phrase for this core; prefer standalone words)");
    expect(result.rejected).toContain("schedule -> schedule (duplicates the synonym relation for this core)");
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

  it("makes every previously accepted IPA and target an explicit retry exclusion", () => {
    const constraint = buildMonthlyPronunciationDistinctnessConstraint([
      { ipa: "/iː/", label: "long ee vowel", explanation: "A long close front vowel." }
    ], "The prior candidate /ɪ/ was rejected as too close to the accepted /iː/ target.");

    expect(constraint).toContain("HARD BANS");
    expect(constraint).toContain("/iː/ (long ee vowel;");
    expect(constraint).toContain("must not return /iː/");
    expect(constraint).toContain("The prior candidate /ɪ/ was rejected");
    expect(constraint).toContain("Choose a different phoneme or stress pattern");
  });

  it("requires a phoneme after a primary-stress-only target was accepted", () => {
    const previousTargets = [{ ipa: "/ˈ/", label: "primary stress", explanation: "Stress the first syllable." }];
    const duplicateIssue = getMonthlyPronunciationTargetIssue({ ipa: "/ˈ/" }, previousTargets);
    const constraint = buildMonthlyPronunciationDistinctnessConstraint(previousTargets, duplicateIssue);

    expect(duplicateIssue).toBe("target IPA /ˈ/ duplicates an earlier pronunciation target");
    expect(constraint).toContain("A stress-only marker target has already been accepted");
    expect(constraint).toContain("must be a real consonant or vowel phoneme");
    expect(constraint).toContain("do not return /ˈ/");
    expect(getMonthlyPronunciationTargetIssue({ ipa: "/ˌ/" }, previousTargets)).toContain("second stress-only target");
    expect(getMonthlyPronunciationTargetIssue({ ipa: "/t/" }, previousTargets)).toBeUndefined();
  });

  it("diagnoses mixed or mis-sized grammar responses and carries exact repair requirements", () => {
    const result = planFor();
    result.coreTerms = [result.coreTerms[0]!];
    result.grammarTopics = [result.grammarTopics[0]!];

    const issues = getMonthlyGrammarPhaseIssues(result);
    expect(issues).toContain("coreTerms must be empty (received 1)");
    expect(issues).toContain("grammarTopics must contain exactly 2 items (received 1)");
    expect(issues).toContain("expandedTerms must be empty (received 144)");
    expect(issues).toContain("pronunciationTargets must be empty (received 4)");

    const retryPrompt = buildMonthlyGrammarPhasePrompt(issues);
    expect(retryPrompt).toContain("Return exactly two grammarTopics");
    expect(retryPrompt).toContain("coreTerms, expandedTerms and pronunciationTargets must be empty arrays");
    expect(retryPrompt).toContain("Previous response rejected");
    expect(retryPrompt).toContain(issues.join("; "));
  });

  it("retries a mixed grammar response once with its concrete errors and accepts only a clean result", async () => {
    const mixed = planFor();
    mixed.coreTerms = [mixed.coreTerms[0]!];
    mixed.grammarTopics = [mixed.grammarTopics[0]!];
    const clean = planFor();
    clean.coreTerms = [];
    clean.expandedTerms = [];
    clean.pronunciationTargets = [];
    const prompts: string[] = [];
    const sequence = [mixed, clean];

    const result = await runMonthlyGrammarPhaseWithRetry(async (prompt) => {
      prompts.push(prompt);
      return sequence[prompts.length - 1]!;
    });

    expect(result).toBe(clean);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("coreTerms must be empty (received 1)");
    expect(prompts[1]).toContain("grammarTopics must contain exactly 2 items (received 1)");
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

  it("plans 20, 21, and 22 slots deterministically without assigning the draft pool", () => {
    const cases = [
      { month: "2026-11", slots: 20, newLessons: 16, reviews: [5, 10, 15, 20] },
      { month: "2026-01", slots: 21, newLessons: 17, reviews: [5, 10, 15, 21] },
      { month: "2026-07", slots: 22, newLessons: 18, reviews: [5, 10, 15, 22] }
    ];

    for (const schedule of cases) {
      const pool = buildMonthlyResourcesFromAiPlan(schedule.month, "A1", theme, criteriaFor(schedule.month), planFor(schedule.month));
      const draftSnapshot = structuredClone(pool);
      expect(pool).not.toHaveProperty("daySpecs");
      expect(pool.coreTerms.every((term) => !("dayNumber" in term))).toBe(true);
      expect(pool.supportTerms.every((term) => !("dayNumber" in term))).toBe(true);

      const contract = planMonthlyResourcePool(pool);
      expect(pool).toEqual(draftSnapshot);
      expect(contract.daySpecs).toHaveLength(schedule.slots);
      expect(contract.daySpecs.filter((day) => day.kind === "new")).toHaveLength(schedule.newLessons);
      expect(contract.daySpecs.filter((day) => day.kind === "review").map((day) => day.lessonNumber)).toEqual(schedule.reviews);
      for (const day of contract.daySpecs.filter((item) => item.kind === "new")) {
        expect(day.coreTermIds).toHaveLength(3);
        expect(contract.coreTerms.filter((term) => term.dayNumber === day.lessonNumber)).toHaveLength(3);
        expect(contract.supportTerms.filter((term) => term.dayNumber === day.lessonNumber)).toHaveLength(9);
      }
      for (const day of contract.daySpecs.filter((item) => item.kind === "review")) {
        expect(day.coreTermIds).toEqual([]);
        expect(day.reviewTermIds.every((id) => contract.daySpecs.some((prior) => prior.kind === "new" && prior.lessonNumber < day.lessonNumber && prior.coreTermIds.includes(id)))).toBe(true);
      }
      const newDays = contract.daySpecs.filter((day) => day.kind === "new");
      for (const day of newDays.slice(12, 15)) {
        expect(day.grammarStepIds).toEqual(["a1-grammar-1-step-3", "a1-grammar-2-step-3"]);
      }
    }
  });

  it("rejects edited pools with more than one phrase per core or over 25% phrases", () => {
    const invalidCore = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    invalidCore.coreTerms[0]!.word = "workflow management";
    expect(() => planMonthlyResourcePool(invalidCore)).toThrow(/standalone English headword/u);

    const multipleForCore = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    multipleForCore.supportTerms[0]!.word = "annual report";
    multipleForCore.supportTerms[1]!.word = "client update";
    expect(() => planMonthlyResourcePool(multipleForCore)).toThrow(/at most one multi-word expanded expression/u);

    const monthlyPhraseOverflow = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    for (let coreIndex = 0; coreIndex < 37; coreIndex += 1) {
      const suffix = `${String.fromCharCode(97 + Math.floor(coreIndex / 26))}${String.fromCharCode(97 + coreIndex % 26)}`;
      monthlyPhraseOverflow.supportTerms[coreIndex * 3]!.word = `client task${suffix}`;
    }
    expect(() => planMonthlyResourcePool(monthlyPhraseOverflow)).toThrow(/25% monthly limit/u);
  });

  it("rejects a plan that has anything other than two grammar topics", () => {
    const plan = planFor();
    plan.grammarTopics.push(structuredClone(plan.grammarTopics[0]!));

    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, plan)).toThrow(MonthlyResourcePlanError);
  });

  it("rejects non-headword cores, repeated grammar steps, and invalid target IPA", () => {
    const phraseCore = planFor();
    phraseCore.coreTerms[0]!.word = "customer update";
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, phraseCore))).toContain("Every core resource must be one standalone lexical headword.");

    const repeatedStep = planFor();
    repeatedStep.grammarTopics[0]!.steps[1]!.focus = repeatedStep.grammarTopics[0]!.steps[0]!.focus;
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, repeatedStep))).toContain("Grammar topic 1 needs a distinct focus for each progressive step.");

    const invalidIpa = planFor();
    invalidIpa.pronunciationTargets[0]!.ipa = "schwa";
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, invalidIpa))).toContain("Pronunciation target 1 needs a valid IPA target.");

    const repeatedTarget = planFor();
    repeatedTarget.pronunciationTargets[1]!.ipa = repeatedTarget.pronunciationTargets[0]!.ipa;
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, repeatedTarget))).toContain("Monthly resources need four distinct pronunciation targets.");
  });

  it("rejects the B1 combined prose IPA and accepts one exact IPA target", () => {
    const malformedB1Ipa = "/ˈnaʊn/ /ˈvɜːrb/ pattern: primary stress on syllable 1";
    expect(isValidMonthlyPronunciationIpaTarget("/ɪ/")).toBe(true);
    expect(isValidMonthlyPronunciationIpaTarget("/ˈ/ ")).toBe(true);
    expect(isValidMonthlyPronunciationIpaTarget(malformedB1Ipa)).toBe(false);
    expect(isValidMonthlyPronunciationIpaTarget("/θ/ and /ð/")).toBe(false);

    const invalidIpa = planFor();
    invalidIpa.pronunciationTargets[1]!.ipa = malformedB1Ipa;
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "B1", theme, criteria, invalidIpa))).toContain("Pronunciation target 2 needs a valid IPA target.");
  });

  it("repairs malformed pronunciation phase output with the observed field type and target count", () => {
    const repair = buildMonthlyPronunciationSchemaRepairIssue([
      { path: "pronunciationTargets", message: "Invalid input: expected array, received string" },
      { path: "pronunciationTargets", message: "Too big: expected string to have <=4 characters" }
    ]);

    expect(repair).toContain("pronunciationTargets must be an array containing exactly one target object");
    expect(repair).toContain("Invalid input: expected array, received string");
    expect(repair).toContain("Too big: expected string to have <=4 characters");
    expect(repair).toContain("keep coreTerms, expandedTerms and grammarTopics empty");
  });

  it("rejects AI pools that exceed one phrase per core or the global phrase ceiling", () => {
    const sameCorePhrases = planFor();
    sameCorePhrases.expandedTerms[0]!.word = "annual report";
    sameCorePhrases.expandedTerms[1]!.word = "client update";
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, sameCorePhrases))).toContain("Core core-1-1 has more than one multi-word support item.");

    const tooManyPhrases = planFor();
    for (let coreIndex = 0; coreIndex < 37; coreIndex += 1) {
      const suffix = `${String.fromCharCode(97 + Math.floor(coreIndex / 26))}${String.fromCharCode(97 + coreIndex % 26)}`;
      tooManyPhrases.expandedTerms[coreIndex * 3]!.word = `client task${suffix}`;
    }
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, tooManyPhrases))).toContain("Expanded phrases exceed the 25% ceiling; standalone words must remain the clear majority.");
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
