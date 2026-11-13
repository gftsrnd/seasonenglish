import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { createRepositories, nextSeasonPointsTier, seasonForRewards } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

/** Badge keys of each Season tier, in ladder order (seed catalog). */
const SUMMER = ["starter", "streak3"];
const AUTUMN = ["week_complete", "friday", "coach_friend"];
const WINTER = ["streak5", "first_try", "wordsmith"];

describe("reward points and Season badges", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  const learnerId = DEMO_IDS.learner;
  const gameSetId = randomUUID();

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into game_sets (id, learner_id, game_key, status, payload)
         values ($1, $2, 'custom_vocabulary', 'published', '{"topic":"Rewards","words":[]}'::jsonb)`,
        [gameSetId, learnerId]
      );
    } finally { client.release(); }
  }, 60_000);

  beforeEach(async () => {
    await pool.query("delete from reward_events where learner_id = $1", [learnerId]);
    await pool.query("delete from activities where learner_id = $1", [learnerId]);
    await pool.query("delete from game_results where learner_id = $1", [learnerId]);
    await pool.query("delete from lesson_part_attempts where learner_id = $1", [learnerId]);
    await pool.query("delete from progress_records where learner_id = $1", [learnerId]);
  });

  afterAll(async () => { await pool.end(); });

  async function totalPoints() {
    return (await repositories.engagement.getSummary(learnerId)).points;
  }

  async function awardBadges(keys: string[]) {
    for (const key of keys) {
      await pool.query(
        `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
         select gen_random_uuid(), $1, b.id, 0, 'achievement', $1 from badges b
         where b.organization_id = $2 and b.badge_key = $3
         on conflict (learner_id, badge_id) where badge_id is not null do nothing`,
        [learnerId, DEMO_IDS.organization, key]
      );
    }
  }

  async function grantPoints(points: number) {
    await pool.query(
      `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
       values (gen_random_uuid(), $1, null, $2, 'test_grant', gen_random_uuid())`,
      [learnerId, points]
    );
  }

  const game = (requestId: string) => repositories.engagement.saveGameResult({
    learnerId, setId: gameSetId, game: "typing", requestId, score: 4, maxScore: 10, correct: 2, total: 5, details: {}
  });

  it("starts a learner with no reward history at 0 points in the first Season", async () => {
    expect(await totalPoints()).toBe(0);
    const progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress).toMatchObject({ points: 0, badges: [], season: { current: { level: 1 }, next: { level: 2, pointsRequired: 60 } } });
  });

  it("awards a game result +5 once per request, also when the same request arrives in parallel", async () => {
    const requestId = randomUUID();
    await game(requestId);
    await game(requestId);
    expect(await totalPoints()).toBe(5);

    const parallelId = randomUUID();
    await expect(Promise.all([game(parallelId), game(parallelId), game(parallelId)])).resolves.toHaveLength(3);
    expect(await totalPoints()).toBe(10);
  });

  it("does not fail parallel game results with distinct requests and awards each one", async () => {
    await expect(Promise.all([game(randomUUID()), game(randomUUID()), game(randomUUID())])).resolves.toHaveLength(3);
    expect(await totalPoints()).toBe(15);
  });

  it("awards the +10 lesson completion once even when completion is saved in parallel or again on refresh", async () => {
    const lessonId = DEMO_IDS.lessons[2];
    const progress = { status: "completed" as const, completedPartCodes: [], evidence: {} };
    await Promise.all([
      repositories.learning.saveLessonProgress({ learnerId, lessonId, progress }),
      repositories.learning.saveLessonProgress({ learnerId, lessonId, progress }),
      repositories.learning.saveLessonProgress({ learnerId, lessonId, progress })
    ]);
    await repositories.learning.saveLessonProgress({ learnerId, lessonId, progress });
    const lessonPoints = await pool.query<{ points: number }>(
      `select coalesce(sum(re.points), 0)::int as points from reward_events re
       join activities a on a.id = re.source_id and re.source_type = 'activity_points'
       where re.learner_id = $1 and a.reference_type = 'lesson' and a.reference_id = $2`,
      [learnerId, lessonId]
    );
    expect(lessonPoints.rows[0]?.points).toBe(10);
    const starter = await pool.query<{ count: number }>(
      `select count(*)::int as count from reward_events re join badges b on b.id = re.badge_id
       where re.learner_id = $1 and b.badge_key = 'starter'`, [learnerId]
    );
    expect(starter.rows[0]?.count).toBe(1);
  });

  it("awards a lesson part only for its first correct answer (+5 first try), never again on a later attempt", async () => {
    const lessonId = DEMO_IDS.lessons[2];
    const submit = (requestId: string) => repositories.learning.submitLessonPartAttempt({
      learnerId, lessonId, partCode: "listening", requestId, evidence: { answer: "The sales manager" }
    });
    const first = randomUUID();
    await expect(submit(first)).resolves.toMatchObject({ evidence: { status: "correct", attempts: 1 } });
    await submit(first);
    expect(await totalPoints()).toBe(5);
    await submit(randomUUID());
    expect(await totalPoints()).toBe(5);
  });

  it("gives the reduced score when the part is right on the second attempt", async () => {
    const lessonId = DEMO_IDS.lessons[2];
    await repositories.learning.submitLessonPartAttempt({
      learnerId, lessonId, partCode: "reading", requestId: randomUUID(), evidence: { answer: "Monday" }
    });
    expect(await totalPoints()).toBe(0);
    await expect(repositories.learning.submitLessonPartAttempt({
      learnerId, lessonId, partCode: "reading", requestId: randomUUID(), evidence: { answer: "Friday" }
    })).resolves.toMatchObject({ evidence: { status: "correct", attempts: 2 } });
    expect(await totalPoints()).toBe(4);
  });

  it("awards each badge once however often rewards are re-synced", async () => {
    const lessonId = DEMO_IDS.lessons[2];
    const progress = { status: "completed" as const, completedPartCodes: [], evidence: {} };
    for (let index = 0; index < 3; index += 1) await repositories.learning.saveLessonProgress({ learnerId, lessonId, progress });
    await game(randomUUID());
    const rows = await pool.query<{ badge_key: string; count: number }>(
      `select b.badge_key, count(*)::int as count from reward_events re join badges b on b.id = re.badge_id
       where re.learner_id = $1 group by b.badge_key`, [learnerId]
    );
    expect(rows.rows).toEqual([{ badge_key: "starter", count: 1 }]);
  });

  it("names the next points tier for the home ring at each boundary", () => {
    expect([0, 59, 60, 61, 179, 180, 181, 359, 360, 361, 999].map(nextSeasonPointsTier))
      .toEqual([60, 60, 180, 180, 180, 360, 360, 360, null, null, null]);
  });

  it("climbs Seasons at exactly 60 / 180 / 360 points once the tier badges are earned", () => {
    const all = new Set([...SUMMER, ...AUTUMN, ...WINTER]);
    expect([0, 59, 60, 61, 179, 180, 359, 360, 361].map((points) => seasonForRewards(points, all).level))
      .toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4]);
  });

  it("climbs Seasons in order: higher-tier badges never skip a missing lower tier", async () => {
    await grantPoints(400);
    await awardBadges(["starter", ...WINTER]);
    let progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress?.season).toMatchObject({ current: { level: 1 }, next: { level: 2 }, earnedBadgeCount: 1, requiredBadgeCount: 2 });

    await awardBadges(["streak3"]);
    progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress?.season).toMatchObject({ current: { level: 2 }, next: { level: 3 }, earnedBadgeCount: 0, requiredBadgeCount: 3 });

    await awardBadges(AUTUMN);
    progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress?.season).toMatchObject({ current: { level: 4 }, next: null });
  });

  it("keeps points and badges from earlier months (lifetime ledger, no monthly reset)", async () => {
    await pool.query(
      `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id, created_at)
       values (gen_random_uuid(), $1, null, 30, 'test_grant', gen_random_uuid(), now() - interval '40 days')`,
      [learnerId]
    );
    await grantPoints(30);
    await awardBadges(SUMMER);
    const progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress).toMatchObject({ points: 60, season: { current: { level: 2 } } });
  });

  it("shows the manager the same points and badges as the learner profile", async () => {
    await grantPoints(75);
    await awardBadges(SUMMER);
    const [progress, manager] = await Promise.all([
      repositories.learning.getProgressDashboard(learnerId),
      repositories.manager.progress(DEMO_IDS.manager)
    ]);
    const row = manager?.learners.find((learner) => learner.learnerId === learnerId);
    expect(row?.rewardPoints).toBe(progress?.points);
    expect([...(row?.earnedBadges ?? [])].sort()).toEqual(progress?.badges.map((badge) => badge.label).sort());
  });
});
