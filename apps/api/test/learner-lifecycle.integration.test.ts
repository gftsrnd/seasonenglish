import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levelUpDefinition, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

// Current Coach dialogue output: an evaluated, counted turn that used one lesson word.
const goodCoachOutput = {
  evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Đúng trọng tâm." },
  seasonReply: "Thanks for explaining. How did you solve the problem?",
  seasonReplyTranslation: "Cảm ơn bạn đã giải thích. Bạn đã giải quyết vấn đề như thế nào?",
  nextQuestion: "How did you solve the problem?",
  nextQuestionTranslation: "Bạn đã giải quyết vấn đề như thế nào?",
  rubric: {
    meaning: { score: 4, evidence: "Câu trả lời rõ ý.", improvement: "" },
    vocabulary: { score: 4, evidence: "Từ vựng phù hợp ngữ cảnh.", improvement: "" },
    grammar: { score: 4, evidence: "Ngữ pháp chính xác.", improvement: "" }
  },
  corrections: [],
  correctedText: "",
  suggestedAnswer: { text: "Hãy kể bạn đã làm gì đầu tiên.", translation: "" },
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
        [DEMO_IDS.learner, await createPinHash("123456")]
      );
      await client.query("update enrollments set cefr = 'A2', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
      // Coach vocabulary comes from the completed lessons of the learner's published, approved month.
      const monthId = crypto.randomUUID();
      const frameworkId = crypto.randomUUID();
      await client.query(
        `insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status)
         select $1, $2, to_char(system_date, 'YYYY-MM'), (date_trunc('month', system_date) + interval '1 month - 1 day')::date, 1, 'approved'
         from organization_system_date($2) system_date
         on conflict (organization_id, month) do update set brief_status = 'approved'`, [monthId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, published_at, published_on)
         select $1, pm.id, 'A2', 'approved', '{"daySpecs":[{"lessonNumber":1,"kind":"new"}]}', now(), (pm.month || '-01')::date
         from program_months pm where pm.organization_id = $2 and pm.month = to_char(organization_system_date($2), 'YYYY-MM')`,
        [frameworkId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status)
         values (gen_random_uuid(), $1, 1, organization_system_date($2), $3, '', 'approved')`,
        [frameworkId, DEMO_IDS.organization, DEMO_IDS.lessons[0]]
      );
      await client.query(
        `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
         values (gen_random_uuid(), $1, $2, 'completed', 100, '{}'::jsonb, now(), now())
         on conflict (learner_id, lesson_id) do update set status = 'completed', completed_at = now()`,
        [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
      );
      // A published B1 level-up form for the A2 learner (the demo seed no longer publishes one).
      await client.query(
        `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
         values ($1, $2, 'level-up-b1-lifecycle-test', 'level_up', 'Đề lên B1 (kiểm thử)')`,
        [DEMO_IDS.levelUpDefinition, DEMO_IDS.organization]
      );
      await client.query(
        `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
         values ($1, $2, 1, 'published', $3::jsonb, now())`,
        [DEMO_IDS.levelUpVersion, DEMO_IDS.levelUpDefinition, JSON.stringify(levelUpDefinition)]
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

    expect(word).toBe("colleague");
    // A word opens when the learner uses it in a counted Coach turn (there is no manual unlock route).
    const unlocked = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie },
      payload: { requestId: crypto.randomUUID(), message: `My ${word} and I solved the problem together.` }
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
    // Readiness comes from six counted monthly cycles; the staff exception makes the next level available now.
    await pool.query(
      `insert into level_up_overrides (id, organization_id, learner_id, from_cefr, target_cefr, reason, granted_by)
       values (gen_random_uuid(), $1, $2, 'A2', 'B1', 'Kiểm thử vòng đời học viên', $3)`,
      [DEMO_IDS.organization, DEMO_IDS.learner, DEMO_IDS.operator]
    );
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/levelup/start", headers: { cookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);
    // The six-turn challenge opens only after the level-up exam has passed.
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'pending_review', current_section = null, submitted_at = now() where id = $1", [attemptId]);
    await pool.query(
      `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
       select gen_random_uuid(), $1, section, 18, '{}'::jsonb, 'human' from unnest(array['listening', 'reading', 'writing', 'speaking']) section`,
      [attemptId]
    );

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
