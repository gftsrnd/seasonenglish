import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const violationLearnerId = "00000000-0000-4000-8000-000000000141";
const timeoutLearnerId = "00000000-0000-4000-8000-000000000142";

describe("assessment score persistence", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let violationCookie = "";
  let timeoutCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email) values
          ($1, $3, 'learner', 'Nguyễn Kiểm Tra Vi Phạm', 'score-violation@e4s.local'),
          ($2, $3, 'learner', 'Trần Kiểm Tra Hết Giờ', 'score-timeout@e4s.local')`,
        [violationLearnerId, timeoutLearnerId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $3), ($2, $4)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash`,
        [violationLearnerId, timeoutLearnerId, await createPinHash("141141"), await createPinHash("142142")]
      );
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash`,
        [DEMO_IDS.operator, await createCredentialHash("operator-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const loginLearner = async (email: string, pin: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    violationCookie = await loginLearner("score-violation@e4s.local", "141141");
    timeoutCookie = await loginLearner("score-timeout@e4s.local", "142142");
    const operator = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(operator.statusCode, operator.body).toBe(200);
    operatorCookie = String(operator.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  async function startWithCorrectListening(cookie: string): Promise<string> {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    const correct = await pool.query<{ task_key: string; correct_answer: string }>(
      `select task->>'key' as task_key, task->>'correctAnswer' as correct_answer
       from assessment_attempts aa join assessment_versions av on av.id = aa.assessment_version_id
       cross join lateral jsonb_array_elements(av.blueprint->'sections') section
       cross join lateral jsonb_array_elements(section->'groups') group_row
       cross join lateral jsonb_array_elements(group_row->'tasks') task
       where aa.id = $1 and section->>'code' = 'listening' and task ? 'correctAnswer' limit 1`,
      [attemptId]
    );
    const saved = await app.inject({
      method: "PUT", url: `/api/v1/assessment-attempts/${attemptId}/responses/listening/${correct.rows[0]!.task_key}`,
      headers: { cookie }, payload: { value: correct.rows[0]!.correct_answer, evidenceType: "choice" }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    return attemptId;
  }

  async function expectObjectiveScores(attemptId: string): Promise<void> {
    const scores = await pool.query<{ section: string; score: string }>(
      `select section, score::text from assessment_scores
       where attempt_id = $1 and section in ('listening', 'reading') order by section`, [attemptId]
    );
    expect(scores.rows.map((row) => row.section)).toEqual(["listening", "reading"]);
    expect(Number(scores.rows.find((row) => row.section === "listening")?.score)).toBeGreaterThan(0);
  }

  it("persists deterministic scores when violations auto-submit the attempt", async () => {
    const attemptId = await startWithCorrectListening(violationCookie);
    await pool.query("update assessment_attempts set violation_limit = 1 where id = $1", [attemptId]);
    const sendViolation = (requestId: string) => app.inject({
      method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/violations`, headers: { cookie: violationCookie },
      payload: { requestId, reason: "visibility_hidden", occurredAt: new Date().toISOString() }
    });
    const warning = await sendViolation("score-warning");
    expect(warning.statusCode, warning.body).toBe(200);
    const response = await sendViolation("score-auto-submit");
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: "pending_review", autoSubmitted: true });
    await expectObjectiveScores(attemptId);
  });

  it("persists timeout scores and repairs legacy missing objective scores without AI", async () => {
    const attemptId = await startWithCorrectListening(timeoutCookie);
    const expiredAt = new Date(Date.now() - 1_000).toISOString();
    await pool.query(
      `update assessment_attempts set current_section = 'speaking',
         timing_state = jsonb_build_object('sections', jsonb_build_object('speaking', jsonb_build_object('startedAt', $2::text, 'endsAt', $2::text)))
       where id = $1`, [attemptId, expiredAt]
    );
    const response = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/submit`, headers: { cookie: timeoutCookie }, payload: {} });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ screenState: "pending", attempt: { runtime: { submitReason: "timeout" } } });
    await expectObjectiveScores(attemptId);

    await pool.query(`delete from assessment_scores where attempt_id = $1 and section in ('listening', 'reading')`, [attemptId]);
    const repaired = await app.inject({ method: "GET", url: `/api/v1/assessment-reviews/attempts/${attemptId}`, headers: { cookie: operatorCookie } });
    expect(repaired.statusCode, repaired.body).toBe(200);
    expect(repaired.json().scores).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "listening", source: "deterministic" }),
      expect.objectContaining({ section: "reading", source: "deterministic" })
    ]));
    await expectObjectiveScores(attemptId);
  });
});
