import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const c1LearnerId = "00000000-0000-4000-8000-000000000119";

describe("Pass Course Form A lifecycle", () => {
  const pool = new Pool({ connectionString: databaseUrl });
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
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, 'learner', 'C1 Pass learner', 'pass.c1@e4s.local')`,
        [c1LearnerId, DEMO_IDS.organization]
      );
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [c1LearnerId, await createPinHash("654321")]);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.operator, await createCredentialHash("operator-pass")]);
      await client.query(
        `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
         values ('00000000-0000-4000-8000-000000000120', $1, $2, 'C1', true)`,
        [DEMO_IDS.program, c1LearnerId]
      );
      await client.query(
        `insert into pass_course_readiness (learner_id, organization_id, cefr_ready)
         values ($1, $2, true)`,
        [c1LearnerId, DEMO_IDS.organization]
      );
    } finally { client.release(); }
    await app.ready();
    const learner = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "pass.c1@e4s.local", pin: "654321" } });
    learnerCookie = String(learner.headers["set-cookie"]).split(";")[0] ?? "";
    const operator = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    operatorCookie = String(operator.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("only exposes the fixed C1 Form A, then issues a persisted certificate and locks the account after operator approval at 85+", async () => {
    const definition = await app.inject({ method: "GET", url: "/api/v1/assessments/pass-course", headers: { cookie: learnerCookie } });
    expect(definition.statusCode, definition.body).toBe(200);
    expect(definition.json()).toMatchObject({ definition: { kind: "pass-course", title: "Pass Course – Form A", totalMinutes: 90, totalScore: 100 } });
    expect(definition.json().definition.sections).toHaveLength(4);

    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/pass-course/start", headers: { cookie: learnerCookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'pending_review', current_section = null, submitted_at = now() where id = $1", [attemptId]);
    for (const [section, score] of [["listening", 22], ["reading", 22], ["writing", 21], ["speaking", 20]]) {
      await pool.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values (gen_random_uuid(), $1, $2, $3, '{}'::jsonb, 'human')`,
        [attemptId, section, score]
      );
    }

    const approved = await app.inject({ method: "POST", url: `/api/v1/assessment-reviews/${attemptId}/decision`, headers: { cookie: operatorCookie }, payload: { status: "approved", reason: "Đủ điều kiện cấp chứng nhận Form A." } });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json()).toMatchObject({ status: "approved", approvedLevel: null });
    const persisted = await pool.query<{ status: string; certificate_number: string }>(
      `select learner.status, certificate.certificate_number
       from users learner join pass_course_certificates certificate on certificate.learner_id = learner.id
       where learner.id = $1`, [c1LearnerId]
    );
    expect(persisted.rows[0]).toMatchObject({ status: "disabled" });
    expect(persisted.rows[0]?.certificate_number).toMatch(/^E4S-C1-/);
  });

  it("refuses non-C1 or reset readiness, and enforces the 72-hour appeal deadline", async () => {
    const blocked = await app.inject({ method: "GET", url: "/api/v1/assessments/pass-course", headers: { cookie: learnerCookie } });
    expect(blocked.statusCode).toBe(401);

    // A fresh C1 account demonstrates the readiness and appeal gates without
    // relying on the disabled account created by the preceding approval.
    const id = "00000000-0000-4000-8000-000000000121";
    await pool.query(`insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'C1 Retry learner', 'pass.retry@e4s.local')`, [id, DEMO_IDS.organization]);
    await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [id, await createPinHash("654322")]);
    await pool.query(`insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ('00000000-0000-4000-8000-000000000122', $1, $2, 'C1', true)`, [DEMO_IDS.program, id]);
    const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "pass.retry@e4s.local", pin: "654322" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const notReady = await app.inject({ method: "GET", url: "/api/v1/assessments/pass-course", headers: { cookie } });
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json()).toEqual({ code: "PASS_COURSE_C1_NOT_READY" });

    await pool.query(`insert into pass_course_readiness (learner_id, organization_id, cefr_ready) values ($1, $2, true)`, [id, DEMO_IDS.organization]);
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/pass-course/start", headers: { cookie }, payload: {} });
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'needs_retry', submitted_at = now() - interval '73 hours' where id = $1", [attemptId]);
    const expired = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/appeals`, headers: { cookie }, payload: { reason: "Đề nghị kiểm tra lại điểm nói vì bản ghi đã được tải lên đầy đủ." } });
    expect(expired.statusCode).toBe(409);
    expect(expired.json()).toEqual({ code: "ASSESSMENT_APPEAL_NOT_AVAILABLE" });

    const appealLearnerId = "00000000-0000-4000-8000-000000000123";
    await pool.query(`insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'C1 Appeal learner', 'pass.appeal@e4s.local')`, [appealLearnerId, DEMO_IDS.organization]);
    await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [appealLearnerId, await createPinHash("654323")]);
    await pool.query(`insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ('00000000-0000-4000-8000-000000000124', $1, $2, 'C1', true)`, [DEMO_IDS.program, appealLearnerId]);
    await pool.query(`insert into pass_course_readiness (learner_id, organization_id, cefr_ready) values ($1, $2, true)`, [appealLearnerId, DEMO_IDS.organization]);
    const appealLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "pass.appeal@e4s.local", pin: "654323" } });
    const appealCookie = String(appealLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const active = await app.inject({ method: "POST", url: "/api/v1/assessments/pass-course/start", headers: { cookie: appealCookie }, payload: {} });
    const activeAttemptId = active.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'needs_retry', submitted_at = now() where id = $1", [activeAttemptId]);
    const appeal = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${activeAttemptId}/appeals`, headers: { cookie: appealCookie }, payload: { reason: "Đề nghị kiểm tra lại điểm nói vì bản ghi đã được tải lên đầy đủ." } });
    expect(appeal.statusCode, appeal.body).toBe(201);
    const resolved = await app.inject({ method: "POST", url: `/api/v1/assessment-appeals/${appeal.json().id}/decision`, headers: { cookie: operatorCookie }, payload: { status: "rejected", resolution: "Đã đối chiếu bản ghi và giữ nguyên kết quả." } });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json()).toMatchObject({ status: "rejected" });
  });

  it("does not issue a Pass Course certificate until all four skills have persisted scores", async () => {
    const id = "00000000-0000-4000-8000-000000000125";
    await pool.query(`insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Incomplete score learner', 'pass.incomplete@e4s.local')`, [id, DEMO_IDS.organization]);
    await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [id, await createPinHash("654324")]);
    await pool.query(`insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ('00000000-0000-4000-8000-000000000126', $1, $2, 'C1', true)`, [DEMO_IDS.program, id]);
    await pool.query(`insert into pass_course_readiness (learner_id, organization_id, cefr_ready) values ($1, $2, true)`, [id, DEMO_IDS.organization]);
    const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "pass.incomplete@e4s.local", pin: "654324" } });
    const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/pass-course/start", headers: { cookie }, payload: {} });
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'pending_review', current_section = null, submitted_at = now() where id = $1", [attemptId]);
    for (const [section, score] of [["listening", 25], ["reading", 25], ["writing", 25]]) {
      await pool.query(`insert into assessment_scores (id, attempt_id, section, score, criteria, source) values (gen_random_uuid(), $1, $2, $3, '{}'::jsonb, 'human')`, [attemptId, section, score]);
    }
    const decision = await app.inject({ method: "POST", url: `/api/v1/assessment-reviews/${attemptId}/decision`, headers: { cookie: operatorCookie }, payload: { status: "approved", reason: "Thiếu điểm nói." } });
    expect(decision.statusCode).toBe(409);
    const certificate = await pool.query("select 1 from pass_course_certificates where learner_id = $1", [id]);
    expect(certificate.rowCount).toBe(0);
  });
});
