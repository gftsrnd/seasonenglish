import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const aiOutput = {
  relevant: true,
  relevanceNote: "",
  reply: "Good correction. What do you do in the product team?",
  rubric: { meaning: 4, vocabulary: 4, grammar: 3 },
  suggestions: [{ original: "at product", corrected: "in product", explanation: "Use in before a department." }],
  correctedText: "I work in product.",
  usedWords: ["product"]
};

describe("AI Coach API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const runTask = vi.fn(async () => ({
    output: aiOutput,
    metadata: {
      traceId: "trace-coach-1", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 12, inputHash: "a".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 }
    }
  }));
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: { runTask } });
  let learnerCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
        [DEMO_IDS.learner, await createCredentialHash("learner-pass"), DEMO_IDS.operator, await createCredentialHash("operator-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (url: string, email: string, password: string) => {
      const response = await app.inject({ method: "POST", url, payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    learnerCookie = await login("/api/auth/learner/login", "learner@e4s.local", "learner-pass");
    operatorCookie = await login("/api/auth/staff/login", "operator@e4s.local", "operator-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns the existing Coach screen state only to its learner", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      topic: "Introducing yourself & your job", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { limit: 20 }, weekly: { target: 2 }
    });
    expect(response.json().vocabulary).toHaveLength(15);
    expect(response.json().messages.length).toBeGreaterThan(0);

    const forbidden = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: operatorCookie } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("stores one validated AI turn and makes the request idempotent", async () => {
    const payload = { requestId: "10000000-0000-4000-8000-000000000001", message: "I work at product." };
    const first = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ speaker: "learner", text: "I work at product." }),
      expect.objectContaining({ speaker: "coach", text: aiOutput.reply, feedback: expect.objectContaining({ rubric: aiOutput.rubric }) })
    ]));
    expect(JSON.stringify(first.json())).not.toContain("trace-coach-1");

    const second = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(second.statusCode, second.body).toBe(200);
    expect(runTask).toHaveBeenCalledTimes(1);
    const stored = await pool.query("select count(*)::int as count from ai_runs where trace_id = 'trace-coach-1'");
    expect(stored.rows[0]?.count).toBe(1);
  });
});
