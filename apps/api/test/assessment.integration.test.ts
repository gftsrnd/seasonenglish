import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("assessment API preserves the one-screen flow and server evidence", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createCredentialHash("learner-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns preparation for a fresh placement attempt", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      screenState: "preparation",
      definition: { kind: "placement", totalMinutes: 75, totalScore: 100 },
      attempt: null
    });
  });

  it("starts, saves and resumes Listening on the same assessment attempt", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);
    expect(started.json()).toMatchObject({ screenState: "listening", attempt: { status: "in_progress", currentSection: "listening" } });

    const attemptId = started.json().attempt.id as string;
    const saved = await app.inject({
      method: "PUT",
      url: `/api/v1/assessment-attempts/${attemptId}/responses/listening/LA_0`,
      headers: { cookie },
      payload: { value: "B", evidenceType: "choice" }
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const resumed = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie } });
    expect(resumed.json()).toMatchObject({
      screenState: "listening",
      attempt: { id: attemptId, responses: [{ section: "listening", taskKey: "LA_0", value: "B", evidenceType: "choice" }] }
    });
  });

  it("rejects another learner's attempt instead of trusting an id from the browser", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/assessment-attempts/${DEMO_IDS.placementAttempt}/responses/listening/LA_0`,
      headers: { cookie },
      payload: { value: "B", evidenceType: "choice" }
    });
    expect(response.statusCode).toBe(409);
  });
});
