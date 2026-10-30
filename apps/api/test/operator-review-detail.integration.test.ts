import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const responseId = "00000000-0000-4000-8000-000000000921";
const fileId = "00000000-0000-4000-8000-000000000922";
const appealId = "00000000-0000-4000-8000-000000000923";
const lessonPartAppealId = "00000000-0000-4000-8000-000000000924";
const artifactKey = `assessment-audio/${DEMO_IDS.learner}/review.wav`;

describe("Operator review detail and AI grade API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let trace = 0;
  const runTask = vi.fn(async () => ({
    output: {
      score: { total: 90, rubric: { meaning: 5, vocabulary: 4, grammar: 4 } },
      offTopic: false,
      feedback: "Bài viết rõ ý và có thể dùng trong công việc.",
      suggestions: [],
      correctedText: "Weekly sample for the team."
    },
    metadata: {
      traceId: `trace-review-${++trace}`, taskId: "weekly_practice_grading", provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 1, inputHash: "c".repeat(64), schemaValid: true as const, usage: {}
    }
  }));
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: { runTask } });
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
        `update users set email = case id
           when $1 then 'thu.ha.tran@e4s.test'
           when $2 then 'quoc.bao.le@e4s.test'
           when $3 then 'minh.anh.nguyen@e4s.test'
           else email end
         where id in ($1, $2, $3)`,
        [DEMO_IDS.operator, DEMO_IDS.manager, DEMO_IDS.learner]
      );
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)`,
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          DEMO_IDS.learner, await createPinHash("123456")
        ]
      );
      await client.query(
        `insert into assessment_responses (id, attempt_id, section, task_key, response)
         values ($1, $2, 'speaking', 'S1', $3::jsonb)`,
        [responseId, DEMO_IDS.placementAttempt, JSON.stringify({ value: "audio evidence", evidenceType: "audio", artifactKey })]
      );
      await client.query(
        `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
         values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', $4, 'audio/wav', 42, $5)`,
        [fileId, DEMO_IDS.organization, DEMO_IDS.learner, artifactKey, "d".repeat(64)]
      );
      await client.query(
        `insert into appeals (id, attempt_id, learner_id, reason, status)
         values ($1, $2, $3, 'Audio cần được xem lại', 'pending')`,
        [appealId, DEMO_IDS.placementAttempt, DEMO_IDS.learner]
      );
      await client.query(
        `insert into lesson_part_appeals (id, learner_id, lesson_id, part_code, reason, status)
         values ($1, $2, $3, 'reading', 'Xin xem lại phần Đọc', 'pending')`,
        [lessonPartAppealId, DEMO_IDS.learner, DEMO_IDS.lessons[0]]
      );
      await client.query(
        `insert into practice_submissions
           (id, learner_id, program_week_id, status, content, prompt_snapshot, cefr_snapshot, vocabulary_snapshot, submitted_at)
         values ($1, $2, $3, 'submitted', '{"text":"Weekly sample for the team."}'::jsonb,
           '{"task":"Write about Introducing yourself & your job"}'::jsonb, 'A2', '[]'::jsonb, now())`,
        [DEMO_IDS.practiceSubmission, DEMO_IDS.learner, DEMO_IDS.week]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (url: string, email: string, credential: string) => {
      const payload = url.includes("learner") ? { email, pin: credential } : { email, password: credential };
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("/api/auth/staff/login", "thu.ha.tran@e4s.test", "operator-pass");
    managerCookie = await login("/api/auth/staff/login", "quoc.bao.le@e4s.test", "manager-pass");
    learnerCookie = await login("/api/auth/learner/login", "minh.anh.nguyen@e4s.test", "123456");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns scoped assessment answers, artifact metadata, integrity, scores and appeal", async () => {
    const response = await app.inject({
      method: "GET", url: `/api/v1/content/review/assessments/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: managerCookie }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      attemptId: DEMO_IDS.placementAttempt,
      learnerId: DEMO_IDS.learner,
      answers: expect.arrayContaining([expect.objectContaining({
        taskKey: "S1",
        audioArtifact: expect.objectContaining({ artifactKey, mimeType: "audio/wav", sizeBytes: 42, signedUrl: null, expiresAt: null })
      })]),
      scores: expect.arrayContaining([expect.objectContaining({ section: "listening", source: "human" })]),
      integrityEvents: expect.any(Array),
      appeal: expect.objectContaining({ id: appealId, status: "pending" })
    });

    const learner = await app.inject({
      method: "GET", url: `/api/v1/content/review/assessments/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: learnerCookie }
    });
    expect(learner.statusCode).toBe(403);
  });

  it("returns the persisted weekly-practice type and topic task in the review queue", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/content/review", headers: { cookie: operatorCookie } });
    expect(response.statusCode, response.body).toBe(200);
    const submission = response.json().submissions.find((item: { id: string }) => item.id === DEMO_IDS.practiceSubmission);
    expect(submission).toMatchObject({
      id: DEMO_IDS.practiceSubmission,
      type: "writing",
      task: expect.stringContaining("Introducing yourself & your job")
    });
  });

  it("includes lesson-part appeals in the operator queue and lets the operator decide them", async () => {
    const queue = await app.inject({ method: "GET", url: "/api/v1/content/review", headers: { cookie: operatorCookie } });
    expect(queue.statusCode, queue.body).toBe(200);
    expect(queue.json().tabs.find((tab: { key: string }) => tab.key === "appeals")?.count).toBe(2);
    expect(queue.json().appeals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: lessonPartAppealId,
        kind: "lesson_part",
        learnerName: "Nguyễn Minh Anh",
        partCode: "reading",
        reason: "Xin xem lại phần Đọc",
        lessonTitle: expect.any(String),
        status: "pending"
      })
    ]));

    const decided = await app.inject({
      method: "POST", url: `/api/v1/content/review/appeals/${lessonPartAppealId}/decision`,
      headers: { cookie: operatorCookie }, payload: { status: "accepted", resolution: "Phần Đọc được tính hoàn thành." }
    });
    expect(decided.statusCode, decided.body).toBe(200);
    const stored = await pool.query<{ status: string }>("select status from lesson_part_appeals where id = $1", [lessonPartAppealId]);
    expect(stored.rows[0]?.status).toBe("accepted");
  });

  it("runs an idempotent AI grade and leaves manual grading authoritative", async () => {
    const request = {
      method: "POST" as const,
      url: `/api/v1/content/review/submissions/${DEMO_IDS.practiceSubmission}/ai-grade`,
      headers: { cookie: operatorCookie },
      payload: { requestId: "review-grade-1" }
    };
    const first = await app.inject(request);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ status: "succeeded", submissionId: DEMO_IDS.practiceSubmission, result: { total: 90 } });

    const repeated = await app.inject(request);
    expect(repeated.statusCode, repeated.body).toBe(200);
    expect(repeated.json()).toMatchObject({ jobId: first.json().jobId, status: "succeeded", result: { total: 90 } });
    expect(runTask).toHaveBeenCalledTimes(1);

    const manager = await app.inject({ ...request, headers: { cookie: managerCookie } });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toMatchObject({ jobId: first.json().jobId, status: "succeeded", result: { total: 90 } });
    expect(runTask).toHaveBeenCalledTimes(1);

    const manual = await app.inject({
      method: "POST", url: `/api/v1/content/review/submissions/${DEMO_IDS.practiceSubmission}/manual-grade`,
      headers: { cookie: operatorCookie }, payload: { meaning: 3, vocabulary: 3, grammar: 3, feedback: "Đã duyệt thủ công." }
    });
    expect(manual.statusCode, manual.body).toBe(200);
    const stored = await pool.query<{ score: Record<string, unknown>; feedback: Record<string, unknown> }>(
      "select score, feedback from practice_submissions where id = $1", [DEMO_IDS.practiceSubmission]
    );
    expect(stored.rows[0]?.score).toMatchObject({ total: 60, rubric: { meaning: 3, vocabulary: 3, grammar: 3 } });
    expect(stored.rows[0]?.feedback).toMatchObject({ source: "human", message: "Đã duyệt thủ công." });
  });
});
