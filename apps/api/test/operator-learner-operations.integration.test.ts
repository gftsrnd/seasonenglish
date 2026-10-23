import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const freshLearnerId = "00000000-0000-4000-8000-000000000109";

describe("Operator learner/test operations", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
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
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, 'learner', 'Học viên Mới', 'fresh@e4s.local')`,
        [freshLearnerId, DEMO_IDS.organization]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)",
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          freshLearnerId, await createPinHash("654321")
        ]
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
    const learnerLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "fresh@e4s.local", pin: "654321" } });
    expect(learnerLogin.statusCode, learnerLogin.body).toBe(200);
    learnerCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns learner profile and assessment detail to Operator and Manager", async () => {
    const profile = await app.inject({
      method: "GET", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}`,
      headers: { cookie: operatorCookie }
    });
    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json()).toMatchObject({
      learner: { id: DEMO_IDS.learner, displayName: "Nguyễn Minh Anh", currentLevel: "A2" },
      profile: { department: "AI" },
      monthlyGoal: null,
      attempts: expect.arrayContaining([expect.objectContaining({ id: DEMO_IDS.placementAttempt, kind: "placement" })])
    });

    const attempt = await app.inject({
      method: "GET", url: `/api/v1/assessment-reviews/attempts/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: managerCookie }
    });
    expect(attempt.statusCode, attempt.body).toBe(200);
    expect(attempt.json()).toMatchObject({
      id: DEMO_IDS.placementAttempt,
      learnerId: DEMO_IDS.learner,
      responses: expect.any(Array),
      scores: expect.any(Array),
      integrityEvents: expect.any(Array)
    });
  });

  it("repairs missing deterministic Listening and Reading scores for a submitted attempt", async () => {
    await pool.query(
      `delete from assessment_scores where attempt_id = $1 and section in ('listening', 'reading')`,
      [DEMO_IDS.placementAttempt]
    );
    const response = await app.inject({
      method: "GET", url: `/api/v1/assessment-reviews/attempts/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: operatorCookie }
    });
    expect(response.statusCode, response.body).toBe(200);
    const scores = response.json().scores as Array<{ section: string; source: string }>;
    expect(scores).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "listening", source: "deterministic" }),
      expect.objectContaining({ section: "reading", source: "deterministic" })
    ]));
  });

  it("lets both staff roles manage learner operations and persists evidence", async () => {
    const managerLevel = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/level`,
      headers: { cookie: managerCookie },
      payload: { mode: "direct", targetLevel: "B1", reason: "Manager review", evidence: "review" }
    });
    expect(managerLevel.statusCode, managerLevel.body).toBe(200);
    expect(managerLevel.json()).toMatchObject({ learnerId: DEMO_IDS.learner, mode: "direct", targetLevel: "B1" });

    const level = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${freshLearnerId}/level`,
      headers: { cookie: operatorCookie },
      payload: { mode: "direct", targetLevel: "A1", reason: "Manual placement from profile", evidence: "profile review" }
    });
    expect(level.statusCode, level.body).toBe(200);
    expect(level.json()).toMatchObject({ learnerId: freshLearnerId, mode: "direct", targetLevel: "A1" });

    const scheduled = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${freshLearnerId}/level`,
      headers: { cookie: operatorCookie },
      payload: { mode: "scheduled", targetLevel: "A2", reason: "Theo dõi thêm một tuần", evidence: "review" }
    });
    expect(scheduled.statusCode, scheduled.body).toBe(200);
    expect(scheduled.json()).toMatchObject({ learnerId: freshLearnerId, mode: "scheduled", targetLevel: "A2" });

    const lower = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${freshLearnerId}/level`,
      headers: { cookie: operatorCookie },
      payload: { mode: "recommend_lower", targetLevel: "A1", reason: "Đề xuất giữ nền tảng", evidence: "review" }
    });
    expect(lower.statusCode, lower.body).toBe(200);
    expect(lower.json()).toMatchObject({ learnerId: freshLearnerId, mode: "recommend_lower", targetLevel: "A1" });

    const goal = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${freshLearnerId}/monthly-goal`,
      headers: { cookie: operatorCookie }, payload: { monthlyGoal: "Nói rõ mục tiêu trong cuộc họp" }
    });
    expect(goal.statusCode, goal.body).toBe(200);
    expect(goal.json()).toMatchObject({ learnerId: freshLearnerId, monthlyGoal: "Nói rõ mục tiêu trong cuộc họp" });

    const request = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/learners/${freshLearnerId}/deletion-requests`,
      headers: { cookie: operatorCookie }, payload: { reason: "Tài khoản được tạo nhầm trong đợt kiểm thử." }
    });
    expect(request.statusCode, request.body).toBe(201);
    expect(request.json()).toMatchObject({ learnerId: freshLearnerId, status: "pending" });

    const learnerWrite = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/monthly-goal`,
      headers: { cookie: learnerCookie }, payload: { monthlyGoal: "Không được phép" }
    });
    expect(learnerWrite.statusCode).toBe(403);
  });
});
