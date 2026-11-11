import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import type { AiTaskRunner, CoachTaskOutput } from "@e4s/ai";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const aiOutput: CoachTaskOutput = {
  evaluation: { status: "valid" as const, result: "partially_correct" as const, countsTowardGoal: true, noteVi: "Trả lời đúng trọng tâm." },
  seasonReply: "That's useful. You've corrected it well 😊",
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
  seasonReply: "Thank you for the clear correction. Your answer is now accurate.",
  nextQuestion: "Could you describe your role in the product team?"
};

describe("AI Coach API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const runTask = vi.fn(async (..._args: Parameters<AiTaskRunner["runTask"]>) => ({
    output: aiOutput,
    metadata: {
      traceId: "trace-coach-1", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 12, inputHash: "a".repeat(64), schemaValid: true as const,
      usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 }
    }
  }));
  const roleplay = vi.fn(async (...[, input]: Parameters<AiTaskRunner["runTask"]>) => {
    const persona = (input as { persona: string }).persona;
    const model = persona === "formal" ? formalAiOutput : aiOutput;
    return {
      output: {
        seasonReply: model.seasonReply + " " + model.nextQuestion,
        learnerQuestion: model.nextQuestion,
        suggestedLearnerReply: model.suggestedAnswer.text
      },
      metadata: { traceId: "trace-roleplay", taskId: "coach_roleplay_turn", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 12, inputHash: "a".repeat(64), schemaValid: true as const, usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 } }
    };
  });
  const runner: AiTaskRunner = {
    runTask: (...args) => args[0] === "coach_roleplay_turn" ? roleplay(...args) : runTask(...args)
  };
  const aiRunnerFactory = vi.fn(async (): Promise<AiTaskRunner | undefined> => runner);
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: runner, aiRunnerFactory });
  let learnerCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("update enrollments set enrolled_at = '2026-11-02' where learner_id = $1", [DEMO_IDS.learner]);
      await client.query("update assessment_decisions set decided_at = '2026-11-02' where attempt_id in (select id from assessment_attempts where learner_id = $1)", [DEMO_IDS.learner]);
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

  beforeEach(async () => {
    await pool.query("delete from coach_sessions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from ai_runs where user_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      "insert into organization_settings (organization_id, configuration) values ($1, $2::jsonb) on conflict (organization_id) do update set configuration = excluded.configuration",
      [DEMO_IDS.organization, JSON.stringify({ simulatedSystemDate: "2026-11-03", coachDailyLimit: 30 })]
    );
    runTask.mockReset();
    roleplay.mockReset();
  });

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns the existing Coach screen state only to its learner", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(aiRunnerFactory).toHaveBeenCalledWith(DEMO_IDS.learner);
    expect(response.json()).toMatchObject({
      topic: expect.stringMatching(/workplace check-in|planning a workday|helping a colleague|joining a meeting/), cefr: "A2", persona: "informal", aiAvailable: true,
      daily: { limit: 30 }, monthly: { target: 100 }
    });
    expect(response.json().vocabulary).toEqual([]);
    expect(response.json().messages.length).toBeGreaterThan(0);
    expect(response.json().messages[0].text).not.toContain("short introduction");
    expect(response.json().messages[0].text).not.toContain("What do you do at work?");

    const forbidden = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: operatorCookie } });
    expect(forbidden.statusCode).toBe(403);
  });

  it("uses the configured daily limit instead of a hard-coded value", async () => {
    await pool.query(
      `insert into organization_settings (organization_id, reminder_inactive_days, weekly_report_enabled, configuration, updated_by)
       values ($1, 3, true, '{"coachDailyLimit":60}'::jsonb, $2)
       on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
      [DEMO_IDS.organization, DEMO_IDS.operator]
    );
    const response = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().daily.limit).toBe(60);
    await pool.query(`update organization_settings set configuration = configuration || '{"coachDailyLimit":20}'::jsonb`);
  });

  it("applies changes from Manager settings at the start of the next organization month", async () => {
    const { rows: [saved] } = await pool.query(
      "select configuration from organization_settings where organization_id = $1",
      [DEMO_IDS.organization]
    );
    try {
      await pool.query(
        `insert into organization_settings (organization_id, configuration, updated_by)
         values ($1, '{"simulatedSystemDate":"2026-11-30","coachDailyLimit":20}'::jsonb, $2)
         on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
        [DEMO_IDS.organization, DEMO_IDS.manager]
      );
      const manager = createRepositories(pool).manager;
      const settings = await manager.settings(DEMO_IDS.manager);
      expect(settings).not.toBeNull();
      await manager.saveSettings(DEMO_IDS.manager, { ...settings!, coachDailyLimit: 60 });
      const learnerLimit = async () => {
        const response = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
        expect(response.statusCode, response.body).toBe(200);
        return response.json().daily.limit;
      };
      expect(await learnerLimit()).toBe(20);
      const operatorEdit = await app.inject({
        method: "PUT", url: "/api/v1/operator/settings", headers: { cookie: operatorCookie },
        payload: { ...settings!, coachDailyLimit: 150 }
      });
      expect(operatorEdit.statusCode, operatorEdit.body).toBe(200);
      expect(operatorEdit.json()).toMatchObject({ coachDailyLimit: 60, coachDailyLimitStartsMonth: "2026-12" });
      await manager.saveSettings(DEMO_IDS.manager, { ...settings!, coachDailyLimit: 75 });
      expect(await learnerLimit()).toBe(20);
      await pool.query(
        "update organization_settings set configuration = configuration || jsonb_build_object('simulatedSystemDate', '2026-12-01') where organization_id = $1",
        [DEMO_IDS.organization]
      );
      expect(await learnerLimit()).toBe(75);
    } finally {
      if (saved) {
        await pool.query("update organization_settings set configuration = $2::jsonb where organization_id = $1", [DEMO_IDS.organization, saved.configuration]);
      } else {
        await pool.query("delete from organization_settings where organization_id = $1", [DEMO_IDS.organization]);
      }
    }
  });

  it("blocks every new message at the daily cap, including acknowledgement-only text", async () => {
    await pool.query(`update organization_settings set configuration = configuration || '{"coachDailyLimit":1}'::jsonb`);
    try {
      const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
      expect(before.statusCode, before.body).toBe(200);
      await pool.query(
        `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback, created_at)
         values ('10000000-0000-4000-8000-000000000029', $1,
           (select coalesce(max(turn_number), 0) + 1 from coach_turns where session_id = $1),
           'learner', '{"text":"I work in a product team."}'::jsonb,
           '{"evaluation":{"countsTowardGoal":true}}'::jsonb, '2026-11-03T12:00:00Z'::timestamptz)`,
        [before.json().sessionId]
      );
      const capped = await app.inject({
        method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
        payload: { requestId: "10000000-0000-4000-8000-000000000030", message: "ok" }
      });
      expect(capped.statusCode, capped.body).toBe(429);
      expect(capped.json()).toEqual({ code: "COACH_DAILY_LIMIT" });
      const after = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
      expect(after.json().messages).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ speaker: "learner", text: "ok" })
      ]));
    } finally {
      await pool.query(`update organization_settings set configuration = configuration || '{"coachDailyLimit":20}'::jsonb`);
    }
  });

  it("does not expose an endpoint for manually opening a secret word", async () => {
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(before.json().vocabulary).toEqual([]);
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/vocabulary/deadline/unlock", headers: { cookie: learnerCookie }
    });
    expect(response.statusCode).toBe(404);
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
    const payload = { requestId: "10000000-0000-4000-8000-000000000009", message: "Could you review the agenda before our meeting?" };
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
    expect(cleared.json().messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: "Could you review the agenda before our meeting?" })]));
    expect(cleared.json().messages).not.toEqual(expect.arrayContaining([expect.objectContaining({ text: "Can you take a quick look at this slide?" })]));
    expect(cleared.json().messages[0]).toMatchObject({ id: expect.stringMatching(/:opening$/), speaker: "coach" });
    expect(cleared.json().messages[0].text).not.toContain("short introduction");
  });

  it("stores one validated AI turn and makes the request idempotent", async () => {
    const payload = { requestId: "10000000-0000-4000-8000-000000000001", message: "I work at product with our design team." };
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    const first = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ speaker: "learner", text: "I work at product with our design team." }),
      expect.objectContaining({
        speaker: "coach",
        text: `${aiOutput.seasonReply} ${aiOutput.nextQuestion}`,
        feedback: expect.objectContaining({ rubric: aiOutput.rubric })
      })
    ]));
    expect(first.json().daily.used).toBe(before.json().daily.used + 1);
    expect(JSON.stringify(first.json())).not.toContain("trace-coach-1");

    const second = await app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload });
    expect(second.statusCode, second.body).toBe(200);
    expect(runTask).toHaveBeenCalledTimes(1);
    const stored = await pool.query("select count(*)::int as count from ai_runs where trace_id = 'trace-coach-1'");
    expect(stored.rows[0]?.count).toBe(1);

    // Older turns stored the question twice even though the roleplay reply already contained it.
    await pool.query(
      "update coach_turns set feedback = feedback || jsonb_build_object('coachText', $2::text) where content->>'requestId' = $1",
      [payload.requestId, `${aiOutput.seasonReply} ${aiOutput.nextQuestion} ${aiOutput.nextQuestion}`]
    );
    const historical = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    expect(historical.statusCode, historical.body).toBe(200);
    expect(historical.json().messages.at(-1).text).toBe(`${aiOutput.seasonReply} ${aiOutput.nextQuestion}`);
  });

  it("serializes concurrent saves so the daily maximum cannot be exceeded", async () => {
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    const limit = before.json().daily.used + 1;
    await pool.query(
      `update organization_settings set configuration = configuration || jsonb_build_object('coachDailyLimit', $1::int)`,
      [limit]
    );
    try {
      const responses = await Promise.all([
        app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload: { requestId: "10000000-0000-4000-8000-000000000031", message: "I work in product design with two colleagues." } }),
        app.inject({ method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload: { requestId: "10000000-0000-4000-8000-000000000032", message: "I work in product research with two colleagues." } })
      ]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 429]);
      const after = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
      expect(after.json().daily).toEqual({ used: limit, limit });
    } finally {
      await pool.query(`update organization_settings set configuration = configuration || '{"coachDailyLimit":20}'::jsonb`);

    }
  });

  it("isolates the latest answer from earlier learner answers when requesting feedback", async () => {
    const earlier = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000021", message: "I send a status update every Thursday." }
    });
    expect(earlier.statusCode, earlier.body).toBe(200);
    runTask.mockClear();
    runTask.mockResolvedValueOnce({
      output: {
        ...aiOutput,
        evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Câu trả lời đúng." },
        rubric: {
          meaning: { score: 5, evidence: "The answer directly addresses the question.", improvement: "No change needed." },
          vocabulary: { score: 5, evidence: "The workplace word is accurate.", improvement: "No change needed." },
          grammar: { score: 5, evidence: "The latest sentence is grammatical.", improvement: "No change needed." }
        },
        corrections: [], correctedText: ""
      },
      metadata: {
        traceId: "trace-coach-isolated", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 12, inputHash: "9".repeat(64), schemaValid: true as const,
        usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 }
      }
    });
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000014", message: "I coordinate the weekly meeting with our clients." }
    });
    expect(response.statusCode, response.body).toBe(200);
    const input = (runTask.mock.calls as unknown as Array<[string, { message: string; priorTurns: unknown[] }]>)[0]?.[1];
    expect(input).toMatchObject({ message: "I coordinate the weekly meeting with our clients.", priorTurns: [] });
    const latest = [...response.json().messages].reverse()
      .find((message: { speaker: string; feedback?: unknown }) => message.speaker === "coach" && message.feedback);
    expect(latest.feedback).toMatchObject({
      evaluation: { result: "correct" }, corrections: [], correctedText: "",
      rubric: { grammar: { score: 5, evidence: "The latest sentence is grammatical." } }
    });
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
    expect(response.json().monthly.turns).toBe(before.json().monthly.turns);
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
        feedback: expect.objectContaining({
          nextQuestion: expect.stringContaining("?"),
          evaluation: expect.objectContaining({ status: "insufficient", countsTowardGoal: false }),
          rubric: expect.objectContaining({ meaning: expect.objectContaining({ score: 0 }) })
        })
      })
    ]));
  });

  it("stores a two-word fragment as insufficient without calling AI", async () => {
    runTask.mockClear();
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie: learnerCookie } });
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000015", message: "Maybe room." }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(runTask).not.toHaveBeenCalled();
    expect(response.json().daily.used).toBe(before.json().daily.used);
    expect(response.json().monthly.turns).toBe(before.json().monthly.turns);
    expect(response.json().messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ speaker: "learner", text: "Maybe room.", classification: "insufficient" }),
      expect.objectContaining({
        speaker: "coach",
        feedback: expect.objectContaining({
          evaluation: expect.objectContaining({ status: "insufficient", result: "missing_information", countsTowardGoal: false })
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
        evaluation: { status: "off_topic", result: "off_topic", countsTowardGoal: false, noteVi: "Câu trả lời chưa liên quan." },
        seasonReply: "That's not related to our question. Let's try that question again 😊",
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
      payload: { requestId: "10000000-0000-4000-8000-000000000012", message: "My favorite color is purple and I like painting." }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().daily.used).toBe(before.json().daily.used);
    expect(response.json().monthly.turns).toBe(before.json().monthly.turns);
    expect(response.json().vocabulary).toEqual(before.json().vocabulary);
    const feedback = [...response.json().messages].reverse()
      .find((message: { speaker: string; feedback?: unknown }) => message.speaker === "coach" && message.feedback)?.feedback;
    expect(feedback).toMatchObject({
      evaluation: { status: "off_topic", countsTowardGoal: false },
      nextQuestion: currentQuestion,
      rubric: { meaning: { score: 1 } }
    });
  });

  it("keeps the accepted formal reply when the feedback contains informal wording", async () => {
    const cookie = learnerCookie;
    const changed = await app.inject({
      method: "PUT", url: "/api/v1/coach/persona", headers: { cookie }, payload: { persona: "formal" }
    });
    expect(changed.statusCode, changed.body).toBe(200);
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000013", message: "I coordinate the weekly planning meeting with our clients." }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(roleplay).toHaveBeenCalledOnce();
    expect(runTask).toHaveBeenCalledOnce();
    const latest = response.json().messages.at(-1);
    expect(latest.feedback).toMatchObject({ nextQuestion: formalAiOutput.nextQuestion, rubric: aiOutput.rubric });
    expect(latest.text).not.toContain("😊");
    expect(latest.text).not.toContain(aiOutput.seasonReply);
  });

  it("keeps the accepted reply if feedback is malformed", async () => {
    runTask.mockImplementationOnce(async () => {
      throw Object.assign(new Error("Invalid provider output"), { code: "AI_OUTPUT_INVALID" });
    });
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000016", message: "Could you tell me where room 302 is?" }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(roleplay).toHaveBeenCalledOnce();
    expect(runTask).toHaveBeenCalledWith("coach_dialogue", expect.anything(), expect.objectContaining({ maxAttempts: 2 }));
    expect(response.json().messages.at(-1).feedback).toMatchObject({
      feedbackStatus: "unavailable", nextQuestion: aiOutput.nextQuestion,
      creditedDuringAiOutage: true, evaluation: { countsTowardGoal: true }
    });
    const log = await pool.query(
      "select payload, created_at from audit_events where action = 'coach.practice_turn_credited_during_outage' and payload->>'requestId' = $1",
      ["10000000-0000-4000-8000-000000000016"]
    );
    expect(log.rows).toEqual([{ payload: expect.objectContaining({ code: "AI_OUTPUT_INVALID", practiceDate: expect.any(String) }), created_at: expect.any(Date) }]);
  });

  it("credits a practice turn once when no AI runner is available", async () => {
    await pool.query(
      `update organization_settings set configuration = configuration || '{"simulatedSystemDate":"2026-11-04"}'
       where organization_id = $1`, [DEMO_IDS.organization]
    );
    const getInbox = () => app.inject({ method: "GET", url: "/api/v1/me/notifications", headers: { cookie: learnerCookie } });
    const priorItems = (await getInbox()).json().items as { id: string }[];
    aiRunnerFactory.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const payload = { requestId: "10000000-0000-4000-8000-000000000022", message: "Could you tell me where room 302 is?" };
    for (const _ of [1, 2]) {
      const response = await app.inject({
        method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie }, payload
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({ aiAvailable: false, daily: { used: 1 }, monthly: { turns: 1 } });
      expect(response.json().messages.at(-1).feedback).toMatchObject({
        feedbackStatus: "unavailable", creditedDuringAiOutage: true, evaluation: { countsTowardGoal: true }
      });
    }
    expect(roleplay).not.toHaveBeenCalled();
    expect(runTask).not.toHaveBeenCalled();
    const log = await pool.query(
      "select payload from audit_events where action = 'coach.practice_turn_credited_during_outage' and payload->>'requestId' = $1",
      [payload.requestId]
    );
    expect(log.rows).toEqual([{ payload: expect.objectContaining({ code: "AI_UNAVAILABLE" }) }]);
    aiRunnerFactory.mockResolvedValueOnce(undefined);
    const nextTurn = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000023", message: "Could you show me the quickest route to room 302?" }
    });
    expect(nextTurn.statusCode, nextTurn.body).toBe(200);
    expect(nextTurn.json()).toMatchObject({ daily: { used: 2 }, monthly: { turns: 2 } });
    const inbox = await getInbox();
    expect(inbox.json().items.filter((item: { id: string; kind: string }) =>
      item.kind === "season_turn_credited" && !priorItems.some(prior => prior.id === item.id))).toEqual([
      expect.objectContaining({ kind: "season_turn_credited", context: "season" })
    ]);
    const staff = await pool.query(
      `select u.role, n.kind, count(n.id)::integer as count
       from users u left join inbox_notifications n
         on n.recipient_id = u.id and n.organization_id = u.organization_id and n.event_key = 'season-feedback:2026-11-04'
       where u.organization_id = $1 and u.status = 'active' and u.role in ('operator', 'manager')
       group by u.id, u.role, n.kind order by u.role`, [DEMO_IDS.organization]
    );
    expect(staff.rows.map(row => row.role)).toEqual(expect.arrayContaining(["operator", "manager"]));
    for (const row of staff.rows) {
      expect(row.count).toBe(1);
      expect(row.kind).toBe(row.role === "manager" ? "season_service_interrupted" : "season_feedback_interrupted");
    }
  });

  it("uses the accepted model answer instead of the evaluator's duplicated question", async () => {
    runTask.mockImplementationOnce(async () => ({
      output: { ...aiOutput, suggestedAnswer: { text: aiOutput.nextQuestion, translation: "Bạn làm công việc gì trong nhóm sản phẩm?" } },
      metadata: { traceId: "trace-duplicate-answer", taskId: "coach_dialogue", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 12, inputHash: "b".repeat(64), schemaValid: true as const, usage: { inputTokens: 20, outputTokens: 25, totalTokens: 45 } }
    }));
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000020", message: "Could you share the updated agenda with our team?" }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().messages.at(-1).feedback).toMatchObject({
      nextQuestion: aiOutput.nextQuestion,
      suggestedAnswer: { text: aiOutput.suggestedAnswer.text },
      evaluation: { status: "valid", countsTowardGoal: true }
    });
  });
});
