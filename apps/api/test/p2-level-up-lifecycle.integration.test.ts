import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { nextEffectiveMonday } from "@e4s/domain/progression";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("P2 level-up lifecycle", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let learnerCookie = "";
  let operatorCookie = "";
  let passedAttemptId = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
        [DEMO_IDS.learner, await createPinHash("123456"), DEMO_IDS.operator, await createCredentialHash("operator-pass")]
      );
      await client.query(
        `insert into organization_settings (organization_id, configuration)
         values ($1, '{"levelUp":{"days":14,"lessons":0,"firstTry":0,"submission":0,"coach":0,"coachTurns":0,"wrong":100,"minParts":0}}'::jsonb)
         on conflict (organization_id) do update
         set configuration = jsonb_set(organization_settings.configuration, '{levelUp}',
           '{"days":14,"lessons":0,"firstTry":0,"submission":0,"coach":0,"coachTurns":0,"wrong":100,"minParts":0}'::jsonb, true)`,
        [DEMO_IDS.organization]
      );
      const definitionId = randomUUID();
      const versionId = randomUUID();
      await client.query(
        `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
         values ($1, $2, 'level-up-b2-p2-test', 'level_up', 'Đề B2 không dành cho learner A2')`,
        [definitionId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
         select $1, $2, 99, 'published',
                jsonb_set(blueprint, '{targetLevel}', '"B2"'::jsonb, true), now()
         from assessment_versions where id = $3`,
        [versionId, definitionId, DEMO_IDS.levelUpVersion]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    expect(login.statusCode, login.body).toBe(200);
    learnerCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const operatorLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" }
    });
    expect(operatorLogin.statusCode, operatorLogin.body).toBe(200);
    operatorCookie = String(operatorLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("enforces readiness and selects the published form for the exact next CEFR", async () => {
    await pool.query(
      `delete from assessment_attempts aa using assessment_versions av, assessment_definitions ad
       where aa.assessment_version_id = av.id and av.definition_id = ad.id
         and ad.kind = 'level_up' and aa.learner_id = $1`,
      [DEMO_IDS.learner]
    );

    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    expect(started.json()).toMatchObject({ definition: { kind: "level-up", targetLevel: "B1" } });

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json()).toEqual({ code: "LEVEL_UP_ALREADY_ACTIVE" });

    await pool.query("delete from assessment_attempts where id = $1", [started.json().attempt.id]);
    await pool.query(
      `update organization_settings
       set configuration = jsonb_set(configuration, '{levelUp,coachTurns}', '99'::jsonb, true)
       where organization_id = $1`,
      [DEMO_IDS.organization]
    );
    const ineligible = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(ineligible.statusCode, ineligible.body).toBe(409);
    expect(ineligible.json()).toEqual({ code: "LEVEL_UP_NOT_READY" });

    await pool.query("update enrollments set cefr = 'C1' where learner_id = $1", [DEMO_IDS.learner]);
    const topLevel = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(topLevel.statusCode, topLevel.body).toBe(409);
    expect(topLevel.json()).toEqual({ code: "LEVEL_UP_TOP_LEVEL" });
  });

  it("opens one six-turn challenge only after the level-up exam passes and grants no reward", async () => {
    await pool.query("update enrollments set cefr = 'A2' where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `update organization_settings
       set configuration = jsonb_set(configuration, '{levelUp}',
         '{"days":14,"lessons":0,"firstTry":0,"submission":0,"coach":0,"coachTurns":0,"wrong":100,"minParts":0}'::jsonb, true)
       where organization_id = $1`,
      [DEMO_IDS.organization]
    );
    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    passedAttemptId = attemptId;

    const tooEarly = await app.inject({ method: "GET", url: "/api/v1/challenge", headers: { cookie: learnerCookie } });
    expect(tooEarly.statusCode).toBe(404);

    await pool.query("update assessment_attempts set status = 'pending_review', current_section = null, submitted_at = now() where id = $1", [attemptId]);
    for (const section of ["listening", "reading", "writing", "speaking"] as const) {
      await pool.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values ($1, $2, $3, 18, '{}'::jsonb, 'human')`,
        [randomUUID(), attemptId, section]
      );
    }

    const challenge = await app.inject({ method: "GET", url: "/api/v1/challenge", headers: { cookie: learnerCookie } });
    expect(challenge.statusCode, challenge.body).toBe(200);
    expect(challenge.json()).toMatchObject({
      assessmentAttemptId: attemptId,
      progress: { completedTurns: 0, requiredTurns: 6, complete: false }
    });
    const sessionId = challenge.json().sessionId as string;
    const prompt = await pool.query<{ id: string; task_id: string }>(
      `select pv.id, task.id as task_id from prompt_versions pv
       join ai_tasks task on task.task_key = pv.task_key
       where pv.organization_id = $1 and pv.task_key = 'coach_dialogue' and pv.status = 'active'
       order by pv.version desc limit 1`,
      [DEMO_IDS.organization]
    );
    for (let index = 0; index < 6; index += 1) {
      const offTopic = index === 2;
      await repositories.coach.saveAiTurn({
        learnerId: DEMO_IDS.learner, sessionId, challengeAttemptId: attemptId,
        requestId: `p2-challenge-${index}`, message: `Challenge answer ${index + 1}`,
        taskId: prompt.rows[0]!.task_id, promptVersionId: prompt.rows[0]!.id,
        output: {
          evaluation: { status: offTopic ? "off_topic" : "valid", countsTowardGoal: !offTopic, noteVi: offTopic ? "Lạc đề." : "Đúng trọng tâm." },
          seasonReply: "Thank you.", seasonReplyTranslation: "Cảm ơn.",
          nextQuestion: "What happened next?", nextQuestionTranslation: "Sau đó chuyện gì xảy ra?",
          rubric: {
            meaning: { score: 4, evidence: "Clear.", improvement: "Add detail." },
            vocabulary: { score: 4, evidence: "Relevant.", improvement: "Add detail." },
            grammar: { score: 4, evidence: "Accurate.", improvement: "Vary structure." }
          },
          corrections: [], correctedText: "", suggestedAnswer: { text: "", translation: "" }, usedWords: []
        },
        metadata: { traceId: randomUUID(), provider: "fixture", model: "fixture", inputHash: String(index).padStart(64, "0"), usage: {}, latencyMs: 1 }
      });
    }
    const completed = await app.inject({ method: "GET", url: "/api/v1/challenge", headers: { cookie: learnerCookie } });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({
      progress: { completedTurns: 6, requiredTurns: 6, average: 4, offTopic: 1, complete: true, passed: true },
      result: { assessmentAttemptId: attemptId, passed: true }
    });
    const challengeRewards = await pool.query<{ count: number }>(
      `select count(*)::int as count from reward_events re
       join activities a on a.id = re.source_id and re.source_type = 'activity_points'
       where a.reference_type = 'coach_turn'
         and a.reference_id in (select id from coach_turns where session_id = $1)`,
      [sessionId]
    );
    expect(challengeRewards.rows[0]?.count).toBe(0);
  });

  it("schedules an approved level for next Monday and applies it only when due", async () => {
    const expectedMonday = nextEffectiveMonday(new Date(), "Asia/Ho_Chi_Minh");
    const approved = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/${passedAttemptId}/decision`,
      headers: { cookie: operatorCookie },
      payload: { status: "approved", approvedLevel: "B1", reason: "Đủ điểm thi và đạt thử thách 6 lượt." }
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const beforeMonday = await pool.query<{ cefr: string }>("select cefr from enrollments where learner_id = $1", [DEMO_IDS.learner]);
    expect(beforeMonday.rows[0]?.cefr).toBe("A2");
    const scheduled = await pool.query<{
      from_cefr: string; to_cefr: string; effective_at: Date; status: string; approved_by: string; reason: string; evidence: Record<string, unknown>;
    }>("select from_cefr, to_cefr, effective_at, status, approved_by, reason, evidence from scheduled_level_changes where assessment_attempt_id = $1", [passedAttemptId]);
    expect(scheduled.rows[0]).toMatchObject({
      from_cefr: "A2", to_cefr: "B1", status: "scheduled", approved_by: DEMO_IDS.operator,
      reason: "Đủ điểm thi và đạt thử thách 6 lượt.",
      evidence: { challenge: { completedTurns: 6, passed: true } }
    });
    expect(scheduled.rows[0]?.effective_at.toISOString()).toBe(expectedMonday);

    const blockedWhileScheduled = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(blockedWhileScheduled.statusCode, blockedWhileScheduled.body).toBe(409);
    expect(blockedWhileScheduled.json()).toEqual({ code: "LEVEL_UP_ALREADY_ACTIVE" });

    await pool.query("update scheduled_level_changes set effective_at = now() - interval '1 minute' where assessment_attempt_id = $1", [passedAttemptId]);
    const progress = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie: learnerCookie } });
    expect(progress.statusCode, progress.body).toBe(200);
    const afterMonday = await pool.query<{ cefr: string }>("select cefr from enrollments where learner_id = $1", [DEMO_IDS.learner]);
    expect(afterMonday.rows[0]?.cefr).toBe("B1");
    const applied = await pool.query<{ status: string; applied_at: Date | null }>("select status, applied_at from scheduled_level_changes where assessment_attempt_id = $1", [passedAttemptId]);
    expect(applied.rows[0]?.status).toBe("applied");
    expect(applied.rows[0]?.applied_at).toBeInstanceOf(Date);
  });

  it("persists a 14-day retry with weak-skill evidence when the exam fails", async () => {
    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'pending_review', current_section = null, submitted_at = now() where id = $1", [attemptId]);
    const scores = { listening: 30, reading: 30, writing: 5, speaking: 5 } as const;
    for (const [section, score] of Object.entries(scores)) {
      await pool.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values ($1, $2, $3, $4, '{}'::jsonb, 'human')`,
        [randomUUID(), attemptId, section, score]
      );
    }
    const checkedAt = Date.now();
    const challenge = await app.inject({ method: "GET", url: "/api/v1/challenge", headers: { cookie: learnerCookie } });
    expect(challenge.statusCode).toBe(404);
    const retry = await pool.query<{ eligible_at: Date; weakest_skill: string; readiness_snapshot: Record<string, unknown> }>(
      "select eligible_at, weakest_skill, readiness_snapshot from level_up_retry_plans where assessment_attempt_id = $1",
      [attemptId]
    );
    expect(retry.rows[0]?.weakest_skill).toBe("writing");
    expect(retry.rows[0]?.readiness_snapshot).toMatchObject({ examScores: scores });
    expect(retry.rows[0]!.eligible_at.getTime()).toBeGreaterThanOrEqual(checkedAt + 14 * 24 * 60 * 60 * 1000 - 2_000);
    const blocked = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "LEVEL_UP_RETRY_NOT_READY", eligibleAt: expect.any(String) });
  });

  it("issues one immutable certificate snapshot", async () => {
    await pool.query(
      `insert into reward_events (id, learner_id, points, badge_id, source_type, source_id)
       select gen_random_uuid(), $1, 0, badge.id, 'p2_certificate_badge', badge.id
       from badges badge where badge.organization_id = $2
       on conflict do nothing`,
      [DEMO_IDS.learner, DEMO_IDS.organization]
    );
    const first = await app.inject({ method: "GET", url: "/api/v1/engagement/rewards/done", headers: { cookie: learnerCookie } });
    const second = await app.inject({ method: "GET", url: "/api/v1/engagement/rewards/done", headers: { cookie: learnerCookie } });
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json()).toMatchObject({
      certificateNumber: first.json().certificateNumber,
      completedAt: first.json().completedAt,
      learnerName: first.json().learnerName,
      cefr: first.json().cefr
    });
    const issuance = await pool.query<{
      count: number; certificate_code: string; level: string; learner_name: string;
      badges_snapshot: unknown[]; signatures_snapshot: Record<string, string>;
    }>(
      `select count(*) over ()::int as count, certificate_code, level, learner_name,
              badges_snapshot, signatures_snapshot
       from certificate_issuances where learner_id = $1 and program_id = $2`,
      [DEMO_IDS.learner, DEMO_IDS.program]
    );
    expect(issuance.rows[0]).toMatchObject({
      count: 1,
      certificate_code: first.json().certificateNumber,
      level: first.json().cefr,
      learner_name: first.json().learnerName,
      signatures_snapshot: { operatorName: expect.any(String), managerName: expect.any(String) }
    });
    expect(issuance.rows[0]?.badges_snapshot.length).toBeGreaterThan(0);
    await expect(pool.query(
      "update certificate_issuances set learner_name = 'Changed' where learner_id = $1 and program_id = $2",
      [DEMO_IDS.learner, DEMO_IDS.program]
    )).rejects.toThrow(/immutable/i);
  });

  it("queues AI-off weekly practice for manual review and preserves the human score", async () => {
    await pool.query("update enrollments set cefr = 'A2' where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("update programs set current_week_override = 1 where id = $1", [DEMO_IDS.program]);
    await pool.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
       select $1, pw.id, $2, 'weekly_vocabulary', 'published',
              '{"topic":"Work","words":[{"english":"meeting"},{"english":"schedule"},{"english":"project"}]}'::jsonb
       from program_weeks pw where pw.program_id = $3 and pw.week_number = 1`,
      [randomUUID(), DEMO_IDS.learner, DEMO_IDS.program]
    );
    const requirements = await repositories.engagement.weeklyPracticeRequirements(DEMO_IDS.learner);
    expect(requirements?.vocabulary.length).toBeGreaterThanOrEqual(3);
    const vocabulary = requirements!.vocabulary.slice(0, 3);
    const text = `I use ${vocabulary[0]} at work. I practise ${vocabulary[1]} with my team. I remember ${vocabulary[2]} every day.`;
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit",
      headers: { cookie: learnerCookie }, payload: { requestId: randomUUID(), text }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ state: "submitted", reviewState: "ungraded", submission: { status: "submitted" } });
    const submissionId = submitted.json().submission.id as string;

    const queue = await app.inject({ method: "GET", url: "/api/v1/content/review", headers: { cookie: operatorCookie } });
    expect(queue.statusCode, queue.body).toBe(200);
    expect(queue.json().submissions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: submissionId, aiGraded: false, total: null })
    ]));
    const graded = await app.inject({
      method: "POST", url: `/api/v1/content/review/submissions/${submissionId}/manual-grade`,
      headers: { cookie: operatorCookie },
      payload: { meaning: 4, vocabulary: 3, grammar: 2, feedback: "Đã chấm tay khi AI tắt." }
    });
    expect(graded.statusCode, graded.body).toBe(200);
    const stored = await pool.query<{ status: string; total: string; source: string }>(
      `select status, score->>'total' as total, feedback->>'source' as source
       from practice_submissions where id = $1`, [submissionId]
    );
    expect(stored.rows[0]).toEqual({ status: "reviewed", total: "62", source: "human" });
  });
});
