import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("assessment API preserves the one-screen flow and server evidence", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";
  let freshCookie = "";
  let operatorCookie = "";
  let managerCookie = "";
  let levelUpAttemptId = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ('00000000-0000-4000-8000-000000000109', $1, 'learner', 'Học viên Mới', 'fresh@e4s.local')`,
        [DEMO_IDS.organization]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)",
        [
          DEMO_IDS.learner, await createCredentialHash("learner-pass"),
          "00000000-0000-4000-8000-000000000109", await createCredentialHash("fresh-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", password: "learner-pass" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const freshLogin = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "fresh@e4s.local", password: "fresh-pass" }
    });
    freshCookie = String(freshLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const operatorLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" }
    });
    operatorCookie = String(operatorLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns preparation for a fresh placement attempt", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie: freshCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      screenState: "preparation",
      definition: { kind: "placement", totalMinutes: 70, totalScore: 100 },
      attempt: null
    });
  });

  it("starts, saves and resumes Listening on the same assessment attempt", async () => {
    const started = await app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: freshCookie }, payload: {} });
    expect(started.statusCode, started.body).toBe(201);
    expect(started.json()).toMatchObject({ screenState: "listening", attempt: { status: "in_progress", currentSection: "listening" } });

    const attemptId = started.json().attempt.id as string;
    const saved = await app.inject({
      method: "PUT",
      url: `/api/v1/assessment-attempts/${attemptId}/responses/listening/LA_0`,
      headers: { cookie: freshCookie },
      payload: { value: "B", evidenceType: "choice" }
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const resumed = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie: freshCookie } });
    expect(resumed.json()).toMatchObject({
      screenState: "listening",
      attempt: { id: attemptId, responses: [{ section: "listening", taskKey: "LA_0", value: "B", evidenceType: "choice" }] }
    });
  });

  it("rejects another learner's attempt instead of trusting an id from the browser", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/assessment-attempts/${DEMO_IDS.placementAttempt}/responses/listening/LA_0`,
      headers: { cookie: freshCookie },
      payload: { value: "B", evidenceType: "choice" }
    });
    expect(response.statusCode).toBe(409);
  });

  it("returns the same submitted attempt when two final submissions race", async () => {
    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie: freshCookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;

    for (const section of ["listening", "reading", "writing"] as const) {
      const advanced = await app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${attemptId}/sections/${section}/complete`,
        headers: { cookie: freshCookie },
        payload: {}
      });
      expect(advanced.statusCode, advanced.body).toBe(200);
    }

    const submit = () => app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/submit`,
      headers: { cookie: freshCookie },
      payload: {}
    });
    const responses = await Promise.all([submit(), submit()]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    for (const response of responses) {
      expect(response.json()).toMatchObject({
        screenState: "pending",
        attempt: { id: attemptId, status: "pending_review" }
      });
    }

    const attempts = await pool.query<{ count: string }>(
      `select count(*)::text as count
       from assessment_attempts
       where learner_id = $1 and id = $2`,
      ["00000000-0000-4000-8000-000000000109", attemptId]
    );
    expect(attempts.rows[0]?.count).toBe("1");
  });

  it("persists the two-listen limit on the server across concurrent clicks and reload", async () => {
    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/levelup/start", headers: { cookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    levelUpAttemptId = attemptId;
    const recordPlay = () => app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/sections/listening/groups/LA/audio-play`,
      headers: { cookie },
      payload: {}
    });

    const plays = await Promise.all([recordPlay(), recordPlay(), recordPlay()]);
    expect(plays.map((response) => response.statusCode).sort()).toEqual([200, 200, 409]);
    expect(plays.filter((response) => response.statusCode === 200)
      .map((response) => response.json().playCount).sort()).toEqual([1, 2]);
    expect(plays.find((response) => response.statusCode === 409)?.json()).toMatchObject({
      code: "ASSESSMENT_AUDIO_PLAY_LIMIT_REACHED"
    });

    const resumed = await app.inject({
      method: "GET", url: "/api/v1/assessments/levelup", headers: { cookie }
    });
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(resumed.json()).toMatchObject({
      attempt: { id: attemptId, audioPlayCounts: { "listening:LA": 2 } }
    });

    const overview = await app.inject({
      method: "GET", url: "/api/v1/assessment-reviews/overview", headers: { cookie: operatorCookie }
    });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({
      levelSignals: {
        inFlow: [expect.objectContaining({
          learnerId: DEMO_IDS.learner,
          currentLevel: "A2",
          targetLevel: "B1",
          phase: "testing",
          assessmentAttemptId: attemptId,
          challengeAttemptId: null,
          metrics: "đang làm bài thi"
        })]
      }
    });
  });

  it("lets the manager administer a submitted level-up attempt and records the approved level", async () => {
    for (const section of ["listening", "reading", "writing"] as const) {
      const advanced = await app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${levelUpAttemptId}/sections/${section}/complete`,
        headers: { cookie }, payload: {}
      });
      expect(advanced.statusCode, advanced.body).toBe(200);
    }
    const submitted = await app.inject({
      method: "POST", url: `/api/v1/assessment-attempts/${levelUpAttemptId}/submit`, headers: { cookie }, payload: {}
    });
    expect(submitted.statusCode, submitted.body).toBe(200);

    const queue = await app.inject({
      method: "GET", url: "/api/v1/assessment-reviews/pending", headers: { cookie: operatorCookie }
    });
    expect(queue.statusCode, queue.body).toBe(200);
    expect(queue.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ attemptId: levelUpAttemptId, learnerName: "Nguyễn Minh Anh", kind: "level-up" })
    ]));
    const managerQueue = await app.inject({
      method: "GET", url: "/api/v1/assessment-reviews/pending", headers: { cookie: managerCookie }
    });
    expect(managerQueue.statusCode, managerQueue.body).toBe(200);
    expect(managerQueue.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ attemptId: levelUpAttemptId })
    ]));
    const overview = await app.inject({
      method: "GET", url: "/api/v1/assessment-reviews/overview", headers: { cookie: operatorCookie }
    });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({
      pendingAssessments: [expect.objectContaining({ kind: "placement", learnerId: "00000000-0000-4000-8000-000000000109" })],
      pendingLevelUp: [expect.objectContaining({ attemptId: levelUpAttemptId, kind: "level-up" })],
      approvedLearners: [expect.objectContaining({ learnerId: DEMO_IDS.learner, currentLevel: "A2", placementScore: 55 })],
      unassessedLearners: [],
      inProgressLearners: [expect.objectContaining({ learnerId: "00000000-0000-4000-8000-000000000109" })],
      levelSignals: {
        inFlow: [expect.objectContaining({
          learnerId: DEMO_IDS.learner,
          currentLevel: "A2",
          targetLevel: "B1",
          phase: "ungraded",
          assessmentAttemptId: levelUpAttemptId,
          challengeAttemptId: null
        })]
      }
    });

    const levelForms = await app.inject({
      method: "GET", url: "/api/v1/assessment-level-forms", headers: { cookie: operatorCookie }
    });
    expect(levelForms.statusCode, levelForms.body).toBe(200);
    expect(levelForms.json()).toEqual([
      expect.objectContaining({ targetLevel: "A2", publishedForm: null }),
      expect.objectContaining({ targetLevel: "B1", publishedForm: expect.objectContaining({ title: "Đề thi lên mức B1", listeningTaskCount: 5, readingTaskCount: 5 }) }),
      expect.objectContaining({ targetLevel: "B2", publishedForm: null }),
      expect.objectContaining({ targetLevel: "C1", publishedForm: null })
    ]);
    const managerDecision = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${levelUpAttemptId}/decision`,
      headers: { cookie: managerCookie },
      payload: { status: "approved", approvedLevel: "B1", reason: "Đủ bằng chứng theo rubric." }
    });
    expect(managerDecision.statusCode, managerDecision.body).toBe(200);
    expect(managerDecision.json()).toMatchObject({
      attemptId: levelUpAttemptId,
      status: "approved",
      approvedLevel: "B1",
      decidedBy: DEMO_IDS.manager
    });
    const repeatedDecision = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${levelUpAttemptId}/decision`,
      headers: { cookie: managerCookie },
      payload: { status: "approved", approvedLevel: "B1", reason: "Đủ bằng chứng theo rubric." }
    });
    expect(repeatedDecision.statusCode, repeatedDecision.body).toBe(200);
    expect(repeatedDecision.json()).toMatchObject({ attemptId: levelUpAttemptId, status: "approved", approvedLevel: "B1" });

    const stored = await pool.query<{ attempt_status: string; approved_level: string; cefr: string }>(
      `select aa.status as attempt_status, ad.approved_level, e.cefr
       from assessment_attempts aa
       join assessment_decisions ad on ad.attempt_id = aa.id
       join enrollments e on e.learner_id = aa.learner_id
       where aa.id = $1`,
      [levelUpAttemptId]
    );
    expect(stored.rows[0]).toEqual({ attempt_status: "approved", approved_level: "B1", cefr: "B1" });
  });
});
