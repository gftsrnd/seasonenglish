import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const goodCoachOutput = {
  relevant: true,
  relevanceNote: "",
  reply: "Tell me one more detail about the problem and how you solved it.",
  rubric: { meaning: 4, vocabulary: 4, grammar: 4 },
  suggestions: [],
  correctedText: "",
  usedWords: ["colleague"]
};

describe("learner lifecycle persistence", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: {
    runTask: async () => ({
      output: goodCoachOutput,
      metadata: {
        traceId: `trace-lifecycle-${crypto.randomUUID()}`,
        taskId: "coach_dialogue",
        provider: "fixture",
        model: "fixture-model",
        attempts: 1,
        latencyMs: 1,
        inputHash: "a".repeat(64),
        schemaValid: true as const,
        usage: {}
      }
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

  afterAll(async () => { await app.close(); await pool.end(); });

  it("persists the learner monthly goal and returns it on Home", async () => {
    const saved = await app.inject({
      method: "PATCH", url: "/api/v1/learner/monthly-goal", headers: { cookie },
      payload: { monthlyGoal: "Speak clearly in two project meetings." }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ monthlyGoal: "Speak clearly in two project meetings." });

    const home = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie } });
    expect(home.statusCode, home.body).toBe(200);
    expect(home.json()).toMatchObject({ monthlyGoal: "Speak clearly in two project meetings." });
  });

  it("unlocks one real Coach vocabulary item and keeps it unlocked after reload", async () => {
    const before = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie } });
    expect(before.statusCode, before.body).toBe(200);
    const word = before.json().vocabulary.find((item: { opened: boolean }) => !item.opened)?.word;
    expect(word).toEqual(expect.any(String));

    const unlocked = await app.inject({
      method: "POST", url: `/api/v1/coach/vocabulary/${encodeURIComponent(word)}/unlock`, headers: { cookie }
    });
    expect(unlocked.statusCode, unlocked.body).toBe(200);
    expect(unlocked.json().vocabulary).toEqual(expect.arrayContaining([
      expect.objectContaining({ word, opened: true })
    ]));

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/coach", headers: { cookie } });
    expect(reloaded.json().vocabulary).toEqual(expect.arrayContaining([
      expect.objectContaining({ word, opened: true })
    ]));
  });

  it("creates one challenge result and one pending level request in the pass transaction", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/levelup/start", headers: { cookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);

    for (let index = 0; index < 6; index += 1) {
      const result = await app.inject({
        method: "POST", url: "/api/v1/challenge/messages", headers: { cookie },
        payload: { requestId: crypto.randomUUID(), message: `I handled the project issue in step ${index + 1}.` }
      });
      expect(result.statusCode, result.body).toBe(200);
    }

    const challenge = await app.inject({ method: "GET", url: "/api/v1/challenge", headers: { cookie } });
    expect(challenge.statusCode, challenge.body).toBe(200);
    expect(challenge.json()).toMatchObject({
      phase: "complete",
      progress: { complete: true, passed: true },
      result: { passed: true },
      request: { status: "pending" }
    });
    const stored = await pool.query<{ results: string; requests: string }>(
      `select
         (select count(*)::text from level_up_challenge_results where assessment_attempt_id = $1) as results,
         (select count(*)::text from assessment_decisions where attempt_id = $1 and status = 'suggested') as requests`,
      [started.json().attempt.id]
    );
    expect(stored.rows[0]).toEqual({ results: "1", requests: "1" });
  });

  it("persists a weekly-practice appeal and returns the pending hidden state", async () => {
    await pool.query(
      `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
       select gen_random_uuid(), $1, l.id, 'completed', 80, '{}'::jsonb, now(), now()
       from lessons l
       on conflict (learner_id, lesson_id) do update set status = 'completed', completed_at = now()`,
      [DEMO_IDS.learner]
    );
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId: crypto.randomUUID(), text: "I explain my weekly project plan to my colleagues clearly." }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    const submissionId = submitted.json().submission.id as string;
    await pool.query(
      `update practice_submissions set status = 'reviewed', score = '{"total": 70}'::jsonb,
         feedback = '{"message":"Please review the rubric."}'::jsonb where id = $1`,
      [submissionId]
    );

    const appealed = await app.inject({
      method: "POST", url: `/api/v1/engagement/practice/${submissionId}/appeals`, headers: { cookie },
      payload: { reason: "Please review the grading against the submitted evidence." }
    });
    expect(appealed.statusCode, appealed.body).toBe(200);
    expect(appealed.json()).toMatchObject({
      submission: { id: submissionId },
      appeal: { status: "pending", submissionId }
    });
  });

  it("persists level-up celebration acknowledgement so a reload does not reopen it", async () => {
    const changedAt = new Date().toISOString();
    await pool.query("update enrollments set cefr = 'B1', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `update learner_profiles
       set profile = jsonb_set(
         profile,
         '{_operator}',
         jsonb_build_object('levelHistory', jsonb_build_array(jsonb_build_object(
           'from', 'A2', 'to', 'B1', 'changedAt', $2::text, 'mode', 'direct',
           'reason', 'Đã hoàn thành chặng học', 'evidence', 'lifecycle test', 'changedBy', $3::text
         )))
       )
       where user_id = $1`,
      [DEMO_IDS.learner, changedAt, DEMO_IDS.operator]
    );

    const home = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie } });
    expect(home.statusCode, home.body).toBe(200);
    expect(home.json().rewardAnnouncement).toMatchObject({ kind: "new-level-announcement", level: "B1" });
    const announcementId = home.json().rewardAnnouncement.announcementId as string;
    expect(announcementId).toEqual(expect.any(String));

    const acknowledged = await app.inject({
      method: "POST", url: "/api/v1/learner/reward-announcement/acknowledge", headers: { cookie },
      payload: { announcementId }
    });
    expect(acknowledged.statusCode, acknowledged.body).toBe(200);
    expect(acknowledged.json()).toMatchObject({ acknowledged: true, announcementId });

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie } });
    expect(reloaded.statusCode, reloaded.body).toBe(200);
    expect(reloaded.json().rewardAnnouncement).toMatchObject({ kind: "normal" });
  });
});
