import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { syncMissedExamNotice } from "../src/inbox-notification-repository.js";

function fakePool() {
  const query = vi.fn(async () => ({ rows: [] }));
  return { pool: { query } as unknown as Pool, query };
}

describe("locked lessons notice", () => {
  it("files one bell notification per month when lessons are locked after a missed exam", async () => {
    const { pool, query } = fakePool();
    await syncMissedExamNotice(pool, "learner-1", { state: "missed_exam", month: "2026-11" });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = (query.mock.calls as unknown as Array<[string, unknown[]]>)[0]!;
    expect(sql).toContain("notify_inbox(organization_id, 'learner', id, $2, 'monthly_lessons_locked', $3)");
    expect(params).toEqual(["learner-1", "lessons-locked:2026-11", "2026-11"]);
  });

  it("does not notify a learner whose lessons are open or who has no month", async () => {
    const { pool, query } = fakePool();
    await syncMissedExamNotice(pool, "learner-1", { state: "active", month: "2026-11" });
    await syncMissedExamNotice(pool, "learner-1", { state: "waiting_next_month", month: "2026-11" });
    await syncMissedExamNotice(pool, "learner-1", null);
    expect(query).not.toHaveBeenCalled();
  });
});
