import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("learner lesson access state", () => {
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
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns and enforces the prior-lesson lock before allowing deep links", async () => {
    await pool.query(
      "update progress_records set status = 'not_started', completed_at = null where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );
    await pool.query("update programs set start_date = current_date - 1 where id = $1", [DEMO_IDS.program]);

    const locked = await app.inject({
      method: "GET", url: `/api/v1/lessons/${DEMO_IDS.lessons[1]}`, headers: { cookie }
    });
    expect(locked.statusCode, locked.body).toBe(200);
    expect(locked.json()).toMatchObject({
      id: DEMO_IDS.lessons[1],
      lock: {
        reason: "prior",
        blocker: { id: DEMO_IDS.lessons[0], dayNumber: 1 },
        totalLessons: 5
      }
    });

    const blockedProgress = await app.inject({
      method: "PUT", url: `/api/v1/lessons/${DEMO_IDS.lessons[1]}/progress`, headers: { cookie },
      payload: { completedPartCodes: [], evidence: {}, markComplete: true }
    });
    expect(blockedProgress.statusCode, blockedProgress.body).toBe(409);
    expect(blockedProgress.json()).toMatchObject({ code: "LESSON_LOCKED", lock: { reason: "prior" } });

    const blockedAttempt = await app.inject({
      method: "POST", url: `/api/v1/lessons/${DEMO_IDS.lessons[1]}/parts/listening/attempts`, headers: { cookie },
      payload: { requestId: "40000000-0000-4000-8000-000000000001", evidence: { answer: "A" } }
    });
    expect(blockedAttempt.statusCode, blockedAttempt.body).toBe(409);
    expect(blockedAttempt.json()).toMatchObject({ code: "LESSON_LOCKED", lock: { reason: "prior" } });
  });

  it("returns a date lock after prior lessons are complete but the schedule is ahead", async () => {
    await pool.query(
      "update progress_records set status = 'completed', completed_at = now() where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );
    await pool.query("update programs set start_date = current_date + 1 where id = $1", [DEMO_IDS.program]);

    const locked = await app.inject({
      method: "GET", url: `/api/v1/lessons/${DEMO_IDS.lessons[1]}`, headers: { cookie }
    });
    expect(locked.statusCode, locked.body).toBe(200);
    expect(locked.json()).toMatchObject({
      id: DEMO_IDS.lessons[1],
      lock: { reason: "date", opensAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/), totalLessons: 5 }
    });
  });
});
