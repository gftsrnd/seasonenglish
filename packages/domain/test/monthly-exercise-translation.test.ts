import { describe, expect, it } from "vitest";
import type { LessonPart } from "@e4s/contracts";
import { MONTHLY_ANSWER_TRANSLATION_RULE, exerciseTranslationRevealed, isSingleTokenAnswer, monthlyExerciseTranslationIssues, readExerciseTranslation, withoutExerciseTranslations } from "../src/monthly/exercise-translation.js";
import { answerWeeklyReviewItem, currentWeeklyReviewSection, resumeWeeklyReviewSession, weeklyReviewSectionsFromParts } from "../src/monthly/weekly-review-session.js";

const question = { prompt: "What does Lan check?", options: ["A report", "An email", "A meeting", "A call"], answer: "A report" };
const translated = { ...question, questionTranslation: "Lan kiểm tra gì?", answerTranslation: "Một báo cáo" };

describe("exercise question/answer translations (12/11)", () => {
  it("requires a short Vietnamese question and answer translation on every daily exercise with an answer", () => {
    expect(monthlyExerciseTranslationIssues("new", "reading", translated)).toEqual([]);
    expect(monthlyExerciseTranslationIssues("new", "reading", question)).toEqual([
      "reading.questionTranslation must be a short Vietnamese translation of the question",
      "reading.answerTranslation must be a short Vietnamese translation of the correct answer \"A report\""
    ]);
    expect(monthlyExerciseTranslationIssues("new", "word_use", { ...translated, answerTranslation: "A report" })[0]).toMatch(/answerTranslation must be a short Vietnamese/u);
    expect(monthlyExerciseTranslationIssues("new", "listening", { ...translated, questionTranslation: `Lan ${"kiểm tra ".repeat(40)}` })[0]).toMatch(/must be short/u);
    // A one-word name/number/acronym answer may stay as it is.
    expect(monthlyExerciseTranslationIssues("new", "listening", { prompt: "Where does she work?", answer: "AI", questionTranslation: "Cô ấy làm ở đâu?", answerTranslation: "AI" })).toEqual([]);
    // Speaking (no answer) and study parts are not exercises with an answer.
    expect(monthlyExerciseTranslationIssues("new", "speaking", { prompt: "Say a sentence.", sample: "The cost is high." })).toEqual([]);
    expect(monthlyExerciseTranslationIssues("new", "grammar", { formula: "x", items: [question] })).toEqual([]);
  });

  it("treats a one-token answer (contraction, hyphenated word) as one word: no Vietnamese gloss needed (December 2026 A1 L4)", () => {
    // Logged A1 week-1 review: grammar.items[0] key "isn't" kept answerTranslation "isn't" through six repair rounds.
    const grammarItem = { id: "g1", prompt: "Chọn từ đúng để hoàn thành câu: The report ____ ready.", options: ["isn't", "aren't", "am not", "not"], answer: "isn't", questionTranslation: "Báo cáo ____ sẵn sàng.", answerTranslation: "isn't" };
    expect(monthlyExerciseTranslationIssues("review", "grammar", { items: [{ ...grammarItem, variants: [{ ...grammarItem, id: "g1-v1", prompt: "Chọn từ đúng: The file ____ here.", questionTranslation: "Tệp ____ ở đây." }] }] })).toEqual([]);
    expect(monthlyExerciseTranslationIssues("new", "word_use", { prompt: "Choose the word.", answer: "co-worker", questionTranslation: "Chọn từ.", answerTranslation: "co-worker" })).toEqual([]);
    // Still present (the field is required), and two or more words are always translated.
    expect(monthlyExerciseTranslationIssues("new", "word_class", { prompt: "Choose.", answer: "isn't", questionTranslation: "Chọn." })).toEqual([
      "word_class.answerTranslation is missing: for the one-word answer \"isn't\" repeat the answer itself"
    ]);
    expect(monthlyExerciseTranslationIssues("new", "word_class", { prompt: "Choose.", answer: "are preparing", questionTranslation: "Chọn.", answerTranslation: "are preparing" })[0]).toMatch(/must be a short Vietnamese translation/u);
    expect(isSingleTokenAnswer(" isn't ")).toBe(true);
    expect(isSingleTokenAnswer("am not")).toBe(false);
    expect(MONTHLY_ANSWER_TRANSLATION_RULE).toContain("isn't");
  });

  it("checks every Friday review item and variant with an answer, not free responses", () => {
    const items = [
      { id: "r1", ...translated, variants: [{ id: "r1-v1", prompt: "What does Minh send?", options: ["A file", "A bag", "A cup", "A pen"], answer: "A file" }] },
      { id: "s4", prompt: "Tell your manager about it.", requiredWords: ["report"] }
    ];
    expect(monthlyExerciseTranslationIssues("review", "reading", { items })).toEqual([
      "reading.items[0].variants[0].questionTranslation must be a short Vietnamese translation of the question",
      "reading.items[0].variants[0].answerTranslation must be a short Vietnamese translation of the correct answer \"A file\""
    ]);
  });

  it("strips every translation for the learner view and reveals only after correct or exhausted", () => {
    const stripped = withoutExerciseTranslations({ ...translated, items: [{ ...translated, variants: [translated] }] });
    expect(JSON.stringify(stripped)).not.toMatch(/Translation/u);
    expect(stripped.prompt).toBe(question.prompt);
    expect(readExerciseTranslation(translated)).toEqual({ question: "Lan kiểm tra gì?", answer: "Một báo cáo" });
    expect(readExerciseTranslation(question)).toBeNull();
    expect(["correct", "wrong_exhausted"].map(exerciseTranslationRevealed)).toEqual([true, true]);
    expect(["wrong_retry", "unanswered", "submitted", undefined].map(exerciseTranslationRevealed)).toEqual([false, false, false, false]);
  });

  it("a Friday review answer hands over the translation only when correct", () => {
    const parts: LessonPart[] = [{ code: "reading", title: "Đọc", content: { items: [{ id: "r1", ...translated }] } }];
    const sections = weeklyReviewSectionsFromParts(parts);
    const state = resumeWeeklyReviewSession(null, sections);
    const itemId = currentWeeklyReviewSection(state)!.queue[0]!.itemId;
    const wrong = answerWeeklyReviewItem({ state, sections, sectionCode: "reading", itemId, answer: "An email", cefr: "B1" });
    expect(wrong.ok && wrong.translation).toBeFalsy();
    const right = answerWeeklyReviewItem({ state, sections, sectionCode: "reading", itemId, answer: "A report", cefr: "B1" });
    expect(right.ok && right.translation).toEqual({ question: "Lan kiểm tra gì?", answer: "Một báo cáo" });
  });
});
