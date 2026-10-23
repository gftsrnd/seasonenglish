import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const aiOutput = {
  evaluation: { status: "valid" as const, countsTowardGoal: true, noteVi: "Trả lời đúng trọng tâm." },
  seasonReply: "That's a useful correction 😊",
  seasonReplyTranslation: "Bạn sửa đúng rồi.",
  nextQuestion: "What do you do in the product team?",
  nextQuestionTranslation: "Bạn làm công việc gì trong nhóm sản phẩm?",
  rubric: {
    meaning: { score: 4, evidence: "The role is clear.", improvement: "Add one work detail." },
    vocabulary: { score: 4, evidence: "Product is relevant.", improvement: "Use department for precision." },
    grammar: { score: 3, evidence: "The sentence is understandable.", improvement: "Use in before a department." }
  },
  corrections: [{
    original: "at product", corrected: "in product", translation: "trong bộ phận sản phẩm",
    reason: "Use in before a department."
  }],
  correctedText: "I work in product.",
  suggestedAnswer: { text: "I work in the product team.", translation: "Tôi làm việc trong nhóm sản phẩm." },
  usedWords: ["product"]
};
const formalAiOutput = {
  ...aiOutput,
  seasonReply: "Thank you for the clear correction.",
  nextQuestion: "Could you describe your role in the product team?"
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
        [DEMO_IDS.learner, await createPinHash("123456"), DEMO_IDS.operator, await createCredentialHash("operator-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (url: string, email: string, secret: string, field: "pin" | "password") => {
      const response = await app.inject({ method: "POST", url, payload: { email, [field]: secret } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    learnerCookie = await login("/api/auth/learner/login", "minh.anh.nguyen@e4s.local", "123456", "pin");
    operatorCookie = await login("/api/auth/staff/login", "thu.ha.tran@e4s.local", "operator-pass", "password");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns the existing Coach screen state only to its learner", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(aiRunnerFactory).toHaveBeenCalledWith(DEMO_IDS.learner);
    expect(response.json()).toMatchObject({
      topic: "Introducing yourself & your job", cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { limit: 30 }, weekly: { target: 50 }
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
      output: formalAiOutput,
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
      expect.objectContaining({
        speaker: "coach",
        text: `${aiOutput.seasonReply} ${aiOutput.nextQuestion}`,
        feedback: expect.objectContaining({ rubric: aiOutput.rubric })
      })
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

  it("stores acknowledgement-only input as insufficient without AI, counters, rewards, or vocabulary unlocks", async () => {
    runTask.mockClear();
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(before.statusCode, before.body).toBe(200);
    const progressBefore = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie: learnerCookie } });
    expect(progressBefore.statusCode, progressBefore.body).toBe(200);

    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000011", message: "ok" }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(runTask).not.toHaveBeenCalled();
    expect(response.json().daily.used).toBe(before.json().daily.used);
    expect(response.json().weekly.turns).toBe(before.json().weekly.turns);
    expect(response.json().vocabulary).toEqual(before.json().vocabulary);
    const progressAfter = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie: learnerCookie } });
    expect(progressAfter.statusCode, progressAfter.body).toBe(200);
    const coachCriterion = (body: any) => body.levelReadiness.criteria
      .find((criterion: { key: string }) => criterion.key === "coachRubric");
    expect(coachCriterion(progressAfter.json())).toEqual(coachCriterion(progressBefore.json()));
    expect(response.json().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ speaker: "learner", text: "ok", classification: "insufficient" }),
      expect.objectContaining({
        speaker: "coach",
        text: expect.stringMatching(/câu tiếng Anh đầy đủ/i),
        feedback: expect.objectContaining({
          evaluation: expect.objectContaining({ status: "insufficient", countsTowardGoal: false }),
          rubric: expect.objectContaining({ meaning: expect.objectContaining({ score: 0 }) })
        })
      })
    ]));
  });

  it("repeats the current question and excludes an off-topic answer from progress", async () => {
    runTask.mockClear();
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(before.statusCode, before.body).toBe(200);
    const currentQuestion = [...before.json().messages].reverse()
      .find((message: { speaker: string; feedback?: { nextQuestion?: string }; text: string }) => message.speaker === "coach")
      ?.["feedback"]?.nextQuestion
      ?? [...before.json().messages].reverse()
        .find((message: { speaker: string; text: string }) => message.speaker === "coach")?.text;
    expect(currentQuestion).toBeTruthy();

    runTask.mockResolvedValueOnce({
      output: {
        evaluation: { status: "off_topic", countsTowardGoal: false, noteVi: "Câu trả lời chưa liên quan." },
        seasonReply: "That's not related to our question 😊",
        seasonReplyTranslation: "Câu trả lời chưa liên quan đến câu hỏi.",
        nextQuestion: "A different question that must not be stored.",
        nextQuestionTranslation: "Một câu hỏi khác không được lưu.",
        rubric: {
          meaning: { score: 1, evidence: "It does not answer the question.", improvement: "Answer the current question." },
          vocabulary: { score: 0, evidence: "No relevant vocabulary.", improvement: "Use words from the question." },
          grammar: { score: 2, evidence: "A sentence is present.", improvement: "Focus on the requested topic." }
        },
        corrections: [], correctedText: "",
        suggestedAnswer: { text: "I work in the product team.", translation: "Tôi làm việc trong nhóm sản phẩm." },
        usedWords: []
      } as any,
      metadata: {
        traceId: "trace-coach-off-topic", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 12, inputHash: "d".repeat(64), schemaValid: true as const,
        usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 }
      }
    });
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000012", message: "My favorite color is purple." }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().daily.used).toBe(before.json().daily.used);
    expect(response.json().weekly.turns).toBe(before.json().weekly.turns);
    expect(response.json().vocabulary).toEqual(before.json().vocabulary);
    const feedback = [...response.json().messages].reverse()
      .find((message: { speaker: string; feedback?: unknown }) => message.speaker === "coach" && message.feedback)?.feedback;
    expect(feedback).toMatchObject({
      evaluation: { status: "off_topic", countsTowardGoal: false },
      nextQuestion: currentQuestion,
      rubric: { meaning: { score: 1 } }
    });
  });

  it("repairs a persona violation once before persisting the turn", async () => {
    await app.inject({
      method: "PUT", url: "/api/v1/coach/persona", headers: { cookie: learnerCookie }, payload: { persona: "formal" }
    });
    runTask.mockClear();
    runTask
      .mockResolvedValueOnce({
        output: aiOutput,
        metadata: { traceId: "trace-policy-bad", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
          attempts: 1, latencyMs: 12, inputHash: "e".repeat(64), schemaValid: true as const,
          usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 } }
      })
      .mockResolvedValueOnce({
        output: formalAiOutput,
        metadata: { traceId: "trace-policy-repaired", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
          attempts: 1, latencyMs: 12, inputHash: "f".repeat(64), schemaValid: true as const,
          usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 } }
      });
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000013", message: "I coordinate the weekly planning meeting." }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(runTask).toHaveBeenCalledTimes(2);
    const repairOptions = (runTask.mock.calls as unknown as Array<[string, unknown, { systemPrompt?: string }]>)[1]?.[2];
    expect(repairOptions?.systemPrompt).toContain("REPAIR THE PREVIOUS OUTPUT ONCE");
    const latestCoach = [...response.json().messages].reverse()
      .find((message: { speaker: string; feedback?: { seasonReply?: string } }) => message.speaker === "coach" && message.feedback);
    expect(latestCoach?.feedback?.seasonReply).toBe(formalAiOutput.seasonReply);
  });
});
