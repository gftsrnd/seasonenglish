import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("Operator assessment AI rescore", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const runTask = vi.fn(async () => ({
    output: {
      writingScore: 18,
      speakingScore: 17,
      suggestedLevel: "B1",
      rationale: "Bài làm thể hiện khả năng xử lý tình huống công việc ở mức B1.",
      monthlyGoal: "Trình bày rõ đề xuất trong cuộc họp."
    },
    metadata: {
      traceId: "trace-assessment-rescore-1",
      taskId: "assessment_scoring",
      provider: "fixture",
      model: "fixture-model",
      attempts: 1,
      latencyMs: 1,
      inputHash: "a".repeat(64),
      schemaValid: true as const,
      usage: {}
    }
  }));
  const app = buildApi({
    pool,
    allowDemoLogin: true,
    secureCookies: false,
    aiRunner: { runTask }
  });
  let operatorCookie = "";
  let managerCookie = "";
  let learnerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)",
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          DEMO_IDS.learner, await createCredentialHash("learner-pass")
        ]
      );
      await client.query(
        `update assessment_attempts
         set status = 'pending_review', current_section = null, submitted_at = now()
         where id = $1`,
        [DEMO_IDS.placementAttempt]
      );
      await client.query(
        `update assessment_decisions
         set suggested_level = null, approved_level = null, status = 'suggested',
             reason = 'Chờ chấm lại', decided_by = null, decided_at = null
         where attempt_id = $1`,
        [DEMO_IDS.placementAttempt]
      );
      await client.query(
        `update assessment_scores set score = 20
         where attempt_id = $1 and section in ('listening', 'reading')`,
        [DEMO_IDS.placementAttempt]
      );
      await client.query(
        `insert into assessment_responses (id, attempt_id, section, task_key, response)
         values
           ('00000000-0000-4000-8000-000000000941', $1, 'writing', 'W1', '{"value":"I can cover the inbox and prioritize urgent tickets.","evidenceType":"text"}'::jsonb),
           ('00000000-0000-4000-8000-000000000942', $1, 'speaking', 'S1', '{"value":"I work in AI and explain my responsibilities.","evidenceType":"transcript"}'::jsonb)
         on conflict (id) do nothing`,
        [DEMO_IDS.placementAttempt]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (url: string, email: string, password: string) => {
      const response = await app.inject({ method: "POST", url, payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("/api/auth/staff/login", "thu.ha.tran@e4s.local", "operator-pass");
    managerCookie = await login("/api/auth/staff/login", "quoc.bao.le@e4s.local", "manager-pass");
    learnerCookie = await login("/api/auth/learner/login", "minh.anh.nguyen@e4s.local", "learner-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("rescores a pending assessment once, persists AI evidence, and rejects only Learner", async () => {
    const request = {
      method: "POST" as const,
      url: `/api/v1/assessment-reviews/${DEMO_IDS.placementAttempt}/rescore`,
      headers: { cookie: operatorCookie },
      payload: { requestId: "operator-rescore-1" }
    };
    const first = await app.inject(request);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      id: DEMO_IDS.placementAttempt,
      status: "pending_review",
      suggestedLevel: "B1",
      scores: expect.arrayContaining([
        expect.objectContaining({ section: "writing", score: 18, source: "ai" }),
        expect.objectContaining({ section: "speaking", score: 17, source: "ai" })
      ])
    });

    const repeated = await app.inject(request);
    expect(repeated.statusCode, repeated.body).toBe(200);
    expect(repeated.json()).toMatchObject({ id: DEMO_IDS.placementAttempt, suggestedLevel: "B1" });
    expect(runTask).toHaveBeenCalledTimes(1);

    const storedScores = await pool.query<{ section: string; score: string; source: string }>(
      "select section, score::text, source from assessment_scores where attempt_id = $1 order by section",
      [DEMO_IDS.placementAttempt]
    );
    expect(storedScores.rows.map((row) => ({ ...row, score: Number(row.score) }))).toEqual(expect.arrayContaining([
      { section: "writing", score: 18, source: "ai" },
      { section: "speaking", score: 17, source: "ai" }
    ]));
    const audit = await pool.query<{ action: string; payload: Record<string, unknown> }>(
      `select action, payload from audit_events
       where action = 'assessment.rescored' and entity_id = $1
       order by created_at desc`,
      [DEMO_IDS.placementAttempt]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ payload: { requestId: "operator-rescore-1", suggestedLevel: "B1" } });

    const manager = await app.inject({ ...request, headers: { cookie: managerCookie } });
    expect(manager.statusCode, manager.body).toBe(200);
    const learner = await app.inject({ ...request, headers: { cookie: learnerCookie } });
    expect(learner.statusCode).toBe(403);
  });

  it("recomputes task-level manual scores and CEFR from the authoritative total", async () => {
    const payload = {
      writingTasks: [
        { taskKey: "W1", criteria: { taskCompletion: 3, organization: 3, vocabulary: 2, grammar: 4, workplaceRegister: 3 } },
        { taskKey: "W2", criteria: { taskCompletion: 4, organization: 3, vocabulary: 3, grammar: 3, workplaceRegister: 4 } }
      ],
      speakingTasks: [
        { taskKey: "S1", evidenceType: "audio", criteria: { taskCompletionRelevance: 4, grammarVocabulary: 3, coherenceClarity: 3, interactionProfessionalRegister: 2 } },
        { taskKey: "S2", evidenceType: "audio", criteria: { taskCompletionRelevance: 4, grammarVocabulary: 3, coherenceClarity: 4, interactionProfessionalRegister: 3 } },
        { taskKey: "S3", evidenceType: "audio", criteria: { taskCompletionRelevance: 4, grammarVocabulary: 3, coherenceClarity: 4, interactionProfessionalRegister: 4 } },
        { taskKey: "S4", evidenceType: "audio", criteria: { taskCompletionRelevance: 4, grammarVocabulary: 3, coherenceClarity: 5, interactionProfessionalRegister: 3 } }
      ],
      comment: "Rubric theo đúng từng task."
    };
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${DEMO_IDS.placementAttempt}/manual-score`,
      headers: { cookie: operatorCookie },
      payload
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      suggestedLevel: "B2",
      scores: expect.arrayContaining([
        expect.objectContaining({ section: "writing", score: 16.3, source: "human" }),
        expect.objectContaining({ section: "speaking", score: 14, source: "human" })
      ])
    });

    const decision = await pool.query<{ suggested_level: string; reason: string }>(
      "select suggested_level, reason from assessment_decisions where attempt_id = $1",
      [DEMO_IDS.placementAttempt]
    );
    expect(decision.rows[0]).toEqual({ suggested_level: "B2", reason: "Tổng điểm chấm tay 70.3/100." });

    const invalid = structuredClone(payload);
    invalid.writingTasks[0]!.criteria.taskCompletion = 5;
    const rejected = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${DEMO_IDS.placementAttempt}/manual-score`,
      headers: { cookie: operatorCookie },
      payload: invalid
    });
    expect(rejected.statusCode).toBe(400);
  });
});
