import { describe, expect, it } from "vitest";
import {
  arenaEligible,
  decideDuel,
  seasonRioRoundPlan,
  scoreGameAttempt,
  weeklyPracticeAvailability
} from "../src/engagement/index.js";

const words = [
  { id: "w1", english: "colleague", vietnamese: "đồng nghiệp", partOfSpeech: "noun" },
  { id: "w2", english: "prepare", vietnamese: "chuẩn bị", partOfSpeech: "verb" },
  { id: "w3", english: "weekly summary", vietnamese: "bản tóm tắt tuần", partOfSpeech: "phrase" }
] as const;

describe("engagement policy", () => {
  it("derives weekly-practice availability from completed lessons", () => {
    expect(weeklyPracticeAvailability(2, 5, false)).toEqual({ state: "locked", remaining: 3 });
    expect(weeklyPracticeAvailability(5, 5, false)).toEqual({ state: "open", remaining: 0 });
    expect(weeklyPracticeAvailability(5, 5, true)).toEqual({ state: "submitted", remaining: 0 });
  });

  it("scores answers from the server word set instead of trusting a client score", () => {
    const result = scoreGameAttempt("scramble", words, [
      { wordId: "w1", answer: "colleague", attempts: 1, usedHint: false },
      { wordId: "w2", answer: "wrong", attempts: 1, usedHint: false },
      { wordId: "w3", answer: "weekly summary", attempts: 2, usedHint: false }
    ]);
    expect(result).toMatchObject({ score: 3, maxScore: 6, correct: 2 });
  });

  it("does not award the same game round more than once when a client repeats it", () => {
    const repeated = Array.from({ length: 3 }, () => ({
      wordId: "w1", answer: "colleague", attempts: 1, usedHint: false
    }));
    expect(scoreGameAttempt("scramble", words, repeated)).toMatchObject({
      score: 2, maxScore: 6, correct: 1, total: 3
    });
    expect(scoreGameAttempt("typing", words, repeated.map((answer) => ({ ...answer, combo: 5 })))).toMatchObject({
      score: 10, maxScore: 150, correct: 1, total: 3
    });
  });

  it("applies each game rule on the server", () => {
    expect(scoreGameAttempt("sort", words, [
      { wordId: "w1", answer: "noun" }, { wordId: "w2", answer: "noun" }
    ])).toMatchObject({ score: 1, maxScore: 3, total: 3 });
    expect(scoreGameAttempt("sort", [...words, {
      id: "w4", english: "follow up", vietnamese: "theo dõi", partOfSpeech: "phrasal verb"
    }], [{ wordId: "w4", answer: "phrase" }])).toMatchObject({ score: 1, maxScore: 4, total: 4 });
    expect(scoreGameAttempt("typing", words, [
      { wordId: "w1", answer: "colleague", combo: 2 }, { wordId: "w2", answer: "prepare", combo: 5 }
    ])).toMatchObject({ score: 30, maxScore: 150, total: 3 });
    expect(scoreGameAttempt("eggs", words, [
      { wordId: "w1", answer: "colleague" }, { wordId: "w2", answer: "no" }
    ])).toMatchObject({ score: 1, maxScore: 3, total: 3 });
    expect(scoreGameAttempt("mario", words, [
      { wordId: "w1", answer: "colleague" }, { wordId: "w2", answer: "prepare" }
    ])).toMatchObject({ score: 2, maxScore: 6, total: 6 });
  });

  it("keeps the published maximum when a fixed-length game ends early", () => {
    const fullSet = Array.from({ length: 12 }, (_, index) => ({
      id: `fixed-${index + 1}`,
      english: `term${String.fromCharCode(97 + index)}`,
      vietnamese: `từ ${index + 1}`,
      partOfSpeech: index % 2 ? "verb" : "noun"
    }));
    const oneCorrect = [{ wordId: "fixed-1", answer: "terma" }];

    expect(scoreGameAttempt("scramble", fullSet, oneCorrect)).toMatchObject({ score: 2, maxScore: 16, correct: 1, total: 8 });
    expect(scoreGameAttempt("eggs", fullSet, oneCorrect)).toMatchObject({ score: 1, maxScore: 10, correct: 1, total: 10 });
    expect(scoreGameAttempt("mario", fullSet, oneCorrect)).toMatchObject({ score: 1, maxScore: 11, correct: 1, total: 11 });
    expect(scoreGameAttempt("sort", fullSet, [{ wordId: "fixed-1", answer: "noun" }])).toMatchObject({ score: 1, maxScore: 12, correct: 1, total: 12 });
    expect(scoreGameAttempt("typing", fullSet, [{ ...oneCorrect[0]!, combo: 1 }])).toMatchObject({ score: 10, maxScore: 500, correct: 1, total: 10 });
  });

  it("plans only answerable Season-rio gates while retaining three repeatable boss questions", () => {
    const shortSet = Array.from({ length: 4 }, (_, index) => ({
      id: `short-${index + 1}`,
      english: `word${index + 1}`,
      vietnamese: `từ ${index + 1}`,
      partOfSpeech: "noun"
    }));
    expect(seasonRioRoundPlan(shortSet)).toMatchObject({ gateCount: 4, bossQuestions: 3, total: 7 });
    expect(scoreGameAttempt("mario", shortSet, [{ wordId: "short-1", answer: "word1" }]))
      .toMatchObject({ score: 1, maxScore: 7, total: 7 });
  });

  it("scores a completed crossword by correct words minus individual letter hints", () => {
    expect(scoreGameAttempt("crossword", words, [
      { wordId: "w1", answer: "colleague" },
      { wordId: "w2", answer: "prepare" },
      { wordId: "w3", answer: "weekly summary" }
    ], { hintsUsed: 1 })).toMatchObject({ score: 2, maxScore: 3, correct: 3, total: 3 });
  });

  it("opens Arena at B1 and decides Duel by score percentage", () => {
    expect(arenaEligible("A2")).toBe(false);
    expect(arenaEligible("B1")).toBe(true);
    expect(decideDuel({ score: 8, maxScore: 10 }, { score: 70, maxScore: 100 })).toBe("challenger");
    expect(decideDuel({ score: 7, maxScore: 10 }, { score: 14, maxScore: 20 })).toBe("draw");
  });
});
