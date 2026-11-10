import { describe, expect, it } from "vitest";
import { vietnamPublicHolidays, buildMonthlyTeachingCalendar } from "../src/monthly/calendar.js";

describe("Vietnamese teaching calendar", () => {
  it("recognizes the new Culture Day only from 2026 and keeps N14 on the holiday", () => {
    expect(vietnamPublicHolidays(2025).some(day => day.date === "2025-11-24")).toBe(false);
    expect(vietnamPublicHolidays(2026).find(day => day.date === "2026-11-24")?.name).toBe("Ngày Văn hóa Việt Nam");
    const days = buildMonthlyTeachingCalendar("2026-11");
    expect(days.find(day => day.date === "2026-11-24")).toMatchObject({ kind: "new", newLessonNumber: 14, holiday: { source: "national" } });
    expect(days.find(day => day.date === "2026-11-06")).toMatchObject({ kind: "review", reviewWeekNumber: 1 });
    expect(days.find(day => day.date === "2026-11-30")).toMatchObject({ kind: "exam" });
    expect(days.filter(day => day.kind === "new")).toHaveLength(16);
  });

  it("converts Vietnamese lunar holidays and includes the published 2026 Tet leave dates", () => {
    const dates = vietnamPublicHolidays(2026).map(day => day.date);
    expect(dates).toEqual(expect.arrayContaining(["2026-02-16", "2026-02-17", "2026-02-20", "2026-04-26", "2026-04-27", "2026-04-30", "2026-05-01", "2026-09-01", "2026-09-02"]));
  });

  it("merges an organization holiday with a Friday without changing teaching counts", () => {
    const ordinary = buildMonthlyTeachingCalendar("2026-11");
    const holidays = buildMonthlyTeachingCalendar("2026-11", [{ date: "2026-11-06", name: "Nghỉ công ty" }, { date: "2026-11-24" }]);
    expect(holidays.find(day => day.date === "2026-11-06")).toMatchObject({ kind: "review", holiday: { source: "organization" } });
    expect(holidays.filter(day => day.kind === "new").map(day => day.newLessonNumber)).toEqual(ordinary.filter(day => day.kind === "new").map(day => day.newLessonNumber));
    expect(holidays.find(day => day.date === "2026-11-24")?.holiday?.source).toBe("national");
    expect(holidays.find(day => day.date === "2026-11-07")?.kind).toBe("weekend");
  });

  it.each(["2027-01", "2026-02", "2026-05", "2026-08"])("gives the last weekday priority as the exam in %s", month => {
    const days = buildMonthlyTeachingCalendar(month);
    expect(days.filter(day => day.kind === "exam")).toHaveLength(1);
    const exam = days.find(day => day.kind === "exam")!;
    expect(days.filter(day => day.date > exam.date).every(day => day.kind === "weekend")).toBe(true);
    expect(exam.newLessonNumber).toBeUndefined();
  });
});
