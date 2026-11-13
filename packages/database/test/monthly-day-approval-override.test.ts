import { describe, expect, it } from "vitest";
import { MonthlyContentRepository, monthlyDayApprovalDecision } from "../src/monthly-content-repository.js";

const severe = { severity: "severe" as const, code: "MONTHLY_EXERCISE_TRANSLATION", message: "Add questionTranslation", dayNumber: 3, component: "reading" };
const light = { severity: "light" as const, code: "MONTHLY_LIGHT", message: "Một cảnh báo nhẹ.", dayNumber: 3, component: "listening" };
const report = (severeFindings: unknown[] = [], lightFindings: unknown[] = []) => ({ severe: severeFindings, light: lightFindings, contractVersion: 1 }) as never;

describe("monthly day approval decision (13/11 approve despite severe findings)", () => {
  const day = (status: "draft" | "failed", quality: never, acknowledged: string[] = []) => ({ lesson_id: "lesson", status, quality_report: quality, quality_acknowledgement: acknowledged.length ? { actorId: "op", acknowledgedAt: "", findingCodes: acknowledged } : null });

  it("keeps the old gate without the override flag", () => {
    expect(monthlyDayApprovalDecision(day("failed", report([severe])), false)).toMatchObject({ ok: false, code: "MONTHLY_DAY_QUALITY_BLOCKED" });
    expect(monthlyDayApprovalDecision(day("draft", report([], [light])), false)).toMatchObject({ ok: false, code: "MONTHLY_DAY_QUALITY_ACK_REQUIRED" });
    expect(monthlyDayApprovalDecision(day("draft", report([], [light]), ["MONTHLY_LIGHT:3:listening"]), false)).toEqual({ ok: true, override: null });
    expect(monthlyDayApprovalDecision(null, true)).toMatchObject({ ok: false, status: 404 });
  });

  it("approves a saved draft with severe findings when the Operator accepts them, listing every finding", () => {
    expect(monthlyDayApprovalDecision(day("failed", report([severe, severe], [light, light, light])), true)).toEqual({
      ok: true,
      override: { severeCodes: ["MONTHLY_EXERCISE_TRANSLATION"], findingKeys: ["MONTHLY_EXERCISE_TRANSLATION:3:reading", "MONTHLY_EXERCISE_TRANSLATION:3:reading", "MONTHLY_LIGHT:3:listening", "MONTHLY_LIGHT:3:listening", "MONTHLY_LIGHT:3:listening"] }
    });
  });

  it("does not turn a clean draft into an override", () => {
    expect(monthlyDayApprovalDecision(day("draft", report()), true)).toEqual({ ok: true, override: null });
  });
});

/** A scripted database: answers the queries approveMonthlyDay sends and records the writes. */
function fakeDatabase(dayRow: Record<string, unknown>, parts: unknown[]) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    if (/from users where id/u.test(sql)) return { rows: [{ organization_id: "org-1", role: "operator" }] };
    if (/select pm\.month from month_frameworks/u.test(sql)) return { rows: [{ month: "2026-11" }] };
    if (/as writable/u.test(sql)) return { rows: [{ writable: true }] };
    if (/select ml\.id, ml\.lesson_id/u.test(sql)) return { rows: [dayRow] };
    if (/select content from lesson_versions/u.test(sql)) return { rows: [{ content: { parts } }] };
    writes.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };
  return { database: { query } as never, writes };
}

describe("MonthlyContentRepository.approveMonthlyDay with acknowledgeSevereFindings", () => {
  const dayRow = { id: "ml-3", lesson_id: "lesson-3", lesson_number: 3, lesson_date: "2026-11-04", status: "failed", scope_hash: "scope", quality_report: report([severe], [light]), quality_acknowledgement: null, correction_count: "0" };
  const parts = [{ code: "reading", content: { prompt: "What is high?" } }];

  it("records who approved with the override, when, and the finding codes", async () => {
    const { database, writes } = fakeDatabase(dayRow, parts);
    const seen: unknown[] = [];
    await new MonthlyContentRepository(database).approveMonthlyDay("operator-1", "framework-1", 3, { acknowledgeSevereFindings: true, integrityIssues: (stored) => { seen.push(stored); return []; } });
    expect(seen).toEqual([parts]);
    const day = writes.find((write) => /update month_lessons set status = 'approved'/u.test(write.sql))!;
    expect(day.params[1]).toBe("operator-1");
    expect(JSON.parse(String(day.params[3]))).toMatchObject({ actorId: "operator-1", severeOverride: true, severeFindingCodes: ["MONTHLY_EXERCISE_TRANSLATION"], findingCodes: ["MONTHLY_EXERCISE_TRANSLATION:3:reading", "MONTHLY_LIGHT:3:listening"] });
    const audit = writes.find((write) => /monthly\.day_approved_with_severe_findings/u.test(write.sql))!;
    expect(audit.params[2]).toBe("operator-1");
    expect(JSON.parse(String(audit.params[4]))).toMatchObject({ dayNumber: 3, approvedBy: "operator-1", approvedAt: expect.any(String), severeFindingCodes: ["MONTHLY_EXERCISE_TRANSLATION"] });
    expect(writes.some((write) => /update lesson_versions set status = 'published'/u.test(write.sql))).toBe(true);
  });

  it("keeps a structurally broken lesson blocked even with the override", async () => {
    const { database, writes } = fakeDatabase(dayRow, parts);
    await expect(new MonthlyContentRepository(database).approveMonthlyDay("operator-1", "framework-1", 3, { acknowledgeSevereFindings: true, integrityIssues: () => ["Đọc: đáp án không trùng lựa chọn nào"] }))
      .rejects.toMatchObject({ statusCode: 409, code: "MONTHLY_DAY_INTEGRITY_BLOCKED", message: expect.stringContaining("Đọc: đáp án không trùng lựa chọn nào") });
    expect(writes).toEqual([]);
  });

  it("still refuses severe findings without the flag", async () => {
    const { database, writes } = fakeDatabase(dayRow, parts);
    await expect(new MonthlyContentRepository(database).approveMonthlyDay("operator-1", "framework-1", 3)).rejects.toMatchObject({ code: "MONTHLY_DAY_QUALITY_BLOCKED" });
    expect(writes).toEqual([]);
  });
});
