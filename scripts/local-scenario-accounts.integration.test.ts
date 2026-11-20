import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { createRepositories, DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "../packages/database/src/index.js";
import { LOCAL_SCENARIO_ACCOUNTS, seedLocalScenarioAccounts } from "./local-scenario-accounts.js";
import { isLearnerProfileComplete } from "../packages/domain/src/learning/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("local scenario account states", () => {
  const client = new Client({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);

  const originalEncryptionKey = process.env.E4S_SETTINGS_ENCRYPTION_KEY;

  beforeAll(async () => {
    // Recoverable learner PINs are encrypted; use a fixed test key when the environment has none.
    process.env.E4S_SETTINGS_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client, { mode: "local" });
    await seedLocalScenarioAccounts(client);
  }, 30_000);

  afterAll(async () => {
    if (originalEncryptionKey === undefined) delete process.env.E4S_SETTINGS_ENCRYPTION_KEY;
    else process.env.E4S_SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
    await pool.end(); await client.end();
  });

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
    const onboardingProfile = await repositories.learning.getProfile(onboarding.id);
    expect(isLearnerProfileComplete(onboardingProfile!.profile)).toBe(false);

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

  it("seeds an inactive learner and a consecutive streak spanning the weekend", async () => {
    const inactive = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-reminder")!;
    const history = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-history")!;
    const inactivity = await client.query<{ inactive_days: number }>(
      `select floor(extract(epoch from (now() - max(occurred_at))) / 86400)::int as inactive_days
       from activities where learner_id = $1`,
      [inactive.id]
    );
    expect(inactivity.rows[0]?.inactive_days).toBeGreaterThanOrEqual(2);

    const streak = await client.query<{ day: string; weekday: number }>(
      `select to_char(occurred_at, 'YYYY-MM-DD') as day,
              extract(isodow from occurred_at)::int as weekday
       from activities where learner_id = $1
       group by to_char(occurred_at, 'YYYY-MM-DD'), extract(isodow from occurred_at)
       order by day`,
      [history.id]
    );
    expect(streak.rows.map(({ weekday }) => weekday)).toEqual([4, 5, 6, 7, 1]);
    const days = streak.rows.map(({ day }) => Date.parse(`${day}T00:00:00Z`));
    expect(days.slice(1).every((day, index) => day - days[index]! === 86_400_000)).toBe(true);
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

  it("seeds one submitted weekly practice that is still waiting for grading", async () => {
    const result = await client.query<{ display_name: string; status: string; score: unknown; feedback: unknown }>(
      `select u.display_name, ps.status, ps.score, ps.feedback
       from practice_submissions ps
       join users u on u.id = ps.learner_id
       where u.email = 'hai.yen.truong@scenario.e4s.local'
         and ps.status = 'submitted'`
    );

    expect(result.rows).toEqual([{
      display_name: "Trương Hải Yến",
      status: "submitted",
      score: null,
      feedback: null
    }]);
  });

  it("is idempotent and repairs a missing B1 lesson", async () => {
    const ids = LOCAL_SCENARIO_ACCOUNTS.map(({ id }) => id);
    const counts = async () => (await client.query<Record<string, number>>(
      `select
        (select count(*)::int from users where id = any($1::uuid[])) as users,
        (select count(*)::int from enrollments where learner_id = any($1::uuid[])) as enrollments,
        (select count(*)::int from progress_records where learner_id = any($1::uuid[])) as progress,
        (select count(*)::int from game_sets where learner_id = any($1::uuid[])) as game_sets,
        (select count(*)::int from lesson_part_attempts where learner_id = any($1::uuid[])) as part_attempts,
        (select count(*)::int from practice_submissions where learner_id = any($1::uuid[])) as practice,
        (select count(*)::int from coach_turns where session_id in
          (select id from coach_sessions where learner_id = any($1::uuid[]))) as coach_turns`,
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

  it("republishes the fixed B1 scenario version after an operator retires it", async () => {
    const versionId = "24000000-0000-4000-8000-000000000002";
    await client.query("update lesson_set_versions set status = 'retired' where id = $1", [versionId]);

    await seedLocalScenarioAccounts(client);

    const repaired = await client.query<{ status: string; lessons: number }>(
      `select lsv.status, count(l.id)::int as lessons
       from lesson_set_versions lsv
       left join lessons l on l.lesson_set_version_id = lsv.id
       where lsv.id = $1
       group by lsv.status`,
      [versionId]
    );
    expect(repaired.rows).toEqual([{ status: "published", lessons: 5 }]);
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

  it("exposes actual failed part attempts and first-try evidence to learner screens", async () => {
    const account = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-lesson-attempts")!;
    const lesson = await repositories.learning.findLesson(account.id, DEMO_IDS.lessons[0]);
    expect(lesson?.progress.evidence.listening).toMatchObject({ attempts: 2, score: 0 });
    const attempts = await client.query("select * from lesson_part_attempts where learner_id = $1 and part_code = 'listening' order by attempt_number", [account.id]);
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows.map((row) => row.attempt_number)).toEqual([1, 2]);
  });
});
