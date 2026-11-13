import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { nextSeasonPointsTier, syncLearnerAbsenceNotice } from "../src/repositories.js";

function fakePool() {
  const query = vi.fn(async () => ({ rows: [] }));
  return { pool: { query } as unknown as Pool, query };
}

describe("learner absence notice", () => {
  it("files one bell notification per streak length, keyed by the first missed date", async () => {
    const { pool, query } = fakePool();
    await syncLearnerAbsenceNotice(pool, "learner-1", { days: 3, startedOn: "2026-11-04" });
    await syncLearnerAbsenceNotice(pool, "learner-1", { days: 4, startedOn: "2026-11-04" });
    expect(query).toHaveBeenCalledTimes(2);
    const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
    expect(calls[0]![0]).toContain("notify_inbox(organization_id, 'learner', id, $2, 'absence_warning', $3)");
    expect(calls.map(([, params]) => params)).toEqual([
      ["learner-1", "absence:2026-11-04:3", "3"],
      ["learner-1", "absence:2026-11-04:4", "4"]
    ]);
  });

  it("does not notify below the warning length, at the lock length or without a streak", async () => {
    const { pool, query } = fakePool();
    await syncLearnerAbsenceNotice(pool, "learner-1", { days: 2, startedOn: "2026-11-04" });
    await syncLearnerAbsenceNotice(pool, "learner-1", { days: 5, startedOn: "2026-11-04" });
    await syncLearnerAbsenceNotice(pool, "learner-1", { days: 0, startedOn: null });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("Season points tiers", () => {
  it("returns the next threshold above the points in the level and null after the last one", () => {
    expect(nextSeasonPointsTier(0)).toBe(500);
    expect(nextSeasonPointsTier(500)).toBe(2000);
    expect(nextSeasonPointsTier(4999)).toBe(5000);
    expect(nextSeasonPointsTier(5000)).toBeNull();
  });
});
