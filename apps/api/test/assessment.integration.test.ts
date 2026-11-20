import type { AssessmentLevelFormDetailView } from "@e4s/contracts";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const freshLearnerId = "00000000-0000-4000-8000-000000000109";
const completeProfile = {
  goals: ["email"], environmentUse: "weekly", familyUse: "never", habits: ["music"],
  learningStyles: ["listening"], durationMinutes: 10, device: "both", selfLevel: "A1"
};
const levelFormTitle = "Đề thi lên mức B1 — kiểm tra tích hợp";

describe("assessment API preserves the one-screen flow and server evidence", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";
  let freshCookie = "";
  let operatorCookie = "";
  let managerCookie = "";
  let levelUpVersionId = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, 'learner', 'Học viên Mới', 'fresh@e4s.local')`,
        [freshLearnerId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into learner_profiles (user_id, profile, completed_at)
         values ($1, $2::jsonb, now())`,
        [freshLearnerId, JSON.stringify({ ...completeProfile, fullName: "Học viên Mới", email: "fresh@e4s.local" })]
      );
      await client.query(
        `insert into organization_settings (organization_id, configuration)
         values ($1, '{"simulatedSystemDate":"2026-11-10"}')
         on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
        [DEMO_IDS.organization]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)",
        [
          DEMO_IDS.learner, await createPinHash("123456"),
          freshLearnerId, await createPinHash("654321"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("test-manager-pw")
        ]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const freshLogin = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "fresh@e4s.local", pin: "654321" }
    });
    freshCookie = String(freshLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const operatorLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" }
    });
    operatorCookie = String(operatorLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "test-manager-pw" }
    });
    managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const headers = { cookie: operatorCookie };
    const draft = await app.inject({ method: "POST", url: "/api/v1/assessment-level-forms/B1/manual-draft", headers });
    expect(draft.statusCode, draft.body).toBe(201);
    levelUpVersionId = draft.json().versionId;
    const detail = await app.inject({ url: `/api/v1/assessment-level-forms/${levelUpVersionId}`, headers });
    expect(detail.statusCode, detail.body).toBe(200);
    const sections = detail.json<AssessmentLevelFormDetailView>().sections.map(section => ({
      ...section,
      groups: section.groups.map(group => ({
        ...group,
        ...(group.stimulus?.type === "audio_script" ? { stimulus: {
          ...group.stimulus, audioSrc: "/media/audio/placement-listening-LA.mp3",
          lines: [{ speaker: "Team lead", text: "Please arrive at the training room at nine." }]
        } } : group.stimulus?.type === "passage" ? { stimulus: { ...group.stimulus, text: "Staff training starts at nine in the training room." } } : {}),
        tasks: group.tasks.map(task => ({
          ...task,
          prompt: `Explain the staff training schedule for item ${task.key}.`,
          ...(task.responseType === "single_choice" ? {
            options: ["Nine", "Ten", "Eleven", "Twelve"].map((label, index) => ({ value: "ABCD"[index]!, label })),
            correctAnswer: "A"
          } : {})
        }))
      }))
    }));
    const saved = await app.inject({
      method: "PUT", url: `/api/v1/assessment-level-forms/${levelUpVersionId}`, headers,
      payload: { title: levelFormTitle, sections }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const published = await app.inject({ method: "POST", url: `/api/v1/assessment-level-forms/${levelUpVersionId}/publication`, headers, payload: { answersReviewed: true } });
    expect(published.statusCode, published.body).toBe(200);
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  const persistedLevelUpAttempt = () => repositories.assessments.startAttempt({
    learnerId: DEMO_IDS.learner, assessmentVersionId: levelUpVersionId, firstSection: "listening", durationMinutes: 15
  });

  it("requires a complete saved profile before starting a placement test", async () => {
    const registered = await app.inject({
      method: "POST", url: "/api/auth/learner/register",
      payload: { displayName: "Nguyễn Thị Lan", email: "placement-draft@example.test", pin: "135790" }
    });
    expect(registered.statusCode, registered.body).toBe(201);
    const auth = { cookie: String(registered.headers["set-cookie"]).split(";")[0] ?? "" };
    const start = () => app.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers: auth });
    const readProfile = () => app.inject({ method: "GET", url: "/api/v1/learner/profile", headers: auth });
    const saveDraft = async (profile: Record<string, unknown>) => {
      const current = await readProfile();
      expect(current.statusCode, current.body).toBe(200);
      const result = await app.inject({
        method: "PUT", url: "/api/v1/learner/profile/draft", headers: auth,
        payload: { version: current.json().version, ...profile }
      });
      expect(result.statusCode, result.body).toBe(200);
    };
    const before = await start();
    expect(before.statusCode, before.body).toBe(409);
    expect(before.json().code).toBe("PLACEMENT_PROFILE_INCOMPLETE");

    await saveDraft({ department: "Support" });
    expect((await start()).statusCode).toBe(409);
    await saveDraft(completeProfile);
    const allowed = await start();
    expect(allowed.statusCode, allowed.body).toBe(201);
  });

  it("returns preparation for a fresh placement attempt", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/assessments/placement", headers: { cookie: freshCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      screenState: "preparation",
      definition: { kind: "placement", totalMinutes: 75, totalScore: 100 },
      attempt: null
    });
  });

  it("returns canonical month metadata for monthly exam grouping", async () => {
    const definition = await pool.query<{ id: string }>(`insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
      values (gen_random_uuid(), $1, 'monthly-final-2026-11-a1', 'final', 'A title without a date') returning id`, [DEMO_IDS.organization]);
    const versions = await pool.query<{ id: string }>(`insert into assessment_versions (id, definition_id, version, status, blueprint)
      select gen_random_uuid(), $1, 1, 'draft', blueprint || '{"monthlyScope":{"month":"2026-11"}}'::jsonb
      from assessment_versions where id = $2 returning id`, [definition.rows[0]!.id, levelUpVersionId]);
    try {
      const response = await app.inject({ method: "GET", url: "/api/v1/assessment-form-previews/final", headers: { cookie: operatorCookie } });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().forms).toEqual(expect.arrayContaining([expect.objectContaining({ versionId: versions.rows[0]!.id, month: "2026-11" })]));
    } finally {
      await pool.query("delete from assessment_versions where definition_id=$1", [definition.rows[0]!.id]);
      await pool.query("delete from assessment_definitions where id=$1", [definition.rows[0]!.id]);
    }
  });

  it("returns persisted four-skill forms for the shared operator assessment viewer", async () => {
    const placement = await app.inject({ method: "GET", url: "/api/v1/assessment-form-previews/placement", headers: { cookie: operatorCookie } });
    expect(placement.statusCode, placement.body).toBe(200);
    expect(placement.json()).toMatchObject({
      kind: "placement",
      forms: [expect.objectContaining({
        kind: "placement", status: "published", editable: false, totalScore: 100,
        sections: expect.arrayContaining([
          expect.objectContaining({ code: "listening" }), expect.objectContaining({ code: "reading" }),
          expect.objectContaining({ code: "writing" }), expect.objectContaining({ code: "speaking" })
        ])
      })]
    });

    const passCourse = await app.inject({ method: "GET", url: "/api/v1/assessment-form-previews/pass_course", headers: { cookie: operatorCookie } });
    expect(passCourse.statusCode, passCourse.body).toBe(200);
    expect(passCourse.json()).toMatchObject({
      kind: "pass_course",
      forms: [expect.objectContaining({ kind: "pass_course", status: "published", editable: false, totalMinutes: 90, totalScore: 100 })]
    });

    const level = await app.inject({ method: "GET", url: "/api/v1/assessment-form-previews/level_up", headers: { cookie: operatorCookie } });
    expect(level.statusCode, level.body).toBe(200);
    expect(level.json()).toMatchObject({
      kind: "level_up",
      forms: [expect.objectContaining({
        versionId: levelUpVersionId, kind: "level_up", targetLevel: "B1", totalMinutes: 75, totalScore: 100,
        sections: expect.arrayContaining([
          expect.objectContaining({ code: "listening" }), expect.objectContaining({ code: "reading" }),
          expect.objectContaining({ code: "writing" }), expect.objectContaining({ code: "speaking" })
        ])
      })]
    });

    const learner = await app.inject({ method: "GET", url: "/api/v1/assessment-form-previews/placement", headers: { cookie } });
    expect(learner.statusCode).toBe(403);
  });

  it("keeps the monthly final locked before the exam date and publication", async () => {
    const view = await app.inject({ method: "GET", url: "/api/v1/assessments/monthly", headers: { cookie } });
    expect(view.statusCode, view.body).toBe(409);
    expect(view.json()).toEqual({ code: "MONTHLY_EXAM_LOCKED" });

    const start = await app.inject({ method: "POST", url: "/api/v1/assessments/monthly/start", headers: { cookie }, payload: {} });
    expect(start.statusCode, start.body).toBe(409);
    expect(start.json()).toEqual({ code: "MONTHLY_EXAM_LOCKED" });
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
      [freshLearnerId, attemptId]
    );
    expect(attempts.rows[0]?.count).toBe("1");
  });

  it("persists the two-listen limit on the server across concurrent clicks and reload", async () => {
    const startLevelUp = () => app.inject({
      method: "POST", url: "/api/v1/assessments/levelup/start", headers: { cookie }, payload: {}
    });
    const notReady = await startLevelUp();
    expect(notReady.statusCode, notReady.body).toBe(409);
    expect(notReady.json()).toEqual({ code: "LEVEL_UP_NOT_READY" });

    // The learner already entered this form when eligible. This test covers
    // resuming that persisted attempt and the server-side audio limit.
    const admitted = await persistedLevelUpAttempt();
    const started = await startLevelUp();
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    expect(attemptId).toBe(admitted.id);
    const recordPlay = () => app.inject({
      method: "POST",
      url: `/api/v1/assessment-attempts/${attemptId}/sections/listening/groups/L/audio-play`,
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
      attempt: { id: attemptId, audioPlayCounts: { "listening:L": 2 } }
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

  it("lets Manager review a submitted level-up and records only an Operator decision after the challenge", async () => {
    const { id: levelUpAttemptId } = await persistedLevelUpAttempt();
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
    expect(managerQueue.json()).toEqual(expect.arrayContaining([expect.objectContaining({ attemptId: levelUpAttemptId })]));
    const overview = await app.inject({
      method: "GET", url: "/api/v1/assessment-reviews/overview", headers: { cookie: operatorCookie }
    });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({
      pendingLevelUp: [expect.objectContaining({ attemptId: levelUpAttemptId, kind: "level-up" })],
      approvedLearners: [expect.objectContaining({ learnerId: DEMO_IDS.learner, currentLevel: "A2", placementScore: 55 })],
      unassessedLearners: [],
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
      expect.objectContaining({ targetLevel: "B1", publishedForm: expect.objectContaining({ title: levelFormTitle, listeningTaskCount: 20, readingTaskCount: 40 }) }),
      expect.objectContaining({ targetLevel: "B2", publishedForm: null }),
      expect.objectContaining({ targetLevel: "C1", publishedForm: null }),
      expect.objectContaining({ targetLevel: "placement-retake", publishedForm: null })
    ]);
    const managerDecision = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${levelUpAttemptId}/decision`,
      headers: { cookie: managerCookie },
      payload: { status: "approved", approvedLevel: "B1", reason: "Đủ bằng chứng theo rubric." }
    });
    expect(managerDecision.statusCode, managerDecision.body).toBe(403);
    const approveLevelUp = () => app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${levelUpAttemptId}/decision`,
      headers: { cookie: operatorCookie },
      payload: { status: "approved", approvedLevel: "B1", reason: "Đủ bằng chứng theo rubric." }
    });
    expect((await approveLevelUp()).statusCode).toBe(409);
    await pool.query(
      `insert into assessment_scores (id, attempt_id, section, score, source)
       select gen_random_uuid(), $1, section, 18, 'human'
       from unnest(array['listening', 'reading', 'writing', 'speaking']) section
       on conflict (attempt_id, section) do update set score = excluded.score, source = excluded.source`,
      [levelUpAttemptId]
    );
    await pool.query(
      `with challenge as (
         insert into coach_sessions (id, learner_id, scenario, status, completed_at)
         values (gen_random_uuid(), $1, jsonb_build_object('kind', 'level_up', 'assessmentAttemptId', $2::text), 'completed', now())
         returning id
       )
       insert into level_up_challenge_results (id, assessment_attempt_id, session_id, learner_id, completed_turns, average, off_topic, passed)
       select gen_random_uuid(), $2::uuid, id, $1, 6, 4, 0, true from challenge`,
      [DEMO_IDS.learner, levelUpAttemptId]
    );
    const operatorDecision = await approveLevelUp();
    expect(operatorDecision.statusCode, operatorDecision.body).toBe(200);
    expect(operatorDecision.json()).toMatchObject({
      attemptId: levelUpAttemptId,
      status: "approved",
      approvedLevel: "B1",
      decidedBy: DEMO_IDS.operator
    });
    const repeatedDecision = await app.inject({
      method: "POST",
      url: `/api/v1/assessment-reviews/${levelUpAttemptId}/decision`,
      headers: { cookie: operatorCookie },
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
