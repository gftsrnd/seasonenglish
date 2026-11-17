import { randomUUID } from "node:crypto";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { DEMO_IDS } from "@e4s/test-support";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A month is publishable once the next three consecutive lesson days (from the simulated date) are approved.
describe("rolling monthly publication window", () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const frameworkId = randomUUID();
  const repositories = createRepositories(pool);
  const month = "2026-11";
  const dates = ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];

  async function setSystemDate(date: string) {
    await pool.query(
      `insert into organization_settings (organization_id, configuration) values ($1, jsonb_build_object('simulatedSystemDate', $2::text))
       on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
      [DEMO_IDS.organization, date]
    );
  }
  const approve = (numbers: number[], status = "approved") =>
    pool.query("update month_lessons set status = $3 where framework_id = $1 and lesson_number = any($2::int[])", [frameworkId, numbers, status]);
  const ready = async () =>
    (await pool.query<{ ready: boolean }>("select monthly_framework_ready_for_publication($1) as ready", [frameworkId])).rows[0]?.ready;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      const monthId = randomUUID();
      const days = dates.map((date, index) => ({ lessonNumber: index + 1, date, kind: "new", lessonId: randomUUID() }));
      await client.query(
        "insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, '2026-11-30', $4, 'approved')",
        [monthId, DEMO_IDS.organization, month, days.length]
      );
      await client.query(
        "insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash) values ($1, $2, 'A1', 'approved', $3, 'scope')",
        [frameworkId, monthId, JSON.stringify({ month, daySpecs: days, coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] })]
      );
      const setId = randomUUID();
      await client.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A1')", [setId, frameworkId]);
      for (const day of days) {
        const versionId = randomUUID();
        await client.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day.lessonNumber]);
        await client.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [day.lessonId, versionId, day.lessonNumber]);
        await client.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'published', '{}'::jsonb)", [randomUUID(), day.lessonId]);
        await client.query(
          "insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', 'draft')",
          [randomUUID(), frameworkId, day.lessonNumber, day.date, day.lessonId]
        );
      }
    } finally {
      client.release();
    }
  }, 30_000);

  afterAll(async () => { await pool.end(); });

  it("needs today's lesson and the next two, not the whole month", async () => {
    await setSystemDate("2026-11-09");
    expect(await ready()).toBe(false);
    await approve([3, 4]);
    expect(await ready()).toBe(false);
    await approve([5]);
    expect(await ready()).toBe(true);
  });

  it("moves the window forward as the date advances", async () => {
    await setSystemDate("2026-11-10");
    expect(await ready()).toBe(false);
    await approve([6]);
    expect(await ready()).toBe(true);
    await approve([4], "draft");
    expect(await ready()).toBe(false);
    await approve([4]);
  });

  it("uses lessons 1-3 before the month starts and the last lessons after it ends", async () => {
    await setSystemDate("2026-10-20");
    expect(await ready()).toBe(false);
    await approve([1, 2]);
    expect(await ready()).toBe(true);
    await setSystemDate("2026-11-20");
    expect(await ready()).toBe(true);
    await approve([6], "draft");
    expect(await ready()).toBe(false);
  });
  it("delivers a later draft only after Operator approval, without republishing the month", async () => {
    const learnerId = randomUUID();
    await pool.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Rolling learner', $3)", [learnerId, DEMO_IDS.organization, `${learnerId}@e4s.local`]);
    await pool.query("insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on) values (gen_random_uuid(), $1, $2, 'A1', true, '2026-11-05')", [DEMO_IDS.program, learnerId]);
    await setSystemDate("2026-11-05");
    await approve([1, 2, 3]);
    await approve([4, 5, 6], "draft");
    await expect(repositories.monthlyContent.publishMonth(DEMO_IDS.operator, frameworkId, "2026-11-05"))
      .resolves.toEqual({ publishedOn: "2026-11-05" });
    const later = { id: randomUUID(), versionId: randomUUID() };
    await pool.query(`insert into lesson_set_versions (id, lesson_set_id, version, status)
      select $1, id, 100, 'draft' from lesson_sets where month_framework_id = $2`, [later.versionId, frameworkId]);
    await pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, 4, 'Later lesson')", [later.id, later.versionId]);
    await pool.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'draft', '{}'::jsonb)", [randomUUID(), later.id]);
    await pool.query("update month_lessons set lesson_id = $2 where framework_id = $1 and lesson_number = 4", [frameworkId, later.id]);

    await setSystemDate("2026-11-10");
    const list = () => repositories.learning.listMonthlyLessons(learnerId, month);
    expect((await list()).map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3]);
    expect(await repositories.learning.findLesson(learnerId, later.id)).toBeNull();
    await expect(repositories.monthlyContent.approveMonthlyDay(learnerId, frameworkId, 4)).rejects.toThrow();
    await repositories.monthlyContent.approveMonthlyDay(DEMO_IDS.operator, frameworkId, 4);
    await approve([5]);
    await pool.query("update month_lessons set scope_hash = 'stale' where framework_id = $1 and lesson_number = 5", [frameworkId]);
    expect((await list()).map((lesson) => lesson.dayNumber)).toEqual([1, 2, 3, 4]);
    expect(await repositories.learning.findLesson(learnerId, later.id)).toMatchObject({ id: later.id });
    const { rows: [framework] } = await pool.query("select published_on::text from month_frameworks where id = $1", [frameworkId]);
    expect(framework?.published_on).toBe("2026-11-05");
  });
});
