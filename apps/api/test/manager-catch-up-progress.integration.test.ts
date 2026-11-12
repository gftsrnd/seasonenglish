import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, learnerMonthlyAccess, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { DEMO_IDS } from "@e4s/test-support";
import { monthlyExamEligibility } from "../src/modules/learning/routes.js";

// Biên bản 30/10 mục 11/6: a learner approved with ≥ 75% of the month's
// effective days left studies this month from lesson 1, in sequence (catch-up).
// November 2026 has 20 effective days and the exam on 30/11.
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test" });
const repositories = createRepositories(pool);
const month = "2026-11";
const frameworkId = randomUUID();
const lessonDates: string[] = [];
for (const date = new Date("2026-11-02T00:00:00Z"); date < new Date("2026-11-28T00:00:00Z"); date.setUTCDate(date.getUTCDate() + 1)) {
  if (date.getUTCDay() >= 1 && date.getUTCDay() <= 5) lessonDates.push(date.toISOString().slice(0, 10));
}
const days = lessonDates.map((date, index) => ({
  lessonNumber: index + 1, date, lessonId: randomUUID(),
  kind: new Date(`${date}T00:00:00Z`).getUTCDay() === 5 ? "review" as const : "new" as const
}));

async function systemDate(date: string) {
  await pool.query(`insert into organization_settings (organization_id, configuration)
    values ($1, jsonb_build_object('simulatedSystemDate', $2::text))
    on conflict (organization_id) do update set configuration = excluded.configuration`, [DEMO_IDS.organization, date]);
}

async function learner(startedOn: string) {
  const id = randomUUID();
  await pool.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Catch-up learner', $3)", [id, DEMO_IDS.organization, `${id}@e4s.local`]);
  await pool.query(`insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on)
    values (gen_random_uuid(), $1, $2, 'A1', true, $3)`, [DEMO_IDS.program, id, startedOn]);
  return id;
}

async function complete(learnerId: string, lessonNumber: number) {
  await pool.query(`insert into progress_records (id, learner_id, lesson_id, status, started_at, completed_at)
    values (gen_random_uuid(), $1, $2, 'completed', now(), now())`, [learnerId, days[lessonNumber - 1]!.lessonId]);
}

const lockOf = async (learnerId: string) => new Map((await repositories.learning.listMonthlyLessons(learnerId, month))
  .map((lesson) => [lesson.dayNumber, lesson.lock ? { reason: lesson.lock.reason, blocker: lesson.lock.blocker?.dayNumber } : null]));

describe("manager progress for mid-month catch-up learners", () => {
  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
    } finally { client.release(); }
    const monthId = randomUUID();
    await pool.query("insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, '2026-11-30', $4, 'approved')",
      [monthId, DEMO_IDS.organization, month, days.length]);
    // Content published at the start of the month, so a regular learner starts on 02/11.
    await pool.query(`insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash, published_at, published_on)
      values ($1, $2, 'A1', 'approved', $3, 'scope', now(), '2026-11-02')`,
      [frameworkId, monthId, JSON.stringify({ month, daySpecs: days.map(({ lessonNumber, date, kind }) => ({ lessonNumber, date, kind })), coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] })]);
    const setId = randomUUID();
    await pool.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A1')", [setId, frameworkId]);
    for (const day of days) {
      const versionId = randomUUID();
      await pool.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day.lessonNumber]);
      await pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [day.lessonId, versionId, day.lessonNumber]);
      await pool.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'published', '{}'::jsonb)", [randomUUID(), day.lessonId]);
      await pool.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', 'approved')",
        [randomUUID(), frameworkId, day.lessonNumber, day.date, day.lessonId]);
    }
  }, 60_000);


  afterAll(async () => { await pool.end(); });

  const overviewRow = async (learnerId: string) => {
    const view = await repositories.manager.monthlyOverview(DEMO_IDS.manager, { month, cefr: "A1" });
    const row = view?.learners.find((entry) => entry.learnerId === learnerId);
    if (!row) throw new Error("learner missing from the monthly overview");
    return row;
  };

  it("counts catch-up lessons dated before the start date as progress to date", async () => {
    await systemDate("2026-11-10");
    const id = await learner("2026-11-09");
    expect(await learnerMonthlyAccess(pool, id)).toMatchObject({ state: "active", startDate: "2026-11-09" });
    for (const lessonNumber of [1, 2, 3]) await complete(id, lessonNumber);
    // Expected by 10/11: lessons 1–4 (02–05/11), 6 (09/11) and 7 (10/11); the 06/11 review
    // predates the start and never gates the sequence, so it is not expected.
    let row = await overviewRow(id);
    expect(row.state).toBe("active");
    expect(row.lessonsToDate).toEqual({ completed: 3, expected: 6 });
    expect(row.completedToDate).toBe(false);
    expect(row.lessons.completed).toBe(3);
    // Attendance still starts from the start date (02/11–06/11 are not absences).
    const eligibility = await monthlyExamEligibility(pool, id);
    expect(row.elapsedDays).toBe(2);
    expect(row.absenceDays).toBe(eligibility.absenceDays);
    expect(row.maxAbsences).toBe(eligibility.maxAbsences);

    for (const lessonNumber of [4, 6, 7]) await complete(id, lessonNumber);
    row = await overviewRow(id);
    expect(row.lessonsToDate).toEqual({ completed: 6, expected: 6 });
    expect(row.completedToDate).toBe(true);
  });

  it("keeps a regular learner's progress to date unchanged", async () => {
    await systemDate("2026-11-10");
    const id = await learner("2026-11-02");
    expect(await learnerMonthlyAccess(pool, id)).toMatchObject({ state: "active", startDate: "2026-11-02" });
    for (const lessonNumber of [1, 2, 3, 4, 5, 6]) await complete(id, lessonNumber);
    // Expected by 10/11: lessons 1–7, the 06/11 review included.
    let row = await overviewRow(id);
    expect(row.lessonsToDate).toEqual({ completed: 6, expected: 7 });
    expect(row.completedToDate).toBe(false);
    await complete(id, 7);
    row = await overviewRow(id);
    expect(row.lessonsToDate).toEqual({ completed: 7, expected: 7 });
    expect(row.completedToDate).toBe(true);
    expect(row.elapsedDays).toBe(7);
  });
});
