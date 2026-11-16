import { describe, expect, it } from "vitest";
import type { LessonPart } from "@e4s/contracts";
import {
  answerWeeklyReviewItem, currentWeeklyReviewSection, gradeWeeklyReviewAnswer, isWeeklyReviewComplete,
  resumeWeeklyReviewSession, setWeeklyReviewWarmup, weeklyReviewSectionsFromParts, weeklyReviewSectionTitle, weeklyReviewWarmupCards,
  type WeeklyReviewSessionState
} from "../src/monthly/weekly-review-session.js";

const parts: LessonPart[] = [
  { code: "vocabulary", title: "Từ tuần", content: { items: [{ word: "deadline", meaning: "hạn chót" }, { word: "budget", meaning: "ngân sách" }] } },
  { code: "listening", title: "Nghe", content: { items: [
    { id: "l1", prompt: "Nghe và chọn nghĩa: deadline", options: ["hạn chót", "ngân sách"], answer: "hạn chót", explanation: "Deadline là hạn chót." },
    { id: "l2", prompt: "Nghe và chọn nghĩa: budget", options: ["hạn chót", "ngân sách"], answer: "ngân sách" }
  ] } },
  { code: "word_use", title: "Word use", content: { items: [
    { id: "u1", prompt: "The ___ is Friday.", answer: "deadline", explanation: "Hạn chót dùng deadline.", variants: [
      { id: "u1-a", prompt: "We must meet the ___ for the report.", answer: "deadline", explanation: "Meet the deadline = kịp hạn chót." },
      { id: "u1-b", prompt: "The project ___ moved to Monday.", answer: "deadline" }
    ] }
  ] } },
  // Legacy single-question part (current generated reviews).
  { code: "word_class", title: "Word form", content: { prompt: "Choose the noun", options: ["budget", "budgetary"], answer: "budget" } },
  { code: "speaking", title: "Nói – Viết", content: { prompt: "Reply to your manager using two weekly words.", requiredWords: ["deadline", "budget"] } }
];

const sections = weeklyReviewSectionsFromParts(parts);

function answer(state: WeeklyReviewSessionState, text: string) {
  const section = currentWeeklyReviewSection(state)!;
  const result = answerWeeklyReviewItem({ state, sections, sectionCode: section.code, itemId: section.queue[0]!.itemId, answer: text, cefr: "A2", now: new Date("2026-11-06T09:00:00Z") });
  if (!result.ok) throw new Error(result.code);
  return result;
}

