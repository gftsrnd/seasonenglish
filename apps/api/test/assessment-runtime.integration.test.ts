import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo, DEMO_IDS } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const runtimeLearnerId = "00000000-0000-4000-8000-000000000119";

describe("assessment runtime API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let runtimeCookie = "";
  let otherLearnerCookie = "";

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
        [runtimeLearnerId, await createCredentialHash("runtime-pass"), DEMO_IDS.learner, await createCredentialHash("learner-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const runtimeLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "runtime-api@e4s.local", password: "runtime-pass" } });
    runtimeCookie = String(runtimeLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const otherLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@e4s.local", password: "learner-pass" } });
    otherLearnerCookie = String(otherLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("rejects a violation event for another learner's attempt", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: runtimeCookie }, payload: {} });
    const attemptId = started.json().attempt.id as string;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/violations`,
      headers: { cookie: otherLearnerCookie },
      payload: { requestId: "wrong-owner-event", reason: "visibility_hidden", occurredAt: new Date().toISOString() }
    });
    expect(response.statusCode, response.body).toBe(409);
  });

  it("deduplicates events and auto-submits only after the warning limit", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/final/start", headers: { cookie: runtimeCookie }, payload: {} });
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
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/level-up/start", headers: { cookie: runtimeCookie }, payload: {} });
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
  });
});
