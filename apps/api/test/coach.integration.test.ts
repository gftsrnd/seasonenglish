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
  replyTranslation: "Bạn sửa đúng rồi. Bạn làm công việc gì trong nhóm sản phẩm?",
  rubric: { meaning: 4, vocabulary: 4, grammar: 3 },
  suggestions: [{
    original: "at product", corrected: "in product", translation: "trong bộ phận sản phẩm",
    explanation: "Use in before a department."
  }],
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
  const aiRunnerFactory = vi.fn(async () => ({ runTask }));
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: { runTask }, aiRunnerFactory });
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
    expect(aiRunnerFactory).toHaveBeenCalledWith(DEMO_IDS.learner);
    expect(response.json()).toMatchObject({
      topic: "Introducing yourself & your job", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { limit: 20 }, weekly: { target: 2 }
    });
    expect(response.json().vocabulary.length).toBeLessThanOrEqual(12);
    expect(new Set(response.json().vocabulary.map((item: { word: string }) => item.word.toLocaleLowerCase())).size).toBe(response.json().vocabulary.length);
    expect(response.json().messages.length).toBeGreaterThan(0);
    expect(response.json().messages[0].text).toContain("practise a short introduction");
    expect(response.json().messages[0].text).not.toContain("What do you do at work?");

    const forbidden = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: operatorCookie } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("uses the configured daily limit instead of a hard-coded value", async () => {
    await pool.query(
      `insert into organization_settings (organization_id, reminder_inactive_days, weekly_report_enabled, configuration, updated_by)
       values ($1, 3, true, '{"coachDailyLimit":7}'::jsonb, $2)
       on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
      [DEMO_IDS.organization, DEMO_IDS.operator]
    );
    const response = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().daily.limit).toBe(7);
    await pool.query(`update organization_settings set configuration = configuration || '{"coachDailyLimit":20}'::jsonb`);
  });

  it("passes both formal and informal personas to the AI request and clears only the conversation", async () => {
    const changed = await app.inject({ method: "PUT", url: "/api/v1/coach/persona", headers: { cookie: learnerCookie }, payload: { persona: "formal" } });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json().persona).toBe("formal");

    runTask.mockResolvedValueOnce({
      output: aiOutput,
      metadata: {
        traceId: "trace-coach-formal", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 12, inputHash: "b".repeat(64), schemaValid: true as const,
        usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 }
      }
    });
    const payload = { requestId: "10000000-0000-4000-8000-000000000009", message: "Could you review the agenda?" };
    const sent = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(sent.statusCode, sent.body).toBe(200);
    expect(runTask).toHaveBeenLastCalledWith("coach_dialogue", expect.objectContaining({ persona: "formal" }), expect.objectContaining({ systemPrompt: expect.stringContaining("FORMAL") }));

    const informal = await app.inject({ method: "PUT", url: "/api/v1/coach/persona", headers: { cookie: learnerCookie }, payload: { persona: "informal" } });
    expect(informal.statusCode, informal.body).toBe(200);
    expect(informal.json().persona).toBe("informal");
    runTask.mockResolvedValueOnce({
      output: aiOutput,
      metadata: {
        traceId: "trace-coach-informal", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 12, inputHash: "c".repeat(64), schemaValid: true as const,
        usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 }
      }
    });
    const informalPayload = { requestId: "10000000-0000-4000-8000-000000000010", message: "Can you take a quick look at this slide?" };
    const informalSent = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload: informalPayload });
    expect(informalSent.statusCode, informalSent.body).toBe(200);
    expect(runTask).toHaveBeenLastCalledWith("coach_dialogue", expect.objectContaining({ persona: "informal" }), expect.objectContaining({ systemPrompt: expect.stringContaining("INFORMAL") }));

    const cleared = await app.inject({ method: "DELETE", url: "/api/v1/coach/session", headers: { cookie: learnerCookie } });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json().messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: "Could you review the agenda?" })]));
    expect(cleared.json().messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: "Can you take a quick look at this slide?" })]));
    expect(cleared.json().messages[0]).toMatchObject({ id: "welcome", speaker: "coach" });
    expect(cleared.json().messages[0].text).toContain("practise a short introduction");
  });

  it("stores one validated AI turn and makes the request idempotent", async () => {
    const payload = { requestId: "10000000-0000-4000-8000-000000000001", message: "I work at product." };
    const first = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ speaker: "learner", text: "I work at product." }),
      expect.objectContaining({ speaker: "coach", text: aiOutput.reply, feedback: expect.objectContaining({ rubric: aiOutput.rubric }) })
    ]));
    const progress = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie: learnerCookie } });
    expect(progress.statusCode, progress.body).toBe(200);
    const coachReadiness = progress.json().levelReadiness.criteria.find((criterion: { key: string }) => criterion.key === "coachRubric");
    expect(coachReadiness.current).toBeGreaterThan(0);
    expect(coachReadiness.display).toMatch(/\/5 · [1-9]\d* lượt/);
    expect(JSON.stringify(first.json())).not.toContain("trace-coach-1");

    const second = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(second.statusCode, second.body).toBe(200);
    expect(runTask).toHaveBeenCalledTimes(1);
    const stored = await pool.query("select count(*)::int as count from ai_runs where trace_id = 'trace-coach-1'");
    expect(stored.rows[0]?.count).toBe(1);
  });
});