describe("weekly review session", () => {
  it("builds ordered sections from lesson parts and warm-up cards from vocabulary", () => {
    expect(sections.map((section) => section.code)).toEqual(["listening", "word_use", "word_class", "speaking"]);
    expect(sections[2]!.items).toEqual([expect.objectContaining({ id: "word_class-1", answer: "budget" })]);
    expect(weeklyReviewWarmupCards(parts).map((card) => card.word)).toEqual(["deadline", "budget"]);
  });

  it("explains a wrong answer and asks the item again at the end of the section", () => {
    let state = resumeWeeklyReviewSession(null, sections);
    const wrong = answer(state, "ngân sách");
    expect(wrong).toMatchObject({ correct: false, willRetry: true, feedback: "Deadline là hạn chót." });
    state = wrong.state;
    expect(state.sections[0]!.queue).toEqual([
      { itemId: "l2", variant: 0, retry: false },
      { itemId: "l1", variant: 0, retry: true }
    ]);
    state = answer(state, "ngân sách").state;
    expect(currentWeeklyReviewSection(state)?.code).toBe("listening");
    state = answer(state, "hạn chót").state;
    expect(currentWeeklyReviewSection(state)?.code).toBe("word_use");
    expect(state.sections[0]!.correctItemIds).toEqual(["l2", "l1"]);
  });

  it("retries with alternative-context variants in rotation and never limits attempts", () => {
    let state = resumeWeeklyReviewSession(null, sections);
    state = answer(answer(state, "hạn chót").state, "ngân sách").state;
    const seen: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      const result = answer(state, "budget");
      expect(result.correct).toBe(false);
      state = result.state;
      seen.push(state.sections[1]!.queue[0]!.variant);
    }
    expect(seen.slice(0, 4)).toEqual([1, 2, 1, 2]);
    expect(answer(state, "deadline").correct).toBe(true);
  });

  it("stores no attempt count or score", () => {
    let state = resumeWeeklyReviewSession(null, sections);
    state = answer(state, "wrong").state;
    const serialized = JSON.stringify(state);
    expect(serialized).not.toMatch(/attempt|score/iu);
  });

  it("resumes at the first unfinished section without losing correct answers", () => {
    let state = resumeWeeklyReviewSession(null, sections);
    state = answer(state, "hạn chót").state;
    state = answer(state, "ngân sách").state;
    state = answer(state, "wrong").state;
    const restored = resumeWeeklyReviewSession(JSON.parse(JSON.stringify(state)), sections);
    expect(currentWeeklyReviewSection(restored)?.code).toBe("word_use");
    expect(restored.sections[0]!.correctItemIds).toEqual(["l1", "l2"]);
    expect(restored.sections[1]!.queue).toEqual([{ itemId: "u1", variant: 1, retry: true }]);
    expect(restored.sections[1]!.answers).toEqual({ u1: "wrong" });
  });

  it("rejects answers for a section that is not current", () => {
    const state = resumeWeeklyReviewSession(null, sections);
    expect(answerWeeklyReviewItem({ state, sections, sectionCode: "word_use", itemId: "u1", answer: "deadline" }))
      .toEqual({ ok: false, code: "REVIEW_SECTION_NOT_CURRENT" });
  });

  it("completes when every item is correct once, whatever happened to the optional warm-up", () => {
    let state = resumeWeeklyReviewSession(null, sections);
    expect(state.warmup).toBe("pending");
    for (const text of ["hạn chót", "ngân sách", "deadline", "budget"]) state = answer(state, text).state;
    expect(isWeeklyReviewComplete(state)).toBe(false);
    state = answer(state, "I will check the budget before the deadline.").state;
    expect(isWeeklyReviewComplete(state)).toBe(true);
    expect(state.completedAt).toBe("2026-11-06T09:00:00.000Z");
    expect(state.warmup).toBe("pending");
    expect(setWeeklyReviewWarmup(state, "skipped")).toMatchObject({ warmup: "skipped", completedAt: "2026-11-06T09:00:00.000Z" });
  });

  it("passes a free response only when it is English and uses two weekly words (HV-S45/S46)", () => {
    const variant = { id: "s", prompt: "Reply", requiredWords: ["deadline", "budget"] };
    expect(gradeWeeklyReviewAnswer(variant, { answer: "Tôi sẽ kiểm tra deadline và budget." })).toBe(false);
    expect(gradeWeeklyReviewAnswer(variant, { answer: "I check the budget." })).toBe(false);
    expect(gradeWeeklyReviewAnswer(variant, { answer: "budget deadline is tomorrow and we has no money" })).toBe(true);
    expect(gradeWeeklyReviewAnswer({ id: "a", prompt: "Read aloud", acceptsAudio: true }, { artifactKey: "audio/1" })).toBe(true);
  });
});

describe("B1+ review language (16/11)", () => {
  it("names the sections in English from B1 and in Vietnamese at A1-A2", () => {
    const codes = ["listening", "word_use", "word_class", "grammar", "reading", "speaking"] as const;
    expect(codes.map((code) => weeklyReviewSectionTitle(code, "B1"))).toEqual(["Listen & recognise words", "Word use", "Word form", "Grammar", "Listening & reading", "Pronunciation, speaking & writing"]);
    expect(codes.map((code) => weeklyReviewSectionTitle(code, "A2"))).toEqual(["Nghe & nhận biết từ", "Word use", "Word form", "Ngữ pháp", "Nghe – Đọc hiểu", "Phát âm & Nói – Viết"]);
    for (const cefr of ["B1", "B2", "C1"]) for (const code of codes) expect(weeklyReviewSectionTitle(code, cefr)).not.toMatch(/[ăâđêôơưàáảãạầấậèéẹềếệìíịòóọồốộờớợùúụừứựỳýỵ]/iu);
  });
  it("warm-up cards carry no Vietnamese meaning from B1", () => {
    const parts = [{ code: "vocabulary", title: "Vocabulary", content: { items: [{ word: "deadline", meaning: "hạn chót" }] } }] as unknown as LessonPart[];
    expect(weeklyReviewWarmupCards(parts, "B1")).toEqual([{ word: "deadline" }]);
    expect(weeklyReviewWarmupCards(parts, "A1")).toEqual([{ word: "deadline", meaning: "hạn chót" }]);
  });
});
