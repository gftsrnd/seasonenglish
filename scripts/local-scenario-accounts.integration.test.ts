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

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client, { mode: "local" });
    await seedLocalScenarioAccounts(client);
  }, 30_000);

  afterAll(async () => { await pool.end(); await client.end(); });

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

  it("makes all approved learners playable while preserving placement and onboarding gates", async () => {
    const expected = [
      ["learner-onboarding-new", null, null, 0], ["learner-placement-new", null, null, 0],
      ["learner-placement-listening", null, null, 0], ["learner-placement-reading", null, null, 0],
      ["learner-placement-writing", null, null, 0], ["learner-placement-speaking", null, null, 0],
      ["learner-placement-submitted", null, null, 0], ["learner-placement-review", null, null, 0],
      ["learner-placement-borderline", null, null, 0], ["learner-appeal", null, null, 0],
      ["learner-lesson-b1", "B1", "locked", 0], ["learner-lesson-attempts", "A2", "locked", 0],
      ["learner-weekly", "A2", "open", 5], ["learner-level-ready", "A2", "reviewed", 5],
      ["learner-history", "A2", "open", 5], ["learner-reminder", "A2", "locked", 0]
    ] as const;
    for (const [key, cefr, practiceState, completed] of expected) {
      const account = LOCAL_SCENARIO_ACCOUNTS.find((item) => item.key === key)!;
      const hub = await repositories.engagement.gameHub(account.id);
      const practice = await repositories.engagement.weeklyPractice(account.id);
      if (!cefr) {
        expect(hub, key).toBeNull();
        expect(practice, key).toBeNull();
        continue;
      }
      expect(hub, key).toMatchObject({ cefr, wordSet: { topic: expect.any(String) } });
      expect(hub?.wordSet?.words.length, key).toBeGreaterThanOrEqual(12);
      expect(new Set(hub?.wordSet?.words.map((word) => word.english.toLowerCase())).size, key)
        .toBe(hub?.wordSet?.words.length);
      for (const word of hub!.wordSet!.words) {
        expect(word, key).toMatchObject({ id: expect.any(String), english: expect.any(String), vietnamese: expect.any(String), definition: expect.any(String), partOfSpeech: expect.any(String) });
        expect(word.english.length, key).toBeGreaterThan(0);
        expect(word.vietnamese.length, key).toBeGreaterThan(0);
      }
      expect(practice, key).toMatchObject({ state: practiceState, totalLessons: 5, completedLessons: completed });
    }
  });

  it("exposes actual failed part attempts and first-try evidence to learner screens", async () => {
    const account = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-lesson-attempts")!;
    const lesson = await repositories.learning.findLesson(account.id, DEMO_IDS.lessons[0]);
    expect(lesson?.progress.evidence.listening).toMatchObject({ attempts: 2, score: 0 });
    const attempts = await client.query("select * from lesson_part_attempts where learner_id = $1 and part_code = 'listening' order by attempt_number", [account.id]);
    expect(attempts.rows).toHaveLength(2);
    expect(attempts.rows.map((row) => row.attempt_number)).toEqual([1, 2]);
  });

  it("makes the ready-for-level-up account eligible using real progress, practice and coach evidence", async () => {
    const account = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-level-ready")!;
    const dashboard = await repositories.learning.getProgressDashboard(account.id);
    expect(dashboard?.levelReadiness).toMatchObject({ eligible: true, examAvailable: true });
    expect(dashboard?.levelReadiness.criteria.every((criterion) => criterion.met)).toBe(true);
  });

  it("repairs missing game sets on reseed without changing real-user game data", async () => {
    const weekly = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-weekly")!;
    const first = await repositories.engagement.gameHub(weekly.id);
    const unrelatedId = "25000000-0000-4000-8000-000000000099";
    await client.query(`insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
      values ($1, $2, $3, 'weekly_vocabulary', 'published', '{"topic":"User topic","words":[]}'::jsonb)`,
    [unrelatedId, DEMO_IDS.week, DEMO_IDS.learner]);
    try {
      await client.query("delete from game_sets where learner_id = $1", [weekly.id]);
      await seedLocalScenarioAccounts(client);
      const repaired = await repositories.engagement.gameHub(weekly.id);
      expect(repaired?.wordSet?.words.length).toBeGreaterThanOrEqual(12);
      expect(repaired?.wordSet?.id).toBe(first?.wordSet?.id);
      expect((await client.query("select payload from game_sets where id = $1", [unrelatedId])).rows)
        .toEqual([{ payload: { topic: "User topic", words: [] } }]);
    } finally {
      await client.query("delete from game_sets where id = $1", [unrelatedId]);
    }
  });

  it("uses the current published week for scenario progress and game vocabulary", async () => {
    const setId = "27000000-0000-4000-8000-000000000001";
    const versionId = "27000000-0000-4000-8000-000000000002";
    const weekly = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-weekly")!;
    const attempts = LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-lesson-attempts")!;
    await client.query("insert into lesson_sets (id, program_week_id, cefr) values ($1, $2, 'A2')", [setId, DEMO_IDS.week2]);
    await client.query(`insert into lesson_set_versions (id, lesson_set_id, version, status, payload, published_at)
      values ($1, $2, 1, 'published', '{}'::jsonb, now())`, [versionId, setId]);
    const lessons = await client.query<{ id: string }>(
      `insert into lessons (id, lesson_set_version_id, day_number, title)
       select gen_random_uuid(), $1, day_number, title from lessons where lesson_set_version_id = $2 returning id`,
      [versionId, DEMO_IDS.publishedLessonSetVersion]
    );
    await client.query(`insert into lesson_versions (id, lesson_id, version, status, content)
      select gen_random_uuid(), l.id, 1, 'published', lv.content
      from lessons l join lessons source on source.day_number = l.day_number and source.lesson_set_version_id = $2
      join lesson_versions lv on lv.lesson_id = source.id and lv.status = 'published'
      where l.lesson_set_version_id = $1`, [versionId, DEMO_IDS.publishedLessonSetVersion]);
    await client.query("update programs set current_week_override = 2 where id = $1", [DEMO_IDS.program]);
    try {
      await seedLocalScenarioAccounts(client);
      expect(await repositories.engagement.weeklyPractice(weekly.id))
        .toMatchObject({ weekId: DEMO_IDS.week2, completedLessons: 5, totalLessons: 5, state: "open" });
      expect((await repositories.engagement.gameHub(weekly.id))?.wordSet?.topic).toBe("Emails & rescheduling meetings");
      const progress = await client.query<{ lesson_id: string }>("select lesson_id from progress_records where learner_id = $1", [attempts.id]);
      expect(lessons.rows.map((lesson) => lesson.id)).toContain(progress.rows[0]?.lesson_id);
      expect((await repositories.learning.getProgressDashboard(LOCAL_SCENARIO_ACCOUNTS.find(({ key }) => key === "learner-level-ready")!.id))?.levelReadiness.eligible).toBe(true);
    } finally {
      await client.query("update programs set current_week_override = null where id = $1", [DEMO_IDS.program]);
      await client.query("delete from lesson_part_attempts where lesson_id = any($1::uuid[])", [lessons.rows.map((lesson) => lesson.id)]);
      await client.query("delete from progress_records where lesson_id = any($1::uuid[])", [lessons.rows.map((lesson) => lesson.id)]);
      await client.query("delete from game_sets where program_week_id = $1", [DEMO_IDS.week2]);
      await client.query("delete from practice_submissions where program_week_id = $1", [DEMO_IDS.week2]);
      await client.query("update lesson_set_versions set status = 'retired' where id = $1", [versionId]);
      await seedLocalScenarioAccounts(client);
    }
  });
});
