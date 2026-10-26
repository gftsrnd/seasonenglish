import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assessmentGradingInputSchema } from "@e4s/ai";
import { migrateDatabase, placementDefinition, resetPublicSchema, seedDemo, syncCanonicalAssessmentBlueprints } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const learnerId = "00000000-0000-4000-8000-000000000164";
const staleLearnerId = "00000000-0000-4000-8000-000000000165";
const staleAttemptId = "00000000-0000-4000-8000-000000009165";

function legacyPlacementDefinition() {
  const legacy = structuredClone(placementDefinition);
  legacy.version = 1;
  const listening = legacy.sections.find((section) => section.code === "listening")!;
  const partA = listening.groups.find((group) => group.key === "LA")!;
  const partB = listening.groups.find((group) => group.key === "LB")!;
  const moved = partB.tasks.find((task) => task.key === "LB_Q9")!;
  partB.tasks = partB.tasks.filter((task) => task.key !== "LB_Q9");
  partA.tasks.splice(3, 0, { ...moved, key: "LA_3" });
  partA.title = "Part A – Questions 1–5";
  partA.instruction = "Nghe thông báo và trả lời câu 1–5.";
  partB.title = "Part B – Questions 6–10";
  partB.instruction = "Nghe cuộc trao đổi và trả lời câu 6–10.";
  return legacy;
}

