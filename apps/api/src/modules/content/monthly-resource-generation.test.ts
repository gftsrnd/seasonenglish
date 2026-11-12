import { buildMonthlyCalendar, maxMonthlySupportRepeats, monthlyDayKind, monthlyPronunciationCatalog, planMonthlyResourcePool, validateMonthlyCurriculum } from "@e4s/domain";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import { isValidMonthlyPronunciationIpaTarget, MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT, validateMonthlyResourcePlanShape } from "./monthly-resource-plan-spec.js";
import {
  buildMonthlyResourcesFromAiPlan,
  getMonthlyGrammarPhaseIssues,
  doesMonthlyPronunciationExampleMatch,
  buildMonthlyGrammarPhasePrompt,
  runMonthlyGrammarPhaseWithRetry,
  MonthlyResourceCriteriaError,
  MonthlyResourcePlanError,
  buildMonthlyPronunciationDistinctnessConstraint,
  buildMonthlyPronunciationSchemaRepairIssue,
  getMonthlyPronunciationTargetIssue,
  buildMonthlyCoreCandidatesPrompt,
  buildMonthlyOptionalSupportPrompt,
  buildMonthlySupportRelationAuditPrompt,
  buildMonthlySupportRelationCandidatePrompt,
  buildMonthlySupportLevelGuidance,
  CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS,
  hasSingleCoreSense,
  isCurrentMonthlyResourceCheckpointCategory,
  isGenuineWordFamily,
  keepExactMonthlySupportRelationCandidates,
  keepSemanticallyAuditedSupportCandidates,
  parseMonthlyResourceAiOutput,
  selectMonthlyCoreCandidates,
  selectMonthlyPronunciationCandidates,
  selectMonthlySupportCandidates,
  monthlySupportQualityIssue
} from "./monthly-resource-generation.js";

const month = "2026-11";
const calendar = buildMonthlyCalendar(month);
const newLessonDays = calendar.effectiveDays
  .flatMap((_date, index) => monthlyDayKind(index + 1, calendar) === "new" ? [index + 1] : []);
const vocabularyCount = newLessonDays.length * 3;
const expandedVocabularyCount = newLessonDays.length * 27;
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
  const newCount = targetCalendar.effectiveDays.filter((_date, index) => monthlyDayKind(index + 1, targetCalendar) === "new").length;
  return { vocabularyCount: newCount * 3, expandedVocabularyCount: newCount * 27, grammarTopicCount: 2, pronunciationSoundCount: 4 };
}

