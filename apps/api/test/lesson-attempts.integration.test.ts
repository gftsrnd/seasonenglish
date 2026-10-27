import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
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
      await client.query("update programs set start_date = current_date - 1 where id = $1", [DEMO_IDS.program]);
      await client.query("delete from progress_records where learner_id = $1 and lesson_id = $2", [DEMO_IDS.learner, DEMO_IDS.lessons[1]]);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createPinHash("123456")]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function completeStudy(lessonId: string) {
    const response = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/study-completion`, headers: { cookie }, payload: {}
    });
    expect(response.statusCode, response.body).toBe(200);
  }

  it("returns real week metadata with the learner lesson", async () => {
    const response = await app.inject({
      method: "GET", url: `/api/v1/lessons/${DEMO_IDS.lessons[1]}`, headers: { cookie }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ weekNumber: 1, weekTopic: "Introducing yourself & your job", dayNumber: 2 });
  });

  it("rejects an exercise API bypass before the learner finishes the study tab", async () => {
    const lessonId = DEMO_IDS.lessons[0];
    const bypass = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000000", evidence: { answer: "Lobby" } }
    });
    expect(bypass.statusCode, bypass.body).toBe(409);
    expect(bypass.json()).toEqual({ code: "LESSON_STUDY_INCOMPLETE" });
    const stored = await pool.query(
      "select count(*)::int as count from lesson_part_attempts where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, lessonId]
    );
    expect(stored.rows[0]?.count).toBe(0);
  });

  it("grades retries from persisted lesson content and keeps duplicate request IDs idempotent", async () => {
    const lessonId = DEMO_IDS.lessons[1];
    await completeStudy(lessonId);
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

    const third = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/listening/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000099", evidence: { answer: "In 2023" } }
    });
    expect(third.statusCode, third.body).toBe(409);
    expect(third.json()).toMatchObject({ code: "LESSON_ATTEMPTS_EXHAUSTED" });

    const reward = await pool.query(
      "select count(*)::int as count, coalesce(sum(points), 0)::int as points from reward_events where learner_id = $1 and source_type = 'lesson_part'",
      [DEMO_IDS.learner]
    );
    expect(reward.rows[0]?.count).toBe(1);
    expect(reward.rows[0]?.points).toBe(4);
  });

  it("rejects one-word self-writing and sends valid self-writing to manual fallback without completing it", async () => {
    const lessonId = DEMO_IDS.lessons[1];
    await completeStudy(lessonId);
    const rejectedRequestId = "30000000-0000-4000-8000-000000000101";
    const rejected = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/writing/attempts`, headers: { cookie },
      payload: { requestId: rejectedRequestId, evidence: { answer: "Hello" } }
    });
    expect(rejected.statusCode, rejected.body).toBe(422);
    expect(rejected.json()).toEqual({ code: "LESSON_WRITING_TOO_SHORT", minimumWords: 2 });
    const rejectedRows = await pool.query(
      "select count(*)::int as count from lesson_part_attempts where learner_id = $1 and request_key = $2",
      [DEMO_IDS.learner, rejectedRequestId]
    );
    expect(rejectedRows.rows[0]?.count).toBe(0);

    const accepted = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/writing/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000102", evidence: { answer: "Hello team" } }
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json()).toMatchObject({
      lessonId, partCode: "writing", evidence: { answer: "Hello team", attempts: 1, status: "submitted", score: 0 }
    });
    expect(accepted.json().progress.completedPartCodes).not.toContain("writing");
  });

  it("counts a persisted Speaking upload while keeping it in submitted review state", async () => {
    const lessonId = DEMO_IDS.lessons[1];
    await completeStudy(lessonId);
    const submitted = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/speaking/attempts`, headers: { cookie },
      payload: {
        requestId: "30000000-0000-4000-8000-000000000105",
        evidence: { artifactKey: "assessment-audio/learner/speaking.webm" }
      }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ evidence: { status: "submitted", artifactKey: "assessment-audio/learner/speaking.webm" } });
    expect(submitted.json().progress.completedPartCodes).toContain("speaking");

    await pool.query(
      `update progress_records
       set evidence = jsonb_set(evidence, '{completedPartCodes}', (evidence->'completedPartCodes') - 'speaking')
       where learner_id = $1 and lesson_id = $2`,
      [DEMO_IDS.learner, lessonId]
    );
    const reloaded = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(reloaded.statusCode, reloaded.body).toBe(200);
    expect(reloaded.json().progress.completedPartCodes).toContain("speaking");
  });

  it("records translation viewing without consuming an attempt or completing the part", async () => {
    const lessonId = DEMO_IDS.lessons[0];
    await completeStudy(lessonId);
    const earlyTranslation = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/writing/attempts`, headers: { cookie },
      payload: { requestId: "30000000-0000-4000-8000-000000000103", evidence: { translated: true } }
    });
    expect(earlyTranslation.statusCode, earlyTranslation.body).toBe(409);
    expect(earlyTranslation.json()).toEqual({ code: "LESSON_TRANSLATION_NOT_AVAILABLE" });
    await pool.query(
      `update progress_records
       set status = 'in_progress', evidence = $3::jsonb, completed_at = null, updated_at = now()
       where learner_id = $1 and lesson_id = $2`,
      [DEMO_IDS.learner, lessonId, JSON.stringify({
        completedPartCodes: ["objective", "vocabulary", "grammar", "pronunciation"],
        evidence: { writing: { attempts: 1, status: "wrong_retry", answer: "wrong" } }
      })]
    );
    await pool.query(
      "delete from lesson_part_attempts where learner_id = $1 and lesson_id = $2 and part_code = 'writing'",
      [DEMO_IDS.learner, lessonId]
    );
    const before = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    const attemptsBefore = before.json().progress.evidence.writing?.attempts ?? 0;
    const persistedAttemptsBefore = await pool.query(
      "select count(*)::int as count from lesson_part_attempts where learner_id = $1 and lesson_id = $2 and part_code = 'writing'",
      [DEMO_IDS.learner, lessonId]
    );
    const translated = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/writing/attempts`, headers: { cookie },
      payload: {
        requestId: "30000000-0000-4000-8000-000000000104",
        evidence: { translated: true }
      }
    });

    expect(translated.statusCode, translated.body).toBe(200);
    expect(translated.json()).toMatchObject({
      lessonId, partCode: "writing", evidence: { attempts: attemptsBefore, translationViewed: true }
    });
    expect(translated.json().progress.completedPartCodes).not.toContain("writing");
    const attempts = await pool.query(
      "select count(*)::int as count from lesson_part_attempts where learner_id = $1 and lesson_id = $2 and part_code = 'writing'",
      [DEMO_IDS.learner, lessonId]
    );
    expect(attempts.rows[0]?.count).toBe(persistedAttemptsBefore.rows[0]?.count);
    await pool.query(
      "update progress_records set status = 'completed', completed_at = now(), updated_at = now() where learner_id = $1 and lesson_id = $2",
      [DEMO_IDS.learner, lessonId]
    );
  });

  it("persists exhaustion and translation, and keeps an appeal as terminal lesson progress", async () => {
    const lessonId = DEMO_IDS.lessons[1];
    await completeStudy(lessonId);
    const prematureAppeal = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/word_class/appeals`, headers: { cookie },
      payload: { reason: "Chỉ được kháng nghị sau khi đã hết hai lượt làm bài." }
    });
    expect(prematureAppeal.statusCode, prematureAppeal.body).toBe(409);
    expect(prematureAppeal.json()).toEqual({ code: "LESSON_APPEAL_NOT_AVAILABLE" });
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
    expect(translated.json()).toMatchObject({ evidence: { status: "wrong_exhausted", attempts: 2, translationViewed: true } });
    expect(translated.json().progress.completedPartCodes).toContain("reading");

    const tooShort = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/appeals`, headers: { cookie },
      payload: { reason: "abcd" }
    });
    expect(tooShort.statusCode, tooShort.body).toBe(400);

    const appeal = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/appeals`, headers: { cookie },
      payload: { reason: "Đáp án trong bài nghe không rõ." }
    });
    expect(appeal.statusCode, appeal.body).toBe(200);
    expect(appeal.json()).toMatchObject({ partCode: "reading", status: "pending", evidence: { status: "appealed" } });
    expect(appeal.json().progress.completedPartCodes).toContain("reading");

    const completedPartCodes = [
      "objective", "vocabulary", "grammar", "pronunciation",
      "listening", "reading", "writing", "word_class", "word_use", "speaking"
    ];
    const completionEvidence = {
      ...appeal.json().progress.evidence,
      listening: { attempts: 1, status: "correct", answer: "A" },
      writing: { attempts: 1, status: "correct", answer: "A" },
      word_class: { attempts: 1, status: "correct", answer: "A" },
      word_use: { attempts: 1, status: "correct", answer: "A" },
      speaking: { attempts: 1, status: "correct", artifactKey: "lesson-audio/speaking.webm" }
    };
    await pool.query(
      `update progress_records set status = 'in_progress', evidence = $3::jsonb, completed_at = null, updated_at = now()
       where learner_id = $1 and lesson_id = $2`,
      [DEMO_IDS.learner, lessonId, JSON.stringify({ completedPartCodes, evidence: completionEvidence })]
    );
    const completion = await app.inject({
      method: "PUT", url: `/api/v1/lessons/${lessonId}/progress`, headers: { cookie },
      payload: { completedPartCodes: [], evidence: {}, markComplete: true }
    });
    expect(completion.statusCode, completion.body).toBe(200);
    expect(completion.json().status).toBe("completed");

    await pool.query(
      "update lesson_part_appeals set status = 'accepted', resolved_at = now() where learner_id = $1 and lesson_id = $2 and part_code = 'reading'",
      [DEMO_IDS.learner, lessonId]
    );
    const repeated = await app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/reading/appeals`, headers: { cookie },
      payload: { reason: "Không được tạo một kháng nghị thứ hai cho cùng phần." }
    });
    expect(repeated.statusCode, repeated.body).toBe(200);
    expect(repeated.json()).toMatchObject({ partCode: "reading", status: "accepted" });
    const appealCount = await pool.query(
      "select count(*)::int as count from lesson_part_appeals where learner_id = $1 and lesson_id = $2 and part_code = 'reading'",
      [DEMO_IDS.learner, lessonId]
    );
    expect(appealCount.rows[0]?.count).toBe(1);

    // Legacy/local records may contain the persisted appeal but not the part code
    // because the appeal was created before appealed parts counted as complete.
    await pool.query(
      `update progress_records
       set status = 'in_progress', evidence = jsonb_set(
         jsonb_set(evidence, '{completedPartCodes}', (evidence->'completedPartCodes') - 'reading'),
         '{evidence,reading,status}', '"wrong_exhausted"'::jsonb
       ), completed_at = null, updated_at = now()
       where learner_id = $1 and lesson_id = $2`,
      [DEMO_IDS.learner, lessonId]
    );

    const reloaded = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(reloaded.json().progress.evidence.reading).toMatchObject({ status: "appealed", translationViewed: true });
    expect(reloaded.json().progress.completedPartCodes).toContain("reading");
  });
});
