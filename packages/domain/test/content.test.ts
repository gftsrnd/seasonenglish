import { describe, expect, it } from "vitest";
import {
  approveContentVersion,
  retirePublishedContent,
  submitContentForReview,
  validateLessonDraft
} from "../src/content/index.js";

const completeLesson = {
  dayNumber: 1,
  title: "I work in… as…",
  durationMinutes: 10,
  parts: [
    { code: "objective", title: "Mục tiêu", content: { text: "Tự giới thiệu công việc." } },
    { code: "instruction", title: "Hướng dẫn", content: { text: "Dùng I work in… as…" } },
    { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"] } },
    { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [team] as [role]." } },
    { code: "pronunciation", title: "Phát âm", content: { focus: "/w/" } },
    { code: "listening", title: "Nghe", content: { prompt: "Where does she work?" } },
    { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern." } },
    { code: "writing", title: "Viết", content: { prompt: "Write one sentence." } },
    { code: "speaking", title: "Nói", content: { prompt: "Introduce your role." } }
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
    expect(submitContentForReview({ status: "draft", lessons: fiveLessons })).toEqual({ status: "review" });

    expect(approveContentVersion({ status: "review", createdBy: "operator-a", checkerId: "operator-a" }))
      .toEqual({ status: "published", approvedBy: "operator-a" });
    expect(approveContentVersion({ status: "review", createdBy: "operator-a", checkerId: "operator-b" }))
      .toEqual({ status: "published", approvedBy: "operator-b" });
  });

  it("retires a publication without changing its content payload", () => {
    const payload = { lessons: [completeLesson] };
    expect(retirePublishedContent({ status: "published", payload })).toEqual({ status: "retired", payload });
  });
});
