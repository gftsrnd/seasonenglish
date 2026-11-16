import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, learnerConsecutiveLearningAbsences, learnerMonthlyAccess, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
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

describe("mid-month catch-up learners", () => {
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
    // Content published on the day the learner is approved (as on 4175).
    await pool.query(`insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash, published_at, published_on)
      values ($1, $2, 'A1', 'approved', $3, 'scope', now(), '2026-11-09')`,
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

  it("opens lesson 1 for a learner approved on 09/11 and unlocks the rest in order", async () => {
    await systemDate("2026-11-09");
    const id = await learner("2026-11-09");
    expect(await learnerMonthlyAccess(pool, id)).toMatchObject({ state: "active", startDate: "2026-11-09", effectiveDays: 15 });
    const lessons = await repositories.learning.listMonthlyLessons(id, month);
    // Lessons dated before the start date are listed (no "Chưa có bài" on 02/11–06/11).
    expect(lessons.map((lesson) => lesson.lessonDate)).toEqual(lessonDates);
    let locks = await lockOf(id);
    expect(locks.get(1)).toBeNull();
    expect(locks.get(2)).toEqual({ reason: "prior", blocker: 1 });
    expect(locks.get(6)).toEqual({ reason: "prior", blocker: 1 });
    expect((await repositories.learning.findLesson(id, days[0]!.lessonId))?.lock).toBeNull();
    expect((await repositories.learning.findLesson(id, days[1]!.lessonId))?.lock).toMatchObject({ reason: "prior" });

    await complete(id, 1);
    locks = await lockOf(id);
    expect(locks.get(2)).toBeNull();
    expect(locks.get(3)).toEqual({ reason: "prior", blocker: 2 });

    await systemDate("2026-11-10");
    for (const lessonNumber of [2, 3, 4]) await complete(id, lessonNumber);
    locks = await lockOf(id);
    // The 06/11 review predates the start: it opens after its week but never blocks 09/11.
    expect(locks.get(5)).toBeNull();
    expect(locks.get(6)).toBeNull();
    expect(locks.get(7)).toEqual({ reason: "prior", blocker: 6 });
    // The 13/11 review (after the start) still gates the next week as usual.
    for (const lessonNumber of [6, 7, 8, 9]) await complete(id, lessonNumber);
    locks = await lockOf(id);
    expect(locks.get(10)).toMatchObject({ reason: "date" });
    await systemDate("2026-11-16");
    expect((await lockOf(id)).get(11)).toMatchObject({ reason: "review", blocker: 10 });
  });

  it("counts absences only from the start date, one attendance per completion day", async () => {
    await systemDate("2026-11-10");
    const id = await learner("2026-11-09");
    for (const lessonNumber of [1, 2, 3]) await complete(id, lessonNumber);
    await systemDate("2026-11-11");
    // Effective window 09/11–27/11 (15 days), max absences floor(15 × 30%) = 4.
    // 02/11–06/11 are not absences; 09/11 is missed, 10/11 is attended once for three lessons.
    expect(await monthlyExamEligibility(pool, id)).toMatchObject({ effectiveDays: 15, maxAbsences: 4, elapsedEffectiveDays: 2, attendedDays: 1, absenceDays: 1 });
    expect(await learnerConsecutiveLearningAbsences(pool, id)).toBe(0);
  });

  it("lets a learner approved on 12/11 study the whole month from lesson 1 without counting it", async () => {
    await systemDate("2026-11-12");
    const id = await learner("2026-11-12");
    expect(await learnerMonthlyAccess(pool, id)).toMatchObject({ state: "uncounted", startDate: "2026-12-01", approvalDate: "2026-11-12" });
    const lessons = await repositories.learning.listMonthlyLessons(id, month);
    expect(lessons.map((lesson) => lesson.dayNumber)).toEqual(days.map((day) => day.lessonNumber));
    // Catch-up from lesson 1; a Friday review before the approval date does not gate later lessons.
    expect((await lockOf(id)).get(1)).toBeNull();
    await complete(id, 1);
    expect((await lockOf(id)).get(2)).toBeNull();
    // Nothing counts: no absences, no attendance window, no monthly final eligibility.
    await systemDate("2026-11-20");
    expect(await learnerConsecutiveLearningAbsences(pool, id)).toBe(0);
    expect(await monthlyExamEligibility(pool, id)).toMatchObject({ effectiveDays: 0, absenceDays: 0, accessEligible: false });
  });
});
