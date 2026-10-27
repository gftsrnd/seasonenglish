import { describe, expect, it } from "vitest";
import type { LearnerLessonRecord } from "@e4s/database";
import { learnerLessonDisplayTitle } from "./routes.js";

function lesson(title: string, example: string): LearnerLessonRecord {
  return {
    id: "lesson-1",
    title,
    dayNumber: 1,
    weekNumber: 1,
    weekTopic: "Introducing yourself & your job",
    cefr: "A1",
    content: {
      parts: [{ code: "grammar", title: "Ngữ pháp", content: { formula: title, examples: [example] } }]
    },
    progress: { status: "not_started", completedPartCodes: [], evidence: {} },
    lock: null
  } as LearnerLessonRecord;
}

function lessonWithoutGrammar(title: string): LearnerLessonRecord {
  return {
    id: "lesson-no-grammar",
    title,
    dayNumber: 1,
    weekNumber: 1,
    weekTopic: "Reporting a safety incident",
    cefr: "A1",
    content: {
      parts: [
        { code: "objective", title: "Mục tiêu", content: { items: [{ type: "content", text: "Nói về một sự cố." }] } },
        { code: "grammar", title: "Ngữ pháp", content: { status: "unavailable", hidden: true } }
      ]
    },
    progress: { status: "not_started", completedPartCodes: [], evidence: {} },
    lock: null
  } as LearnerLessonRecord;
}

describe("learnerLessonDisplayTitle", () => {
  it("replaces a persisted generic grammar placeholder with the lesson's concrete example", () => {
    expect(learnerLessonDisplayTitle(lesson("S + V + O", "I check the report."))).toBe("I check the report");
  });

  it("keeps only the English sentence when a generic title falls back to a bilingual example", () => {
    expect(learnerLessonDisplayTitle(lesson("S + V + O", "Maybe you could add a chart to the report. (Có lẽ bạn có thể thêm biểu đồ.)"))).toBe(
      "Maybe you could add a chart to the report"
    );
  });

  it("keeps an already specific sentence frame", () => {
    expect(learnerLessonDisplayTitle(lesson("It is + adjective", "It is good."))).toBe("It is + adjective");
  });

  it("uses the content topic instead of a grammar-shaped title when grammar is unavailable", () => {
    expect(learnerLessonDisplayTitle(lessonWithoutGrammar("Say what happened: 'A man fell down'"))).toBe(
      "Reporting a safety incident"
    );
  });
});
