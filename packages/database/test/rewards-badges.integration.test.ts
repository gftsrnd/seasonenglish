import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { createRepositories, monthlyCalendarAchievements, nextSeasonPointsTier, PAID_GAME_RESULTS_PER_DAY, seasonForRewards, type MonthlyCalendarLessonProgress } from "../src/repositories.js";
import { recomputeDoublePaidRewards } from "../src/reward-recompute.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

/** Badge keys of each Season tier, in ladder order (seed catalog). */
const SUMMER = ["starter", "streak"];
const AUTUMN = ["week_complete", "friday", "coach_friend"];
const WINTER = ["first_try", "monthly_final_score", "wordsmith"];

describe("reward points and Season badges", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  const learnerId = DEMO_IDS.learner;
  const gameSetId = randomUUID();
  const month = "2026-11";
  const monthId = randomUUID();
  const frameworkId = randomUUID();
  const finalVersionId = randomUUID();
  const levelUpVersionId = randomUUID();
  const calendarDays = [
    { lessonNumber: 1, date: "2026-11-02", kind: "new" },
    { lessonNumber: 2, date: "2026-11-03", kind: "new" },
    { lessonNumber: 3, date: "2026-11-04", kind: "new" },
    { lessonNumber: 4, date: "2026-11-05", kind: "new" },
    { lessonNumber: 5, date: "2026-11-06", kind: "review" },
    { lessonNumber: 6, date: "2026-11-09", kind: "new" },
    { lessonNumber: 7, date: "2026-11-10", kind: "new" }
  ].map((day) => ({ ...day, lessonId: randomUUID() }));

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
    for (const [kind, versionId] of [["final", finalVersionId], ["level_up", levelUpVersionId]] as const) {
      const definitionId = randomUUID();
      await pool.query("insert into assessment_definitions (id, organization_id, assessment_key, kind, title) values ($1, $2, $3, $4, $3)", [definitionId, DEMO_IDS.organization, `rewards-${kind}`, kind]);
      await pool.query("insert into assessment_versions (id, definition_id, version, status, blueprint, published_at) values ($1, $2, 1, 'published', '{}'::jsonb, now())", [versionId, definitionId]);
    }
    // A monthly calendar: week of 02/11 (four new lessons + the Friday review) and two days of the next week.
    await pool.query("insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, '2026-11-30', $4, 'approved')",
      [monthId, DEMO_IDS.organization, month, calendarDays.length]);
    await pool.query(`insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash, published_at, published_on)
      values ($1, $2, 'A2', 'approved', $3, 'scope', now(), '2026-11-02')`,
      [frameworkId, monthId, JSON.stringify({ month, daySpecs: calendarDays.map(({ lessonNumber, date, kind }) => ({ lessonNumber, date, kind })), coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] })]);
    const setId = randomUUID();
    await pool.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A2')", [setId, frameworkId]);
    for (const day of calendarDays) {
      const versionId = randomUUID();
      await pool.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day.lessonNumber]);
      await pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [day.lessonId, versionId, day.lessonNumber]);
      await pool.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'published', '{}'::jsonb)", [randomUUID(), day.lessonId]);
      await pool.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', 'approved')",
        [randomUUID(), frameworkId, day.lessonNumber, day.date, day.lessonId]);
    }
  }, 60_000);

  beforeEach(async () => {
    await pool.query("delete from reward_events where learner_id = $1", [learnerId]);
    await pool.query("delete from activities where learner_id = $1", [learnerId]);
    await pool.query("delete from game_results where learner_id = $1", [learnerId]);
    await pool.query("delete from lesson_part_attempts where learner_id = $1", [learnerId]);
    await pool.query("delete from progress_records where learner_id = $1", [learnerId]);
    await pool.query("delete from inbox_notifications where recipient_id = $1", [learnerId]);
    await pool.query("delete from learner_season_milestones where learner_id = $1", [learnerId]);
    await pool.query("delete from organization_settings where organization_id = $1", [DEMO_IDS.organization]);
    await pool.query("delete from organization_holidays where organization_id = $1", [DEMO_IDS.organization]);
    await pool.query("delete from coach_sessions where learner_id = $1", [learnerId]);
    await pool.query("delete from assessment_attempts where learner_id = $1 and assessment_version_id = $2", [learnerId, finalVersionId]);
    // The demo learner is at A2 since long ago (one level period: every point counts).
    await pool.query("update enrollments set cefr = 'A2', cefr_approved = true, cefr_started_on = '2026-10-01' where learner_id = $1", [learnerId]);
    await pool.query("delete from learner_level_periods where learner_id = $1", [learnerId]);
    await pool.query("insert into learner_level_periods (learner_id, cefr, started_at, source) values ($1, 'A2', now() - interval '1 year', 'test')", [learnerId]);
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

  /** A mini game round scored 0–100; 60/100 passes the 50/100 threshold. */
  const game = (requestId: string, score = 60) => repositories.engagement.saveGameResult({
    learnerId, setId: gameSetId, game: "typing", requestId, score, raw: score, rawMax: 100, unitsAssigned: 10, gameplayMs: null,
    correct: Math.round(score / 10), total: 10, details: {}
  });

  it("starts a learner with no reward history at 0 points in the first Season", async () => {
    expect(await totalPoints()).toBe(0);
    const progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress).toMatchObject({ points: 0, badges: [], season: { current: { level: 1 }, next: { level: 2, pointsRequired: 500 }, cefr: "A2", pointsInLevel: 0 } });
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

  it("names the next points threshold for the home ring at each boundary", () => {
    expect([0, 499, 500, 501, 1999, 2000, 2001, 4999, 5000, 5001, 99999].map(nextSeasonPointsTier))
      .toEqual([500, 500, 2000, 2000, 2000, 5000, 5000, 5000, null, null, null]);
  });

  it("climbs Seasons at exactly 500 / 2 000 / 5 000 points in the level once the Season badges are earned", () => {
    const all = new Set([...SUMMER, ...AUTUMN, ...WINTER]);
    expect([0, 499, 500, 501, 1999, 2000, 4999, 5000, 5001].map((points) => seasonForRewards(points, all).level))
      .toEqual([1, 1, 2, 2, 2, 3, 3, 4, 4]);
  });

  it("climbs Seasons in order: higher-tier badges never skip a missing lower tier", async () => {
    await grantPoints(6000);
    await awardBadges(["starter", ...WINTER]);
    let progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress?.season).toMatchObject({ current: { level: 1 }, next: { level: 2 }, earnedBadgeCount: 1, requiredBadgeCount: 2 });

    await awardBadges(["streak"]);
    progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress?.season).toMatchObject({ current: { level: 2 }, next: { level: 3 }, earnedBadgeCount: 0, requiredBadgeCount: 3 });

    await awardBadges(AUTUMN);
    progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress?.season).toMatchObject({ current: { level: 4 }, next: null });
  });

  it("keeps points and badges from earlier months (lifetime ledger, no monthly reset)", async () => {
    await pool.query(
      `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id, created_at)
       values (gen_random_uuid(), $1, null, 300, 'test_grant', gen_random_uuid(), now() - interval '40 days')`,
      [learnerId]
    );
    await grantPoints(200);
    await awardBadges(SUMMER);
    const progress = await repositories.learning.getProgressDashboard(learnerId);
    expect(progress).toMatchObject({ points: 500, season: { current: { level: 2 }, pointsInLevel: 500 } });
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

  async function systemDate(date: string) {
    await pool.query(`insert into organization_settings (organization_id, configuration)
      values ($1, jsonb_build_object('simulatedSystemDate', $2::text))
      on conflict (organization_id) do update set configuration = excluded.configuration`, [DEMO_IDS.organization, date]);
  }

  /** Completes calendar day N on `onDate` (organisation date), as the learner app does. */
  async function completeDay(lessonNumber: number, onDate?: string) {
    const day = calendarDays[lessonNumber - 1]!;
    await systemDate(onDate ?? day.date);
    await repositories.learning.saveLessonProgress({
      learnerId, lessonId: day.lessonId, progress: { status: "completed", completedPartCodes: [], evidence: {} }
    });
  }

  async function earnedBadgeKeys() {
    const { rows } = await pool.query<{ badge_key: string }>(
      `select b.badge_key from reward_events re join badges b on b.id = re.badge_id where re.learner_id = $1 order by b.badge_key`, [learnerId]
    );
    return rows.map((row) => row.badge_key);
  }

  async function notifications(kind: string) {
    const { rows } = await pool.query<{ event_key: string; context: string }>(
      "select event_key, context from inbox_notifications where recipient_id = $1 and kind = $2 order by event_key", [learnerId, kind]
    );
    return rows;
  }

  describe("mini games", () => {
    it("pays +5 only for a round of at least 50/100", async () => {
      await game(randomUUID(), 49);
      expect(await totalPoints()).toBe(0);
      await game(randomUUID(), 50);
      expect(await totalPoints()).toBe(5);
      const stored = await pool.query<{ arena_score: number; max_score: number; rules_version: number }>(
        "select arena_score, max_score, rules_version from game_results where learner_id = $1 order by arena_score", [learnerId]);
      expect(stored.rows).toEqual([{ arena_score: 49, max_score: 100, rules_version: 2 }, { arena_score: 50, max_score: 100, rules_version: 2 }]);
    });

    it("keeps paying results from before the 0–100 rule by 50 % of their maximum, within the same daily cap", async () => {
      const legacy = async (score: number, maxScore: number) => {
        const resultId = randomUUID();
        await pool.query(
          `insert into game_results (id, game_set_id, learner_id, game_key, score, max_score, request_key)
           values ($1, $2, $3, 'typing', $4, $5, $6)`, [resultId, gameSetId, learnerId, score, maxScore, randomUUID()]);
        await pool.query(
          `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
           values ($1, $2, 'game', 'game_result', $3, 5, $4::jsonb)`,
          [randomUUID(), learnerId, resultId, JSON.stringify({ game: "typing", score, maxScore })]);
      };
      await legacy(4, 10);
      await legacy(5, 10);
      await game(randomUUID(), 0);
      expect(await totalPoints()).toBe(5);
      for (let play = 0; play < 3; play += 1) await game(randomUUID(), 90);
      expect(await totalPoints()).toBe(15);
    });

    it("pays at most three results a day but keeps recording every play", async () => {
      expect(PAID_GAME_RESULTS_PER_DAY).toBe(3);
      for (let play = 0; play < 5; play += 1) await expect(game(randomUUID(), 80)).resolves.toMatchObject({ score: 80, maxScore: 100 });
      expect(await totalPoints()).toBe(15);
      const plays = await pool.query<{ count: number }>("select count(*)::int as count from activities where learner_id = $1 and activity_type = 'game'", [learnerId]);
      expect(plays.rows[0]?.count).toBe(5);
    });

    it("gives three new paid results on the next Vietnam day", async () => {
      for (let play = 0; play < 4; play += 1) await game(randomUUID());
      expect(await totalPoints()).toBe(15);
      await pool.query("update activities set occurred_at = occurred_at - interval '1 day' where learner_id = $1 and activity_type = 'game'", [learnerId]);
      for (let play = 0; play < 4; play += 1) await game(randomUUID());
      expect(await totalPoints()).toBe(30);
    });

    it("does not count a failed result toward the daily cap", async () => {
      await game(randomUUID(), 10);
      await game(randomUUID(), 20);
      for (let play = 0; play < 3; play += 1) await game(randomUUID());
      expect(await totalPoints()).toBe(15);
    });
  });

  describe("monthly calendar", () => {
    it("pays +10 for a new lesson and +15 for the Friday review", async () => {
      await completeDay(1);
      expect(await totalPoints()).toBe(10);
      await completeDay(5);
      expect(await totalPoints()).toBe(25);
      await completeDay(5);
      expect(await totalPoints()).toBe(25);
    });

    it("counts a Friday review for 'Ôn tập đúng hẹn' only when it is completed on its scheduled day (A2 needs 4)", async () => {
      await completeDay(5, "2026-11-09");
      expect(await earnedBadgeKeys()).not.toContain("friday");
      await pool.query("delete from progress_records where learner_id = $1", [learnerId]);
      await completeDay(5, "2026-11-06");
      // One on-time review of the four an A2 learner needs.
      expect(await earnedBadgeKeys()).not.toContain("friday");
      const roadmap = (await repositories.learning.getProgressDashboard(learnerId))?.badgeRoadmap.find((badge) => badge.key === "friday");
      expect(roadmap).toMatchObject({ earned: false, threshold: 4, description: "4 bài Ôn tuần đúng hẹn" });
    });

    it("counts a calendar week for 'Tuần trọn vẹn' when every lesson of it is completed (A2 needs 3)", async () => {
      for (const lessonNumber of [1, 2, 3, 4]) await completeDay(lessonNumber);
      await completeDay(5, "2026-11-12");
      // One whole week of the three an A2 learner needs.
      expect(await earnedBadgeKeys()).not.toContain("week_complete");
      const roadmap = (await repositories.learning.getProgressDashboard(learnerId))?.badgeRoadmap.find((badge) => badge.key === "week_complete");
      expect(roadmap).toMatchObject({ earned: false, threshold: 3 });
    });

    it("does not count a short edge week (fewer than three lessons) as a whole week", async () => {
      await completeDay(6);
      await completeDay(7);
      expect(await earnedBadgeKeys()).not.toContain("week_complete");
    });

    it("pays +20 once when every new and review lesson of the month is completed", async () => {
      for (const day of calendarDays.slice(0, -1)) await completeDay(day.lessonNumber);
      const bonus = () => pool.query<{ count: number }>(
        "select count(*)::int as count from reward_events where learner_id = $1 and source_type = 'full_month_bonus'", [learnerId]
      );
      expect((await bonus()).rows[0]?.count).toBe(0);
      await completeDay(7);
      await completeDay(7);
      expect((await bonus()).rows[0]?.count).toBe(1);
      expect(await totalPoints()).toBe(6 * 10 + 15 + 20);
    });

    it("finds month, week and on-time review achievements from calendar days", () => {
      const day = (lessonDate: string, completed: boolean, kind: "new" | "review" = "new", onTime = false): MonthlyCalendarLessonProgress =>
        ({ monthId: "m", frameworkId: "f", lessonCount: 4, kind, lessonDate, completed, onTime });
      expect(monthlyCalendarAchievements([day("2026-11-02", true), day("2026-11-03", true), day("2026-11-06", true, "review"), day("2026-11-09", false)]))
        .toEqual({ completedMonthIds: [], weekComplete: true, fridayOnTime: false, completeWeeks: 1, onTimeReviews: 0 });
      expect(monthlyCalendarAchievements([day("2026-11-02", true), day("2026-11-03", true), day("2026-11-06", true, "review", true), day("2026-11-09", true)]))
        .toEqual({ completedMonthIds: ["m"], weekComplete: true, fridayOnTime: true, completeWeeks: 1, onTimeReviews: 1 });
      expect(monthlyCalendarAchievements([day("2026-11-02", true), day("2026-11-03", true)]).completedMonthIds).toEqual([]);
    });
  });

  describe("tests", () => {
    async function recordAssessment(versionId: string) {
      const attemptId = randomUUID();
      await pool.query("insert into assessment_attempts (id, assessment_version_id, learner_id, status) values ($1, $2, $3, 'pending_review')", [attemptId, versionId, learnerId]);
      await pool.query(`insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence)
        values (gen_random_uuid(), $1, 'assessment', 'assessment_attempt', $2, 30, '{}'::jsonb)`, [learnerId, attemptId]);
      await game(randomUUID(), 0);
      return attemptId;
    }

    it("pays +15 for the monthly final exam and +10 for placement and level-up tests", async () => {
      const attempts = [await recordAssessment(finalVersionId)];
      expect(await totalPoints()).toBe(15);
      attempts.push(await recordAssessment(DEMO_IDS.placementVersion));
      expect(await totalPoints()).toBe(25);
      attempts.push(await recordAssessment(levelUpVersionId));
      expect(await totalPoints()).toBe(35);
      await pool.query("delete from activities where learner_id = $1", [learnerId]);
      await pool.query("delete from assessment_attempts where id = any($1::uuid[])", [attempts]);
    });
  });

  describe("lesson parts", () => {
    it("keeps a correct part when it is practised again and pays nothing for the retry", async () => {
      const lessonId = DEMO_IDS.lessons[2];
      await repositories.learning.submitLessonPartAttempt({
        learnerId, lessonId, partCode: "listening", requestId: randomUUID(), evidence: { answer: "The sales manager" }
      });
      const retry = await repositories.learning.submitLessonPartAttempt({
        learnerId, lessonId, partCode: "listening", requestId: randomUUID(), evidence: { answer: "Nobody" }
      });
      expect(retry?.progress.evidence.listening).toMatchObject({ status: "correct", attempts: 1 });
      expect(await totalPoints()).toBe(5);
    });
  });

  describe("notifications and Season celebration", () => {
    it("sends one bell notification per badge", async () => {
      await completeDay(1);
      await completeDay(1);
      await completeDay(2);
      expect(await notifications("badge_earned")).toEqual([{ event_key: "badge:starter", context: "Khởi đầu" }]);
    });

    it("records a new Season once per level: one bell notification and one congratulation modal", async () => {
      await grantPoints(700);
      await awardBadges(SUMMER);
      await game(randomUUID(), 0);
      expect(await notifications("season_reached")).toEqual([{ event_key: "season:A2:2", context: "2:A2" }]);
      // The demo learner may first see a level announcement; close it to reach the Season one.
      let lifecycle = await repositories.learning.learnerLifecycle(learnerId, 700);
      if (lifecycle?.rewardAnnouncement.kind !== "season-up" && lifecycle?.rewardAnnouncement.announcementId) {
        await repositories.learning.acknowledgeRewardAnnouncement(learnerId, lifecycle.rewardAnnouncement.announcementId);
        lifecycle = await repositories.learning.learnerLifecycle(learnerId, 700);
      }
      expect(lifecycle?.rewardAnnouncement).toMatchObject({ kind: "season-up", seasonLevel: 2, level: "A2", announcementId: "season-up:A2:2", seasonName: "Mùa hạ · A2", points: 700, nextPoints: 2000 });
      await expect(repositories.learning.acknowledgeRewardAnnouncement(learnerId, "season-up:A2:2")).resolves.toBe(true);
      await expect(repositories.learning.acknowledgeRewardAnnouncement(learnerId, "season-up:A2:2")).resolves.toBe(false);
      expect((await repositories.learning.learnerLifecycle(learnerId, 700))?.rewardAnnouncement.kind).not.toBe("season-up");
      await game(randomUUID(), 0);
      expect(await notifications("season_reached")).toHaveLength(1);
    });

    it("celebrates only the highest Season when several are reached at once", async () => {
      await grantPoints(2100);
      await awardBadges([...SUMMER, ...AUTUMN]);
      await game(randomUUID(), 0);
      expect(await notifications("season_reached")).toEqual([{ event_key: "season:A2:3", context: "3:A2" }]);
      const pending = await pool.query<{ cefr: string; season_level: number }>(
        "select cefr, season_level from learner_season_milestones where learner_id = $1 and celebrated_at is null", [learnerId]
      );
      expect(pending.rows).toEqual([{ cefr: "A2", season_level: 3 }]);
    });
  });

  describe("badge certificate", () => {
    it("is offered only when the learner can open it, and names the actual Season and level", async () => {
      await grantPoints(700);
      await awardBadges(SUMMER);
      expect((await repositories.learning.getProgressDashboard(learnerId))?.badgeCertificateAvailable).toBe(false);
      await expect(repositories.engagement.reward(learnerId, "done")).resolves.toBeNull();
      const preview = await repositories.engagement.reward(learnerId, "preview");
      expect(preview?.season).toEqual({ name: "Mùa hạ", description: "đón nắng", cefr: "A2" });
      expect(preview?.displayPoints).toBe(700);

      const finalAttempt = randomUUID();
      await pool.query("update enrollments set cefr = 'C1' where learner_id = $1", [learnerId]);
      await pool.query("insert into assessment_attempts (id, assessment_version_id, learner_id, status) values ($1, $2, $3, 'approved')", [finalAttempt, finalVersionId, learnerId]);
      try {
        expect((await repositories.learning.getProgressDashboard(learnerId))?.badgeCertificateAvailable).toBe(true);
        // A new level restarts the ladder: the C1 certificate names the C1 Season.
        await expect(repositories.engagement.reward(learnerId, "done")).resolves.toMatchObject({ printable: true, season: { name: "Mùa xuân", cefr: "C1" } });
      } finally {
        await pool.query("delete from assessment_attempts where id = $1", [finalAttempt]);
        await pool.query("update enrollments set cefr = 'A2' where learner_id = $1", [learnerId]);
      }
    });
  });

  describe("badge definitions", () => {
    it("exist for every organisation, including one created later", async () => {
      const organizationId = randomUUID();
      await pool.query("insert into organizations (id, name, slug) values ($1, 'Another org', $2)", [organizationId, `org-${organizationId}`]);
      const { rows } = await pool.query<{ badge_key: string; label: string; season_level: number }>(
        "select badge_key, label, (rule->>'seasonLevel')::int as season_level from badges where organization_id = $1 order by badge_key", [organizationId]
      );
      expect(rows).toEqual([
        { badge_key: "coach_friend", label: "Bạn của Season", season_level: 3 },
        { badge_key: "first_try", label: "Chuẩn ngay lần đầu", season_level: 4 },
        { badge_key: "friday", label: "Ôn tập đúng hẹn", season_level: 3 },
        { badge_key: "monthly_final_score", label: "Điểm thi tháng", season_level: 4 },
        { badge_key: "starter", label: "Khởi đầu", season_level: 2 },
        { badge_key: "streak", label: "Chuỗi ngày học", season_level: 2 },
        { badge_key: "week_complete", label: "Tuần trọn vẹn", season_level: 3 },
        { badge_key: "wordsmith", label: "Thợ chữ", season_level: 4 }
      ]);
      const demo = await pool.query<{ id: string }>("select id from badges where organization_id = $1 and badge_key = 'starter'", [DEMO_IDS.organization]);
      expect(demo.rows[0]?.id).toBe(DEMO_IDS.badge);
    });
  });

  describe("double-pay recompute", () => {
    it("reports duplicates in a dry run and removes only the later payments with apply", async () => {
      const gameResult = await game(randomUUID());
      // A historical race: the same game result recorded and paid twice, and a part paid twice.
      const twin = randomUUID();
      await pool.query(`insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence, occurred_at)
        values ($1, $2, 'game', 'game_result', $3, 5, '{}'::jsonb, now() + interval '1 minute')`, [twin, learnerId, gameResult.id]);
      await pool.query("insert into reward_events (id, learner_id, badge_id, points, source_type, source_id) values (gen_random_uuid(), $1, null, 5, 'activity_points', $2)", [learnerId, twin]);
      const lessonId = DEMO_IDS.lessons[2];
      for (const attemptNumber of [1, 2]) {
        const attemptId = randomUUID();
        await pool.query(`insert into lesson_part_attempts (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, score, created_at)
          values ($1, $2, $3, 'reading', $4, $5, 'correct', 100, now() + make_interval(mins => $5))`, [attemptId, learnerId, lessonId, randomUUID(), attemptNumber]);
        await pool.query("insert into reward_events (id, learner_id, badge_id, points, source_type, source_id) values (gen_random_uuid(), $1, null, $3, 'lesson_part', $2)", [learnerId, attemptId, 6 - attemptNumber]);
      }
      expect(await totalPoints()).toBe(5 + 5 + 5 + 4);

      const dryRun = await recomputeDoublePaidRewards(pool, { learnerId });
      expect(dryRun).toMatchObject({ applied: false, points: 9, learners: [{ learnerId, rewards: 2, points: 9 }] });
      expect(await totalPoints()).toBe(19);

      const applied = await recomputeDoublePaidRewards(pool, { learnerId, apply: true });
      expect(applied).toMatchObject({ applied: true, points: 9 });
      expect(await totalPoints()).toBe(10);
      expect((await recomputeDoublePaidRewards(pool, { learnerId })).rewards).toEqual([]);
    });
  });

  describe("Seasons per CEFR level", () => {
    const b1FrameworkId = randomUUID();
    const b1Days = [
      ["2026-11-02", "new"], ["2026-11-03", "new"], ["2026-11-04", "new"], ["2026-11-05", "new"], ["2026-11-06", "review"],
      ["2026-11-09", "new"], ["2026-11-10", "new"], ["2026-11-11", "new"], ["2026-11-12", "new"], ["2026-11-13", "review"],
      ["2026-11-16", "new"], ["2026-11-17", "new"], ["2026-11-18", "new"], ["2026-11-19", "new"], ["2026-11-20", "review"]
    ].map(([date, kind], index) => ({ lessonNumber: index + 1, date: date!, kind: kind!, lessonId: randomUUID() }));

    beforeAll(async () => {
      await pool.query(`insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash, published_at, published_on)
        values ($1, $2, 'B1', 'approved', $3, 'scope', now(), '2026-11-02')`,
        [b1FrameworkId, monthId, JSON.stringify({ month, daySpecs: b1Days.map(({ lessonNumber, date, kind }) => ({ lessonNumber, date, kind })), coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] })]);
      const setId = randomUUID();
      await pool.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'B1')", [setId, b1FrameworkId]);
      for (const day of b1Days) {
        const versionId = randomUUID();
        await pool.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day.lessonNumber]);
        await pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [day.lessonId, versionId, day.lessonNumber]);
        await pool.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', 'approved')",
          [randomUUID(), b1FrameworkId, day.lessonNumber, day.date, day.lessonId]);
      }
    });

    /** Changes the learner's level (any path writes the enrollment); optionally backdates the new level's start. */
    async function setLevel(cefr: string, startedAt?: string) {
      await pool.query("update enrollments set cefr = $2 where learner_id = $1", [learnerId, cefr]);
      if (startedAt) {
        await pool.query("update enrollments set cefr_started_on = ($2::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date where learner_id = $1", [learnerId, startedAt]);
        await pool.query(
          `update learner_level_periods set started_at = $2 where id = (
             select id from learner_level_periods where learner_id = $1 order by started_at desc, seq desc limit 1)`,
          [learnerId, startedAt]
        );
      }
    }

    /** B1 calendar days completed on their own date. */
    async function completeB1(dates: string[]) {
      for (const date of dates) {
        const day = b1Days.find((item) => item.date === date)!;
        await pool.query(
          `insert into progress_records (id, learner_id, lesson_id, status, evidence, completed_at, completed_on)
           values (gen_random_uuid(), $1, $2, 'completed', '{}'::jsonb, now(), $3)`,
          [learnerId, day.lessonId, date]
        );
      }
    }

    /** Valid Season turns; each turn uses one new word. */
    async function coachTurns(count: number) {
      const sessionId = randomUUID();
      await pool.query("insert into coach_sessions (id, learner_id, scenario) values ($1, $2, '{\"kind\":\"practice\"}'::jsonb)", [sessionId, learnerId]);
      await pool.query(
        `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback)
         select gen_random_uuid(), $1, n, 'learner', '{}'::jsonb, jsonb_build_object('relevant', true, 'usedWords', jsonb_build_array('word' || n))
         from generate_series(1, $2::int) n`,
        [sessionId, count]
      );
    }

    async function sync() { await game(randomUUID(), 0); }

    async function roadmap(key: string) {
      return (await repositories.learning.getProgressDashboard(learnerId))?.badgeRoadmap.find((badge) => badge.key === key);
    }

    it("climbs with the points earned in the current level and restarts at Mùa xuân on a level change; badges are kept", async () => {
      await grantPoints(600);
      await awardBadges(SUMMER);
      await sync();
      let progress = await repositories.learning.getProgressDashboard(learnerId);
      expect(progress).toMatchObject({ points: 600, season: { current: { level: 2 }, next: { level: 3, pointsRequired: 2000 }, cefr: "A2", pointsInLevel: 600 } });

      await setLevel("B1");
      progress = await repositories.learning.getProgressDashboard(learnerId);
      expect(progress).toMatchObject({ points: 600, season: { current: { level: 1 }, next: { level: 2, pointsRequired: 500 }, cefr: "B1", pointsInLevel: 0, earnedBadgeCount: 2, requiredBadgeCount: 2 } });
      expect(progress?.badges.map((badge) => badge.key).sort()).toEqual(["starter", "streak"]);
      expect(progress?.badgeRoadmap.find((badge) => badge.key === "streak")).toMatchObject({ earned: true, earnedLevel: "A2" });

      await grantPoints(500);
      await sync();
      progress = await repositories.learning.getProgressDashboard(learnerId);
      expect(progress).toMatchObject({ points: 1100, season: { current: { level: 2 }, cefr: "B1", pointsInLevel: 500 } });
      expect(await notifications("season_reached")).toEqual([
        { event_key: "season:A2:2", context: "2:A2" },
        { event_key: "season:B1:2", context: "2:B1" }
      ]);
      const manager = (await repositories.manager.progress(DEMO_IDS.manager))?.learners.find((learner) => learner.learnerId === learnerId);
      expect(manager).toMatchObject({ rewardPoints: 1100, rewardPointsInLevel: 500, rewardSeasonLevel: 2 });

      // Lowering the level restarts the ladder as well.
      await setLevel("A2");
      progress = await repositories.learning.getProgressDashboard(learnerId);
      expect(progress?.season).toMatchObject({ current: { level: 1 }, cefr: "A2", pointsInLevel: 0 });
    });

    it("celebrates each (level, Season) once and never a Season of another level", async () => {
      await grantPoints(600);
      await awardBadges(SUMMER);
      await sync();
      await repositories.learning.acknowledgeRewardAnnouncement(learnerId, "season-up:A2:2");
      await setLevel("B1");
      await grantPoints(500);
      await sync();
      let lifecycle = await repositories.learning.learnerLifecycle(learnerId, 1100);
      if (lifecycle?.rewardAnnouncement.kind !== "season-up" && lifecycle?.rewardAnnouncement.announcementId) {
        await repositories.learning.acknowledgeRewardAnnouncement(learnerId, lifecycle.rewardAnnouncement.announcementId);
        lifecycle = await repositories.learning.learnerLifecycle(learnerId, 1100);
      }
      expect(lifecycle?.rewardAnnouncement).toMatchObject({ kind: "season-up", announcementId: "season-up:B1:2", seasonName: "Mùa hạ · B1", level: "B1", points: 500 });
      await repositories.learning.acknowledgeRewardAnnouncement(learnerId, "season-up:B1:2");
      await sync();
      expect((await repositories.learning.learnerLifecycle(learnerId, 1100))?.rewardAnnouncement.kind).not.toBe("season-up");
      const milestones = await pool.query<{ cefr: string; season_level: number; celebrated: boolean }>(
        "select cefr, season_level, celebrated_at is not null as celebrated from learner_season_milestones where learner_id = $1 order by cefr, season_level", [learnerId]
      );
      expect(milestones.rows).toEqual([{ cefr: "A2", season_level: 2, celebrated: true }, { cefr: "B1", season_level: 2, celebrated: true }]);
    });

    it("uses the current level's threshold for a badge not earned yet and keeps earned badges after a level-up", async () => {
      await coachTurns(25);
      await sync();
      // A2: 25 words ≥ 20 (Thợ chữ) but 25 turns < 30 (Bạn của Season).
      expect(await earnedBadgeKeys()).toEqual(["wordsmith"]);
      expect(await roadmap("coach_friend")).toMatchObject({ earned: false, threshold: 30, description: "30 lượt luyện với Season" });

      await setLevel("A1");
      await sync();
      expect(await earnedBadgeKeys()).toEqual(["coach_friend", "wordsmith"]);
      expect(await roadmap("coach_friend")).toMatchObject({ earned: true, earnedLevel: "A1", description: "20 lượt luyện với Season" });

      await setLevel("B1");
      await sync();
      expect(await earnedBadgeKeys()).toEqual(["coach_friend", "wordsmith"]);
      expect(await roadmap("wordsmith")).toMatchObject({ earned: true, earnedLevel: "A2" });
      expect(await roadmap("first_try")).toMatchObject({ earned: false, threshold: 3 });
      expect(await notifications("badge_earned")).toEqual([
        { event_key: "badge:coach_friend", context: "Bạn của Season" },
        { event_key: "badge:wordsmith", context: "Thợ chữ" }
      ]);
    });

    it("awards 'Điểm thi tháng' with the level's score: 72 is not enough at A2 (75) but passes at A1", async () => {
      const attemptId = randomUUID();
      await pool.query("insert into assessment_attempts (id, assessment_version_id, learner_id, status) values ($1, $2, $3, 'approved')", [attemptId, finalVersionId, learnerId]);
      for (const section of ["listening", "reading", "writing", "speaking"]) {
        await pool.query("insert into assessment_scores (id, attempt_id, section, score, source) values (gen_random_uuid(), $1, $2, 18, 'human')", [attemptId, section]);
      }
      await sync();
      expect(await earnedBadgeKeys()).not.toContain("monthly_final_score");
      expect(await roadmap("monthly_final_score")).toMatchObject({ threshold: 75, description: "Thi tháng đạt từ 75 điểm" });
      await setLevel("A1");
      await sync();
      expect(await earnedBadgeKeys()).toContain("monthly_final_score");
      expect(await roadmap("monthly_final_score")).toMatchObject({ earned: true, earnedLevel: "A1", description: "Đạt một bài thi tháng" });
    });

    it("counts a learning day only when that day's scheduled lesson is done on its day; holidays and weekends are skipped", async () => {
      await setLevel("B1", "2026-11-01T00:00:00+07:00");
      await systemDate("2026-11-30");
      // Games alone never make a learning day.
      await game(randomUUID(), 0);
      await completeB1(["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13"]);
      await sync();
      // Wed 11/11 was scheduled and missed: the longest run is 3 (06, 09, 10) < 5.
      expect(await earnedBadgeKeys()).not.toContain("streak");
      await pool.query("insert into organization_holidays (organization_id, holiday_date) values ($1, '2026-11-11')", [DEMO_IDS.organization]);
      await sync();
      // With 11/11 a holiday: 06 (Fri) → weekend → 09, 10, 12, 13 = 5 days at B1.
      expect(await earnedBadgeKeys()).toContain("streak");
      expect(await roadmap("streak")).toMatchObject({ earned: true, earnedLevel: "B1" });
    });

    it("counts whole weeks and on-time reviews of the current level (B1: 2 weeks, 3 reviews)", async () => {
      await setLevel("B1", "2026-11-01T00:00:00+07:00");
      await systemDate("2026-11-30");
      await completeB1(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-13"]);
      await sync();
      expect(await earnedBadgeKeys()).not.toContain("week_complete");
      expect(await earnedBadgeKeys()).not.toContain("friday");
      await completeB1(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
      await sync();
      expect(await earnedBadgeKeys()).toEqual(expect.arrayContaining(["friday", "week_complete"]));
    });

    it("does not hand out a lower threshold on arrival: days of the previous level do not count toward the new one", async () => {
      for (const day of calendarDays) await completeDay(day.lessonNumber);
      // Seven on-time days at A2 (needs 10).
      expect(await earnedBadgeKeys()).not.toContain("streak");
      await setLevel("B1", "2026-11-12T00:00:00+07:00");
      await sync();
      expect(await earnedBadgeKeys()).not.toContain("streak");
      expect(await roadmap("streak")).toMatchObject({ earned: false, threshold: 5 });
    });
  });
});
