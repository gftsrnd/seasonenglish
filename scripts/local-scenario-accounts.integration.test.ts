import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "../packages/database/src/index.js";
import { LOCAL_SCENARIO_ACCOUNTS, seedLocalScenarioAccounts } from "./local-scenario-accounts.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("local scenario account states", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client, { mode: "local" });
    await seedLocalScenarioAccounts(client);
  }, 30_000);

  afterAll(async () => { await client.end(); });

  it("seeds exactly the approved human identities", async () => {
    const ids = LOCAL_SCENARIO_ACCOUNTS.map(({ id }) => id);
    const result = await client.query<{ id: string; display_name: string; email: string }>(
      "select id, display_name, email from users where id = any($1::uuid[]) order by id",
      [ids]
    );
    expect(result.rows).toEqual(LOCAL_SCENARIO_ACCOUNTS
      .map(({ id, displayName: display_name, email }) => ({ id, display_name, email }))
      .sort((left, right) => left.id.localeCompare(right.id)));
  });

  it("keeps onboarding incomplete and covers every placement checkpoint", async () => {
    const onboarding = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-onboarding-new")!;
    const profile = await client.query<{ completed_at: Date | null }>(
      "select completed_at from learner_profiles where user_id = $1",
      [onboarding.id]
    );
    expect(profile.rows[0]?.completed_at).toBeNull();

    const result = await client.query<{ email: string; status: string; current_section: string }>(
      `select u.email, aa.status, aa.current_section
       from assessment_attempts aa join users u on u.id = aa.learner_id
       where u.id = any($1::uuid[]) order by u.email`,
      [LOCAL_SCENARIO_ACCOUNTS.map(({ id }) => id)]
    );
    expect(result.rows).toEqual([
      { email: "anh.tuan.ho@scenario.e4s.local", status: "pending_review", current_section: "speaking" },
      { email: "bao.tram.ta@scenario.e4s.local", status: "pending_review", current_section: "speaking" },
      { email: "duc.long.vu@scenario.e4s.local", status: "in_progress", current_section: "writing" },
      { email: "gia.han.bui@scenario.e4s.local", status: "submitted", current_section: "speaking" },
      { email: "hoang.anh.le@scenario.e4s.local", status: "in_progress", current_section: "listening" },
      { email: "my.linh.duong@scenario.e4s.local", status: "pending_review", current_section: "speaking" },
      { email: "ngoc.mai.do@scenario.e4s.local", status: "in_progress", current_section: "speaking" },
      { email: "thu.trang.pham@scenario.e4s.local", status: "in_progress", current_section: "reading" }
    ]);
  });

  it("seeds dedicated reminder and appeal scenarios", async () => {
    const reminder = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-reminder")!;
    const appeal = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-appeal")!;
    await expect(client.query("select 1 from reminders where learner_id = $1", [reminder.id]))
      .resolves.toHaveProperty("rowCount", 1);
    await expect(client.query("select 1 from appeals where learner_id = $1 and status = 'pending'", [appeal.id]))
      .resolves.toHaveProperty("rowCount", 1);
  });

  it("publishes five weekly lessons for every approved scenario level", async () => {
    const result = await client.query<{ cefr: string; lessons: number }>(
      `select ls.cefr, count(l.id)::int as lessons
       from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       where ls.program_week_id = $1 and ls.cefr in ('A2', 'B1')
       group by ls.cefr order by ls.cefr`,
      [DEMO_IDS.week]
    );
    expect(result.rows).toEqual([{ cefr: "A2", lessons: 5 }, { cefr: "B1", lessons: 5 }]);
  });

  it("is idempotent and repairs a missing B1 lesson", async () => {
    const ids = LOCAL_SCENARIO_ACCOUNTS.map(({ id }) => id);
    const counts = async () => (await client.query<{ users: number; enrollments: number; progress: number }>(
      `select
        (select count(*)::int from users where id = any($1::uuid[])) as users,
        (select count(*)::int from enrollments where learner_id = any($1::uuid[])) as enrollments,
        (select count(*)::int from progress_records where learner_id = any($1::uuid[])) as progress`,
      [ids]
    )).rows[0];
    const before = await counts();
    await seedLocalScenarioAccounts(client);
    expect(await counts()).toEqual(before);

    await client.query("delete from lessons where id = $1", ["24000000-0000-4000-8100-000000000005"]);
    await seedLocalScenarioAccounts(client);
    const repaired = await client.query<{ lessons: number }>(
      `select count(*)::int as lessons from lessons
       where lesson_set_version_id = $1`,
      ["24000000-0000-4000-8000-000000000002"]
    );
    expect(repaired.rows[0]?.lessons).toBe(5);
    expect(await counts()).toEqual(before);
  });

  it("seeds visible AI-scored and manually-scored placement examples", async () => {
    const result = await client.query<{ email: string; source: string; sections: number }>(
      `select u.email, s.source, count(*)::int as sections
       from assessment_scores s
       join assessment_attempts a on a.id = s.attempt_id
       join users u on u.id = a.learner_id
       where u.email in ($1, $2) and s.section in ('writing', 'speaking')
       group by u.email, s.source
       order by u.email`,
      ["anh.tuan.ho@scenario.e4s.local", "my.linh.duong@scenario.e4s.local"]
    );
    expect(result.rows).toEqual([
      { email: "anh.tuan.ho@scenario.e4s.local", source: "ai", sections: 2 },
      { email: "my.linh.duong@scenario.e4s.local", source: "human", sections: 2 }
    ]);
  });
});
