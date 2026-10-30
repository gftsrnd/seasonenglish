import { describe, expect, it } from "vitest";
import type { ContentGenerationFindingView, ContentLessonDraftInput } from "@e4s/contracts";
import {
  buildVocabularyEnrichmentPrompt,
  isDerivationOrInflection,
  lessonComponentsNeedingRepair,
  lessonDaysNeedingRepair,
  lessonRepairComponentsByDay,
  mergeGeneratedLesson,
  mergeGeneratedLessons,
  mergeGenerationFindingsAfterRepair,
  normalizeVocabularyEnrichmentItem,
  validateVocabularyEnrichmentItem
} from "./enrichment.js";

const generatedLesson: ContentLessonDraftInput = {
  dayNumber: 1,
  title: "S + V + O",
  durationMinutes: 10,
  parts: [
    { code: "objective", title: "Mục tiêu bài học", content: { text: "Nói được ba câu về công việc." } },
    { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Đọc mẫu.", "Làm bài.", "Kiểm tra."] } },
    { code: "vocabulary", title: "Từ vựng", content: { items: [{ word: "report", type: "noun", meaning: "báo cáo", collocations: ["write a report", "weekly report", "send the report"], family: [], synonyms: [], antonyms: [], umbrella: { word: "document", meaning: "tài liệu", siblings: [] }, imageQuery: "office report document", pronunciation: "/rɪˈpɔːrt/" }] } },
    { code: "grammar", title: "Ngữ pháp", content: { formula: "S + V + O", usage: "Nói ai làm gì.", examples: ["I write a report.", "She sends a report."] } },
    { code: "pronunciation", title: "Phát âm", content: { focus: "/r/", tip: "Rung nhẹ.", words: [{ word: "report", ipa: "/rɪˈpɔːrt/" }, { word: "read", ipa: "/riːd/" }, { word: "right", ipa: "/raɪt/" }] } },
    { code: "listening", title: "Nghe", content: { audio: "I write a report every Friday.", prompt: "What does she write?", options: ["A report", "An email", "A plan", "A note"], answer: "A report" } },
    { code: "reading", title: "Đọc", content: { text: "Lan writes a report every Friday. Her manager reads it.", prompt: "When does Lan write it?", options: ["Friday", "Monday", "Tuesday", "Sunday"], answer: "Friday" } },
    { code: "writing", title: "Viết", content: { type: "fill", prompt: "I ___ a report.", options: [], answer: "write" } },
    { code: "word_class", title: "Từ loại", content: { prompt: "What part of speech is report?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
    { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence is correct?", options: ["I write a report.", "I write a reports.", "I writing report.", "I writes reports."], answer: "I write a report." } },
    { code: "speaking", title: "Nói", content: { prompt: "Nói một câu về báo cáo.", answer: "I write a report every Friday." } }
  ]
};

describe("lesson enrichment merge", () => {
  it("keeps unresolved findings for untouched days when one component is repaired", () => {
    const existing: ContentGenerationFindingView[] = [
      { dayNumber: 1, component: "foundation", code: "DUPLICATE", severity: "error", message: "old day 1", issues: [], repairAction: "regenerate_component" },
      { dayNumber: 2, component: "skills", code: "CEFR", severity: "error", message: "keep day 2", issues: [], repairAction: "regenerate_component" }
    ];
    const generated: ContentGenerationFindingView[] = [
      { dayNumber: 1, component: "foundation", code: "STILL_DUPLICATE", severity: "error", message: "new day 1", issues: [], repairAction: "regenerate_component" }
    ];

    expect(mergeGenerationFindingsAfterRepair(existing, generated, { 1: ["foundation"] })).toEqual([
      existing[1],
      generated[0]
    ]);
  });

  it("clears a stale level-wide lexical finding when vocabulary is repaired", () => {
    const staleCoverage: ContentGenerationFindingView = {
      dayNumber: null,
      component: "vocabulary",
      code: "VOCABULARY_LEXICAL_COVERAGE_LOW",
      severity: "warning",
      message: "old aggregate coverage",
      issues: [],
      repairAction: "regenerate_component"
    };

    expect(mergeGenerationFindingsAfterRepair([staleCoverage], [staleCoverage], { 3: ["vocabulary"] })).toEqual([]);
  });

  it("replaces only the component named by an actionable finding", () => {
    const existing = [generatedLesson];
    const generated = [{
      ...generatedLesson,
      title: "New foundation title",
      parts: generatedLesson.parts.filter((part) => ["objective", "instruction", "grammar", "pronunciation"].includes(part.code)).map((part) => ({ ...part, content: { marker: "repaired" } }))
    }];

    const merged = mergeGeneratedLessons(existing, generated, "enrich", { 1: ["foundation"] });

    expect(merged[0]?.title).toBe("New foundation title");
    expect(merged[0]?.parts.find((part) => part.code === "grammar")?.content).toEqual({ marker: "repaired" });
    expect(merged[0]?.parts.find((part) => part.code === "vocabulary")?.content).toEqual(
      existing[0]?.parts.find((part) => part.code === "vocabulary")?.content
    );
  });

  it("fills missing legacy fields without replacing existing learner-facing content", () => {
    const existing: ContentLessonDraftInput = {
      ...generatedLesson,
      title: "Talking about daily work tasks",
      parts: generatedLesson.parts.filter((part) => !["word_class", "word_use"].includes(part.code)).map((part) =>
        part.code === "objective" ? { ...part, content: { text: "Giữ nguyên mục tiêu cũ." } } : part
      )
    };

    const merged = mergeGeneratedLesson(existing, generatedLesson, "enrich");

    expect(merged.title).toBe("Talking about daily work tasks");
    expect(merged.parts.find((part) => part.code === "objective")?.content).toEqual({ text: "Giữ nguyên mục tiêu cũ." });
    expect(((merged.parts.find((part) => part.code === "vocabulary")?.content.items as Array<Record<string, unknown>>)[0])?.type).toBe("noun");
    expect(merged.parts.map((part) => part.code)).toEqual([
      "objective", "instruction", "vocabulary", "grammar", "pronunciation", "listening", "reading", "writing", "word_class", "word_use", "speaking"
    ]);
  });

  it("replaces an incomplete choice list with the four options returned by AI", () => {
    const existing: ContentLessonDraftInput = {
      ...generatedLesson,
      parts: generatedLesson.parts.map((part) => part.code === "listening"
        ? { ...part, content: { ...part.content, options: ["Old A", "Old B", "Old C"], answer: "Old A" } }
        : part)
    };

    const merged = mergeGeneratedLesson(existing, generatedLesson, "enrich");
    const listening = merged.parts.find((part) => part.code === "listening");

    expect(listening?.content.options).toEqual(["A report", "An email", "A plan", "A note"]);
    expect(listening?.content.answer).toBe("A report");
  });

  it("fills only missing collocations for the phrase repair action", () => {
    const existing: ContentLessonDraftInput = {
      ...generatedLesson,
      parts: generatedLesson.parts.map((part) => part.code === "vocabulary"
        ? { ...part, content: { ...part.content, items: [{ ...(part.content.items as Array<Record<string, unknown>>)[0], collocations: ["write a report"] }] } }
        : part)
    };

    const merged = mergeGeneratedLesson(existing, generatedLesson, "fill-phrases");
    const vocabulary = merged.parts.find((part) => part.code === "vocabulary");
    expect((vocabulary?.content.items as Array<Record<string, unknown>>)[0]?.collocations).toEqual(["write a report", "weekly report", "send the report"]);
    expect(merged.title).toBe(existing.title);
  });

  it("matches lessons by day and preserves the five-day order", () => {
    const reversed = [3, 1, 2, 5, 4].map((dayNumber) => ({ ...generatedLesson, dayNumber }));
    expect(mergeGeneratedLessons([generatedLesson], reversed, "enrich").map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it("preserves complete existing days when AI regenerates only missing days", () => {
    const existing = [1, 2, 3, 4, 5].map((dayNumber) => ({ ...generatedLesson, dayNumber, title: `Existing ${dayNumber}` }));
    const repaired = [{ ...generatedLesson, dayNumber: 3, title: "Generated 3" }];

    const merged = mergeGeneratedLessons(existing, repaired, "enrich");

    expect(merged).toHaveLength(5);
    expect(merged.map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(merged.map((lesson) => lesson.title)).toEqual(["Existing 1", "Existing 2", "Existing 3", "Existing 4", "Existing 5"]);
  });

  it("selects only incomplete and absent days for AI enrichment", () => {
    const complete = [1, 2, 3, 4].map((dayNumber) => ({
      ...generatedLesson,
      dayNumber,
      parts: generatedLesson.parts.map((part) => part.code === "vocabulary"
        ? { ...part, content: { ...part.content, items: (part.content.items as Array<Record<string, unknown>>).map((item) => ({ ...item, family: ["reporter"], synonyms: ["summary"], antonyms: ["silence"] })) } }
        : part)
    }));
    const incomplete = complete.map((lesson) => lesson.dayNumber === 2
      ? { ...lesson, parts: lesson.parts.filter((part) => part.code !== "word_use") }
      : lesson);

    expect(lessonDaysNeedingRepair(incomplete, "enrich")).toEqual([2, 5]);
  });

  it("selects a day when any retained lesson component is missing", () => {
    const partial = [{
      ...generatedLesson,
      parts: generatedLesson.parts.filter((part) => part.code !== "objective")
    }];

    expect(lessonDaysNeedingRepair(partial, "enrich")).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not spend an AI repair on at most two light lexical gaps in a level", () => {
    const level = [1, 2, 3, 4, 5].map((dayNumber) => ({
      ...generatedLesson,
      dayNumber,
      parts: generatedLesson.parts.map((part) => part.code !== "vocabulary" ? part : {
        ...part,
        content: {
          ...part.content,
          items: [{
            ...(part.content.items as Array<Record<string, unknown>>)[0]!,
            family: ["reporter"],
            synonyms: dayNumber <= 2 ? [] : ["summary"],
            antonyms: []
          }]
        }
      })
    }));

    expect(lessonDaysNeedingRepair(level, "enrich", "A2")).toEqual([]);
    expect([...lessonRepairComponentsByDay(level, "enrich", "A2").entries()]).toEqual([]);
  });

  it("selects a day whose grammar is explicitly unavailable for AI supplementation", () => {
    const unavailable = [{
      ...generatedLesson,
      parts: generatedLesson.parts.map((part) => part.code === "grammar"
        ? { ...part, content: { status: "unavailable", hidden: true, reason: "insufficient_evidence" } }
        : part)
    }];

    expect(lessonComponentsNeedingRepair(unavailable[0], "enrich")).toContain("foundation");
  });

  it("replaces unavailable grammar when AI supplementation returns usable grammar", () => {
    const existing: ContentLessonDraftInput = {
      ...generatedLesson,
      parts: generatedLesson.parts.map((part) => part.code === "grammar"
        ? { ...part, content: { status: "unavailable", hidden: true, reason: "insufficient_evidence" } }
        : part)
    };

    const merged = mergeGeneratedLesson(existing, generatedLesson, "enrich");
    const grammar = merged.parts.find((part) => part.code === "grammar")?.content;

    expect(grammar).toEqual(generatedLesson.parts.find((part) => part.code === "grammar")?.content);
    expect(grammar).not.toHaveProperty("hidden");
  });

  it("merges a partial AI result without overwriting valid manual content", () => {
    const existing: ContentLessonDraftInput = {
      ...generatedLesson,
      title: "Tiêu đề đã sửa tay",
      parts: generatedLesson.parts
        .filter((part) => part.code !== "vocabulary")
        .map((part) => part.code === "objective"
          ? { ...part, content: { text: "Mục tiêu do người dùng sửa." } }
          : part)
    };
    const partialGenerated: ContentLessonDraftInput = {
      ...generatedLesson,
      title: "AI title",
      parts: generatedLesson.parts.filter((part) => part.code === "vocabulary")
    };

    const merged = mergeGeneratedLesson(existing, partialGenerated, "enrich");

    expect(merged.title).toBe("Tiêu đề đã sửa tay");
    expect(merged.parts.find((part) => part.code === "objective")?.content).toEqual({ text: "Mục tiêu do người dùng sửa." });
    expect(merged.parts.find((part) => part.code === "vocabulary")).toBeDefined();
  });

  it("enforces TESOL heteronym disambiguation, POS/sense/self-synonym/derivation guards, and B1-C1 language rules", () => {
    const prompt = buildVocabularyEnrichmentPrompt({
      headword: "introduce",
      pos: "verb",
      sense: "to present something new to people for the first time",
      example: "Let me introduce our new product.",
      cefr: "B1",
      context: "Workplace - Sales"
    });
    expect(prompt).toContain("HETERONYM DISAMBIGUATION");
    expect(prompt).toContain("SELF-SYNONYM & DERIVATION GUARD");
    expect(prompt).toContain("ACTIVE LEVEL B1");

    expect(isDerivationOrInflection("introduce", "introduction")).toBe(true);
    expect(isDerivationOrInflection("introduce", "reintroduce")).toBe(true);
    expect(isDerivationOrInflection("introduce", "introducing")).toBe(true);
    expect(isDerivationOrInflection("introduce", "present")).toBe(false);

    const invalidHeteronymAndRelations = {
      word: "present",
      partOfSpeech: "verb",
      pronunciation: "/ˈprezənt/",
      stress: "PRE-sent",
      ttsText: "present",
      ssml: '<speak><phoneme alphabet="ipa" ph="ˈprezənt">present</phoneme></speak>',
      meaning: "trình bày, giới thiệu",
      collocations: ["present the plan", "trình bày dự án", "present our product"],
      family: [{ word: "presentation", type: "noun", meaning: "bài thuyết trình" }],
      umbrella: { word: "record", pos: "noun", ipa: "/rɪˈkɔːrd/", meaning: "hồ sơ" },
      synonyms: [
        {
          word: "present",
          level: "B1",
          partOfSpeech: "verb",
          note: "same word",
          sense: "to show formally",
          example: "Let me present the plan."
        },
        {
          word: "presentation",
          level: "B1",
          partOfSpeech: "verb",
          note: "derived noun",
          sense: "to show formally",
          example: "Let me presentation the plan."
        },
        {
          word: "gift",
          level: "B1",
          partOfSpeech: "noun",
          note: "wrong POS",
          sense: "something given",
          example: "She gave a gift."
        },
        {
          word: "introduce",
          level: "B1",
          partOfSpeech: "verb",
          note: "Trang trọng hơn khi trình bày",
          sense: "giới thiệu sản phẩm mới",
          example: "Let me introduce our new product."
        },
        {
          word: "launch",
          level: "B1",
          partOfSpeech: "verb",
          note: "Used for new products or campaigns",
          sense: "to introduce a new product to the market",
          example: "We will launch the new product tomorrow."
        }
      ],
      antonyms: [
        {
          word: "withdraw",
          level: "B1",
          partOfSpeech: "verb",
          note: "Used when pulling back a product or proposal",
          sense: "to remove a product or proposal from consideration",
          example: "The team decided to withdraw the proposal."
        }
      ]
    };

    const validation = validateVocabularyEnrichmentItem(invalidHeteronymAndRelations, { cefr: "B1" });
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
      "pronunciation",
      "stress",
      "ssml",
      "collocations[1]",
      "synonyms[0].word",
      "synonyms[1].word",
      "synonyms[2].partOfSpeech",
      "synonyms[3].note",
      "synonyms[3].sense"
    ]));

    const normalized = normalizeVocabularyEnrichmentItem(invalidHeteronymAndRelations, { cefr: "B1" });
    expect(normalized.pronunciation).toBe("/prɪˈzent/");
    expect(normalized.stress).toBe("pre-SENT");
    expect(normalized.ssml).toBe('<speak><phoneme alphabet="ipa" ph="prɪˈzent">present</phoneme></speak>');
    expect(normalized.collocations).toEqual(["present the plan", "present our product"]);
    expect((normalized.umbrella as Record<string, unknown>).ipa).toBe("/ˈrekərd/");
    expect(normalized.synonyms).toEqual([
      {
        word: "launch",
        level: "B1",
        partOfSpeech: "verb",
        note: "Used for new products or campaigns",
        sense: "to introduce a new product to the market",
        example: "We will launch the new product tomorrow."
      }
    ]);
    expect(normalized.antonyms).toHaveLength(1);
    expect(validateVocabularyEnrichmentItem(normalized, { cefr: "B1" }).valid).toBe(true);
  });
});
