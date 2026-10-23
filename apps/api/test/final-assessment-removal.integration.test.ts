import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("retired final assessment", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
    } finally {
      client.release();
    }
    await app.ready();
    const registration = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: { displayName: "No Final Learner", email: "no-final@e4s.local", pin: "123456" }
    });
    expect(registration.statusCode, registration.body).toBe(201);
    cookie = String(registration.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("rejects the retired final kind while preserving placement and level-up routes", async () => {
    const finalResponse = await app.inject({ method: "GET", url: "/api/v1/assessments/final", headers: { cookie } });
    const placementResponse = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie } });
    const levelUpResponse = await app.inject({ method: "GET", url: "/api/v1/assessments/level-up", headers: { cookie } });

    expect(finalResponse.statusCode).toBe(400);
    expect(placementResponse.statusCode).toBe(200);
    expect(levelUpResponse.statusCode).toBe(200);
  });

  it("does not seed a final assessment definition", async () => {
    const result = await pool.query<{ kind: string }>(
      "select kind from assessment_definitions order by kind"
    );

    expect(result.rows.map((row) => row.kind)).toEqual(["level_up", "placement"]);
  });
});
