import { describe, expect, it } from "vitest";
import {
  buildLevelReadiness,
  calculateWeeklyPracticeScore,
  createLevelRetryPlan,
  nextEffectiveMonday,
  passesLevelUpExam,
  validateWeeklyPractice
} from "../src/progression/index.js";

describe("P2 progression policy", () => {
  it("enforces the A1/A2 sentence and weekly-vocabulary rules", () => {
    expect(validateWeeklyPractice({
      cefr: "A2",
      text: "I prepare the agenda. My colleague joins the meeting. We send a weekly summary.",
      weeklyVocabulary: ["prepare", "colleague", "weekly summary", "deadline"]
    })).toEqual({ valid: true, errors: [] });

    expect(validateWeeklyPractice({
      cefr: "A2",
      text: "I prepare the agenda. My colleague joins today.",
      weeklyVocabulary: ["prepare", "colleague", "weekly summary"]
    })).toEqual({
      valid: false,
      errors: [
        "Bài A1–A2 cần từ 3 đến 5 câu.",
        "Hãy dùng ít nhất 3 từ hoặc cụm từ của tuần."
      ]
    });
  });

  it("enforces B1 and B2+ length formats", () => {
    const b1 = Array.from({ length: 80 }, (_, index) => `word${index + 1}`).join(" ");
    expect(validateWeeklyPractice({ cefr: "B1", text: b1, weeklyVocabulary: [] })).toEqual({ valid: true, errors: [] });
    expect(validateWeeklyPractice({ cefr: "B1", text: "Too short.", weeklyVocabulary: [] }).valid).toBe(false);

    const dialogue = Array.from({ length: 8 }, (_, index) => `Speaker ${index + 1}: a useful line`).join("\n");
    const reflection = Array.from({ length: 120 }, (_, index) => `term${index + 1}`).join(" ");
    expect(validateWeeklyPractice({ cefr: "B2", text: dialogue, weeklyVocabulary: [] })).toEqual({ valid: true, errors: [] });
    expect(validateWeeklyPractice({ cefr: "C1", text: reflection, weeklyVocabulary: [] })).toEqual({ valid: true, errors: [] });
    expect(validateWeeklyPractice({ cefr: "B2", text: "Short response.", weeklyVocabulary: [] }).valid).toBe(false);
  });

  it("recalculates the 40/30/30 score and caps off-topic work at 30", () => {
    expect(calculateWeeklyPracticeScore({ meaning: 4, vocabulary: 3, grammar: 2, offTopic: false })).toBe(62);
    expect(calculateWeeklyPracticeScore({ meaning: 5, vocabulary: 5, grammar: 5, offTopic: true })).toBe(30);
  });

  it("uses all configured readiness thresholds instead of hard-coded values", () => {
    const readiness = buildLevelReadiness({
      metrics: { lessonCompletion: 88, firstTryAccuracy: 72, weeklyPractice: 79, coachRubric: 3.8, coachTurns: 7 },
      thresholds: { days: 21, lessons: 85, firstTry: 70, submission: 75, coach: 3.5, coachTurns: 6, wrong: 25, minParts: 5 },
      examAvailable: true
    });
    expect(readiness.windowDays).toBe(21);
    expect(readiness.eligible).toBe(true);
    expect(readiness.criteria.map((criterion) => [criterion.key, criterion.target, criterion.met])).toEqual([
      ["lessonCompletion", 85, true],
      ["firstTryAccuracy", 70, true],
      ["weeklyPractice", 75, true],
      ["coachRubric", 3.5, true]
    ]);
  });

  it("requires total 70 and at least 50 percent in every level-up skill", () => {
    const maxima = { listening: 30, reading: 30, writing: 20, speaking: 20 } as const;
    expect(passesLevelUpExam({ listening: 21, reading: 21, writing: 14, speaking: 14 }, maxima)).toBe(true);
    expect(passesLevelUpExam({ listening: 27, reading: 27, writing: 9, speaking: 17 }, maxima)).toBe(false);
    expect(passesLevelUpExam({ listening: 18, reading: 18, writing: 16, speaking: 17 }, maxima)).toBe(false);
  });

  it("creates a persisted retry-plan payload with the weakest skill and 14-day eligibility", () => {
    expect(createLevelRetryPlan({
      failedAt: new Date("2026-10-23T03:00:00.000Z"),
      scores: { listening: 18, reading: 21, writing: 8, speaking: 14 },
      readinessSnapshot: { lessonCompletion: 92, firstTryAccuracy: 78, weeklyPractice: 84, coachRubric: 4.1, coachTurns: 8 }
    })).toEqual({
      eligibleAt: "2026-11-06T03:00:00.000Z",
      weakestSkill: "writing",
      readinessSnapshot: { lessonCompletion: 92, firstTryAccuracy: 78, weeklyPractice: 84, coachRubric: 4.1, coachTurns: 8 }
    });
  });

  it("schedules approval for the next Monday midnight in Asia/Ho_Chi_Minh", () => {
    expect(nextEffectiveMonday(new Date("2026-10-21T10:00:00.000Z"), "Asia/Ho_Chi_Minh"))
      .toBe("2026-10-25T17:00:00.000Z");
    expect(nextEffectiveMonday(new Date("2026-10-25T18:00:00.000Z"), "Asia/Ho_Chi_Minh"))
      .toBe("2026-11-01T17:00:00.000Z");
  });
});
