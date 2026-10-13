import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const expectedTables = [
  "activities", "ai_runs", "ai_tasks", "appeals", "assessment_attempts", "assessment_audio_plays",
  "assessment_decisions", "assessment_definitions", "assessment_responses",
  "assessment_scores", "assessment_versions", "audit_events", "badges",
  "coach_sessions", "coach_turns", "duels", "enrollments", "files", "game_results",
  "game_sets", "idempotency_keys", "jobs", "learner_profiles", "lesson_set_versions",
  "lesson_sets", "lesson_versions", "lessons", "micro_lessons", "notification_deliveries", "organizations",
  "practice_submissions", "program_weeks", "programs", "progress_records",
  "prompt_versions", "reminders", "reward_events", "rubric_versions", "sessions",
  "surveys", "user_credentials", "users"
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

  it("keeps each seeded lesson's study content aligned with its learning objective", async () => {
    const result = await client.query<{ content: { parts: Array<{ code: string; content: Record<string, unknown> }> } }>(
      "select content from lesson_versions where lesson_id = $1",
      [DEMO_IDS.lessons[1]]
    );
    const parts = result.rows[0]?.content.parts ?? [];
    const vocabulary = parts.find((part) => part.code === "vocabulary")?.content.items;
    const grammar = parts.find((part) => part.code === "grammar")?.content.formula;

    expect(vocabulary).toEqual(expect.arrayContaining([expect.objectContaining({ word: "from" })]));
    expect(grammar).toBe("Where are you from? · I am from + nơi");
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
