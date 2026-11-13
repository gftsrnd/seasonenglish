import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

// B8-004: a placement appeal is only possible after the level is approved.
describe("Appeals before the placement level is approved", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let cookie = "";
  const setApproved = async (approved: boolean) => {
    await pool.query(
      "update enrollments set cefr = $2, cefr_approved = $3 where learner_id = $1",
      [DEMO_IDS.learner, approved ? "A2" : null, approved]
    );
  };
  const appealPayload = { proposedLevel: "B1", reason: "Nhờ Vận hành xem lại điểm phần nói của bài đầu vào." };

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("update users set email = 'minh.anh.nguyen@e4s.test' where id = $1", [DEMO_IDS.learner]);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.learner, await createPinHash("123456")]);
      // Keep the seeded placement decision inside its 72-hour appeal window.
      await client.query("update assessment_decisions set decided_at = now() - interval '1 hour' where attempt_id = $1", [DEMO_IDS.placementAttempt]);
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.test", pin: "123456" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("lists nothing appealable and refuses every appeal while the level is not approved, but keeps complaints", async () => {
    await setApproved(false);
    const headers = { cookie };

    const available = await app.inject({ method: "GET", url: "/api/v1/learner/appealable-assessments", headers });
    expect(available.statusCode, available.body).toBe(200);
    expect(available.json()).toEqual({ results: [] });

    const history = await app.inject({ method: "GET", url: "/api/v1/learner/appeals", headers });
    expect(history.statusCode, history.body).toBe(200);
    expect(history.json()).toEqual({ appeals: [] });

    const assessment = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${DEMO_IDS.placementAttempt}/appeals`, headers, payload: appealPayload });
    expect(assessment.statusCode, assessment.body).toBe(409);
    expect(assessment.json()).toMatchObject({ code: "APPEAL_LEVEL_NOT_APPROVED" });

    const lessonPart = await app.inject({ method: "POST", url: `/api/v1/lessons/${DEMO_IDS.lessons[0]}/parts/reading/appeals`, headers,
      payload: { reason: "Câu hỏi số 2 có đáp án chưa đúng." } });
    expect(lessonPart.statusCode, lessonPart.body).toBe(409);
    expect(lessonPart.json()).toMatchObject({ code: "APPEAL_LEVEL_NOT_APPROVED" });

    const practice = await app.inject({ method: "POST", url: `/api/v1/engagement/practice/${DEMO_IDS.practiceSubmission}/appeals`, headers,
      payload: { reason: "Nhờ chấm lại bài thực hành tuần này." } });
    expect(practice.statusCode, practice.body).toBe(409);
    expect(practice.json()).toMatchObject({ code: "APPEAL_LEVEL_NOT_APPROVED" });

    const stored = await pool.query("select id from appeals where learner_id = $1", [DEMO_IDS.learner]);
    expect(stored.rowCount).toBe(0);

    const complaint = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers,
      payload: { kind: "account", reason: "Tôi chưa đổi được ảnh đại diện." } });
    expect(complaint.statusCode, complaint.body).toBeLessThan(300);

    for (const kind of ["attendance", "lesson_count"]) {
      const learningComplaint = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers,
        payload: { kind, reason: "Bài học hôm nay chưa được tính." } });
      expect(learningComplaint.statusCode, learningComplaint.body).toBe(409);
      expect(learningComplaint.json()).toMatchObject({ code: "LEARNER_COMPLAINT_NOT_APPLICABLE" });
    }
  });

  it("opens the placement appeal once the level is approved", async () => {
    await setApproved(true);
    const headers = { cookie };
    const available = await app.inject({ method: "GET", url: "/api/v1/learner/appealable-assessments", headers });
    expect(available.statusCode, available.body).toBe(200);
    expect(available.json().results).toEqual([expect.objectContaining({ attemptId: DEMO_IDS.placementAttempt })]);

    const created = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${DEMO_IDS.placementAttempt}/appeals`, headers, payload: appealPayload });
    expect(created.statusCode, created.body).toBe(201);

    const history = await app.inject({ method: "GET", url: "/api/v1/learner/appeals", headers });
    expect(history.json().appeals).toEqual([expect.objectContaining({ kind: "assessment", status: "pending" })]);
  });
});
