import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const expectedTables = [
  "activities", "ai_runs", "ai_tasks", "appeals", "assessment_attempts", "assessment_audio_plays",
  "assessment_decisions", "assessment_definitions", "assessment_responses",
  "assessment_scores", "assessment_versions", "audit_events", "auth_challenges", "badges",
  "coach_sessions", "coach_turns", "duels", "enrollments", "files", "game_results",
  "content_lesson_level_settings", "game_sets", "idempotency_keys", "jobs", "learner_profiles", "learner_vocabulary_unlocks", "level_up_challenge_results", "lesson_set_versions",
  "lesson_sets", "lesson_versions", "lessons", "lesson_part_appeals", "lesson_part_attempts", "media_assets", "micro_lessons", "notification_deliveries", "organization_settings", "organizations",
  "certificate_issuances", "level_up_retry_plans", "practice_appeals", "practice_submissions", "program_weeks", "programs", "progress_records", "scheduled_level_changes",
  "manager_destructive_confirmations", "manager_maintenance_backups", "manager_pin_reports", "prompt_versions", "provider_configurations", "reminders", "reward_events", "rubric_versions", "sessions",
  "surveys", "topic_reports", "topic_strikes", "user_credentials", "users"
].sort();

describe("normalized E4S database", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await migrateDatabase(client);
    await seedDemo(client);
  }, 30_000);

  afterAll(async () => {
    await client.end();
  });

  it("creates the complete normalized table set", async () => {
    const result = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations' order by table_name"
    );

    expect(result.rows.map((row) => row.table_name)).toEqual(expectedTables);
  });

  it("creates the organization-scoped media cache columns and indexes", async () => {
    const columns = await client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'media_assets' order by ordinal_position"
    );
    const indexes = await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public' and tablename = 'media_assets' order by indexname"
    );

    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "id", "organization_id", "request_fingerprint", "normalized_query", "provider", "provider_asset_id",
      "status", "source_url", "source_page_url", "creator", "licence", "licence_url", "object_key",
      "mime_type", "width", "height", "sha256", "expires_at", "created_at", "updated_at"
    ]);
    expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining([
      "media_assets_organization_fingerprint_unique",
      "media_assets_status_expires_index"
    ]));
  });

  it("seeds deterministic learner, operator and manager accounts", async () => {
    const result = await client.query<{ id: string; role: string }>(
      "select id, role from users where organization_id = $1 order by role, id",
      [DEMO_IDS.organization]
    );

    expect(result.rows).toEqual([
      { id: DEMO_IDS.learner, role: "learner" },
      { id: DEMO_IDS.manager, role: "manager" },
      { id: DEMO_IDS.operator, role: "operator" },
      { id: DEMO_IDS.checker, role: "operator" }
    ]);
  });

  it("repairs canonical demo account identity when the local seed is rerun", async () => {
    await client.query(
      `update users
       set role = 'manager', display_name = 'Stale operator', email = 'stale@e4s.local', status = 'disabled'
       where id = $1`,
      [DEMO_IDS.operator]
    );

    await seedDemo(client);

    const result = await client.query<{ role: string; display_name: string; email: string; status: string }>(
      "select role, display_name, email, status from users where id = $1",
      [DEMO_IDS.operator]
    );

    expect(result.rows).toEqual([{
      role: "operator",
      display_name: "Trần Thu Hà",
      email: "thu.ha.tran@e4s.local",
      status: "active"
    }]);
  });

  it("keeps the seeded learner at 5/5 lessons without submitting weekly practice", async () => {
    await client.query(
      `update progress_records
       set status = 'in_progress', completed_at = null
       where learner_id = $1 and lesson_id = $2`,
      [DEMO_IDS.learner, DEMO_IDS.lessons[1]]
    );

    await seedDemo(client);

    const result = await client.query<{ day_number: number; status: string | null; practice_count: string }>(
      `select l.day_number, pr.status
        , (select count(*) from practice_submissions ps where ps.learner_id = $1)::text as practice_count
       from lessons l
       left join progress_records pr
         on pr.lesson_id = l.id and pr.learner_id = $1
       where l.id = any($2::uuid[])
       order by l.day_number`,
      [DEMO_IDS.learner, DEMO_IDS.lessons]
    );

    expect(result.rows).toEqual([
      { day_number: 1, status: "completed", practice_count: "0" },
      { day_number: 2, status: "completed", practice_count: "0" },
      { day_number: 3, status: "completed", practice_count: "0" },
      { day_number: 4, status: "completed", practice_count: "0" },
      { day_number: 5, status: "completed", practice_count: "0" }
    ]);
  });

  it("keeps each seeded lesson's study content aligned with its learning objective", async () => {
    const result = await client.query<{ content: { parts: Array<{ code: string; content: Record<string, unknown> }> } }>(
      "select content from lesson_versions where lesson_id = $1",
      [DEMO_IDS.lessons[1]]
    );
    const parts = result.rows[0]?.content.parts ?? [];
    const vocabulary = parts.find((part) => part.code === "vocabulary")?.content.items;
    const grammar = parts.find((part) => part.code === "grammar")?.content.formula;
    const listening = parts.find((part) => part.code === "listening")?.content;
    const reading = parts.find((part) => part.code === "reading")?.content;

    expect(vocabulary).toEqual(expect.arrayContaining([expect.objectContaining({ word: "from" })]));
    expect(grammar).toBe("Where are you from? · I am from + nơi");
    expect(listening).toMatchObject({ script: expect.any(String), options: expect.arrayContaining([expect.any(String)]) });
    expect(reading).toMatchObject({ text: expect.any(String), options: expect.arrayContaining([expect.any(String)]) });
  });

  it("enforces foreign keys for learner profiles", async () => {
    await expect(client.query(
      "insert into learner_profiles (user_id, profile) values ($1, '{}'::jsonb)",
      ["00000000-0000-0000-0000-000000000099"]
    )).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects duplicate idempotency keys within one scope", async () => {
    await client.query(
      "insert into idempotency_keys (scope, key, response) values ('assessment.submit', 'same-key', '{}'::jsonb)"
    );

    await expect(client.query(
      "insert into idempotency_keys (scope, key, response) values ('assessment.submit', 'same-key', '{}'::jsonb)"
    )).rejects.toMatchObject({ code: "23505" });
  });

  it("keeps published lesson-set versions immutable", async () => {
    await expect(client.query(
      "update lesson_set_versions set payload = '{\"changed\":true}'::jsonb where id = $1",
      [DEMO_IDS.publishedLessonSetVersion]
    )).rejects.toThrow(/published lesson set version is immutable/i);
  });
});
