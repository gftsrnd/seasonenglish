import { describe, expect, it } from "vitest";
import { buildMonthlyCalendar, monthlyDayKind } from "../src/monthly/curriculum.js";
import {
  evaluateMonthlyLessonAccess, monthlyAttendanceDates, monthlyWeeklyReviews, weeklyReviewAttendanceOutcome,
  weeklyReviewForLesson, type MonthlyAccessLessonInput
} from "../src/monthly/weekly-review.js";

function monthLessons(month: string, completedNumbers: readonly number[] = []): MonthlyAccessLessonInput[] {
  const calendar = buildMonthlyCalendar(month);
  const reviews = new Map(monthlyWeeklyReviews(calendar).map((slot) => [slot.lessonNumber, slot]));
  return calendar.effectiveDays.map((date, index) => {
    const lessonNumber = index + 1;
    const slot = reviews.get(lessonNumber);
    return {
      lessonNumber,
      date,
      kind: monthlyDayKind(lessonNumber, calendar),
      completed: completedNumbers.includes(lessonNumber),
      ...(slot ? { reviewGatesNextWeek: slot.gatesNextWeek, reviewFromPreviousMonth: slot.fromPreviousMonth } : {})
    };
  });
}

function accessOf(month: string, systemDate: string, completed: readonly number[], lessonNumber: number, holidays: readonly string[] = []) {
  return evaluateMonthlyLessonAccess({ month, systemDate, lessons: monthLessons(month, completed), holidays }).find((item) => item.lessonNumber === lessonNumber);
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

describe("weekly review identity", () => {
  it("binds each Friday review to the Mon–Thu new lessons of its calendar week (11/2026, exam Monday)", () => {
    const slots = monthlyWeeklyReviews("2026-11");
    expect(slots.map((slot) => [slot.reviewDate, slot.weekNumber, slot.prerequisiteLessonNumbers, slot.gatesNextWeek])).toEqual([
      ["2026-11-06", 1, [1, 2, 3, 4], true],
      ["2026-11-13", 2, [6, 7, 8, 9], true],
      ["2026-11-20", 3, [11, 12, 13, 14], true],
      ["2026-11-27", 4, [16, 17, 18, 19], true]
    ]);
    expect(weeklyReviewForLesson(7, "2026-11")?.reviewDate).toBe("2026-11-13");
  });

  it("keeps a review for a short month-start week and drops it in a Mon–Thu exam week (12/2026, exam Thu 31)", () => {
    const slots = monthlyWeeklyReviews("2026-12");
    expect(slots.map((slot) => slot.reviewDate)).toEqual(["2026-12-04", "2026-12-11", "2026-12-18", "2026-12-25"]);
    expect(slots[0]).toMatchObject({ weekNumber: 1, prerequisiteLessonNumbers: [1, 2, 3], gatesNextWeek: true });
    // 28–30/12 are new lessons with no review; the exam week neither has nor creates a gate.
    expect(weeklyReviewForLesson(20, "2026-12")).toBeNull();
    expect(slots.some((slot) => slot.reviewDate >= "2026-12-28")).toBe(false);
  });

  it("uses previous-month material for a month starting on Friday and lets the exam replace a Friday review (01/2027)", () => {
    const slots = monthlyWeeklyReviews("2027-01");
    expect(slots.map((slot) => slot.reviewDate)).toEqual(["2027-01-01", "2027-01-08", "2027-01-15", "2027-01-22"]);
    expect(slots[0]).toMatchObject({ lessonNumber: 1, fromPreviousMonth: true, gatesNextWeek: false, prerequisiteLessonNumbers: [] });
    expect(slots.some((slot) => slot.reviewDate === "2027-01-29")).toBe(false);
  });

  it("matches the review counts of the specification table", () => {
    expect(monthlyWeeklyReviews("2027-02")).toHaveLength(3);
    expect(monthlyWeeklyReviews("2027-03")).toHaveLength(4);
    expect(monthlyWeeklyReviews("2027-07")).toHaveLength(4);
  });
});

describe("next-week unlock gate", () => {
  it("locks Monday of week 2 until the week 1 review is complete", () => {
    expect(accessOf("2026-11", "2026-11-09", range(1, 4), 6)).toEqual({ lessonNumber: 6, locked: true, reason: "review", blockerLessonNumber: 5, reviewWeekNumber: 1 });
    expect(accessOf("2026-11", "2026-11-09", range(1, 5), 6)).toEqual({ lessonNumber: 6, locked: false });
  });

  it("opens the review only on its Friday and only after every daily lesson of the week", () => {
    expect(accessOf("2026-11", "2026-11-05", range(1, 4), 5)).toEqual({ lessonNumber: 5, locked: true, reason: "date", opensAt: "2026-11-06" });
    expect(accessOf("2026-11", "2026-11-06", range(1, 3), 5)).toEqual({ lessonNumber: 5, locked: true, reason: "prior", blockerLessonNumber: 4 });
    expect(accessOf("2026-11", "2026-11-06", range(1, 4), 5)).toEqual({ lessonNumber: 5, locked: false });
  });

  it("forces multi-week makeup into week 1 lessons → week 1 review → week 2 lessons order", () => {
    expect(accessOf("2026-11", "2026-11-18", [], 6)).toMatchObject({ reason: "prior", blockerLessonNumber: 1 });
    expect(accessOf("2026-11", "2026-11-18", range(1, 4), 6)).toMatchObject({ reason: "review", blockerLessonNumber: 5, reviewWeekNumber: 1 });
    expect(accessOf("2026-11", "2026-11-18", range(1, 5), 6)).toEqual({ lessonNumber: 6, locked: false });
    expect(accessOf("2026-11", "2026-11-18", range(1, 9), 11)).toMatchObject({ reason: "review", blockerLessonNumber: 10, reviewWeekNumber: 2 });
  });

  it("applies the same order to a newcomer catching up past lessons (approved 09/11, HV-S30/S31)", () => {
    expect(accessOf("2026-11", "2026-11-09", range(1, 4), 6)).toMatchObject({ reason: "review", reviewWeekNumber: 1 });
    expect(accessOf("2026-11", "2026-11-09", range(1, 5), 6)).toMatchObject({ locked: false });
  });

  it("does not gate on a month-start carryover review (HV-S50)", () => {
    expect(accessOf("2027-01", "2027-01-04", [], 2)).toEqual({ lessonNumber: 2, locked: false });
  });

  it("lets holiday lessons open after the pre-chain lesson but keeps a Friday review in the chain as a gate", () => {
    const holidays = ["2026-11-04", "2026-11-05", "2026-11-06"];
    // Learner finished N2 before the Wed–Fri chain; the chain lessons open.
    expect(accessOf("2026-11", "2026-11-05", [1, 2], 4, holidays)).toEqual({ lessonNumber: 4, locked: false });
    // The Monday after the chain still waits for the Friday review in the chain.
    expect(accessOf("2026-11", "2026-11-09", [1, 2], 6, holidays)).toMatchObject({ reason: "review", blockerLessonNumber: 5 });
    // The review itself needs the week's lessons, holiday ones included.
    expect(accessOf("2026-11", "2026-11-09", [1, 2], 5, holidays)).toMatchObject({ reason: "prior", blockerLessonNumber: 3 });
    expect(accessOf("2026-11", "2026-11-09", range(1, 5), 6, holidays)).toMatchObject({ locked: false });
  });

  it("opens the first lesson after a chain without the chain lessons when no review is inside it", () => {
    const holidays = ["2026-11-03", "2026-11-04"];
    expect(accessOf("2026-11", "2026-11-05", [1], 4, holidays)).toEqual({ lessonNumber: 4, locked: false });
    // Not finishing the lesson before the chain keeps the chain locked as usual.
    expect(accessOf("2026-11", "2026-11-05", [], 2, holidays)).toMatchObject({ reason: "prior", blockerLessonNumber: 1 });
  });
});

describe("review attendance", () => {
  it("counts Friday when the week's review is completed on that Friday", () => {
    expect(weeklyReviewAttendanceOutcome({ month: "2026-11", reviewDate: "2026-11-06", completedDate: "2026-11-06" }))
      .toEqual({ reviewFridayAttended: true, creditedDate: "2026-11-06" });
  });

  it("leaves Friday absent and credits nothing for a weekend makeup (HV-S48)", () => {
    expect(weeklyReviewAttendanceOutcome({ month: "2026-11", reviewDate: "2026-11-06", completedDate: "2026-11-07" }))
      .toEqual({ reviewFridayAttended: false, creditedDate: null });
  });

  it("credits an effective makeup day even when that day's lesson is not done (HV-S49)", () => {
    expect(weeklyReviewAttendanceOutcome({ month: "2026-11", reviewDate: "2026-11-06", completedDate: "2026-11-09" }))
      .toEqual({ reviewFridayAttended: false, creditedDate: "2026-11-09" });
    expect(monthlyAttendanceDates({ month: "2026-11", completions: [{ completedDate: "2026-11-09", kind: "review" }] })).toEqual(["2026-11-09"]);
  });

  it("does not count a daily lesson completed on Friday as Friday attendance", () => {
    expect(monthlyAttendanceDates({ month: "2026-11", completions: [{ completedDate: "2026-11-06", kind: "new" }] })).toEqual([]);
    expect(monthlyAttendanceDates({ month: "2026-11", completions: [
      { completedDate: "2026-11-06", kind: "new" }, { completedDate: "2026-11-06", kind: "review" }
    ] })).toEqual(["2026-11-06"]);
  });

  it("counts Mon–Thu daily lessons once per day, ignores weekends and the exam date, and adds arrived holidays", () => {
    const dates = monthlyAttendanceDates({
      month: "2026-11", systemDate: "2026-11-18",
      completions: [
        { completedDate: "2026-11-02", kind: "new" }, { completedDate: "2026-11-02", kind: "new" },
        { completedDate: "2026-11-08", kind: "new" }, { completedDate: "2026-11-30", kind: "new" }
      ],
      holidays: ["2026-11-17", "2026-11-19"]
    });
    expect(dates).toEqual(["2026-11-02", "2026-11-17"]);
  });

  it("counts the month-start carryover review for the new month (CH-R17)", () => {
    expect(monthlyAttendanceDates({ month: "2027-01", completions: [{ completedDate: "2027-01-01", kind: "review" }] })).toEqual(["2027-01-01"]);
  });
});
