import { describe, expect, it } from "vitest";
import {
  approveContentVersion,
  retirePublishedContent,
  submitContentForReview,
  validateLessonDraft,
  validateLessonPublication
} from "../src/content/index.js";

const completeLesson = {
  dayNumber: 1,
  title: "I work in… as…",
  durationMinutes: 10,
  parts: [
    { code: "objective", title: "Mục tiêu", content: { text: "Tự giới thiệu công việc." } },
    { code: "instruction", title: "Hướng dẫn", content: { steps: ["Học nội dung", "Làm bài tập"] } },
    { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"].map((word) => ({ word, meaning: "từ công việc", collocations: [`my ${word}`, `new ${word}`, `work ${word}`] })) } },
    { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [team] as [role].", examples: ["I work in AI as an intern."] } },
    { code: "pronunciation", title: "Phát âm", content: { focus: "/w/", words: ["work", "week", "well"], instruction: "Round your lips." } },
    { code: "listening", title: "Nghe", content: { script: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
    { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
    { code: "writing", title: "Viết", content: { type: "fill", prompt: "I work in ___.", answer: "AI" } },
    { code: "word_class", title: "Từ loại", content: { prompt: "What is role?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
    { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence is correct?", options: ["I work in AI.", "I works AI.", "I working AI.", "I work AI yesterday."], answer: "I work in AI." } },
    { code: "speaking", title: "Nói", content: { prompt: "Introduce your role.", sample: "I work in AI as an intern." } }
  ]
} as const;

describe("content publishing policy", () => {
  it("rejects a lesson draft that is missing a required learning part", () => {
    const incomplete = {
      ...completeLesson,
      parts: completeLesson.parts.filter((part) => part.code !== "speaking")
    };

    expect(validateLessonDraft([incomplete])).toEqual({
      valid: false,
      issues: [{ dayNumber: 1, code: "speaking", message: "Thiếu phần Nói." }]
    });
  });

  it("moves a valid draft to review and allows the maker to approve it", () => {
    expect(() => submitContentForReview({ status: "draft", lessons: [completeLesson] }))
      .toThrowError("CONTENT_LESSON_SET_INCOMPLETE");
    const fiveLessons = [1, 2, 3, 4, 5].map((dayNumber) => ({ ...completeLesson, dayNumber }));
    expect(submitContentForReview({ status: "draft", lessons: fiveLessons, weeklyPractice: { task: "Write four sentences about work.", guidance: "Use this week's vocabulary.", requiredVocabulary: ["work"] } })).toEqual({ status: "review" });

    expect(approveContentVersion({ status: "review", createdBy: "operator-a", checkerId: "operator-a" }))
      .toEqual({ status: "published", approvedBy: "operator-a" });
    expect(approveContentVersion({ status: "review", createdBy: "operator-a", checkerId: "operator-b" }))
      .toEqual({ status: "published", approvedBy: "operator-b" });
  });

  it("blocks review when manual listening, speaking, answers, or weekly practice cannot be used by a learner", () => {
    const invalid = structuredClone(completeLesson) as any;
    invalid.parts.find((part: any) => part.code === "listening").content.script = "";
    invalid.parts.find((part: any) => part.code === "speaking").content.sample = "";
    invalid.parts.find((part: any) => part.code === "reading").content.answer = "Unknown";
    const fiveLessons = [1, 2, 3, 4, 5].map((dayNumber) => ({ ...invalid, dayNumber }));

    const result = validateLessonPublication(fiveLessons, { task: "", guidance: "", requiredVocabulary: [] });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "listening", message: expect.stringContaining("nguồn âm thanh") }),
      expect.objectContaining({ code: "speaking", message: expect.stringContaining("câu mẫu") }),
      expect.objectContaining({ code: "reading", message: expect.stringContaining("trùng nguyên văn") }),
      expect.objectContaining({ code: "weekly_practice", message: expect.stringContaining("đề bài") })
    ]));
    expect(() => submitContentForReview({ status: "draft", lessons: fiveLessons, weeklyPractice: { task: "", guidance: "", requiredVocabulary: [] } }))
      .toThrowError("CONTENT_VALIDATION_FAILED");
  });

  it("accepts an explicitly unavailable grammar section and does not require invented lexical relations", () => {
    const manual = structuredClone(completeLesson) as any;
    manual.parts.find((part: any) => part.code === "grammar").content = {
      status: "unavailable", hidden: true, reason: "no_suitable_content"
    };
    for (const item of manual.parts.find((part: any) => part.code === "vocabulary").content.items) {
      item.family = [];
      item.synonyms = [];
      item.antonyms = [];
      item.umbrella = null;
    }
    const result = validateLessonPublication(
      [1, 2, 3, 4, 5].map((dayNumber) => ({ ...manual, dayNumber })),
      { task: "Write about work.", guidance: "Use the lesson.", requiredVocabulary: ["work"] }
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("retires a publication without changing its content payload", () => {
    const payload = { lessons: [completeLesson] };
    expect(retirePublishedContent({ status: "published", payload })).toEqual({ status: "retired", payload });
  });
});
