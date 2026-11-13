import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { learnerMonthlyAccess, notAfterSystemDate } from "../src/repositories.js";

type AccessRow = {
  system_date: string; month: string; cefr: string | null; level_started_on: string | null;
  exam_date: string | null; published_on: string | null; reset_on: string | null; unlocked_on: string | null; graduated: boolean;
};

/** The access row comes from the first query; the previous-exam check finds no final exam. */
function poolReturning(overrides: Partial<AccessRow>) {
  const row: AccessRow = {
    system_date: "2026-11-06", month: "2026-11", cefr: "A1", level_started_on: "2026-11-01",
    exam_date: "2026-11-30", published_on: "2026-11-02", reset_on: null, unlocked_on: null, graduated: false,
    ...overrides
  };
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [row] })
    .mockResolvedValue({ rows: [] });
  return { query } as unknown as Pool;
}

describe("monthly access after the simulated system date moves backwards", () => {
  it("keeps a month published after the system date open from the system date", async () => {
    // 4175: A1 November was published on 13/11, then the system date was set back to 06/11.
    const access = await learnerMonthlyAccess(poolReturning({ published_on: "2026-11-13" }), "learner-1");
    expect(access?.state).toBe("active");
    expect(access?.startDate).toBe("2026-11-06");
    // Days before the simulated date are never counted (no absences on 02–05/11).
    expect(access?.effectiveDates[0]).toBe("2026-11-06");
  });

  it("keeps a level approved after the system date open from the system date", async () => {
    const access = await learnerMonthlyAccess(poolReturning({ level_started_on: "2026-11-13" }), "learner-1");
    expect(access?.state).toBe("active");
    expect(access?.startDate).toBe("2026-11-06");
  });

  it("treats a lesson unlock resolved after the system date the same way", async () => {
    const access = await learnerMonthlyAccess(poolReturning({ unlocked_on: "2026-11-13", published_on: "2026-11-13", level_started_on: "2026-11-12" }), "learner-1");
    expect(access?.state).toBe("active");
    expect(access?.effectiveDates[0]).toBe("2026-11-06");
  });

  it("does not change a system date that moved forward", async () => {
    const access = await learnerMonthlyAccess(poolReturning({ system_date: "2026-11-20", published_on: "2026-11-13" }), "learner-1");
    expect(access?.state).toBe("waiting_next_month");
    expect(access?.effectiveDates[0]).toBe("2026-11-13");
  });

  it("still waits for content that is not published", async () => {
    const access = await learnerMonthlyAccess(poolReturning({ published_on: null }), "learner-1");
    expect(access?.state).toBe("waiting_content");
  });

  it("clamps only dates after the system date", () => {
    expect(notAfterSystemDate("2026-11-13", "2026-11-06")).toBe("2026-11-06");
    expect(notAfterSystemDate("2026-11-02", "2026-11-06")).toBe("2026-11-02");
    expect(notAfterSystemDate(null, "2026-11-06")).toBeNull();
  });
});
