import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo, DEMO_IDS } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const runtimeLearnerId = "00000000-0000-4000-8000-000000000119";

describe("assessment runtime API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let runtimeCookie = "";
  let otherLearnerCookie = "";
  let placementAttemptId = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, 'learner', 'Runtime API Learner', 'runtime-api@e4s.local')`,
        [runtimeLearnerId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)`,
        [runtimeLearnerId, await createPinHash("654321"), DEMO_IDS.learner, await createPinHash("123456")]
      );
    } finally { client.release(); }
    await app.ready();
    const runtimeLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "runtime-api@e4s.local", pin: "654321" } });
    runtimeCookie = String(runtimeLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const otherLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    otherLearnerCookie = String(otherLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  beforeEach(async () => {
    await pool.query("delete from assessment_attempts where learner_id = $1", [runtimeLearnerId]);
    placementAttemptId = "";
  });

  it("rejects a violation event for another learner's attempt", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: runtimeCookie }, payload: {} });
    const attemptId = started.json().attempt.id as string;
    placementAttemptId = attemptId;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/violations`,
      headers: { cookie: otherLearnerCookie },
      payload: { requestId: "wrong-owner-event", reason: "visibility_hidden", occurredAt: new Date().toISOString() }
    });
    expect(response.statusCode, response.body).toBe(409);
  });

  it("accepts every blocked-browser violation and auto-submits on the fourth", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: runtimeCookie }, payload: {} });
    placementAttemptId = started.json().attempt.id as string;
    const correct = await pool.query<{ task_key: string; correct_answer: string }>(
      `select task->>'key' as task_key, task->>'correctAnswer' as correct_answer
       from assessment_attempts aa
       join assessment_versions av on av.id = aa.assessment_version_id
       cross join lateral jsonb_array_elements(av.blueprint->'sections') section
       cross join lateral jsonb_array_elements(section->'groups') group_row
       cross join lateral jsonb_array_elements(group_row->'tasks') task
       where aa.id = $1 and section->>'code' = 'listening' and task ? 'correctAnswer'
       limit 1`,
      [placementAttemptId]
    );
    expect(correct.rows[0]).toBeTruthy();
    const saved = await app.inject({
      method: "PUT",
      url: `/api/v1/assessment-attempts/${placementAttemptId}/responses/listening/${correct.rows[0]!.task_key}`,
      headers: { cookie: runtimeCookie },
      payload: { value: correct.rows[0]!.correct_answer, evidenceType: "choice" }
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const reasons = ["logout", "copy", "paste", "new_window"] as const;
    const states: Array<{ violationCount: number; status: string; autoSubmitted: boolean; submitReason: string | null }> = [];
    for (const [index, reason] of reasons.entries()) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${placementAttemptId}/violations`,
        headers: { cookie: runtimeCookie },
        payload: { requestId: `blocked-browser-${index}`, reason, occurredAt: new Date().toISOString() }
      });
      expect(response.statusCode, response.body).toBe(200);
      states.push(response.json());
    }

    expect(states.map((state) => state.violationCount)).toEqual([1, 2, 3, 4]);
    expect(states[2]).toMatchObject({ status: "in_progress", autoSubmitted: false });
    expect(states[3]).toMatchObject({ status: "pending_review", autoSubmitted: true, submitReason: "violations" });
    const objectiveScores = await pool.query<{ section: string; score: string }>(
      `select section, score::text from assessment_scores
       where attempt_id = $1 and section in ('listening', 'reading') order by section`,
      [placementAttemptId]
    );
    expect(objectiveScores.rows.map((row) => row.section)).toEqual(["listening", "reading"]);
    expect(Number(objectiveScores.rows.find((row) => row.section === "listening")?.score)).toBeGreaterThan(0);
    const events = await pool.query<{ reason: string }>(
      `select event->>'reason' as reason
       from assessment_attempts, jsonb_array_elements(integrity_events) event
       where id = $1
       order by (event->>'violationCount')::int`,
      [placementAttemptId]
    );
    expect(events.rows.map((row) => row.reason)).toEqual(reasons);
  });

  it("deduplicates events and automatically submits after the warning limit", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: runtimeCookie }, payload: {} });
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set violation_limit = 1 where id = $1", [attemptId]);

    const send = (requestId: string) => app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/violations`,
      headers: { cookie: runtimeCookie },
      payload: { requestId, reason: "visibility_hidden", occurredAt: new Date().toISOString() }
    });
    const first = await send("api-event-1");
    const duplicate = await send("api-event-1");
    const automatic = await send("api-event-2");

    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ violationCount: 1, violationLimit: 1, submitReason: null, status: "in_progress" });
    expect(duplicate.statusCode, duplicate.body).toBe(200);
    expect(duplicate.json()).toMatchObject({ violationCount: 1 });
    expect(automatic.statusCode, automatic.body).toBe(200);
    expect(automatic.json()).toMatchObject({ violationCount: 2, submitReason: "violations", status: "pending_review", autoSubmitted: true });
    const duplicateAutomatic = await send("api-event-2");
    expect(duplicateAutomatic.statusCode, duplicateAutomatic.body).toBe(200);
    expect(duplicateAutomatic.json()).toMatchObject({ violationCount: 2, autoSubmitted: true });
  });

  it("lets the server advance an expired section instead of trusting the browser clock", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: runtimeCookie }, payload: {} });
    const attemptId = started.json().attempt.id as string;
    await pool.query(
      `update assessment_attempts
       set timing_state = jsonb_set(timing_state, '{sections,listening,endsAt}'::text[], to_jsonb($2::text))
       where id = $1`,
      [attemptId, new Date(Date.now() - 1_000).toISOString()]
    );
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/sections/listening/complete`,
      headers: { cookie: runtimeCookie },
      payload: {}
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ screenState: "reading", attempt: { currentSection: "reading" } });
  });

  it("returns the authoritative pending view when a stale section submit follows auto-submit", async () => {
    const prior = process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT;
    process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT = "true";
    try {
      const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: runtimeCookie }, payload: {} });
      const attemptId = started.json().attempt.id as string;
      await pool.query("update assessment_attempts set violation_limit = 1 where id = $1", [attemptId]);
      const send = (requestId: string) => app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${attemptId}/violations`,
        headers: { cookie: runtimeCookie },
        payload: { requestId, reason: "visibility_hidden", occurredAt: new Date().toISOString() }
      });
      await send("stale-submit-event-1");
      const automatic = await send("stale-submit-event-2");
      expect(automatic.json()).toMatchObject({ status: "pending_review", autoSubmitted: true });

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${attemptId}/sections/listening/complete`,
        headers: { cookie: runtimeCookie },
        payload: {}
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ screenState: "pending", attempt: { status: "pending_review", currentSection: null } });
    } finally {
      if (prior === undefined) delete process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT;
      else process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT = prior;
    }
  });
});
