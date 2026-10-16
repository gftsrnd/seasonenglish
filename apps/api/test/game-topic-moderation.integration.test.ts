import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("game topic moderation API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: {
    runTask: async () => ({
      output: { topic: "Sprint planning", words: [] },
      metadata: { traceId: "trace-topic", taskId: "vocabulary_generation", provider: "fixture", model: "fixture-model", attempts: 1, latencyMs: 1, inputHash: "a".repeat(64), schemaValid: true as const, usage: {} }
    })
  } });
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

  beforeEach(async () => {
    await pool.query("delete from topic_reports where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from topic_strikes where learner_id = $1", [DEMO_IDS.learner]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns unsafe strike states and creates one report on the third strike", async () => {
    for (const [index, requestId] of [1, 2, 3].map((value) => [value, `40000000-0000-4000-8000-00000000000${value}`] as const)) {
      const response = await app.inject({
        method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
        payload: { requestId, topic: "porn" }
      });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json().moderation).toMatchObject({
        state: index === 3 ? "reported" : "unsafe", strike: index
      });
    }
    const report = await pool.query(
      "select count(*)::int as count from topic_reports where learner_id = $1 and status = 'open'",
      [DEMO_IDS.learner]
    );
    expect(report.rows[0]?.count).toBe(1);
  });

  it("returns an explicit invalid topic state without pretending a word set was generated", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: "40000000-0000-4000-8000-000000000010", topic: "!!!" }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "VOCABULARY_TOPIC_REJECTED", moderation: { state: "invalid" } });
    expect(response.json().wordSet).toBeUndefined();
  });
});
