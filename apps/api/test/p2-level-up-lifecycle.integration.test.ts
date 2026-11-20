import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, levelUpDefinition, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
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
      // The demo seed no longer publishes a level-up form: publish the B1 fixture form here.
      await client.query(
        `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
         values ($1, $2, 'level-up-b1-p2-test', 'level_up', 'Đề lên B1 (kiểm thử)')`,
        [DEMO_IDS.levelUpDefinition, DEMO_IDS.organization]
      );
      await client.query(
        `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
         values ($1, $2, 1, 'published', $3::jsonb, now())`,
        [DEMO_IDS.levelUpVersion, DEMO_IDS.levelUpDefinition, JSON.stringify(levelUpDefinition)]
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

  // Level-up readiness is computed from six counted monthly cycles; these cases need a ready
  // learner, so they use the staff exception ("Thi lên mức") that makes the next level available now.
  const setLevelUpOverride = async (allowed: boolean) => {
    const response = await app.inject({
      method: "PUT", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/level-up-override`,
      headers: { cookie: operatorCookie }, payload: allowed ? { allowed, reason: "Kiểm thử vòng đời lên mức" } : { allowed }
    });
    expect(response.statusCode, response.body).toBe(200);
  };

  it("enforces readiness and selects the published form for the exact next CEFR", async () => {
    await pool.query(
      `delete from assessment_attempts aa using assessment_versions av, assessment_definitions ad
       where aa.assessment_version_id = av.id and av.definition_id = ad.id
         and ad.kind = 'level_up' and aa.learner_id = $1`,
      [DEMO_IDS.learner]
    );
    const notReady = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(notReady.statusCode, notReady.body).toBe(409);
    expect(notReady.json()).toEqual({ code: "LEVEL_UP_NOT_READY" });
    await setLevelUpOverride(true);

    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    // The A2 learner gets the B1 form (never the published B2 fixture); the key names the target level.
    expect(started.json()).toMatchObject({ definition: { kind: "level-up", key: "levelup-b1" } });

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    // A second start resumes the in-progress attempt instead of opening another one.
    expect(duplicate.statusCode, duplicate.body).toBe(201);
    expect(duplicate.json().attempt.id).toBe(started.json().attempt.id);

    await pool.query("delete from assessment_attempts where id = $1", [started.json().attempt.id]);
    await setLevelUpOverride(false);
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
    await setLevelUpOverride(true);
    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/level-up/start",
      headers: { cookie: learnerCookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;

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
        requestId: randomUUID(), message: `Challenge answer ${index + 1}`,
        taskId: prompt.rows[0]!.task_id, promptVersionId: prompt.rows[0]!.id,
        output: {
          evaluation: { status: offTopic ? "off_topic" : "valid", result: offTopic ? "off_topic" : "correct", countsTowardGoal: !offTopic, noteVi: offTopic ? "Lạc đề." : "Đúng trọng tâm." },
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

  it("applies an approved level in the decision transaction", async () => {
    const passedAttemptId = randomUUID();
    const challengeSessionId = randomUUID();
    const definitionId = randomUUID();
    const versionId = randomUUID();
    await pool.query(
      `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
       values ($1, $2, 'level-up-b1-immediate-fixture', 'level_up', 'B1')`, [definitionId, DEMO_IDS.organization]
    );
    await pool.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint)
       values ($1, $2, 1, 'published', '{"targetLevel":"B1"}')`, [versionId, definitionId]
    );
    await pool.query("update enrollments set cefr = 'A2' where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `insert into assessment_attempts (id, assessment_version_id, learner_id, status, submitted_at)
       values ($1, $2, $3, 'pending_review', now())`,
      [passedAttemptId, versionId, DEMO_IDS.learner]
    );
    await pool.query(
      "insert into coach_sessions (id, learner_id, scenario, status, completed_at) values ($1, $2, '{}', 'completed', now())",
      [challengeSessionId, DEMO_IDS.learner]
    );
    await pool.query(
      `insert into level_up_challenge_results (id, assessment_attempt_id, session_id, learner_id, completed_turns, average, off_topic, passed)
       values (gen_random_uuid(), $1, $2, $3, 6, 4, 1, true)`,
      [passedAttemptId, challengeSessionId, DEMO_IDS.learner]
    );
    const requestedAt = Date.now();
    const approved = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/${passedAttemptId}/decision`,
      headers: { cookie: operatorCookie },
      payload: { status: "approved", approvedLevel: "B1", reason: "Đủ điểm thi và đạt thử thách 6 lượt." }
    });
    expect(approved.statusCode, approved.body).toBe(200);

    const enrollment = await pool.query<{ cefr: string }>("select cefr from enrollments where learner_id = $1", [DEMO_IDS.learner]);
    expect(enrollment.rows[0]?.cefr).toBe("B1");
    const applied = await pool.query<{
      from_cefr: string; to_cefr: string; effective_at: Date; applied_at: Date; status: string;
      approved_by: string; reason: string; evidence: Record<string, unknown>;
    }>("select from_cefr, to_cefr, effective_at, applied_at, status, approved_by, reason, evidence from scheduled_level_changes where assessment_attempt_id = $1", [passedAttemptId]);
    expect(applied.rows[0]).toMatchObject({
      from_cefr: "A2", to_cefr: "B1", status: "applied", approved_by: DEMO_IDS.operator,
      reason: "Đủ điểm thi và đạt thử thách 6 lượt.",
      evidence: { challenge: { completedTurns: 6, passed: true } }
    });
    expect(applied.rows[0]?.effective_at.getTime()).toBeGreaterThanOrEqual(requestedAt);
    expect(applied.rows[0]?.applied_at).toEqual(applied.rows[0]?.effective_at);
    const progress = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie: learnerCookie } });
    expect(progress.statusCode, progress.body).toBe(200);
    expect(progress.json()).toMatchObject({ learner: { cefr: "B1" } });
  });

  it("persists a 14-day retry with weak-skill evidence when the exam fails", async () => {
    // The challenge case leaves its A2 attempt pending with a suggested level request, which would block a new start.
    const undecided = `select aa.id from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'level_up'
       where aa.learner_id = $1 and aa.status in ('in_progress', 'submitted', 'pending_review')`;
    await pool.query(`delete from assessment_decisions where attempt_id in (${undecided})`, [DEMO_IDS.learner]);
    await pool.query(`delete from assessment_attempts where id in (${undecided})`, [DEMO_IDS.learner]);
    await setLevelUpOverride(true);
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
    // The certificate opens at C1 once a monthly final has been approved.
    const finalDefinitionId = randomUUID();
    const finalVersionId = randomUUID();
    await pool.query("update enrollments set cefr = 'C1' where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
       values ($1, $2, 'monthly-final-certificate-fixture-c1', 'final', 'Fixture C1')`, [finalDefinitionId, DEMO_IDS.organization]
    );
    await pool.query("insert into assessment_versions (id, definition_id, version, status, blueprint) values ($1, $2, 1, 'published', '{}')", [finalVersionId, finalDefinitionId]);
    await pool.query(
      "insert into assessment_attempts (id, assessment_version_id, learner_id, status, submitted_at) values ($1, $2, $3, 'approved', now())",
      [randomUUID(), finalVersionId, DEMO_IDS.learner]
    );
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
  it("resets a returning A1 learner's road to A2 and describes the downgrade neutrally", async () => {
    const previousMonth = await pool.query<{ month: string; exam_date: string }>(
      `select to_char(date_trunc('month', organization_system_date($1)) - interval '1 day', 'YYYY-MM') as month,
              to_char(date_trunc('month', organization_system_date($1)) - interval '1 day', 'YYYY-MM-DD') as exam_date`,
      [DEMO_IDS.organization]
    );
    const past = previousMonth.rows[0]!;
    const definitionId = randomUUID();
    const versionId = randomUUID();
    const attemptId = randomUUID();
    await pool.query("update enrollments set cefr = 'A1', enrolled_at = now() - interval '1 year' where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status)
       values (gen_random_uuid(), $1, $2, $3::date, 1, 'approved')`,
      [DEMO_IDS.organization, past.month, past.exam_date]
    );
    await pool.query(
      `insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status)
       select gen_random_uuid(), $1, to_char(system_date, 'YYYY-MM'),
              (date_trunc('month', system_date) + interval '1 month - 1 day')::date, 1, 'approved'
       from organization_system_date($1) system_date`, [DEMO_IDS.organization]
    );
    await pool.query(
      `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
       values ($1, $2, $3, 'final', 'Fixture A1')`, [definitionId, DEMO_IDS.organization, `monthly-final-${past.month}-a1`]
    );
    await pool.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint)
       values ($1, $2, 1, 'published', '{}')`, [versionId, definitionId]
    );
    await pool.query(
      `insert into assessment_attempts (id, assessment_version_id, learner_id, status, started_at, submitted_at)
       values ($1, $2, $3, 'approved', $4::date + interval '8 hours', $4::date + interval '9 hours')`,
      [attemptId, versionId, DEMO_IDS.learner, past.exam_date]
    );
    await pool.query(
      `insert into assessment_scores (id, attempt_id, section, score, source)
       select gen_random_uuid(), $1, section, 20, 'human' from unnest(array['listening', 'reading', 'writing', 'speaking']) section`, [attemptId]
    );
    await pool.query(
      `insert into learner_complaints (organization_id, learner_id, kind, reason, status, submitted_at, due_at)
       values ($1, $2, 'exam_eligibility', 'Đủ điều kiện dự thi', 'approved', $3::date + interval '1 hour', $3::date + interval '2 hours')`,
      [DEMO_IDS.organization, DEMO_IDS.learner, past.exam_date]
    );
    const home = () => app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie: learnerCookie } });
    const changeLevel = (targetLevel: "A1" | "A2") => app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/level`,
      headers: { cookie: operatorCookie },
      payload: { mode: "direct", targetLevel, reason: "Điều chỉnh trình độ kiểm thử", evidence: "Kết quả học và bài thi đã kiểm tra" }
    });
    const before = await home();
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json().levelReadiness).toMatchObject({ targetLevel: "A2", monthlyPolicy: { eligibleMonths: 1, finalPasses: 1 } });
    const up = await changeLevel("A2");
    expect(up.statusCode, up.body).toBe(200);
    const down = await changeLevel("A1");
    expect(down.statusCode, down.body).toBe(200);
    const after = await home();
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json()).toMatchObject({
      learner: { cefr: "A1" },
      levelReadiness: { targetLevel: "A2", monthlyPolicy: { eligibleMonths: 0, finalPasses: 0, seasonMonths: 0 } },
      rewardAnnouncement: { kind: "level-adjustment", level: "A1" }
    });
  });

});
