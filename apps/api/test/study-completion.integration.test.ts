import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("L-044 lesson study completion", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";
  const lessonId = DEMO_IDS.lessons[0]!;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createPinHash("123456")]
      );
      await client.query("update enrollments set cefr = 'B1', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
      await client.query("update lesson_sets set cefr = 'B1' where id = $1", [DEMO_IDS.lessonSet]);
      await client.query(
        `update progress_records
         set status = 'in_progress', score = null, evidence = $3::jsonb, completed_at = null, updated_at = now()
         where learner_id = $1 and lesson_id = $2`,
        [DEMO_IDS.learner, lessonId, JSON.stringify({
          completedPartCodes: [],
          evidence: { listening: { attempts: 1, status: "wrong_retry", answer: "The plan", score: 0 } }
        })]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("persists B1 study completion idempotently without replacing exercise evidence", async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: `/api/v1/lessons/${lessonId}/study-completion`,
        headers: { cookie },
        payload: {}
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        status: "in_progress",
        completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation"],
        evidence: { listening: { attempts: 1, status: "wrong_retry", answer: "The plan", score: 0 } }
      });
    }

    const stored = await pool.query<{ status: string; evidence: Record<string, any> }>(
      "select status, evidence from progress_records where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, lessonId]
    );
    expect(stored.rows[0]).toMatchObject({
      status: "in_progress",
      evidence: {
        completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation"],
        evidence: { listening: { attempts: 1, status: "wrong_retry", answer: "The plan", score: 0 } }
      }
    });
  });
});
