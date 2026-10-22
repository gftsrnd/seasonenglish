import { describe, expect, it } from "vitest";
import type { ContentLessonDraftInput } from "@e4s/contracts";
import { mergeGeneratedLesson, mergeGeneratedLessons } from "./enrichment.js";

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
});
