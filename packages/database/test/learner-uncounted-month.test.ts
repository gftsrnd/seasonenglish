import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createRepositories, learnerConsecutiveLearningAbsences, learnerLearningAbsenceStreak, learnerMonthlyAccess, syncLearnerUncountedMonthNotice } from "../src/repositories.js";

type AccessRow = {
  system_date: string; month: string; cefr: string | null; level_started_on: string | null;
  exam_date: string | null; published_on: string | null; reset_on: string | null; unlocked_on: string | null; graduated: boolean;
};

const november: AccessRow = {
  system_date: "2026-11-20", month: "2026-11", cefr: "A1", level_started_on: "2026-11-12",
  exam_date: "2026-11-30", published_on: "2026-11-02", reset_on: null, unlocked_on: null, graduated: false
};
const december: AccessRow = { ...november, system_date: "2026-12-09", month: "2026-12", exam_date: "2026-12-31", published_on: "2026-12-01" };

/**
 * Answers each statement by its SQL: the access row per requested month, an unattempted previous
 * final exam, no lessons or attendance, and records every query for assertions.
 */
function fakePool(rows: Record<string, AccessRow>, systemMonth: string) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes("organization_system_date(learner.organization_id) as system_date")) {
      const month = (params[1] as string | null) ?? systemMonth;
      return { rows: rows[month] ? [rows[month]] : [] };
    }
    if (sql.includes("as grace_open")) return { rows: [{ override: false, grace_open: false }] };
    if (sql.includes("current_enrollment")) {
      return { rows: ["2026-11", "2026-12"].filter((month) => month <= systemMonth).map((month) => ({ month, level_started_at: new Date("2026-11-12T03:00:00Z") })) };
    }
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, calls };
}

describe("uncounted (học thử) month", () => {
  it("opens the month for a learner approved after 25% of the school days, counting from next month", async () => {
    const { pool } = fakePool({ "2026-11": november }, "2026-11");
    const access = await learnerMonthlyAccess(pool, "learner-1");
    expect(access).toMatchObject({ state: "uncounted", approvalDate: "2026-11-12", startDate: "2026-12-01" });
  });

  it("never counts absences, warnings or the absence lock in an uncounted month", async () => {
    const { pool, calls } = fakePool({ "2026-11": november }, "2026-11");
    expect(await learnerLearningAbsenceStreak(pool, "learner-1")).toEqual({ days: 0, startedOn: null });
    expect(await learnerConsecutiveLearningAbsences(pool, "learner-1")).toBe(0);
    // No attendance or lesson-date lookup was needed.
    expect(calls.some(({ sql }) => sql.includes("from progress_records pr"))).toBe(false);
  });

  it("counts the next month normally and never treats the uncounted month's exam as missed", async () => {
    const { pool, calls } = fakePool({ "2026-11": november, "2026-12": december }, "2026-12");
    const access = await learnerMonthlyAccess(pool, "learner-1");
    // The November final was never attempted, but November did not count: no missed_exam lock.
    expect(access).toMatchObject({ state: "active", startDate: "2026-12-01" });
    calls.length = 0;
    await learnerLearningAbsenceStreak(pool, "learner-1");
    // The absence streak reads December only, not the uncounted November.
    const attendance = calls.find(({ sql }) => sql.includes("from progress_records pr"));
    expect(attendance?.params[1]).toEqual(["2026-12"]);
  });

  it("leaves an uncounted month out of the level-up records", async () => {
    const { pool, calls } = fakePool({ "2026-11": november, "2026-12": december }, "2026-12");
    await createRepositories(pool).learning.monthlyLevelUpReadiness("learner-1", "A1");
    const records = calls.find(({ sql }) => sql.includes("lesson_facts as ("));
    expect(records?.params[6]).toEqual(["2026-11"]);
    expect(JSON.parse(records?.params[5] as string)).toEqual({ "2026-12": "2026-12-01" });
    const attendance = calls.find(({ sql }) => sql.includes("from progress_records pr"));
    expect(attendance?.params[1]).toEqual(["2026-12"]);
  });

  it("puts one bell notification per uncounted month", async () => {
    const { pool, calls } = fakePool({}, "2026-11");
    await syncLearnerUncountedMonthNotice(pool, "learner-1", { state: "uncounted", month: "2026-11", startDate: "2026-12-01" });
    await syncLearnerUncountedMonthNotice(pool, "learner-1", { state: "active", month: "2026-12", startDate: "2026-12-01" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("notify_inbox(organization_id, 'learner', id, $2, 'monthly_uncounted', $3)");
    expect(calls[0]!.params).toEqual(["learner-1", "monthly-uncounted:2026-11", "2026-12-01"]);
  });
});