describe("placement Listening 2 question 9 scoring path", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let capturedAssessmentInput: unknown;
  const runTask = vi.fn(async (_taskName: string, input: unknown) => {
    capturedAssessmentInput = input;
    return ({
    output: {
      writingScore: 10,
      speakingScore: 10,
      suggestedLevel: "A2",
      rationale: "Điểm khách quan và phần tự luận phù hợp mức A2.",
      monthlyGoal: "Luyện phản hồi công việc ngắn mỗi ngày."
    },
    metadata: {
      traceId: "trace-listening-q9",
      taskId: "assessment_scoring",
      provider: "fixture",
      model: "fixture-model",
      attempts: 1,
      latencyMs: 1,
      inputHash: "b".repeat(64),
      schemaValid: true as const,
      usage: {}
    }
    });
  });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: { runTask } });
  let cookie = "";
  let staleCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "update assessment_versions set blueprint = $2::jsonb where id = $1",
        [DEMO_IDS.placementVersion, JSON.stringify(legacyPlacementDefinition())]
      );
      await syncCanonicalAssessmentBlueprints(client);
      await client.query(
        "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Placement Q9', 'placement-q9@e4s.local')",
        [learnerId, DEMO_IDS.organization]
      );
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [learnerId, await createPinHash("164164")]);
      await client.query(
        "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Stale Placement', 'stale-placement@e4s.local')",
        [staleLearnerId, DEMO_IDS.organization]
      );
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [staleLearnerId, await createPinHash("165165")]);
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "placement-q9@e4s.local", pin: "164164" }
    });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const staleLogin = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "stale-placement@e4s.local", pin: "165165" }
    });
    expect(staleLogin.statusCode, staleLogin.body).toBe(200);
    staleCookie = String(staleLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("persists question 9 once under Listening 2, scores 20/20 once, and carries that objective result into AI grading", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    const listening = placementDefinition.sections.find((section) => section.code === "listening")!;
    const entries = listening.groups.flatMap((group) => group.tasks.map((task) => ({ groupKey: group.key, task })));
    expect(entries[8]).toMatchObject({ groupKey: "LB", task: { key: "LB_Q9" } });

    for (const { task } of entries) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/v1/assessment-attempts/${attemptId}/responses/listening/${task.key}`,
        headers: { cookie },
        payload: { value: task.correctAnswer, evidenceType: "choice" }
      });
      expect(response.statusCode, response.body).toBe(200);
    }

    const persisted = await pool.query<{ section: string; task_key: string }>(
      "select section, task_key from assessment_responses where attempt_id = $1 and task_key = 'LB_Q9'",
      [attemptId]
    );
    expect(persisted.rows).toEqual([{ section: "listening", task_key: "LB_Q9" }]);

    for (const section of ["listening", "reading", "writing"] as const) {
      const advanced = await app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${attemptId}/sections/${section}/complete`,
        headers: { cookie },
        payload: {}
      });
      expect(advanced.statusCode, advanced.body).toBe(200);
    }
    const submitted = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/submit`,
      headers: { cookie },
      payload: {}
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({
      attempt: {
        sectionScores: { listening: 20, reading: 0, writing: 10, speaking: 10 },
        totalScore: 40,
        suggestedLevel: "A2"
      }
    });

    expect(runTask).toHaveBeenCalledOnce();
    const aiInput = assessmentGradingInputSchema.parse(capturedAssessmentInput);
    expect(aiInput.objectiveScores.listening).toMatchObject({ score: 20, maxScore: 20, answered: 15, total: 15 });
    expect(aiInput.objectiveScores.listening.groups.find((group) => group.groupKey === "LB")?.taskKeys).toContain("LB_Q9");
    expect(aiInput.objectiveScores.listening.groups.flatMap((group) => group.taskKeys).filter((key) => key === "LB_Q9")).toHaveLength(1);

    const scoreRows = await pool.query<{ section: string; score: string }>(
      "select section, score::text from assessment_scores where attempt_id = $1 order by section",
      [attemptId]
    );
    expect(scoreRows.rows.map((row) => ({ section: row.section, score: Number(row.score) }))).toEqual([
      { section: "listening", score: 20 },
      { section: "reading", score: 0 },
      { section: "speaking", score: 10 },
      { section: "writing", score: 10 }
    ]);
  }, 30_000);

  it("migrates a pre-fix active attempt without losing responses or persisted listening plays", async () => {
    const latest = await pool.query<{ id: string }>(
      `select av.id from assessment_versions av
       join assessment_definitions ad on ad.id = av.definition_id
       where ad.assessment_key = 'placement-a' and av.status = 'published'`
    );
    expect(latest.rows[0]?.id).toBeTruthy();
    await pool.query(
      `insert into assessment_attempts
         (id, assessment_version_id, learner_id, status, current_section, timing_state, started_at, updated_at)
       values ($1, $2, $3, 'in_progress', 'listening', $4::jsonb, now(), now())`,
      [staleAttemptId, DEMO_IDS.placementVersion, staleLearnerId, JSON.stringify({ sections: { listening: { startedAt: new Date().toISOString(), endsAt: new Date(Date.now() + 10 * 60_000).toISOString() } } })]
    );
    await pool.query(
      `insert into assessment_responses (id, attempt_id, section, task_key, response) values
       ('00000000-0000-4000-8000-000000008161', $1, 'listening', 'LA_1', '{"value":"B","evidenceType":"choice"}'::jsonb),
       ('00000000-0000-4000-8000-000000008162', $1, 'listening', 'LA_3', '{"value":"B","evidenceType":"choice"}'::jsonb)`,
      [staleAttemptId]
    );
    await pool.query(
      `insert into assessment_audio_plays (id, attempt_id, section, group_key, play_count) values
       ('00000000-0000-4000-8000-000000008163', $1, 'listening', 'LA', 1),
       ('00000000-0000-4000-8000-000000008164', $1, 'listening', 'LB', 1)`,
      [staleAttemptId]
    );

    const resumed = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie: staleCookie } });
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(resumed.json()).toMatchObject({
      definition: { version: 3 },
      attempt: {
        id: staleAttemptId,
        audioPlayCounts: { "listening:LA": 1, "listening:LB": 1 }
      }
    });
    const view = resumed.json();
    expect(view.definition.sections[0].groups[0].instruction).toContain("1–4");
    expect(view.attempt.responses).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskKey: "LA_1", value: "B" }),
      expect.objectContaining({ taskKey: "LB_Q9", value: "B" })
    ]));
    expect(view.attempt.responses.some((response: { taskKey: string }) => response.taskKey === "LA_3")).toBe(false);

    const persisted = await pool.query<{ assessment_version_id: string; task_key: string }>(
      `select aa.assessment_version_id, ar.task_key
       from assessment_attempts aa join assessment_responses ar on ar.attempt_id = aa.id
       where aa.id = $1 order by ar.task_key`,
      [staleAttemptId]
    );
    expect(persisted.rows).toEqual([
      { assessment_version_id: latest.rows[0]!.id, task_key: "LA_1" },
      { assessment_version_id: latest.rows[0]!.id, task_key: "LB_Q9" }
    ]);

    const secondPlay = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${staleAttemptId}/sections/listening/groups/LA/audio-play`,
      headers: { cookie: staleCookie }
    });
    expect(secondPlay.statusCode, secondPlay.body).toBe(200);
    expect(secondPlay.json()).toEqual({ playCount: 2, remaining: 0 });

    const refreshed = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie: staleCookie } });
    expect(refreshed.statusCode, refreshed.body).toBe(200);
    expect(refreshed.json().attempt.audioPlayCounts["listening:LA"]).toBe(2);

    const blocked = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${staleAttemptId}/sections/listening/groups/LA/audio-play`,
      headers: { cookie: staleCookie }
    });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "ASSESSMENT_AUDIO_PLAY_LIMIT_REACHED" });
  }, 30_000);
});
