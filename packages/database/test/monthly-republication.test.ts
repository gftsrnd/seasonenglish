import { describe, expect, it } from "vitest";
import { MonthlyContentRepository, republicationIncompleteMessage } from "../src/monthly-content-repository.js";

type Facts = { status: string; today: string; published_on: string | null; ready: boolean; in_window: boolean };
type WindowDay = { lesson_number: number; lesson_date: string; ready: boolean };
type Learner = { enrollment_id: string; learner_id: string; level_started_on: string | null };

/** A scripted database: answers the reads republishMonth sends and records every write. */
function fakeDatabase(options: { role?: string; facts?: Partial<Facts>; window?: WindowDay[]; learners?: Learner[]; unlocks?: string[] } = {}) {
  const facts: Facts = { status: "approved", today: "2026-11-06", published_on: "2026-11-13", ready: true, in_window: true, ...options.facts };
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    if (/^(begin|commit|rollback)$/u.test(sql)) { writes.push({ sql, params }); return { rows: [] }; }
    if (/from users where id/u.test(sql)) return { rows: [{ organization_id: "org-1", role: options.role ?? "manager" }] };
    if (/monthly_framework_ready_for_publication\(mf\.id\) as ready/u.test(sql)) return { rows: [{ month: "2026-11", cefr: "A1", ...facts }] };
    if (/with framework as/u.test(sql)) return { rows: options.window ?? [] };
    if (/select e\.id as enrollment_id/u.test(sql)) return { rows: options.learners ?? [] };
    if (/update learner_complaints/u.test(sql)) { writes.push({ sql, params }); return { rows: (options.unlocks ?? []).map((id) => ({ id })) }; }
    writes.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };
  return { database: { query } as never, writes };
}

const learners: Learner[] = [
  { enrollment_id: "enrollment-1", learner_id: "learner-1", level_started_on: "2026-11-13" },
  { enrollment_id: "enrollment-2", learner_id: "learner-2", level_started_on: "2026-11-02" },
  { enrollment_id: "enrollment-3", learner_id: "learner-3", level_started_on: null }
];

describe("Công bố lại: republishing a month on the current system date", () => {
  it("previews the date change, the learners who can study and the readiness", async () => {
    const { database } = fakeDatabase({ learners });
    const preview = await new MonthlyContentRepository(database).previewMonthRepublication("manager-1", "framework-a1");
    expect(preview).toEqual({ publishedOn: "2026-11-13", republishOn: "2026-11-06", needed: true, ready: true, missingDays: [], affectedLearners: 3, shiftedLearners: 1 });
  });

  it("blocks when the readiness rule fails and names the missing days, writing nothing", async () => {
    const { database, writes } = fakeDatabase({ facts: { ready: false }, learners, window: [
      { lesson_number: 4, lesson_date: "2026-11-06", ready: true },
      { lesson_number: 5, lesson_date: "2026-11-09", ready: false },
      { lesson_number: 6, lesson_date: "2026-11-10", ready: false }
    ] });
    const repository = new MonthlyContentRepository(database);
    expect((await repository.previewMonthRepublication("operator-1", "framework-a1")).missingDays).toEqual([{ lessonNumber: 5, date: "2026-11-09" }, { lessonNumber: 6, date: "2026-11-10" }]);
    await expect(repository.republishMonth("operator-1", "framework-a1", "2026-11-06")).rejects.toMatchObject({
      statusCode: 409, code: "MONTHLY_REPUBLICATION_INCOMPLETE", message: expect.stringContaining("09/11 (Bài 5), 10/11 (Bài 6)")
    });
    expect(writes.filter((write) => !/^(begin|rollback)$/u.test(write.sql))).toEqual([]);
  });

  it("moves published_on, later level starts and unlock dates to the system date and audits it", async () => {
    const { database, writes } = fakeDatabase({ learners, unlocks: ["complaint-9"] });
    const result = await new MonthlyContentRepository(database).republishMonth("manager-1", "framework-a1", "2026-11-06");
    expect(result).toEqual({ previousPublishedOn: "2026-11-13", publishedOn: "2026-11-06", changed: true, shiftedLearners: 1 });
    const enrollments = writes.find((write) => /update enrollments set cefr_started_on/u.test(write.sql))!;
    expect(enrollments.params).toEqual([["enrollment-1"], "2026-11-06"]);
    const unlocks = writes.find((write) => /update learner_complaints/u.test(write.sql))!;
    expect(unlocks.params).toEqual([["learner-1", "learner-2", "learner-3"], "2026-11-06", "2026-11"]);
    const framework = writes.find((write) => /update month_frameworks set published_on/u.test(write.sql))!;
    expect(framework.sql).not.toMatch(/published_at/u);
    expect(framework.params).toEqual(["framework-a1", "2026-11-06"]);
    const audit = writes.find((write) => /monthly\.framework_republished/u.test(write.sql))!;
    expect(audit.params[2]).toBe("manager-1");
    expect(JSON.parse(String(audit.params[4]))).toEqual({
      month: "2026-11", cefr: "A1", actorRole: "manager", previousPublishedOn: "2026-11-13", publishedOn: "2026-11-06",
      studyLearnerCount: 3, shiftedLearnerCount: 1, shiftedLearnerIds: ["learner-1"], unlockComplaintIds: ["complaint-9"]
    });
    expect(writes.at(-1)?.sql).toBe("commit");
  });

  it("is idempotent when the dates already match", async () => {
    const { database, writes } = fakeDatabase({ facts: { published_on: "2026-11-06" }, learners });
    const result = await new MonthlyContentRepository(database).republishMonth("operator-1", "framework-a1", "2026-11-06");
    expect(result).toEqual({ previousPublishedOn: "2026-11-06", publishedOn: "2026-11-06", changed: false, shiftedLearners: 0 });
    expect(writes.map((write) => write.sql)).toEqual(["begin", "commit"]);
  });

  it("only republishes a published month, never moves an earlier date forward and checks the confirmed date", async () => {
    await expect(new MonthlyContentRepository(fakeDatabase({ facts: { published_on: null } }).database).republishMonth("operator-1", "f", "2026-11-06"))
      .rejects.toMatchObject({ statusCode: 409, code: "MONTHLY_REPUBLICATION_NOT_PUBLISHED" });
    await expect(new MonthlyContentRepository(fakeDatabase({ facts: { published_on: "2026-11-02" } }).database).republishMonth("operator-1", "f", "2026-11-06"))
      .rejects.toMatchObject({ code: "MONTHLY_REPUBLICATION_NOT_NEEDED" });
    await expect(new MonthlyContentRepository(fakeDatabase().database).republishMonth("operator-1", "f", "2026-11-05"))
      .rejects.toMatchObject({ code: "MONTHLY_PUBLICATION_DATE_CHANGED" });
  });

  it("is limited to Operators and Managers", async () => {
    await expect(new MonthlyContentRepository(fakeDatabase({ role: "learner" }).database).republishMonth("learner-1", "f", "2026-11-06")).rejects.toThrow(/Operator or Manager/u);
  });

  it("explains an incomplete month without missing days", () => {
    expect(republicationIncompleteMessage([])).toMatch(/chưa đủ điều kiện công bố/u);
  });
});
