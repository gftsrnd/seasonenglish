import { buildMonthlyCalendar, monthlyDayKind, planMonthlyResourcePool, validateMonthlyCurriculum } from "@e4s/domain";
import type { MonthlyResourcePlanTaskOutput } from "@e4s/ai";
import { describe, expect, it } from "vitest";
import { isValidMonthlyPronunciationIpaTarget, MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT } from "./monthly-resource-plan-spec.js";
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
  buildMonthlyOptionalSupportPrompt,
  buildMonthlySupportRelationAuditPrompt,
  buildMonthlySupportRelationCandidatePrompt,
  CURRENT_MONTHLY_RESOURCE_CHECKPOINT_SCHEMA_VERSIONS,
  hasSingleCoreSense,
  isCurrentMonthlyResourceCheckpointCategory,
  isGenuineWordFamily,
  keepExactMonthlySupportRelationCandidates,
  keepSemanticallyAuditedSupportCandidates,
  parseMonthlyResourceAiOutput,
  selectMonthlyCoreCandidates,
  selectMonthlyPronunciationCandidates,
  selectMonthlySupportCandidates
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
      expect(prompt).toContain("25% monthly repeat ceiling");
      expect(prompt).toContain("same-level sibling");
    }
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).toContain("A single-relation support phase must return only that exact relation");
    expect(MONTHLY_RESOURCE_PLAN_SYSTEM_PROMPT).not.toContain("return 12 ordered");
  });

  it("frames verb umbrellas as broader action categories in both generation and audit prompts", () => {
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
    expect(generationPrompt).toContain("a genuine broader noun category for the action in this exact verb sense");
    expect(generationPrompt).toContain("writing is an activity");
    expect(generationPrompt).toContain("natural two-to-four-word noun phrase");
    expect(auditPrompt).toContain("writing is a kind of [candidate]");
    expect(auditPrompt).not.toContain("writeing");
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
    expect(prompt).toContain("select exactly 3 additional valid supports");
    expect(prompt).toContain("selected items must bring the per-core total to at least six and never above nine");
    expect(prompt).toContain("antonyms are optional and must never be invented or forced");
    expect(prompt).toContain("Same-core supports already used: aid; helper");
    expect(prompt).toContain("Do not return previously rejected candidates: timetable; timebox");
    expect(prompt).toContain("Previous validation feedback: these were not genuine additional supports");
    expect(prompt).toContain("Other-core terms may be reused when they are a genuine fit");
    expect(prompt).toContain("25% monthly repeat ceiling");
  });

  it("selects the six valid mandatory and optional supports without requiring nine", () => {
    const candidates = [
      ["umbrella", "property", "noun"], ["synonym", "fast", "adjective"], ["word_family", "quickly", "adverb"],
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

    expect(result.selected).toHaveLength(6);
    expect(result.selected.map((term) => term.relation)).toEqual(expect.arrayContaining(["umbrella", "synonym", "word_family"]));
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
    expect(retryPrompt).toContain("silently identify all three for the exact meaning");
    expect(retryPrompt).toContain("a genuine umbrella category, a natural same-sense synonym, and a common derivational word-family item");
    expect(retryPrompt).toContain("update → updater");
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
    expect(prompt).toContain("For EVERY core candidate, return exactly three authentic supports");
    expect(prompt).toContain("one umbrella, one same-sense synonym, and one common word_family item");
    expect(prompt).toContain("linked using that candidate's exact coreTerms.id");
    expect(prompt).toContain("If a candidate cannot support all three, omit its core and all its edges");
  });

  it("rejects core headwords without a clear derivational family", () => {
    const result = selectMonthlyCoreCandidates({
      candidates: ["feedback", "deadline", "date"].map((word) => ({ id: word, word, meaning: "", type: "noun", ipa: "/t/" })),
      existingCoreWords: new Set(),
      needed: 3
    });
    expect(result.selected.map((term) => term.word)).toEqual(["date"]);
    expect(result.rejected).toHaveLength(2);
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
    expect(result.selected.map((term) => term.word)).toEqual(expect.arrayContaining(["activity", "write up", "writer"]));
    expect(result.selected).toHaveLength(3);
    expect(candidates.map((term) => term.word)).not.toContain("document");
  });

  it("accepts a true quality noun as the umbrella for an adjective core", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x0", word: "cautious", meaning: "thận trọng", type: "adjective", relation: "umbrella", relatesToCoreId: "core-a" },
        { id: "x1", word: "property", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
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
    expect(result.selected.map((term) => term.word)).toEqual(["fast", "quickly", "property"]);
    expect(result.rejected).toContain("cautious -> cautious (part of speech does not match the core sense for this relation)");
  });

  it("selects the first three valid linked support terms from an ordered AI candidate set", () => {
    const candidates = [
      { id: "x1", word: "core phrase", meaning: "", type: "noun", relation: "synonym" as const, relatesToCoreId: "core-a" },
      { id: "x2", word: "annual report", meaning: "", type: "noun", relation: "collocation" as const, relatesToCoreId: "core-a" },
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

    expect(result.selected.map((term) => term.word)).toEqual(["useful", "annual report", "schedule"]);
    expect(result.rejected.some((item) => item.includes("core phrase -> core phrase"))).toBe(true);
  });

  it("rejects a phrase once the monthly phrase budget is exhausted", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x1", word: "annual report", meaning: "", type: "noun", relation: "collocation", relatesToCoreId: "core-a" },
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
    expect(result.selected.some((term) => term.word === "annual report")).toBe(false);
  });

  it("selects at most one phrase per core while allowing the second distinct semantic item", () => {
    const result = selectMonthlySupportCandidates({
      candidates: [
        { id: "x1", word: "annual report", meaning: "", type: "noun", relation: "collocation", relatesToCoreId: "core-a" },
        { id: "x2", word: "activity", meaning: "", type: "noun", relation: "umbrella", relatesToCoreId: "core-a" },
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

    expect(result.selected.map((term) => term.word)).toEqual(["activity", "priority", "helpful", "annual report"]);
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
    multipleForCore.supportTerms[0]!.word = "annual report";
    multipleForCore.supportTerms[1]!.word = "client update";
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
    sameCorePhrases.expandedTerms[0]!.word = "annual report";
    sameCorePhrases.expandedTerms[1]!.word = "client update";
    expect(planErrors(() => buildMonthlyResourcesFromAiPlan(month, "A1", theme, criteria, sameCorePhrases))).toContain("Core core-1-1 has more than one multi-word support item.");

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
