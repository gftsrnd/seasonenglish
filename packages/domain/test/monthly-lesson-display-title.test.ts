import { describe, expect, it } from "vitest";
import { monthlyDefaultLessonTitle, monthlyLessonDisplayTitle } from "../src/monthly/daily-progression.js";
import { containsVietnameseLearnerText } from "../src/content/index.js";
import { buildMonthlyCalendar, monthlyNewLessonOrdinal } from "../src/monthly/curriculum.js";

describe("monthlyLessonDisplayTitle", () => {
  it("renumbers a stored raw-slot 'Bài N' to the new-lesson ordinal (Friday reviews excluded)", () => {
    expect(monthlyLessonDisplayTitle("Bài 6", { kind: "new", newLessonNumber: 5 })).toBe("Bài 5");
    expect(monthlyLessonDisplayTitle("Bài 6: Present simple", { kind: "new", newLessonNumber: 5 })).toBe("Bài 5: Present simple");
    expect(monthlyLessonDisplayTitle("Lesson 6 · Can I…?", { kind: "new", newLessonNumber: 5 })).toBe("Lesson 5 · Can I…?");
    expect(monthlyLessonDisplayTitle("Bài học 6", { kind: "new", newLessonNumber: 5 })).toBe("Bài học 5");
  });

  it("labels a review day as review, never 'Bài N'", () => {
    expect(monthlyLessonDisplayTitle("Bài 5", { kind: "review", reviewWeekNumber: 1 })).toBe("Ôn tuần 1");
    expect(monthlyLessonDisplayTitle("Bài 5: Weekly words", { kind: "review" })).toBe("Ôn tập: Weekly words");
    expect(monthlyLessonDisplayTitle("Bài ôn tuần 1", { kind: "review", reviewWeekNumber: 1 })).toBe("Bài ôn tuần 1");
  });

  it("keeps an English (B1+) title English when relabelling a review day", () => {
    expect(monthlyLessonDisplayTitle("Lesson 5", { kind: "review", reviewWeekNumber: 1 })).toBe("Week 1 review");
    expect(monthlyLessonDisplayTitle("Lesson 5: Weekly words", { kind: "review" })).toBe("Weekly review: Weekly words");
    expect(monthlyLessonDisplayTitle("Week 2 review", { kind: "review", reviewWeekNumber: 2 })).toBe("Week 2 review");
  });

  it("leaves titles without a number prefix, or without a known ordinal, untouched", () => {
    expect(monthlyLessonDisplayTitle("Can you send the report?", { kind: "new", newLessonNumber: 5 })).toBe("Can you send the report?");
    expect(monthlyLessonDisplayTitle("Bài 5", { kind: "new", newLessonNumber: 5 })).toBe("Bài 5");
    expect(monthlyLessonDisplayTitle("Bài 6", { kind: "new" })).toBe("Bài 6");
    expect(monthlyLessonDisplayTitle("Lessons learned", { kind: "new", newLessonNumber: 2 })).toBe("Lessons learned");
    expect(monthlyLessonDisplayTitle(undefined, { kind: "new", newLessonNumber: 2 })).toBe("");
  });

  it("matches the calendar ordinal for the slot after the first Friday review", () => {
    const calendar = buildMonthlyCalendar("2026-11");
    const reviewSlot = calendar.effectiveDays.findIndex((_date, index) => monthlyNewLessonOrdinal(index + 1, calendar) === null) + 1;
    expect(reviewSlot).toBeGreaterThan(0);
    const afterReview = reviewSlot + 1;
    const ordinal = monthlyNewLessonOrdinal(afterReview, calendar)!;
    expect(ordinal).toBe(afterReview - 1);
    expect(monthlyLessonDisplayTitle(`Bài ${afterReview}`, { kind: "new", newLessonNumber: ordinal })).toBe(`Bài ${ordinal}`);
  });
});

describe("monthlyDefaultLessonTitle", () => {
  it("defaults B1-C1 titles to English so the B1+ title gate passes", () => {
    for (const cefr of ["B1", "B2", "C1"]) {
      expect(monthlyDefaultLessonTitle({ kind: "review", reviewWeekNumber: 2 }, cefr)).toBe("Week 2 review");
      expect(monthlyDefaultLessonTitle({ kind: "review" }, cefr)).toBe("Weekly review");
      expect(monthlyDefaultLessonTitle({ kind: "new", newLessonNumber: 3 }, cefr)).toBe("Lesson 3");
    }
    for (const title of ["Week 2 review", "Weekly review", "Lesson 3"]) expect(containsVietnameseLearnerText(title)).toBe(false);
    expect(containsVietnameseLearnerText("Bài ôn tuần 2")).toBe(true);
  });

  it("keeps Vietnamese defaults for A1-A2", () => {
    for (const cefr of ["A1", "A2"]) {
      expect(monthlyDefaultLessonTitle({ kind: "review", reviewWeekNumber: 2 }, cefr)).toBe("Bài ôn tuần 2");
      expect(monthlyDefaultLessonTitle({ kind: "review" }, cefr)).toBe("Bài ôn tập");
      expect(monthlyDefaultLessonTitle({ kind: "new", newLessonNumber: 3 }, cefr)).toBe("Bài 3");
    }
    expect(monthlyDefaultLessonTitle({ kind: "new" }, "B1")).toBeUndefined();
  });
});