function planFor(targetMonth = month): MonthlyResourcePlanTaskOutput {
  const targetCalendar = buildMonthlyCalendar(targetMonth);
  const targetNewLessonDays = targetCalendar.effectiveDays
    .flatMap((_date, index) => monthlyDayKind(index + 1, targetCalendar) === "new" ? [index + 1] : []);
  return {
    coreTerms: targetNewLessonDays.flatMap((_dayNumber, dayIndex) => Array.from({ length: 3 }, (_, itemIndex) => ({
      id: `core-${dayIndex + 1}-${itemIndex + 1}`,
      word: `core${String.fromCharCode(97 + dayIndex)}${String.fromCharCode(97 + itemIndex)}`,
      meaning: `Từ cốt lõi ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      ipa: "/kɔːr/"
    }))),
    expandedTerms: targetNewLessonDays.flatMap((_dayNumber, dayIndex) => Array.from({ length: 27 }, (_, itemIndex) => ({
      id: `expanded-${dayIndex + 1}-${itemIndex + 1}`,
      word: `support${String.fromCharCode(97 + dayIndex)}${String.fromCharCode(97 + Math.floor(itemIndex / 26))}${String.fromCharCode(97 + itemIndex % 26)}`,
      meaning: `Từ mở rộng ${dayIndex + 1}-${itemIndex + 1}`,
      type: "noun",
      relation: (["umbrella", "synonym", "antonym", "word_family", "collocation", "umbrella", "synonym", "antonym", "word_family"] as const)[itemIndex % 9]!,
      relatesToCoreId: `core-${dayIndex + 1}-${Math.floor(itemIndex / 9) + 1}`
    }))),
    grammarTopics: [
      { id: "grammar-a", title: "Ngữ pháp A", steps: [1, 2, 3].map((step) => ({ id: `a-${step}`, focus: `Nền tảng ${step}`, dailyObjectives: [`Nhận diện cách dùng A bước ${step}`, `Vận dụng trong phản hồi A bước ${step}`], formula: "S + V", usage: "Dùng trong giao tiếp cơ bản.", examples: ["I confirm the plan.", "We check the file.", "They send the note."] })) },
      { id: "grammar-b", title: "Ngữ pháp B", steps: [1, 2, 3].map((step) => ({ id: `b-${step}`, focus: `Mở rộng ${step}`, dailyObjectives: [`Nhận diện cách dùng B bước ${step}`, `Vận dụng trong phản hồi B bước ${step}`], formula: "S + will + V", usage: "Dùng để nói về kế hoạch.", examples: ["I will call the client.", "We will review the file.", "They will share an update."] })) }
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
  it("invalidates core and support checkpoints when their contracts change", () => {
    const oldSupportLineage = { schemaVersion: "monthly-resource-category-v17-core-family-screen-current-pronunciation-system" };
    expect(isCurrentMonthlyResourceCheckpointCategory("coreTerms", oldSupportLineage)).toBe(false);
    expect(isCurrentMonthlyResourceCheckpointCategory("coreTerms", {
      schemaVersion: CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS.coreTerms
    })).toBe(true);
    expect(isCurrentMonthlyResourceCheckpointCategory("expandedTerms", oldSupportLineage)).toBe(false);
    expect(isCurrentMonthlyResourceCheckpointCategory("expandedTerms", {
      schemaVersion: "monthly-resource-category-v18-quota-free-support-relation-audit"
    })).toBe(false);
    expect(isCurrentMonthlyResourceCheckpointCategory("expandedTerms", {
      schemaVersion: "monthly-resource-category-v19-isolated-relation-generation"
    })).toBe(false);
    expect(isCurrentMonthlyResourceCheckpointCategory("expandedTerms", {
      schemaVersion: CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS.expandedTerms
    })).toBe(true);
  });

  it("uses a standalone, quota-free audit prompt for support relationships", () => {
    const prompt = buildMonthlySupportRelationAuditPrompt({
      core: { word: "bring", meaning: "mang lại, đưa đến", type: "verb" },
      candidates: [
        { id: "support-a", word: "brought", meaning: "đã mang lại", type: "verb", relation: "synonym", relatesToCoreId: "core-a" }
      ]
    });

    expect(prompt).toContain("AUDIT ONLY");
    expect(prompt).toContain("Do not generate, repair, rename, relabel, translate, or add candidates");
    expect(prompt).toContain("no minimum count, relation quota");
    expect(prompt).toContain('"word":"brought"');
    expect(prompt).toContain("normal substitution in at least one common sentence");
    expect(prompt).toContain("do not require the words to be interchangeable in every context");
    expect(prompt).not.toContain("Return exactly 12");
    expect(prompt).not.toContain("expandedVocabularyCount");
  });

  it("keeps correctly labeled candidates when one generated relation is mislabeled", () => {
    const candidates: MonthlyResourcePlanTaskOutput["expandedTerms"] = [
      { id: "right", word: "conversation", meaning: "cuộc trò chuyện", type: "noun", relation: "umbrella", relatesToCoreId: "core-call" },
      { id: "wrong-relation", word: "meeting", meaning: "cuộc họp", type: "noun", relation: "synonym", relatesToCoreId: "core-call" },
      { id: "wrong-core", word: "communication", meaning: "giao tiếp", type: "noun", relation: "umbrella", relatesToCoreId: "core-other" }
    ];

    expect(keepExactMonthlySupportRelationCandidates(candidates, "umbrella", "core-call")).toEqual([candidates[0]]);
  });

  it("keeps an approved support when the audit rewrites only its generated ID", () => {
    const candidate = {
      id: "generated-77",
      word: "workplace",
      meaning: "nơi làm việc",
      type: "noun",
      relation: "umbrella" as const,
      relatesToCoreId: "core-office"
    };
    expect(keepSemanticallyAuditedSupportCandidates([candidate], [{ ...candidate, id: "audit-1" }])).toEqual([candidate]);
    expect(keepSemanticallyAuditedSupportCandidates([candidate], [{ ...candidate, id: "audit-1", meaning: "tòa nhà" }])).toEqual([]);
  });

  it("ignores non-content top-level AI metadata while keeping resource arrays strict", () => {
    const output = { coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [], coreTerms_note: "generated note", expandedVocabularyCount: 12 };
    expect(parseMonthlyResourceAiOutput(output)).toEqual({ coreTerms: [], expandedTerms: [], grammarTopics: [], pronunciationTargets: [] });
    expect(() => parseMonthlyResourceAiOutput({ ...output, expandedTerms: [{ unexpected: true }] })).toThrow();
  });

  it("requests one required support relation at a time for every CEFR level", () => {
    for (const cefr of ["A1", "A2", "B1", "B2", "C1"] as const) {
      const prompt = buildMonthlySupportRelationCandidatePrompt({
        cefr,
        core: { id: "core-a", word: "quick", meaning: "nhanh", type: "adjective" },
        relation: "umbrella",
        theme: "Handling client feedback",
        forbiddenCoreWords: ["quick", "plan"],
        existingSupportWords: ["action", "activity"],
        sameCoreSupportWords: ["fast", "quickly"],
        rejectedCandidateWords: ["meeting"],
        previousIssue: "same-level peer, not a broader category"
      });

      expect(prompt).toContain(`CEFR ${cefr}`);
      expect(prompt).toContain("relation exactly `umbrella`");
      expect(prompt).toContain("override any general prompt that requests a different candidate count or mixed relations");
      expect(prompt).toContain("Do not produce synonym, antonym, word_family, or collocation entries");
      expect(prompt).toContain("If no genuine candidate exists, return an empty expandedTerms array");
      expect(prompt).toContain("Aim for at least six genuinely plausible candidates when that many exist");
      expect(prompt).toContain("quick (nhanh; adjective)");
      expect(prompt).toContain("Do not duplicate a support term already attached to this same core: fast; quickly");
      expect(prompt).toContain("Other umbrella candidates already generated and rejected for this core: meeting");
      expect(prompt).toContain("same-level peer, not a broader category");
      expect(prompt).toContain("reuse it for this core when the exact relation holds");
      expect(prompt).toContain("35% monthly repeat ceiling");
      expect(prompt).not.toContain("25% monthly repeat ceiling");
      expect(prompt).toContain("Do not reject or omit a genuine relation only because the word is one level above or below");
      expect(prompt).toContain("Set each expandedTerms item's cefr field");
      expect(prompt).toContain("same-level sibling");
    }
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).toContain("A single-relation support phase must return only that exact relation");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).not.toContain("return 12 ordered");
  });

  it("frames umbrellas by part of speech (WordNet) in both generation and audit prompts", () => {
    const shared = {
      cefr: "A1",
      core: { id: "core-write", word: "write", meaning: "viết", type: "verb" },
      theme: "At Work",
      forbiddenCoreWords: ["write"],
      existingSupportWords: []
    };
    const generationPrompt = buildMonthlySupportRelationCandidatePrompt({ ...shared, relation: "umbrella" });
    const auditPrompt = buildMonthlySupportRelationAuditPrompt({
      core: shared.core,
      candidates: []
    });
    // Verb: troponym parent, a more general VERB.
    expect(generationPrompt).toContain("Return only a more general VERB that this verb is a way of doing");
    expect(generationPrompt).toContain("“To write is a way to [candidate]”");
    expect(generationPrompt).toContain("email -> send, whisper -> speak, cancel -> stop, review -> check");
    expect(generationPrompt).toContain("Never return a noun category (activity, communication");
    expect(generationPrompt).toContain("The umbrella relation is optional for a verb");
    expect(auditPrompt).toContain("“To write is a way to [candidate]”");
    expect(auditPrompt).toContain("the candidate is a more general VERB");
    expect(auditPrompt).not.toContain("is a kind of [candidate]");
    expect(auditPrompt).not.toContain("office -> workplace");

    // Adjective/adverb: the attribute noun it describes.
    const adjective = { ...shared, core: { id: "core-small", word: "small", meaning: "nhỏ", type: "adjective" } };
    const adjectiveGeneration = buildMonthlySupportRelationCandidatePrompt({ ...adjective, relation: "umbrella" });
    expect(adjectiveGeneration).toContain("Return only the attribute NOUN this word describes: “small describes [candidate]”");
    expect(adjectiveGeneration).toContain("small -> size, easy -> difficulty, happy -> mood, late -> time");
    const adjectiveAudit = buildMonthlySupportRelationAuditPrompt({ core: adjective.core, candidates: [] });
    expect(adjectiveAudit).toContain("“small describes [candidate]”");
    expect(buildMonthlySupportRelationAuditPrompt({ core: { word: "late", meaning: "muộn", type: "adverb" }, candidates: [] })).toContain("“late describes [candidate]”");

    // Noun: hypernym, group noun phrase allowed.
    const noun = { ...shared, core: { id: "core-email", word: "email", meaning: "thư điện tử", type: "noun" } };
    const nounGeneration = buildMonthlySupportRelationCandidatePrompt({ ...noun, relation: "umbrella" });
    expect(nounGeneration).toContain("“A email is a kind of [candidate]”");
    expect(nounGeneration).toContain("natural two-to-four-word noun phrase");
    expect(nounGeneration).not.toContain("is optional");
    expect(buildMonthlySupportRelationAuditPrompt({ core: noun.core, candidates: [] })).toContain("“A email is a kind of [candidate]”");

    // Every umbrella prompt bans generic placeholders.
    for (const prompt of [generationPrompt, auditPrompt, adjectiveGeneration, adjectiveAudit, nounGeneration]) {
      expect(prompt).toContain("Never use a generic placeholder as an umbrella");
    }
    // A noun's word family is optional, a verb's is required.
    expect(buildMonthlySupportRelationCandidatePrompt({ ...noun, relation: "word_family" })).toContain("The word_family relation is optional for a noun");
    expect(buildMonthlySupportRelationCandidatePrompt({ ...shared, relation: "word_family" })).not.toContain("is optional");
  });

  it("requires the exact remaining support count while keeping antonyms optional", () => {
    const prompt = buildMonthlyOptionalSupportPrompt({
      cefr: "A1",
      core: { id: "core-help", word: "help", meaning: "giúp đỡ", type: "verb" },
      theme: "At Work",
      requestedCount: 3,
      forbiddenCoreWords: ["help", "work"],
      existingSupportWords: ["action", "activity"],
      sameCoreSupportWords: ["aid", "helper"],
      rejectedCandidateWords: ["timetable", "timebox"],
      previousIssue: "these were not genuine additional supports"
    });
    expect(prompt).toContain("generate up to 12 distinct authentic expandedTerms candidates");
    expect(prompt).toContain("select up to 3 additional valid supports");
    expect(prompt).toContain("The separately audited synonym and word-family supports required for this part of speech already exist");
    expect(prompt).toContain("the core needs at least 3 supports in total");
    expect(prompt).toContain("First check for a genuine umbrella support, which is optional for this part of speech");
    expect(prompt).toContain("“To <core> is a way to <umbrella>”");
    const nounPrompt = buildMonthlyOptionalSupportPrompt({ cefr: "A1", core: { id: "core-plan", word: "plan", meaning: "kế hoạch", type: "noun" }, theme: "At Work", requestedCount: 2, forbiddenCoreWords: [], existingSupportWords: [] });
    expect(nounPrompt).toContain("The separately audited umbrella and synonym supports required for this part of speech already exist");
    expect(nounPrompt).toContain("First check for a genuine word_family support");
    expect(prompt).toContain("the per-core total must never exceed 9");
    expect(prompt).not.toContain("at least six");
    expect(prompt).toContain("Support words may be at CEFR A1, A2");
    expect(prompt).toContain("antonyms are optional and must never be invented or forced");
    expect(prompt).toContain("Same-core supports already used: aid; helper");
    expect(prompt).toContain("Do not return previously rejected candidates: timetable; timebox");
    expect(prompt).toContain("Previous validation feedback: these were not genuine additional supports");
    expect(prompt).toContain("Other-core terms may be reused when they are a genuine fit");
    expect(prompt).toContain("35% monthly repeat ceiling");
  });

  it("selects the six valid mandatory and optional supports without requiring nine", () => {
    const candidates = [
      ["umbrella", "speed", "noun"], ["synonym", "fast", "adjective"], ["word_family", "quickly", "adverb"],
      ["word_family", "quickness", "noun"], ["antonym", "slow", "adjective"], ["synonym", "speedy", "adjective"]
    ] as const;
    const result = selectMonthlySupportCandidates({
      candidates: candidates.map(([relation, word, type], index) => ({ id: `q-${index}`, word, meaning: "", type, relation, relatesToCoreId: "core-a" })),
      coreId: "core-a",
      coreWord: "quick",
      coreType: "adjective",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 100,
      maxPhrasePlacements: 108,
      needed: 9
    });

    // Adjective cores take no umbrella (quality rule 2), so 5 of the 6 are kept.
    expect(result.selected).toHaveLength(5);
    expect(result.selected.map((term) => term.relation)).toEqual(expect.arrayContaining(["synonym", "word_family"]));
    expect(result.selected.some((term) => term.relation === "umbrella")).toBe(false);
    expect(result.rejected.some((issue) => issue.includes("missing required"))).toBe(false);
  });

  it("allows exact-sense umbrella nouns outside a fixed vocabulary list", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [{
        id: "reservation",
        word: "reservation",
        meaning: "việc đặt chỗ",
        type: "noun",
        relation: "umbrella",
        relatesToCoreId: "core-book"
      }],
      coreId: "core-book",
      coreWord: "book",
      coreType: "verb/noun",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 10,
      maxPhrasePlacements: 10,
      needed: 1
    });

    expect(result.selected.map((term) => term.word)).toEqual(["reservation"]);
    expect(result.rejected.some((issue) => issue.includes("missing required umbrella"))).toBe(false);
  });

  it("accepts a natural noun phrase as an umbrella candidate", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [{ id: "phone-conversation", word: "phone conversation", meaning: "cuộc trò chuyện qua điện thoại", type: "noun", relation: "umbrella", relatesToCoreId: "core-call" }],
      coreId: "core-call",
      coreWord: "call",
      coreType: "noun",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 10,
      maxPhrasePlacements: 10,
      needed: 1
    });

    expect(result.selected.map((term) => term.word)).toEqual(["phone conversation"]);
  });

  it("accepts true derived family forms but rejects semantic neighbors and inflections", () => {
    expect(isGenuineWordFamily("manage", "manager")).toBe(true);
    expect(isGenuineWordFamily("plan", "planning")).toBe(true);
    expect(isGenuineWordFamily("problem", "problematic")).toBe(true);
    expect(isGenuineWordFamily("happy", "happiness")).toBe(true);
    expect(isGenuineWordFamily("solution", "solve")).toBe(true);
    expect(isGenuineWordFamily("visible", "visibility")).toBe(true);
    expect(isGenuineWordFamily("idea", "ideal")).toBe(true);
    expect(isGenuineWordFamily("wall", "wallpaper")).toBe(true);
    expect(isGenuineWordFamily("sign", "signature")).toBe(true);
    expect(isGenuineWordFamily("client", "clientele")).toBe(true);
    expect(isGenuineWordFamily("feedback", "positive")).toBe(false);
    expect(isGenuineWordFamily("deadline", "due")).toBe(false);
    expect(isGenuineWordFamily("solution", "helpful")).toBe(false);
    expect(isGenuineWordFamily("project", "projects")).toBe(false);
  });

  it("keeps only support candidates the semantic auditor confirms without changing their relation", () => {
    const candidates = [
      { id: "x1", word: "time limit", meaning: "", type: "noun", relation: "umbrella" as const, relatesToCoreId: "core-a" },
      { id: "x2", word: "timeline", meaning: "", type: "noun", relation: "umbrella" as const, relatesToCoreId: "core-a" }
    ] as const;
    const audited = [
      { ...candidates[0]!, meaning: "", type: "noun" },
      { ...candidates[1]!, relation: "synonym" as const }
    ];
    expect(keepSemanticallyAuditedSupportCandidates(candidates, audited).map((term) => term.id)).toEqual(["x1"]);
  });

  it("selects nine linked resources with mandatory relation groups and caps any group at three", () => {
    const relationOrder = ["umbrella", "umbrella", "umbrella", "umbrella", "umbrella", "umbrella", "synonym", "synonym", "synonym", "antonym", "antonym", "antonym", "word_family", "word_family", "word_family", "collocation", "collocation", "collocation"] as const;
    const candidates = Array.from({ length: 18 }, (_, index) => ({
      id: `support-${index + 1}`,
      word: relationOrder[index] === "umbrella" ? ["action", "activity", "process", "task", "work", "operation"][index]!
        : relationOrder[index] === "word_family" && index === 12 ? "manager"
          : relationOrder[index] === "word_family" && index === 13 ? "management"
            : `term${String.fromCharCode(97 + index)}`,
      meaning: "",
      type: "noun",
      relation: relationOrder[index]!,
      relatesToCoreId: "core-a"
    }));
    const selection = selectMonthlySupportCandidates({
      candidates,
      coreId: "core-a",
      coreWord: "manage",
      coreType: "noun/verb",
      coreWords: new Set(["priority"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 9
    });
    expect(selection.selected).toHaveLength(9);
    const counts = new Map<string, number>();
    for (const term of selection.selected) counts.set(term.relation, (counts.get(term.relation) ?? 0) + 1);
    expect([...counts.keys()]).toEqual(expect.arrayContaining(["umbrella", "synonym", "word_family"]));
    expect([...counts.values()].every((count) => count <= 3)).toBe(true);
  });

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

  it("rejects a core candidate labelled above the month level and allows a missing or lower label", () => {
    const result = selectMonthlyCoreCandidates({
      candidates: [
        { id: "c1", word: "vague", meaning: "mơ hồ", type: "adjective", ipa: "/veɪɡ/", cefr: "B2" },
        { id: "c2", word: "editor", meaning: "biên tập viên", type: "noun", ipa: "/ˈedɪtər/", cefr: "A2" },
        { id: "c3", word: "email", meaning: "thư điện tử", type: "noun", ipa: "/ˈiːmeɪl/", cefr: "A1" },
        { id: "c4", word: "phone", meaning: "điện thoại", type: "noun", ipa: "/fəʊn/" }
      ],
      existingCoreWords: new Set(),
      needed: 3,
      cefr: "A1"
    });
    expect(result.selected.map((term) => term.word)).toEqual(["email", "phone"]);
    expect(result.rejected).toContain("vague -> vague (CEFR B2 is above the month level A1)");
    expect(result.rejected).toContain("editor -> editor (CEFR A2 is above the month level A1)");
    // Without a month level the label is not checked (legacy callers).
    expect(selectMonthlyCoreCandidates({ candidates: [{ id: "c1", word: "vague", meaning: "mơ hồ", type: "adjective", ipa: "/veɪɡ/", cefr: "B2" }], existingCoreWords: new Set(), needed: 1 }).selected).toHaveLength(1);
  });

  it("keeps a valid core CEFR label from AI output and drops an unusable one", () => {
    const parsed = parseMonthlyResourceAiOutput({
      coreTerms: [
        { id: "c1", word: "email", meaning: "thư", type: "noun", ipa: "/x/", cefr: "A1" },
        { id: "c2", word: "phone", meaning: "điện thoại", type: "noun", ipa: "/x/", cefr: "Z9" },
        { id: "c3", word: "desk", meaning: "bàn", type: "noun", ipa: "/x/" }
      ],
      expandedTerms: [], grammarTopics: [], pronunciationTargets: []
    });
    expect(parsed.coreTerms.map((term) => term.cefr)).toEqual(["A1", undefined, undefined]);
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
      previousIssue: "six candidates collided with existing core terms and the old headword had no genuine word-family item"
    });
    for (const word of collisions) expect(retryPrompt).toContain(word);
    expect(retryPrompt).toContain("RETRY FOR CORE BATCH 9");
    expect(retryPrompt).toContain("Return 6 entirely different authentic standalone headwords");
    expect(retryPrompt).toContain("the old headword had no genuine word-family item");
    expect(retryPrompt).toContain("Preserve every base requirement");
    expect(retryPrompt).toContain("Select only authentic level-appropriate English");
    expect(retryPrompt).toContain("Assign exactly one part of speech");
    expect(retryPrompt).toContain("one clear, common workplace sense");
    expect(retryPrompt).toContain("silently identify them for the exact meaning");
    expect(retryPrompt).toContain("a noun a genuine umbrella category and a natural same-sense synonym; a verb, adjective or adverb a natural same-sense synonym and a common derivational word-family item");
    expect(retryPrompt).toContain("“To <core> is a way to <umbrella>”");
    expect(retryPrompt).toContain("pay → payment");
    expect(retryPrompt).not.toContain("update → updater");
  });

  it("preflights mandatory relations before a core candidate can be selected", () => {
    const prompt = buildMonthlyCoreCandidatesPrompt({
      cefr: "A1",
      theme: "Handling Client Feedback",
      communicationGoal: "Respond to a client and agree on a next step",
      existingCoreWords: [],
      batchNumber: 1,
      candidateCount: 6,
      preflightRelations: true
    });
    expect(prompt).toContain("only their mandatory expandedTerms preflight edges");
    expect(prompt).toContain("For EVERY core candidate, return three authentic supports covering the relations its part of speech requires");
    expect(prompt).toContain("for a noun, one umbrella, one same-sense synonym, and one common word_family item when one exists");
    expect(prompt).toContain("for a verb, adjective or adverb, one same-sense synonym, one common word_family item, and one genuine umbrella when one exists");
    expect(prompt).toContain("linked using that candidate's exact coreTerms.id");
    expect(prompt).toContain("If a candidate cannot support the relations its part of speech requires, omit its core and all its edges");
    expect(prompt).toContain("“To <core> is a way to <umbrella>”");
    expect(prompt).toContain("“<core> describes <umbrella>”");
    expect(prompt).toContain("never the comparative or superlative of an adjective (smaller, easier)");
  });

  it("rejects headwords without a clear derivational family only when their part of speech needs one", () => {
    // A noun core needs no word family, so feedback and deadline are acceptable nouns.
    const nouns = selectMonthlyCoreCandidates({
      candidates: ["feedback", "deadline", "date"].map((word) => ({ id: word, word, meaning: "", type: "noun", ipa: "/t/" })),
      existingCoreWords: new Set(),
      needed: 3
    });
    expect(nouns.selected.map((term) => term.word)).toEqual(["feedback", "deadline", "date"]);
    const verb = selectMonthlyCoreCandidates({
      candidates: [{ id: "feedback", word: "feedback", meaning: "", type: "verb", ipa: "/t/" }],
      existingCoreWords: new Set(),
      needed: 1
    });
    expect(verb.selected).toHaveLength(0);
    expect(verb.rejected[0]).toContain("does not have a clear, common derivational word family");
  });

  it("rejects multi-sense core entries that confuse relation audits", () => {
    expect(hasSingleCoreSense("verb/noun", "đặt trước; cuốn sách")).toBe(false);
    expect(hasSingleCoreSense("verb", "đặt trước hoặc ghi vào sổ")).toBe(false);
    expect(hasSingleCoreSense("noun", "tài liệu giấy")).toBe(true);

    const result = selectMonthlyCoreCandidates({
      candidates: [
        { id: "book", word: "book", meaning: "đặt trước; cuốn sách", type: "verb/noun", ipa: "/bʊk/" },
        { id: "paper", word: "paper", meaning: "tài liệu giấy", type: "noun", ipa: "/ˈpeɪpə/" }
      ],
      existingCoreWords: new Set(),
      needed: 1
    });
    expect(result.selected.map((term) => term.word)).toEqual(["paper"]);
    expect(result.rejected[0]).toContain("one part of speech and one unambiguous Vietnamese meaning");
  });

  it("does not choose core headwords that collide with another core's derivational family", () => {
    const result = selectMonthlyCoreCandidates({
      candidates: [{ id: "meet", word: "meet", meaning: "gặp", type: "verb", ipa: "/miːt/" }],
      existingCoreWords: new Set(["meeting"]),
      needed: 1
    });
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0]).toContain("overlaps a derivational family");
  });

  it("uses POS checks while the exact-sense audit rejects false verb umbrellas", () => {
    const generated = [
        { id: "x1", word: "document", meaning: "tài liệu", type: "noun", relation: "umbrella" as const, relatesToCoreId: "core-a" },
        { id: "x4", word: "activity", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x5", word: "communication", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x6", word: "communicate", meaning: "", type: "verb", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x2", word: "write up", meaning: "", type: "verb", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x3", word: "writer", meaning: "", type: "noun", relation: "word_family", relatesToCoreId: "core-a" }
    ] as const;
    const candidates = keepSemanticallyAuditedSupportCandidates(generated, generated.filter((candidate) => candidate.id !== "x1"));
    const result = selectMonthlySupportCandidates({
      candidates,
      coreId: "core-a",
      coreWord: "write",
      coreType: "verb",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 3
    });
    // A verb's umbrella is a more general verb; a noun category or a generic placeholder is rejected.
    expect(result.selected.map((term) => term.word)).toEqual(["write up", "writer", "communicate"]);
    expect(candidates.map((term) => term.word)).not.toContain("document");
    expect(result.rejected).toContain("activity -> activity (is a generic placeholder, not a genuine umbrella for this core)");
    expect(result.rejected).toContain("communication -> communication (part of speech does not match the core sense for this relation)");
  });

  it("keeps no umbrella for an adjective core, even a valid attribute noun", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x0", word: "cautious", meaning: "thận trọng", type: "adjective", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x1", word: "property", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x4", word: "speed", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x2", word: "fast", meaning: "", type: "adjective", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x3", word: "quickly", meaning: "", type: "adverb", relation: "word_family", relatesToCoreId: "core-a" }
      ],
      coreId: "core-a",
      coreWord: "quick",
      coreType: "adjective",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 3
    });
    expect(result.selected.map((term) => term.word)).toEqual(["fast", "quickly"]);
    expect(result.rejected).toContain("property -> property (is a generic placeholder, not a genuine umbrella for this core)");
    expect(result.rejected).toContain("cautious -> cautious (adjective and adverb cores take no umbrella in this plan)");
    expect(result.rejected).toContain("speed -> speed (adjective and adverb cores take no umbrella in this plan)");
  });

  it("selects the first three valid linked support terms from an ordered AI candidate set", () => {
    const candidates = [
      { id: "x1", word: "core phrase", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x2", word: "use a tool", meaning: "", type: "noun", relation: "collocation" as const, relatesToCoreId: "core-a" },
      { id: "x3", word: "schedule", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x4", word: "schedule", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x5", word: "useful", meaning: "", type: "adjective", relation: "word_family" as const, relatesToCoreId: "core-a" },
      { id: "x6", word: "coordinate", meaning: "", type: "verb", relation: "word_family" as const, relatesToCoreId: "core-a" }
    ];
    const result = selectMonthlySupportCandidates({
      candidates,
      coreId: "core-a",
      coreWord: "use",
      coreType: "noun/verb",
      coreWords: new Set(["core phrase"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 3
    });

    expect(result.selected.map((term) => term.word)).toEqual(["useful", "use a tool", "schedule"]);
    expect(result.rejected.some((item) => item.includes("core phrase -> core phrase"))).toBe(true);
  });

  it("rejects a phrase once the monthly phrase budget is exhausted", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x1", word: "use a tool", meaning: "", type: "noun", relation: "collocation", relatesToCoreId: "core-a" },
        { id: "x2", word: "schedule", meaning: "", type: "noun", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x3", word: "useful", meaning: "", type: "adjective", relation: "word_family", relatesToCoreId: "core-a" }
      ],
      coreId: "core-a",
      coreWord: "use",
      coreType: "noun/verb",
      coreWords: new Set(["priority"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: ["client update"],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 1,
      needed: 2
    });

    expect(result.selected.map((term) => term.word)).toEqual(["schedule", "useful"]);
    expect(result.selected.some((term) => term.word === "use a tool")).toBe(false);
  });

  it("selects at most one phrase per core while allowing the second distinct semantic item", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x1", word: "ask for help", meaning: "", type: "noun", relation: "collocation", relatesToCoreId: "core-a" },
        { id: "x2", word: "service", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x3", word: "priority", meaning: "", type: "noun", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x4", word: "schedule", meaning: "", type: "noun", relation: "synonym", relatesToCoreId: "core-a" },
        { id: "x5", word: "helpful", meaning: "", type: "adjective", relation: "word_family", relatesToCoreId: "core-a" }
      ],
      coreId: "core-a",
      coreWord: "help",
      coreType: "noun/verb",
      coreWords: new Set(["account"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 28,
      maxPhrasePlacements: 36,
      needed: 4
    });

    expect(result.selected.map((term) => term.word)).toEqual(["service", "priority", "helpful", "ask for help"]);
    expect(result.selected.filter((term) => term.word.includes(" "))).toHaveLength(1);
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

  it("keeps advanced pronunciation on the advanced track after a stress target", () => {
    const previous = [{ ipa: "/ˈ/", label: "primary stress", explanation: "Stress the first syllable." }];
    const prompt = buildMonthlyPronunciationDistinctnessConstraint(previous, "Rejected isolated /θ/.", true);
    expect(prompt).toContain("consonant cluster");
    expect(prompt).toContain("do not return /ˈ/, /ˌ/");
    expect(prompt).not.toContain("must be a real consonant or vowel phoneme");
  });

  it("diagnoses mixed or mis-sized grammar responses and carries exact repair requirements", () => {
    const result = planFor();
    result.coreTerms = [result.coreTerms[0]!];
    result.grammarTopics = [result.grammarTopics[0]!];

    const issues = getMonthlyGrammarPhaseIssues(result);
    expect(issues).toContain("coreTerms must be empty (received 1)");
    expect(issues).toContain("grammarTopics must contain exactly 2 items (received 1)");
    expect(issues).toContain("expandedTerms must be empty (received 432)");
    expect(issues).toContain("pronunciationTargets must be empty (received 4)");

    const retryPrompt = buildMonthlyGrammarPhasePrompt(issues);
    expect(retryPrompt).toContain("Return exactly two grammarTopics");
    expect(retryPrompt).toContain("coreTerms, expandedTerms and pronunciationTargets must be empty arrays");
    expect(retryPrompt).toContain("Previous response rejected");
    expect(retryPrompt).toContain(issues.join("; "));
  });

  it("flags Vietnamese dailyObjectives from B1 and keeps them valid at A1 (WP9)", async () => {
    const clean = planFor();
    clean.coreTerms = [];
    clean.expandedTerms = [];
    clean.pronunciationTargets = [];
    expect(getMonthlyGrammarPhaseIssues(clean)).toEqual([]);
    expect(getMonthlyGrammarPhaseIssues(clean, "A1")).toEqual([]);
    expect(getMonthlyGrammarPhaseIssues(clean, "B1")).toEqual([
      expect.stringContaining("grammarTopics[0] dailyObjectives must be in simple English for B1"),
      expect.stringContaining("grammarTopics[1] dailyObjectives must be in simple English for B1")
    ]);
    const english = structuredClone(clean);
    for (const topic of english.grammarTopics) for (const step of topic.steps) step.dailyObjectives = [`Recognise ${step.id} in a short email`, `Use ${step.id} to answer a client`];
    expect(getMonthlyGrammarPhaseIssues(english, "C1")).toEqual([]);
    expect(buildMonthlyGrammarPhasePrompt()).toContain("written in Vietnamese for A1/A2 and in simple English for B1, B2 and C1");
    expect(buildMonthlyGrammarPhasePrompt([], "B1")).toContain("write dailyObjectives in simple English with no Vietnamese words");
    const prompts: string[] = [];
    const result = await runMonthlyGrammarPhaseWithRetry(async (prompt) => { prompts.push(prompt); return prompts.length === 1 ? clean : english; }, "B1");
    expect(result).toBe(english);
    expect(prompts[1]).toContain("dailyObjectives must be in simple English for B1");
  });

  it("matches example IPA against the literal target only (no legacy X placeholder)", () => {
    expect(doesMonthlyPronunciationExampleMatch("/iː/", "/miːt/")).toBe(true);
    expect(doesMonthlyPronunciationExampleMatch("/ˈ/", "/ˈklaɪənt/")).toBe(true);
    expect(doesMonthlyPronunciationExampleMatch("/iː/", "/wɜːk/")).toBe(false);
    expect(doesMonthlyPronunciationExampleMatch("/ˈXx/", "/ˈklaɪənt/")).toBe(false);
    expect(doesMonthlyPronunciationExampleMatch("/st/", "/ɪkˈstend/", "extend")).toBe(false);
    expect(doesMonthlyPronunciationExampleMatch("/nd/", "/ɪkˈstend/", "extend")).toBe(true);
    // Strong forms are genuine /æ/ examples (A2 approval false rejection, 11/11); weak forms are not.
    expect(doesMonthlyPronunciationExampleMatch("/æ/", "/ðæt/", "that")).toBe(true);
    expect(doesMonthlyPronunciationExampleMatch("/æ/", "/hæv/", "have")).toBe(true);
    expect(doesMonthlyPronunciationExampleMatch("/ə/", "/tə/", "to")).toBe(false);
    expect(doesMonthlyPronunciationExampleMatch("/æ/", "/plæn/", "plan")).toBe(true);
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

  it("keeps the AI's core CEFR label and the pronunciation catalog item through pool and approval plan", () => {
    const plan = planFor();
    plan.coreTerms[0]!.cefr = "A1";
    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, plan, ["phoneme-m", undefined, "phoneme-l", "phoneme-h"]);
    expect(pool.coreTerms[0]!.cefr).toBe("A1");
    expect(pool.coreTerms[1]!).not.toHaveProperty("cefr");
    expect(pool.sounds.map((sound) => sound.catalogId)).toEqual(["phoneme-m", undefined, "phoneme-l", "phoneme-h"]);
    const contract = planMonthlyResourcePool(pool);
    expect(validateMonthlyCurriculum(contract)).toEqual([]);
    expect(contract.coreTerms[0]!.cefr).toBe("A1");
    expect(contract.sounds[0]!.catalogId).toBe("phoneme-m");
  });

  it("stores the roadmap grammar catalog topic on each topic and plans roadmap day stages", () => {
    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor(), [], ["a1-p2-a", "a1-p2-b"]);
    expect(pool.grammarTopics.map((topic) => topic.catalogId)).toEqual(["a1-p2-a", "a1-p2-b"]);
    const contract = planMonthlyResourcePool(pool);
    expect(validateMonthlyCurriculum(contract)).toEqual([]);
    const firstNew = contract.daySpecs.find((day) => day.kind === "new")!;
    expect(firstNew.grammarPlan).toMatchObject({ code: "A1", stage: "identify" });
    expect(buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor()).grammarTopics.every((topic) => !("catalogId" in topic))).toBe(true);
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
      { month: "2026-01", slots: 21, newLessons: 17, reviews: [2, 7, 12, 17] },
      { month: "2026-07", slots: 22, newLessons: 18, reviews: [3, 8, 13, 18] }
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
        expect(contract.supportTerms.filter((term) => term.dayNumber === day.lessonNumber)).toHaveLength(27);
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

  it("rejects more than one phrase per core while allowing the monthly phrase cap to remain a secondary ceiling", () => {
    const invalidCore = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    invalidCore.coreTerms[0]!.word = "workflow management";
    expect(() => planMonthlyResourcePool(invalidCore)).toThrow(/standalone English headword/u);

    const multipleForCore = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    // Umbrella group phrases are exempt, so place both phrases on non-umbrella supports of one core.
    const firstCoreId = multipleForCore.supportTerms[0]!.relatedCoreTermId;
    const [phraseA, phraseB] = multipleForCore.supportTerms.filter((term) => term.relatedCoreTermId === firstCoreId && term.relation !== "umbrella");
    phraseA!.word = "annual report";
    phraseB!.word = "client update";
    expect(() => planMonthlyResourcePool(multipleForCore)).toThrow(/at most one multi-word expanded expression/u);

    const manyPhrasesWithinPerCoreLimit = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor());
    for (let coreIndex = 0; coreIndex < 37; coreIndex += 1) {
      const suffix = `${String.fromCharCode(97 + Math.floor(coreIndex / 26))}${String.fromCharCode(97 + coreIndex % 26)}`;
      manyPhrasesWithinPerCoreLimit.supportTerms[coreIndex * 9]!.word = `client task${suffix}`;
    }
    expect(() => planMonthlyResourcePool(manyPhrasesWithinPerCoreLimit)).not.toThrow();
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

  it("rejects AI pools that exceed one phrase per core", () => {
    const sameCorePhrases = planFor();
    const [firstNonUmbrella, secondNonUmbrella] = sameCorePhrases.expandedTerms
      .map((term, index) => ({ term, index }))
      .filter(({ term }) => term.relatesToCoreId === sameCorePhrases.expandedTerms[0]!.relatesToCoreId && term.relation !== "umbrella");
    sameCorePhrases.expandedTerms[firstNonUmbrella!.index]!.word = "annual report";
    sameCorePhrases.expandedTerms[secondNonUmbrella!.index]!.word = "client update";
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, sameCorePhrases))).toContain("Core core-1-1 has more than one multi-word support item.");

    // An umbrella group phrase does not count toward the one-phrase-per-core limit.
    const umbrellaPhrase = planFor();
    const coreId = umbrellaPhrase.expandedTerms[0]!.relatesToCoreId;
    const umbrella = umbrellaPhrase.expandedTerms.find((term) => term.relatesToCoreId === coreId && term.relation === "umbrella")!;
    const other = umbrellaPhrase.expandedTerms.find((term) => term.relatesToCoreId === coreId && term.relation !== "umbrella")!;
    umbrella.word = "office equipment";
    other.word = "client update";
    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, umbrellaPhrase)).not.toThrow();

    const manyPhrasesWithinPerCoreLimit = planFor();
    for (let coreIndex = 0; coreIndex < 37; coreIndex += 1) {
      const suffix = `${String.fromCharCode(97 + Math.floor(coreIndex / 26))}${String.fromCharCode(97 + coreIndex % 26)}`;
      manyPhrasesWithinPerCoreLimit.expandedTerms[coreIndex * 9]!.word = `client task${suffix}`;
    }
    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, manyPhrasesWithinPerCoreLimit)).not.toThrow();
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

/** Keeps only one umbrella, one synonym and one word_family support per core (the planFor relation cycle positions 0, 1, 3). */
function threeSupportPlan(): MonthlyResourcePlanTaskOutput {
  const plan = planFor();
  plan.expandedTerms = plan.expandedTerms.filter((_term, index) => [0, 1, 3].includes(index % 9));
  return plan;
}
const threeSupportCriteria = { ...criteria, expandedVocabularyCount: vocabularyCount * 3 };

describe("monthly support pool rules (VH-R33: 3-9 per core, 35% repeats, CEFR ±1)", () => {
  it("accepts a pool with exactly three supports per core, one per required relation", () => {
    const plan = threeSupportPlan();
    expect(plan.expandedTerms).toHaveLength(vocabularyCount * 3);
    expect(validateMonthlyResourcePlanShape(plan, newLessonDays.length, "A1")).toEqual([]);

    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, plan);
    const contract = planMonthlyResourcePool(pool);
    expect(validateMonthlyCurriculum(contract)).toEqual([]);
    for (const core of contract.coreTerms) {
      expect(contract.supportTerms.filter((term) => term.relatedCoreTermId === core.id).map((term) => term.relation).sort()).toEqual(["synonym", "umbrella", "word_family"]);
    }
  });

  it("still accepts the previous six-to-nine support pools", () => {
    const sixPerCore = planFor();
    sixPerCore.expandedTerms = sixPerCore.expandedTerms.filter((_term, index) => index % 9 < 6);
    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, { ...criteria, expandedVocabularyCount: vocabularyCount * 6 }, sixPerCore);
    expect(validateMonthlyCurriculum(planMonthlyResourcePool(pool))).toEqual([]);
    expect(validateMonthlyCurriculum(planMonthlyResourcePool(buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor())))).toEqual([]);
  });

  it("bounds the requested expanded count to three-to-nine supports per core", () => {
    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, threeSupportPlan())).not.toThrow();
    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, { ...criteria, expandedVocabularyCount: vocabularyCount * 3 - 1 }, threeSupportPlan())).toThrow(MonthlyResourceCriteriaError);
    expect(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, { ...criteria, expandedVocabularyCount: vocabularyCount * 9 + 1 }, planFor())).toThrow(MonthlyResourceCriteriaError);
  });

  it("rejects a pool where a core misses a required relation, even with three supports", () => {
    const plan = threeSupportPlan();
    plan.expandedTerms[1]!.relation = "collocation"; // core-1-1 loses its synonym
    expect(validateMonthlyResourcePlanShape(plan, newLessonDays.length)).toContain("Core core-1-1 needs umbrella and synonym supports.");
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, plan))).toContain("Core core-1-1 needs umbrella and synonym supports.");

    const domainPool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, threeSupportPlan());
    domainPool.supportTerms[1]!.relation = "collocation";
    expect(() => planMonthlyResourcePool(domainPool)).toThrow(/a1-core-1 needs umbrella and synonym supports/u);

    // Required relations follow the core's part of speech in the plan check too.
    const nounWithoutFamily = threeSupportPlan();
    nounWithoutFamily.expandedTerms[2]!.relation = "antonym"; // core-1-1 (noun) loses only its word family
    expect(validateMonthlyResourcePlanShape(nounWithoutFamily, newLessonDays.length)).toEqual([]);
    const verbWithoutUmbrella = threeSupportPlan();
    verbWithoutUmbrella.coreTerms[0]!.type = "verb";
    verbWithoutUmbrella.expandedTerms[0]!.relation = "collocation"; // core-1-1 (verb) loses only its umbrella
    expect(validateMonthlyResourcePlanShape(verbWithoutUmbrella, newLessonDays.length)).toEqual([]);
    const verbWithoutFamily = threeSupportPlan();
    verbWithoutFamily.coreTerms[0]!.type = "verb";
    verbWithoutFamily.expandedTerms[2]!.relation = "antonym";
    expect(validateMonthlyResourcePlanShape(verbWithoutFamily, newLessonDays.length)).toContain("Core core-1-1 needs synonym and word-family supports.");

    const twoSupports = threeSupportPlan();
    twoSupports.expandedTerms.splice(1, 1);
    expect(validateMonthlyResourcePlanShape(twoSupports, newLessonDays.length)).toContain("Core core-1-1 needs three to nine support resources.");
  });

  it("applies one 35% repeated-support ceiling at the boundary in the plan check and the domain", () => {
    const total = vocabularyCount * 3;
    const ceiling = maxMonthlySupportRepeats(total);
    expect(ceiling).toBe(Math.floor(total * 0.35));
    expect(ceiling).toBeGreaterThan(Math.floor(total * 0.25));
    const repeated = (repeats: number) => {
      const plan = threeSupportPlan();
      // Reuse core 1's umbrella word on `repeats` supports of later cores.
      for (let index = 3; index < 3 + repeats; index += 1) plan.expandedTerms[index]!.word = plan.expandedTerms[0]!.word;
      return plan;
    };

    expect(validateMonthlyResourcePlanShape(repeated(ceiling), newLessonDays.length)).toEqual([]);
    const atCeilingPool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, repeated(ceiling));
    expect(validateMonthlyCurriculum(planMonthlyResourcePool(atCeilingPool))).toEqual([]);

    expect(validateMonthlyResourcePlanShape(repeated(ceiling + 1), newLessonDays.length)).toContain("Expanded resources repeat more than 35% of the monthly total.");
    const overCeilingPool = structuredClone(atCeilingPool);
    overCeilingPool.supportTerms[3 + ceiling]!.word = overCeilingPool.supportTerms[0]!.word;
    expect(() => planMonthlyResourcePool(overCeilingPool)).toThrow(/repeat more than 35% of the monthly total/u);
  });

  it("applies the same 35% ceiling when the generator selects repeated supports", () => {
    const expandedCount = 20;
    const maxRepeatedPlacements = maxMonthlySupportRepeats(expandedCount);
    expect(maxRepeatedPlacements).toBe(7);
    // Six repeated placements already used: "alpha" appears seven times.
    const existingSupportWords = [...Array.from({ length: 7 }, () => "alpha"), "beta", "gamma"];
    const select = (existing: string[]) => selectMonthlySupportCandidates({
      candidates: [{ id: "u", word: "beta", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-x" }],
      coreId: "core-x",
      coreWord: "plan",
      coreType: "noun",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: existing,
      maxRepeatedPlacements,
      maxPhrasePlacements: 10,
      needed: 1
    });

    expect(select(existingSupportWords).selected.map((term) => term.word)).toEqual(["beta"]);
    const overLimit = select([...existingSupportWords, "alpha"]);
    expect(overLimit.selected).toEqual([]);
    expect(overLimit.rejected.join(" ")).toContain("exceeds the 35% monthly support-repeat limit");
  });

  it("accepts and records an adjacent-level support while rejecting one two levels away", () => {
    const adjacent = threeSupportPlan();
    adjacent.expandedTerms[0]!.cefr = "A2";
    adjacent.expandedTerms[1]!.cefr = "A1";
    expect(validateMonthlyResourcePlanShape(adjacent, newLessonDays.length, "A1")).toEqual([]);
    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, adjacent);
    expect(pool.supportTerms[0]!.cefr).toBe("A2");
    expect(pool.supportTerms[1]!.cefr).toBe("A1");
    expect(pool.supportTerms[2]).not.toHaveProperty("cefr");
    const contract = planMonthlyResourcePool(pool);
    expect(contract.supportTerms[0]!.cefr).toBe("A2");
    expect(validateMonthlyCurriculum(contract)).toEqual([]);

    const tooFar = threeSupportPlan();
    tooFar.expandedTerms[0]!.cefr = "B1";
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, threeSupportCriteria, tooFar))).toContain("Expanded resource expanded-1-1 is CEFR B1; supports must be within one level of A1; word family may be up to B1.");

    // C1 has no level above it; B2 is its only adjacent level.
    const c1 = threeSupportPlan();
    c1.expandedTerms[0]!.cefr = "B2";
    expect(validateMonthlyResourcePlanShape(c1, newLessonDays.length, "C1").filter((error) => error.includes("CEFR"))).toEqual([]);
  });

  it("lets generator selection keep adjacent-level candidates and drop out-of-band ones", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "s1", word: "speedy", meaning: "nhanh", type: "adjective", relation: "synonym", relatesToCoreId: "core-q", cefr: "C1" },
        { id: "s2", word: "rapid", meaning: "nhanh", type: "adjective", relation: "synonym", relatesToCoreId: "core-q", cefr: "B1" }
      ],
      coreId: "core-q",
      coreWord: "quick",
      coreType: "adjective",
      coreWords: new Set(),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 10,
      maxPhrasePlacements: 10,
      needed: 1,
      cefr: "A2"
    });
    expect(result.selected.map((term) => [term.word, term.cefr])).toEqual([["rapid", "B1"]]);
    expect(result.rejected.join(" ")).toContain("CEFR C1 is more than one level from A2");
  });

  it("12/11: B1+ synonym/antonym candidates need a short English definition; A1–A2 read the Vietnamese meaning", () => {
    const select = (cefr: "A2" | "B2", candidates: Parameters<typeof selectMonthlySupportCandidates>[0]["candidates"]) => selectMonthlySupportCandidates({
      candidates, coreId: "core-q", coreWord: "quick", coreType: "adjective", coreWords: new Set(), sameCoreWords: new Set(), sameCoreRelations: new Set(),
      existingSupportWords: [], maxRepeatedPlacements: 10, maxPhrasePlacements: 10, needed: 2, cefr
    });
    const fast = { id: "s1", word: "fast", meaning: "nhanh", type: "adjective", relation: "synonym" as const, relatesToCoreId: "core-q", cefr: "B2" as const };
    const slow = { id: "s2", word: "slow", meaning: "chậm", type: "adjective", relation: "antonym" as const, relatesToCoreId: "core-q", cefr: "B2" as const };
    const b2 = select("B2", [fast, { ...slow, definition: "taking a long time" }]);
    expect(b2.selected.map((term) => term.word)).toEqual(["slow"]);
    expect(b2.rejected.join(" ")).toContain("fast -> fast (the synonym needs a short simple-English definition at B2)");
    expect(select("B2", [{ ...fast, definition: "nhanh chóng và gọn" }]).rejected.join(" ")).toContain("no Vietnamese");
    expect(select("A2", [{ ...fast, cefr: "A2" }]).selected.map((term) => term.word)).toEqual(["fast"]);
    expect(buildMonthlySupportLevelGuidance("B1")).toContain("also carries definition: a short simple-English definition");
    expect(buildMonthlySupportLevelGuidance("A2")).toContain("meaning is its own short Vietnamese meaning");
  });

  it("allows a word-family support up to two levels above the month and rejects three", () => {
    const family = (word: string, cefr: "A1" | "A2" | "B1" | "B2" | "C1") => ({ id: `f-${word}`, word, meaning: "quản lý", type: "noun", relation: "word_family" as const, relatesToCoreId: "core-m", cefr });
    const result = selectMonthlySupportCandidates({
      candidates: [family("managerial", "B2"), family("management", "B1"), family("manager", "A1")],
      coreId: "core-m",
      coreWord: "manage",
      coreType: "verb",
      coreWords: new Set(["manage"]),
      sameCoreWords: new Set(),
      sameCoreRelations: new Set(),
      existingSupportWords: [],
      maxRepeatedPlacements: 10,
      maxPhrasePlacements: 10,
      needed: 3,
      cefr: "A1"
    });
    expect(result.selected.map((term) => term.word)).toEqual(["management", "manager"]);
    expect(result.rejected.join(" ")).toContain("CEFR B2 is above B1, the highest word-family level for A1");

    const plan = threeSupportPlan();
    const familyIndex = plan.expandedTerms.findIndex((term) => term.relation === "word_family");
    plan.expandedTerms[familyIndex]!.cefr = "B1";
    expect(validateMonthlyResourcePlanShape(plan, newLessonDays.length, "A1").filter((error) => error.includes("CEFR"))).toEqual([]);
    plan.expandedTerms[familyIndex]!.cefr = "B2";
    expect(validateMonthlyResourcePlanShape(plan, newLessonDays.length, "A1")).toContain(`Expanded resource ${plan.expandedTerms[familyIndex]!.id} is CEFR B2; supports must be within one level of A1; word family may be up to B1.`);
  });

  it("keeps a valid support CEFR label from AI output and drops an unusable one", () => {
    const parsed = parseMonthlyResourceAiOutput({
      coreTerms: [],
      expandedTerms: [
        { id: "e1", word: "rapid", meaning: "nhanh", type: "adjective", relation: "synonym", relatesToCoreId: "core-q", cefr: "B1" },
        { id: "e2", word: "fast", meaning: "nhanh", type: "adjective", relation: "synonym", relatesToCoreId: "core-q", cefr: null },
        { id: "e3", word: "swift", meaning: "nhanh", type: "adjective", relation: "synonym", relatesToCoreId: "core-q" }
      ],
      grammarTopics: [],
      pronunciationTargets: []
    });
    expect(parsed.expandedTerms.map((term) => term.cefr)).toEqual(["B1", undefined, undefined]);
  });

  it("asks every support prompt for adjacent-level labels instead of rejecting them", () => {
    const core = { id: "core-q", word: "quick", meaning: "nhanh", type: "adjective" };
    const prompts = [
      buildMonthlyCoreCandidatesPrompt({ cefr: "B1", theme: "Work", communicationGoal: "Talk", existingCoreWords: [], batchNumber: 1, preflightRelations: true }),
      buildMonthlySupportRelationCandidatePrompt({ cefr: "B1", core, relation: "synonym", theme: "Work", forbiddenCoreWords: [], existingSupportWords: [] }),
      buildMonthlyOptionalSupportPrompt({ cefr: "B1", core, theme: "Work", requestedCount: 2, forbiddenCoreWords: [], existingSupportWords: [] })
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain("Support words may be at CEFR A2, B1, B2");
      expect(prompt).toContain("Do not reject or omit a genuine relation only because the word is one level above or below B1");
    }
    expect(buildMonthlySupportRelationAuditPrompt({ core, candidates: [] })).toContain("Do not reject a genuine relation only because the word is one level above or below");
    for (const prompt of prompts) expect(prompt).toContain("at most two levels above it (up to C1)");
    expect(buildMonthlySupportLevelGuidance("A1")).toContain("at most two levels above it (up to B1)");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).toContain("at most two levels above it (A1 up to B1");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).not.toContain("may be at any CEFR level");
  });

  it("tells the audit and gap-fill prompts which umbrella and word-family candidates to reject", () => {
    const audit = buildMonthlySupportRelationAuditPrompt({ core: { word: "computer", meaning: "máy tính", type: "noun" }, candidates: [] });
    expect(audit).toContain("Reject a candidate that is NARROWER than the core, i.e. a kind of the core (computer -> laptop");
    expect(audit).toContain("a synonym or near-synonym (leader -> boss)");
    expect(audit).toContain("(attend -> meeting, pay -> salary");
    expect(audit).toContain("an adjective or modifier (designer -> graphic)");
    expect(audit).toContain("office -> workplace, email -> communication, invoice -> document");
    expect(audit).toContain("Reject rare or awkward agent nouns, abstract nouns and adverbs");
    expect(audit).toContain("texter, repairer, repairable, checker, payer");
    const core = { id: "core-p", word: "pay", meaning: "trả tiền", type: "verb" };
    const umbrella = buildMonthlySupportRelationCandidatePrompt({ cefr: "A1", core, relation: "umbrella", theme: "Work", forbiddenCoreWords: [], existingSupportWords: [] });
    expect(umbrella).toContain("Never return a narrower kind of the core (computer -> laptop), a synonym (leader -> boss)");
    const family = buildMonthlySupportRelationCandidatePrompt({ cefr: "A1", core, relation: "word_family", theme: "Work", forbiddenCoreWords: [], existingSupportWords: [] });
    expect(family).toContain("COMMON, frequently used derivational form");
    expect(family).toContain("texter, repairer, checker, payer");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).toContain("three to nine expanded items per core");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).toContain("at or below 35% of the total expanded set");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).not.toMatch(/six to nine|minimum six/u);
  });
});

describe("support quality rules (umbrella reuse, adjective umbrella, -ness, -ly, comparative antonym)", () => {
  const noun = { word: "email", type: "noun", cefr: "A1" };
  const adjective = { word: "small", type: "adjective", cefr: "A1" };

  it("caps one umbrella word at two cores per month", () => {
    expect(monthlySupportQualityIssue(noun, { word: "office equipment", relation: "umbrella" }, 1)).toBeUndefined();
    expect(monthlySupportQualityIssue(noun, { word: "office equipment", relation: "umbrella" }, 2)).toMatch(/already used for 2 cores/u);
  });

  it("gives adjective cores no umbrella", () => {
    expect(monthlySupportQualityIssue(adjective, { word: "size", relation: "umbrella" }, 0)).toMatch(/take no umbrella/u);
  });

  it("rejects uncommon -ness nouns for A1/A2 adjectives but keeps common ones", () => {
    expect(monthlySupportQualityIssue(adjective, { word: "smallness", relation: "word_family" }, 0)).toMatch(/uncommon -ness/u);
    expect(monthlySupportQualityIssue({ word: "happy", type: "adjective", cefr: "A1" }, { word: "happiness", relation: "word_family" }, 0)).toBeUndefined();
    expect(monthlySupportQualityIssue({ word: "small", type: "adjective", cefr: "B2" }, { word: "smallness", relation: "word_family" }, 0)).toBeUndefined();
  });

  it("rejects rare -ly forms and keeps common ones", () => {
    expect(monthlySupportQualityIssue({ word: "tired", type: "adjective", cefr: "A1" }, { word: "tiredly", relation: "word_family" }, 0)).toMatch(/rare or meaning-changing/u);
    expect(monthlySupportQualityIssue({ word: "quick", type: "adjective", cefr: "A1" }, { word: "quickly", relation: "word_family" }, 0)).toBeUndefined();
  });

  it("never accepts a comparative or superlative as an antonym", () => {
    expect(monthlySupportQualityIssue({ word: "good", type: "adjective", cefr: "A1" }, { word: "better", relation: "antonym" }, 0)).toMatch(/comparative/u);
    expect(monthlySupportQualityIssue(adjective, { word: "smaller", relation: "antonym" }, 0)).toMatch(/comparative/u);
    expect(monthlySupportQualityIssue(adjective, { word: "big", relation: "antonym" }, 0)).toBeUndefined();
  });
});

describe("L-042 register alternatives in the resource pool", () => {
  const register = [
    { coreId: "core-1-1", kind: "slang", word: "touch base", definition: "talk briefly to check on progress", ipa: "/tʌtʃ beɪs/", usage: "Fine with colleagues in chat; not in formal reports." },
    { coreId: "core-1-1", kind: "poetic", word: "steed", definition: "a horse for riding", ipa: "/stiːd/", source: "Found in old ballads and tales of knights." },
    // Formal register is not poetic (12/11), and the old shape without IPA / notes is no longer generated.
    { coreId: "core-1-2", kind: "poetic", word: "convene", definition: "come together for a formal meeting", ipa: "/kənˈviːn/", source: "Common in older poetry." },
    { coreId: "core-1-2", kind: "slang", word: "bullshit", definition: "talk that is not true", ipa: "/ˈbʊlʃɪt/", usage: "Casual only; never in formal emails." },
    { coreId: "core-1-3", kind: "slang", word: "ballpark", definition: "a rough guess of a number" }
  ];
  // B1+ pronunciation targets must be the level's catalog notations.
  const levelPlan = (cefr: "B1" | "B2" | "C1") => {
    const plan = planFor();
    const catalog = monthlyPronunciationCatalog(cefr);
    plan.pronunciationTargets.forEach((target, index) => { target.ipa = catalog[index]!.notation; });
    return plan;
  };
  it("B1–C1: audited alternatives are stored on the mapped core and survive planning", () => {
    for (const cefr of ["B1", "B2", "C1"] as const) {
      const pool = buildMonthlyResourcesFromAiPlan(month, cefr, theme, criteria, levelPlan(cefr), [], [], register);
      expect(pool.coreTerms[0]!.id).toBe(`${cefr.toLowerCase()}-core-1`);
      expect(pool.coreTerms[0]!.registerTerms?.map((term) => [term.kind, term.word, term.ipa])).toEqual([["slang", "touch base", "/tʌtʃ beɪs/"], ["poetic", "steed", "/stiːd/"]]);
      // Formal-as-poetic and vulgar slang are dropped, as is the old shape; a core without alternatives carries no field.
      expect(pool.coreTerms[1]!.registerTerms).toBeUndefined();
      expect(pool.coreTerms[2]!.registerTerms).toBeUndefined();
      const contract = planMonthlyResourcePool(pool);
      expect(contract.coreTerms[0]!.registerTerms?.map((term) => term.word)).toEqual(["touch base", "steed"]);
    }
  });
  it("A1–A2 ignore them, and no alternatives is the normal case", () => {
    const pool = buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, planFor(), [], [], register);
    expect(pool.coreTerms.every((core) => core.registerTerms === undefined)).toBe(true);
    expect(buildMonthlyResourcesFromAiPlan(month, "B2", theme, criteria, levelPlan("B2")).coreTerms.every((core) => core.registerTerms === undefined)).toBe(true);
    expect(isCurrentMonthlyResourceCheckpointCategory("registerTerms", { schemaVersion: CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS.registerTerms })).toBe(true);
  });
});
