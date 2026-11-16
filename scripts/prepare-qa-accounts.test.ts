import { describe, expect, it } from "vitest";
import { ATTENDANCE_PATTERNS, PASS_COMPLETED_SCORES, QA_ACCOUNTS, QA_SHARED_PIN, lateCohortStart, qaProfile, qaRowId, shiftMonth } from "./prepare-qa-accounts.js";

describe("QA learner cohort", () => {
  it("matches the QA account spec exactly", () => {
    expect(QA_ACCOUNTS.map(({ email, pin, cefr, status }) => [email.split("@")[0], pin, cefr, status])).toEqual([
      ["qa-level-a1", QA_SHARED_PIN, "A1", "active"],
      ["qa-level-a2", QA_SHARED_PIN, "A2", "active"],
      ["qa-level-b1", QA_SHARED_PIN, "B1", "active"],
      ["qa-level-b2", QA_SHARED_PIN, "B2", "active"],
      ["qa-level-c1", QA_SHARED_PIN, "C1", "active"],
      ["qa-onboarding", QA_SHARED_PIN, null, "active"],
      ["qa-placement", QA_SHARED_PIN, null, "active"],
      ["qa-locked", QA_SHARED_PIN, "A2", "disabled"],
      ["qa-lesson-resume", QA_SHARED_PIN, "A1", "active"],
      ["qa-learned-game", QA_SHARED_PIN, "A1", "active"],
      ["qa-monthly-appeal", QA_SHARED_PIN, "A1", "active"],
      ["qa-monthly-ready", QA_SHARED_PIN, "A1", "active"],
      ["qa-level-ready", QA_SHARED_PIN, "A1", "active"],
      ["qa-pass-ready", QA_SHARED_PIN, "C1", "active"],
      ["qa-pass-completed", QA_SHARED_PIN, "C1", "active"],
      ["qa-lowered-a1", QA_SHARED_PIN, "A1", "active"],
      ["qa-learning-appeal", QA_SHARED_PIN, "A1", "active"],
      ["qa-absent-1", QA_SHARED_PIN, "A2", "active"],
      ["qa-absent-2", QA_SHARED_PIN, "B1", "active"],
      ["qa-monthly-ineligible-1", QA_SHARED_PIN, "A1", "active"],
      ["qa-monthly-ineligible-2", QA_SHARED_PIN, "B2", "active"]
    ]);
    expect(/^\d{6}$/.test(QA_SHARED_PIN)).toBe(true);
    for (const field of ["id", "email"] as const) {
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
