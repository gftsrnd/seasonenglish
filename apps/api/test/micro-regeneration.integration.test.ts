import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const generatedMicro = {
  topic: "Clarifying a project deadline",
  durationMinutes: 5 as const,
  theory: "Use could you clarify when you need a deadline or requirement explained.",
  vocabulary: ["clarify", "deadline", "requirement"],
  practice: {
    prompt: "Choose the clearest question about a deadline.",
    type: "mcq" as const,
    options: ["Could you clarify the deadline?", "Tell me now."],
    answer: "Could you clarify the deadline?"
  }
};

describe("micro-lesson regeneration API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const runTask = vi.fn(async () => ({
    output: generatedMicro,
    metadata: {
      traceId: "trace-micro-regeneration-1", taskId: "micro_lesson_generation", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 1, inputHash: "a".repeat(64), schemaValid: true as const, usage: {}
    }
  }));
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: { runTask } });
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
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("keeps normal generation idempotent but persists a fresh lesson for regeneration", async () => {
    const existing = await app.inject({
      method: "GET",
      url: `/api/v1/micro-lessons/${DEMO_IDS.microLesson}`,
      headers: { cookie }
    });
    expect(existing.statusCode).toBe(200);
    expect(existing.json()).toMatchObject({ id: DEMO_IDS.microLesson, regenerateAvailable: true });

    const normal = await app.inject({
      method: "POST",
      url: "/api/v1/micro-lessons",
      headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000011" }
    });
    expect(normal.statusCode, normal.body).toBe(200);
    expect(normal.json()).toMatchObject({ id: DEMO_IDS.microLesson, regenerateAvailable: true });
    expect(runTask).not.toHaveBeenCalled();

    const regenerated = await app.inject({
      method: "POST",
      url: "/api/v1/micro-lessons",
      headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000012", regenerate: true }
    });
    expect(regenerated.statusCode, regenerated.body).toBe(201);
    expect(regenerated.json()).toMatchObject({
      regenerateAvailable: true,
      topic: generatedMicro.topic,
      practice: { prompt: generatedMicro.practice.prompt, options: generatedMicro.practice.options }
    });
    expect(regenerated.json().id).not.toBe(DEMO_IDS.microLesson);
    expect(runTask).toHaveBeenCalledTimes(1);

    const resumed = await app.inject({
      method: "GET",
      url: `/api/v1/micro-lessons/${regenerated.json().id}`,
      headers: { cookie }
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ id: regenerated.json().id, topic: generatedMicro.topic, regenerateAvailable: true });
  });
});
