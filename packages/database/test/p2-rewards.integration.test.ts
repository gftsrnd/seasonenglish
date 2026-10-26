import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("P2 reward ledger", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
    } finally { client.release(); }
  }, 30_000);

  afterAll(async () => { await pool.end(); });

  it("awards weekly practice +15 and full-week +20 once, while level challenges award zero", async () => {
    await pool.query("delete from reward_events where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from activities where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("update programs set current_week_override = 1 where id = $1", [DEMO_IDS.program]);

    const requestId = randomUUID();
    const submitted = await repositories.engagement.submitWeeklyPractice({
      learnerId: DEMO_IDS.learner,
      requestId,
      text: "I introduce myself and explain my work to the project team every week."
    });
    expect(submitted?.submission?.id).toEqual(expect.any(String));
    await repositories.engagement.submitWeeklyPractice({
      learnerId: DEMO_IDS.learner,
      requestId,
      text: "A repeated request must not award points again."
    });

    const ledger = await pool.query<{ source_type: string; points: number; count: number }>(
      `select re.source_type, re.points, count(*)::int as count
       from reward_events re
       left join activities a on re.source_type = 'activity_points' and a.id = re.source_id
       where re.learner_id = $1
         and (re.source_type = 'full_week_bonus' or a.activity_type = 'weekly_practice')
       group by re.source_type, re.points order by re.source_type`,
      [DEMO_IDS.learner]
    );
    expect(ledger.rows).toEqual([
      { source_type: "activity_points", points: 15, count: 1 },
      { source_type: "full_week_bonus", points: 20, count: 1 }
    ]);

    const challengeSessionId = randomUUID();
    await pool.query(
      `insert into coach_sessions (id, learner_id, scenario, status)
       values ($1, $2, '{"kind":"level_up","targetLevel":"B1"}'::jsonb, 'active')`,
      [challengeSessionId, DEMO_IDS.learner]
    );
    const prompt = await pool.query<{ id: string; task_id: string }>(
      `select pv.id, task.id as task_id from prompt_versions pv
       join ai_tasks task on task.task_key = pv.task_key
       where pv.organization_id = $1 and pv.task_key = 'coach_dialogue' and pv.status = 'active'
       order by pv.version desc limit 1`,
      [DEMO_IDS.organization]
    );
    const saved = await repositories.coach.saveAiTurn({
      learnerId: DEMO_IDS.learner,
      sessionId: challengeSessionId,
      challengeAttemptId: DEMO_IDS.placementAttempt,
      requestId: randomUUID(),
      message: "I can present the project plan clearly.",
      taskId: prompt.rows[0]!.task_id,
      promptVersionId: prompt.rows[0]!.id,
      output: {
        evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Đúng trọng tâm." },
        seasonReply: "Good.", seasonReplyTranslation: "Tốt.",
        nextQuestion: "What is the main risk?", nextQuestionTranslation: "Rủi ro chính là gì?",
        rubric: {
          meaning: { score: 4, evidence: "Clear intent.", improvement: "Add evidence." },
          vocabulary: { score: 4, evidence: "Relevant words.", improvement: "Use one detail." },
          grammar: { score: 4, evidence: "Accurate sentence.", improvement: "Vary structure." }
        },
        corrections: [], correctedText: "", suggestedAnswer: { text: "The main risk is timing.", translation: "Rủi ro chính là tiến độ." },
        usedWords: ["project"]
      },
      metadata: {
        traceId: randomUUID(), provider: "fixture", model: "fixture-model", inputHash: "a".repeat(64),
        usage: {}, latencyMs: 1
      }
    });
    expect(saved).toBe(true);
    const challengePoints = await pool.query<{ points: number }>(
      `select coalesce(sum(re.points), 0)::int as points
       from reward_events re join activities a on a.id = re.source_id and re.source_type = 'activity_points'
       where re.learner_id = $1 and a.reference_type = 'coach_turn'
         and a.reference_id in (select id from coach_turns where session_id = $2)`,
      [DEMO_IDS.learner, challengeSessionId]
    );
    expect(challengePoints.rows[0]?.points).toBe(0);
  });

  it("keeps reward histories isolated by learner and removes the temporary account", async () => {
    const temporaryLearnerId = randomUUID();
    const temporaryRewardId = randomUUID();
    try {
      await pool.query(
        `insert into users (id, organization_id, display_name, email, role, status)
         values ($1, $2, 'P2 Temporary Learner', $3, 'learner', 'active')`,
        [temporaryLearnerId, DEMO_IDS.organization, `p2-${temporaryLearnerId}@example.test`]
      );
      await pool.query(
        `insert into reward_events (id, learner_id, points, source_type, source_id)
         values ($1, $2, 99, 'p2_test', $1)`,
        [temporaryRewardId, temporaryLearnerId]
      );
      await expect(repositories.engagement.getSummary(temporaryLearnerId)).resolves.toMatchObject({ points: 99 });
      await expect(repositories.engagement.getSummary(DEMO_IDS.learner)).resolves.not.toMatchObject({ points: 99 });
    } finally {
      await pool.query("delete from reward_events where learner_id = $1", [temporaryLearnerId]);
      await pool.query("delete from users where id = $1", [temporaryLearnerId]);
    }
    const account = await pool.query("select 1 from users where id = $1", [temporaryLearnerId]);
    expect(account.rowCount).toBe(0);
  });
});
