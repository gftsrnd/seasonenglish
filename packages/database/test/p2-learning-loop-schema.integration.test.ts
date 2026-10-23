import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("P2 learning-loop persistence", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
  }, 30_000);

  afterAll(async () => {
    await client.end();
  });

  it("stores immutable weekly-practice context and allows only one submission per learner/week", async () => {
    const columns = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'practice_submissions'`
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining([
      "prompt_snapshot", "cefr_snapshot", "vocabulary_snapshot"
    ]));

    const week = await client.query<{ id: string }>("select id from program_weeks order by week_number limit 1");
    const weekId = week.rows[0]!.id;
    await client.query(
      `insert into practice_submissions
         (id, learner_id, program_week_id, status, content, prompt_snapshot, cefr_snapshot, vocabulary_snapshot)
       values ($1, $2, $3, 'submitted', '{"text":"first"}', '{"task":"saved"}', 'A1', '["hello"]')`,
      [randomUUID(), DEMO_IDS.learner, weekId]
    );
    await expect(client.query(
      `insert into practice_submissions
         (id, learner_id, program_week_id, status, content, prompt_snapshot, cefr_snapshot, vocabulary_snapshot)
       values ($1, $2, $3, 'submitted', '{"text":"second"}', '{}', 'A1', '[]')`,
      [randomUUID(), DEMO_IDS.learner, weekId]
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("deduplicates reward events by learner, source type and source id", async () => {
    const sourceId = randomUUID();
    await client.query(
      "insert into reward_events (id, learner_id, points, source_type, source_id) values ($1, $2, 15, 'weekly_practice', $3)",
      [randomUUID(), DEMO_IDS.learner, sourceId]
    );
    await expect(client.query(
      "insert into reward_events (id, learner_id, points, source_type, source_id) values ($1, $2, 15, 'weekly_practice', $3)",
      [randomUUID(), DEMO_IDS.learner, sourceId]
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("persists retry plans, scheduled level changes and one immutable certificate per program", async () => {
    const tables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1::text[])`,
      [["level_up_retry_plans", "scheduled_level_changes", "certificate_issuances"]]
    );
    expect(tables.rows.map((row) => row.table_name).sort()).toEqual([
      "certificate_issuances", "level_up_retry_plans", "scheduled_level_changes"
    ]);

    const program = await client.query<{ id: string }>("select id from programs order by created_at limit 1");
    const programId = program.rows[0]!.id;
    await client.query(
      `insert into certificate_issuances
         (id, learner_id, program_id, certificate_code, level, learner_name, organization_name, badges_snapshot, signatures_snapshot)
       values ($1, $2, $3, 'SE-2026-ABC123', 'C1', 'Learner Snapshot', 'GFT Snapshot', '[]', '{}')`,
      [randomUUID(), DEMO_IDS.learner, programId]
    );
    await expect(client.query(
      `insert into certificate_issuances
         (id, learner_id, program_id, certificate_code, level, learner_name, organization_name, badges_snapshot, signatures_snapshot)
       values ($1, $2, $3, 'SE-2026-OTHER1', 'C1', 'Changed Name', 'Changed Org', '[]', '{}')`,
      [randomUUID(), DEMO_IDS.learner, programId]
    )).rejects.toMatchObject({ code: "23505" });

    await expect(client.query(
      "update certificate_issuances set learner_name = 'Mutated' where learner_id = $1 and program_id = $2",
      [DEMO_IDS.learner, programId]
    )).rejects.toThrow(/certificate issuance is immutable/i);
  });
});
