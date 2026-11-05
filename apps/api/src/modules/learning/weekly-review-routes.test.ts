import { describe, expect, it } from "vitest";
import type { LessonPart } from "@e4s/contracts";
import { answerWeeklyReviewItem, resumeWeeklyReviewSession, weeklyReviewSectionsFromParts } from "@e4s/domain/monthly";
import { buildWeeklyReviewSessionView } from "./weekly-review-routes.js";

const parts: LessonPart[] = [
  { code: "vocabulary", title: "Từ tuần", content: { items: [{ word: "deadline", meaning: "hạn chót" }] } },
  { code: "listening", title: "Nghe", content: { items: [
    { id: "l1", prompt: "Chọn nghĩa của deadline", options: ["hạn chót", "ngân sách"], answer: "hạn chót", explanation: "Deadline là hạn chót.",
      variants: [{ id: "l1-v1", prompt: "Từ nào nghĩa là hạn chót?", options: ["deadline", "budget"], answer: "deadline" }] }
  ] } },
  { code: "speaking", title: "Nói – Viết", content: { prompt: "Reply using two weekly words.", requiredWords: ["deadline", "budget"] } }
];

describe("weekly review session view", () => {
  const sections = weeklyReviewSectionsFromParts(parts);

  it("never sends answer keys or explanations to the learner", () => {
    const view = buildWeeklyReviewSessionView("lesson-1", parts, sections, resumeWeeklyReviewSession(null, sections));
    expect(view.currentQuestion).toEqual({
      sectionCode: "listening", itemId: "l1", variantId: "l1", retry: false,
      prompt: "Chọn nghĩa của deadline", options: ["hạn chót", "ngân sách"], freeResponse: false, acceptsAudio: false
    });
    expect(JSON.stringify(view)).not.toContain("Deadline là hạn chót");
    expect(view.warmup).toEqual({ status: "pending", cards: [{ word: "deadline", meaning: "hạn chót" }] });
    expect(view.sections.map((section) => [section.code, section.totalItems, section.completed])).toEqual([["listening", 1, false], ["speaking", 1, false]]);
  });

  it("shows the alternative-context variant as a retry after a wrong answer", () => {
    const outcome = answerWeeklyReviewItem({ state: resumeWeeklyReviewSession(null, sections), sections, sectionCode: "listening", itemId: "l1", answer: "ngân sách", cefr: "A1" });
    if (!outcome.ok) throw new Error(outcome.code);
    const view = buildWeeklyReviewSessionView("lesson-1", parts, sections, outcome.state);
    expect(view.currentQuestion).toMatchObject({ itemId: "l1", variantId: "l1-v1", retry: true, prompt: "Từ nào nghĩa là hạn chót?" });
    expect(view.currentSectionCode).toBe("listening");
  });

  it("marks the free response section as accepting audio", () => {
    const first = answerWeeklyReviewItem({ state: resumeWeeklyReviewSession(null, sections), sections, sectionCode: "listening", itemId: "l1", answer: "hạn chót" });
    if (!first.ok) throw new Error(first.code);
    const view = buildWeeklyReviewSessionView("lesson-1", parts, sections, first.state);
    expect(view.currentQuestion).toMatchObject({ sectionCode: "speaking", freeResponse: true, acceptsAudio: true });
  });
});
