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

  it("keeps the monthly final exam locked for a new learner while preserving placement and level-up routes", async () => {
    const finalResponse = await app.inject({ method: "GET", url: "/api/v1/assessments/final", headers: { cookie } });
    const placementResponse = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie } });
    const levelUpResponse = await app.inject({ method: "GET", url: "/api/v1/assessments/level-up", headers: { cookie } });

    // "final" is the monthly exam again; a learner without an eligible month gets a locked state, not a 400.
    expect(finalResponse.statusCode, finalResponse.body).toBe(409);
    expect(placementResponse.statusCode, placementResponse.body).toBe(200);
    // The level-up route is still recognised; the demo seed ships no published level-up form (it comes from the bank).
    expect(levelUpResponse.statusCode, levelUpResponse.body).toBe(404);
    expect(levelUpResponse.json()).toEqual({ code: "ASSESSMENT_NOT_PUBLISHED" });
  });

  it("seeds placement and Pass Course definitions but no final assessment definition", async () => {
    const result = await pool.query<{ kind: string }>(
      "select kind from assessment_definitions order by kind"
    );

    // Level-up forms come from the assessment bank; monthly finals are created per month.
    expect(result.rows.map((row) => row.kind)).toEqual(["pass_course", "placement"]);
  });
});
