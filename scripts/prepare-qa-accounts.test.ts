import { describe, expect, it } from "vitest";
import { ATTENDANCE_PATTERNS, PASS_COMPLETED_SCORES, QA_ACCOUNTS, lateCohortStart, qaProfile, qaRowId, shiftMonth } from "./prepare-qa-accounts.js";

describe("QA learner cohort", () => {
  it("matches the QA account spec exactly", () => {
    expect(QA_ACCOUNTS.map(({ email, pin, cefr, status }) => [email.split("@")[0], pin, cefr, status])).toEqual([
      ["qa-level-a1", "190972", "A1", "active"],
      ["qa-level-a2", "622215", "A2", "active"],
      ["qa-level-b1", "304972", "B1", "active"],
      ["qa-level-b2", "307028", "B2", "active"],
      ["qa-level-c1", "379202", "C1", "active"],
      ["qa-onboarding", "505484", null, "active"],
      ["qa-placement", "396648", null, "active"],
      ["qa-locked", "322483", "A2", "disabled"],
      ["qa-lesson-resume", "115196", "A1", "active"],
      ["qa-learned-game", "662721", "A1", "active"],
      ["qa-monthly-appeal", "154738", "A1", "active"],
      ["qa-monthly-ready", "326235", "A1", "active"],
      ["qa-level-ready", "587853", "A1", "active"],
      ["qa-pass-ready", "381901", "C1", "active"],
      ["qa-pass-completed", "105068", "C1", "active"],
      ["qa-lowered-a1", "767961", "A1", "active"],
      ["qa-learning-appeal", "214541", "A1", "active"],
      ["qa-absent-1", "829505", "A2", "active"],
      ["qa-absent-2", "751480", "B1", "active"],
      ["qa-monthly-ineligible-1", "720698", "A1", "active"],
      ["qa-monthly-ineligible-2", "320988", "B2", "active"]
    ]);
    for (const field of ["id", "email", "pin"] as const) {
      expect(new Set(QA_ACCOUNTS.map((account) => account[field])).size).toBe(QA_ACCOUNTS.length);
    }
    expect(QA_ACCOUNTS.every((account) => account.email.endsWith("@learner-qa.e4s.local") && /^\d{6}$/.test(account.pin))).toBe(true);
  });

  it("derives stable, distinct child-row ids", () => {
    const [first, second] = QA_ACCOUNTS;
    expect(qaRowId(first!, "enrollment")).toBe(qaRowId(first!, "enrollment"));
    expect(qaRowId(first!, "enrollment")).not.toBe(qaRowId(second!, "enrollment"));
    expect(qaRowId(first!, "enrollment")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps the fixture facts consistent", () => {
    expect(Object.values(PASS_COMPLETED_SCORES).reduce((sum, score) => sum + score, 0)).toBe(93);
    expect(qaProfile(QA_ACCOUNTS.find((account) => account.scenario === "onboarding")!)).toEqual({});
    expect(shiftMonth("2026-11", -6)).toBe("2026-05");
    expect(lateCohortStart("2026-11", "2026-11-30")).toBe("2026-11-10");
    expect(ATTENDANCE_PATTERNS["absent-within-limit"]!.length).toBeGreaterThan(ATTENDANCE_PATTERNS["absent-over-limit"]!.length);
  });
});
