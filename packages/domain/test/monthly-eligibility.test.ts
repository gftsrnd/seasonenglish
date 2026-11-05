import { describe, expect, it } from "vitest";
import { evaluateMonthlyExamEligibility, evaluateMonthlyLevelUpReadiness, monthlySeasonTurnTarget } from "../src/progression/monthly-eligibility.js";

describe("canonical monthly eligibility", () => {
  it("allows the fixed level final despite incomplete lessons and Season activity", () => {
    const result = evaluateMonthlyExamEligibility({
      systemDate: "2026-11-30", examDate: "2026-11-30", effectiveDays: 20, elapsedEffectiveDays: 20,
      attendedDays: 14, scheduledLessons: 20, completedLessons: 19, seasonTurns: 99,
      frameworkApproved: true, formPublished: true
    });
    expect(result.accessEligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.lessonsEligible).toBe(false);
    expect(result.seasonEligible).toBe(false);
    expect(result.attendanceEligible).toBe(true);
  });

  it("still blocks a learner whose absences exceed the monthly cap", () => {
    const result = evaluateMonthlyExamEligibility({
      systemDate: "2026-11-30", examDate: "2026-11-30", effectiveDays: 20, elapsedEffectiveDays: 20,
      attendedDays: 13, scheduledLessons: 20, completedLessons: 0, seasonTurns: 0,
      frameworkApproved: true, formPublished: true
    });
    expect(result.accessEligible).toBe(false);
    expect(result.reasons).toEqual(["MONTHLY_ATTENDANCE_LIMIT_EXCEEDED"]);
  });

  it("allows an approved attendance complaint to restore exam access", () => {
    const result = evaluateMonthlyExamEligibility({
      systemDate: "2026-11-30", examDate: "2026-11-30", effectiveDays: 20, elapsedEffectiveDays: 20,
      attendedDays: 12, scheduledLessons: 20, completedLessons: 0, seasonTurns: 0,
      attendanceOverride: true, frameworkApproved: true, formPublished: true
    });
    expect(result.absenceDays).toBe(8);
    expect(result.attendanceEligible).toBe(true);
    expect(result.attendanceOverride).toBe(true);
    expect(result.accessEligible).toBe(true);
  });

  it("opens the exam only for an approved framework, published form and the system exam window", () => {
    const result = evaluateMonthlyExamEligibility({
      systemDate: "2026-11-30", examDate: "2026-11-30", effectiveDays: 20, elapsedEffectiveDays: 20,
      attendedDays: 14, scheduledLessons: 20, completedLessons: 20, seasonTurns: 100,
      frameworkApproved: true, formPublished: true
    });
    expect(result.accessEligible).toBe(true);
    expect(result.accessState).toBe("eligible");
  });

  it("closes the system window after the exam date", () => {
    const result = evaluateMonthlyExamEligibility({
      systemDate: "2026-12-01", examDate: "2026-11-30", effectiveDays: 20, elapsedEffectiveDays: 20,
      attendedDays: 14, scheduledLessons: 20, completedLessons: 20, seasonTurns: 100,
      frameworkApproved: true, formPublished: true
    });
    expect(result.windowOpen).toBe(false);
    expect(result.accessEligible).toBe(false);
    expect(result.reasons).toContain("MONTHLY_EXAM_WINDOW_NOT_OPEN");
  });
});

describe("canonical level-up readiness", () => {
  const months = Array.from({ length: 6 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, "0")}`,
    eligible: true,
    finalScore: 71,
    finalPassed: index > 1,
    seasonTurns: index > 1 ? 100 : 40,
    absenceRate: 10
  }));

  it("requires six eligible months, the level pass count, average, latest pass and Season months", () => {
    const result = evaluateMonthlyLevelUpReadiness({ currentLevel: "B1", months });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("LEVEL_UP_MONTHLY_FINAL_AVERAGE_INSUFFICIENT");
    expect(result.reasons).toContain("LEVEL_UP_MONTHLY_FINAL_PASSES_INSUFFICIENT");
    expect(result.reasons).toContain("LEVEL_UP_SEASON_MONTHS_INSUFFICIENT");
  });

  it("uses the stricter B1-C1 thresholds and requires the latest month to pass", () => {
    const result = evaluateMonthlyLevelUpReadiness({
      currentLevel: "B1",
      months: months.map((month, index) => ({ ...month, finalScore: 75, finalPassed: index < 5, seasonTurns: 100 }))
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("LEVEL_UP_LATEST_MONTHLY_FINAL_MUST_PASS");
  });

  it("counts a newcomer month against its scaled Season target", () => {
    const result = evaluateMonthlyLevelUpReadiness({
      currentLevel: "A1",
      months: Array.from({ length: 6 }, (_, index) => ({
        month: `2026-${String(index + 1).padStart(2, "0")}`, eligible: true,
        finalScore: 75, finalPassed: true, seasonTurns: index === 5 ? 75 : 100,
        seasonTarget: index === 5 ? 75 : 100, absenceRate: 10
      }))
    });
    expect(result.seasonMonths).toBe(6);
    expect(result.eligible).toBe(true);
  });
});

describe("monthly Season quota", () => {
  it("scales and rounds up a newcomer target from their approval date", () => {
    expect(monthlySeasonTurnTarget("2026-11-09", "2026-11", "2026-11-30")).toBe(75);
    expect(monthlySeasonTurnTarget("2026-11-01", "2026-11", "2026-11-30")).toBe(100);
  });
});
