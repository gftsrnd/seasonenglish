import { describe, expect, it } from "vitest";
import { consecutiveLearningAbsences, learningAbsenceStreak, evaluateMonthlyExamEligibility, monthlyAttendanceCountedDates, evaluateMonthlyLevelUpReadiness, monthlyExamEntryState, learnerMonthlySeasonTarget, monthlyLearnerWindow, monthlySeasonTurnTarget, monthlyAccessState, monthlyAccessCanStudy, monthlyAccessCounts } from "../src/progression/monthly-eligibility.js";

it("allows starts through the 23:24 ICT minute and closes at 23:25", () => {
  expect(monthlyExamEntryState("2026-11-29", "2026-11-30", "23:59:59")).toBe("upcoming");
  expect(monthlyExamEntryState("2026-11-30", "2026-11-30", "00:00:00")).toBe("open");
  expect(monthlyExamEntryState("2026-11-30", "2026-11-30", "23:24:59")).toBe("open");
  expect(monthlyExamEntryState("2026-11-30", "2026-11-30", "23:25:00")).toBe("closed");
  expect(monthlyExamEntryState("2026-12-01", "2026-11-30", "00:00:00")).toBe("closed");
});

it("prorates newcomers from their first effective day and defers below 75 percent", () => {
  expect(monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-07")).toMatchObject({ effectiveDays: 15, canStudy: true, startDate: "2026-11-09", seasonTarget: 75 });
  expect(monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-10")).toMatchObject({ effectiveDays: 14, canStudy: false, startDate: "2026-12-01" });
  expect(monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-30")).toMatchObject({ effectiveDays: 0, canStudy: false });
});

it("counts only elapsed effective dates and resets the streak on attendance", () => {
  const dates = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"];
  expect(consecutiveLearningAbsences(dates, [], "2026-11-11")).toBe(5);
  expect(consecutiveLearningAbsences(dates, ["2026-11-09"], "2026-11-11")).toBe(1);
  expect(consecutiveLearningAbsences(dates, [], "2026-11-11", "2026-11-10")).toBe(1);
});

it("keys an absence streak by its first missed date so each streak level is reported once", () => {
  const dates = ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"];
  expect(learningAbsenceStreak(dates, ["2026-11-05"], "2026-11-11")).toEqual({ days: 3, startedOn: "2026-11-06" });
  expect(learningAbsenceStreak(dates, ["2026-11-05"], "2026-11-12")).toEqual({ days: 4, startedOn: "2026-11-06" });
  expect(learningAbsenceStreak(dates, ["2026-11-10"], "2026-11-11")).toEqual({ days: 0, startedOn: null });
});

it("shows attendance today without treating today as an elapsed absence", () => {
  const result = evaluateMonthlyExamEligibility({
    systemDate: "2026-11-12", examDate: "2026-11-30", effectiveDays: 15, elapsedEffectiveDays: 3,
    attendedDays: 2, attendedElapsedDays: 1, scheduledLessons: 0, completedLessons: 0, seasonTurns: 74,
    seasonTarget: 75, frameworkApproved: true, formPublished: true
  });
  expect(result).toMatchObject({ attendedDays: 2, absenceDays: 2, maxAbsences: 4, seasonTurnsRequired: 75, seasonEligible: false });
});

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

it("uses one Season target rule for Coach and monthly-exam eligibility", () => {
  // Approved after a third of November: the prorated window target (65) is not a
  // cohort target because the learner joins next month; both screens show 100.
  const late = monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-11");
  expect(late.canStudy).toBe(false);
  expect(learnerMonthlySeasonTarget({ ...late, state: "waiting_next_month" })).toBe(100);
  expect(learnerMonthlySeasonTarget({ ...late, state: "uncounted" })).toBe(100);
  const prorated = monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-09");
  expect(learnerMonthlySeasonTarget({ ...prorated, state: "active" })).toBe(prorated.seasonTarget);
  expect(learnerMonthlySeasonTarget(null)).toBe(100);
});

it("counts absences only on days that had an approved lesson (December 2026: 22 absences with 7 lessons)", () => {
  const window = monthlyLearnerWindow("2026-12", "2026-12-31", "2026-12-01");
  expect(window.effectiveDays).toBe(22);
  // The December 4300 run generated only L1-L3, L4 (review), L5, L8 and L16.
  const lessonDates = ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-07", "2026-12-10", "2026-12-22"];
  const examDay = monthlyAttendanceCountedDates(window.effectiveDates, new Set(lessonDates), "2026-12-31");
  expect(examDay).toEqual(lessonDates);
  const eligibility = evaluateMonthlyExamEligibility({
    systemDate: "2026-12-31", examDate: "2026-12-31", effectiveDays: examDay.length, elapsedEffectiveDays: examDay.length,
    attendedDays: 5, attendedElapsedDays: 5, scheduledLessons: 6, completedLessons: 5, seasonTurns: 0,
    frameworkApproved: true, formPublished: true, windowOpen: true
  });
  expect(eligibility.absenceDays).toBe(2);
  expect(eligibility.maxAbsences).toBe(2);
  expect(eligibility.reasons).not.toContain("MONTHLY_ATTENDANCE_LIMIT_EXCEEDED");
  // Mid-month: today and later days stay counted (their lessons may still be approved); past days without a lesson do not.
  expect(monthlyAttendanceCountedDates(window.effectiveDates, lessonDates, "2026-12-09").slice(0, 7)).toEqual(["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-07", "2026-12-09", "2026-12-10"]);
  expect(consecutiveLearningAbsences(examDay, ["2026-12-01"], "2026-12-31")).toBe(6);
});

describe("uncounted (học thử) month access", () => {
  const base = { cefr: "A1", publishedOn: "2026-11-02", systemDate: "2026-11-12" };
  it("lets a learner approved after 25% of the school days study a month that does not count", () => {
    const late = monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-12");
    expect(late.canStudy).toBe(false);
    const state = monthlyAccessState({ ...base, approvalDate: "2026-11-12", canStudy: late.canStudy });
    expect(state).toBe("uncounted");
    expect(monthlyAccessCanStudy(state)).toBe(true);
    expect(monthlyAccessCounts(state)).toBe(false);
    // Counting starts on the first day of the next month.
    expect(late.startDate).toBe("2026-12-01");
  });

  it("counts a month approved within the 75% window and the month after an uncounted one", () => {
    const onTime = monthlyLearnerWindow("2026-11", "2026-11-30", "2026-11-09");
    expect(monthlyAccessState({ ...base, approvalDate: "2026-11-09", canStudy: onTime.canStudy })).toBe("active");
    const nextMonth = monthlyLearnerWindow("2026-12", "2026-12-31", "2026-12-01");
    const state = monthlyAccessState({ cefr: "A1", publishedOn: "2026-12-01", systemDate: "2026-12-03", approvalDate: "2026-12-01", canStudy: nextMonth.canStudy });
    expect(state).toBe("active");
    expect(monthlyAccessCounts(state)).toBe(true);
  });

  it("keeps the other states", () => {
    expect(monthlyAccessState({ ...base, cefr: null, approvalDate: "2026-11-02", canStudy: true })).toBe("unplaced");
    expect(monthlyAccessState({ ...base, publishedOn: null, approvalDate: "2026-11-02", canStudy: true })).toBe("waiting_content");
    expect(monthlyAccessState({ ...base, approvalDate: "2026-12-01", canStudy: false })).toBe("waiting_next_month");
    for (const state of ["unplaced", "waiting_content", "waiting_next_month", "missed_exam"]) {
      expect(monthlyAccessCanStudy(state)).toBe(false);
      expect(monthlyAccessCounts(state)).toBe(false);
    }
  });
});
