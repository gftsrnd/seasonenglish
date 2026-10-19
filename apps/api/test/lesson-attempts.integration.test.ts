import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("lesson exercise evidence API", () => {
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

  it("grades retries from persisted lesson content and keeps duplicate request IDs idempotent", async () => {
    const lessonId = DEMO_IDS.lessons[1];
    const first = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/listening/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000001", evidence: { answer: "B" } }
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      lessonId, partCode: "listening", evidence: { status: "wrong_retry", attempts: 1, score: 0 }
    });
    expect(first.json().progress.completedPartCodes).not.toContain("listening");

    const duplicate = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/listening/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000001", evidence: { answer: "In 2023" } }
    });
    expect(duplicate.statusCode, duplicate.body).toBe(200);
    expect(duplicate.json()).toMatchObject({ evidence: { status: "wrong_retry", attempts: 1, answer: "B" } });

    const retry = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/listening/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000002", evidence: { answer: "In 2023" } }
    });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json()).toMatchObject({ evidence: { status: "correct", attempts: 2, score: 100 } });
    expect(retry.json().progress.completedPartCodes).toContain("listening");

    const reward = await pool.query(
      "select count(*)::int as count, coalesce(sum(points), 0)::int as points from reward_events where learner_id = $1 and source_type = 'lesson_part'",
      [DEMO_IDS.learner]
    );
    expect(reward.rows[0]?.count).toBe(1);
    expect(reward.rows[0]?.points).toBe(4);
  });

  it("persists exhausted, translated and appealed outcomes for reload", async () => {
    const lessonId = DEMO_IDS.lessons[1];
    for (const [requestId, answer] of [
      ["30000000-0000-4000-8000-000000000003", "A"],
      ["30000000-0000-4000-8000-000000000004", "C"]
    ] as const) {
      const response = await app.inject({
        method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/attempts`, headers: { cookie },
        payload: { requestId, evidence: { answer } }
      });
      expect(response.statusCode, response.body).toBe(200);
    }

    const exhausted = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(exhausted.json().progress.evidence.reading).toMatchObject({ status: "wrong_exhausted", attempts: 2 });

    const translated = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000005", evidence: { answer: "C", translated: true } }
    });
    expect(translated.statusCode, translated.body).toBe(200);
    expect(translated.json()).toMatchObject({ evidence: { status: "translated" } });

    const appeal = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/appeals`, headers: { cookie },
      payload: { reason: "Đáp án trong bài nghe không rõ." }
    });
    expect(appeal.statusCode, appeal.body).toBe(200);
    expect(appeal.json()).toMatchObject({ partCode: "reading", status: "pending", evidence: { status: "appealed" } });

    const reloaded = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(reloaded.json().progress.evidence.reading).toMatchObject({ status: "appealed" });
  });
});
