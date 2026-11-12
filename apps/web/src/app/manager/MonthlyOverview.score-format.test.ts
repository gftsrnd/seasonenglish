import { describe, expect, it } from "vitest";
import type { ManagerMonthlyOverviewView } from "@e4s/contracts";
import { buildManagerMonthlyCsv, monthlyExamLabel } from "./MonthlyOverview.js";

const exam = {
  status: "approved" as const,
  total: 18.766666666666666,
  scores: { listening: 7.352941176470589, reading: 4.411764705882353, writing: 7, speaking: null }
};

describe("Manager monthly score formatting", () => {
  it("shows the monthly exam total with one decimal, a decimal comma and its maximum", () => {
    expect(monthlyExamLabel(exam as never)).toBe("18,8/100 · Đã chấm");
  });

  it("keeps CSV score cells machine-friendly with one-decimal rounding", () => {
    const view = {
      learners: [{
        email: "lan@example.test", learnerName: "Lan", cefr: "A2", state: "active",
        attendedDays: 10, elapsedDays: 12, absenceDays: 2, maxAbsences: 4,
        lessons: { completed: 8, scheduled: 10 }, reviews: { completed: 1, scheduled: 2 }, season: { turns: 30, target: 100 },
        exam, levelCriteria: null, complaintCount: 0
      }]
    } as unknown as ManagerMonthlyOverviewView;
    const row = buildManagerMonthlyCsv(view).split("\r\n")[1]!;

    expect(row).toContain('"7.4","4.4","7","","18.8"');
    expect(row).not.toMatch(/\d\.\d{3,}/);
  });
});
