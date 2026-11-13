import { describe, expect, it } from "vitest";
import { validateLessonPublication } from "../src/content/index.js";

const englishOnlyIssues = (titles: Record<string, string>) => {
  const parts = Object.entries(titles).map(([code, title]) => ({ code, title, content: code === "vocabulary" ? { items: [{ word: "deliverable", meaning: "sản phẩm bàn giao" }] } : { prompt: "Read the update and answer." } }));
  const { issues } = validateLessonPublication([{ dayNumber: 2, title: "Lesson 2", parts } as never], undefined, "B2");
  return issues.filter((issue) => issue.message.startsWith("B1+ requires all learner-facing content"));
};

describe("B1+ English-only rule and the editor's default section titles (13/11)", () => {
  it("does not flag the manual editor's standard Vietnamese section names", () => {
    expect(englishOnlyIssues({ objective: "Mục tiêu bài học", instruction: "Hướng dẫn làm bài", vocabulary: "Từ vựng", listening: "Nghe", word_use: "Dùng từ", speaking: "Nói" })).toEqual([]);
  });
  it("still flags a Vietnamese title that is not a standard section name", () => {
    expect(englishOnlyIssues({ listening: "Nghe đoạn hội thoại sau" }).map((issue) => issue.code)).toEqual(["listening"]);
  });
});
