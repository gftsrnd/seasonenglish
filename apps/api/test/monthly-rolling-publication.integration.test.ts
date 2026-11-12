import { randomUUID } from "node:crypto";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { DEMO_IDS } from "@e4s/test-support";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A month is publishable once the next three consecutive lesson days (from the simulated date) are approved.
describe("rolling monthly publication window", () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const frameworkId = randomUUID();
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
});
