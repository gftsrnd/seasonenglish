import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const deleteRequestId = "00000000-0000-4000-8000-000000000901";
const purgeAccountId = "00000000-0000-4000-8000-000000000902";
const purgeSessionId = "00000000-0000-4000-8000-000000000905";
const purgeEnrollmentId = "00000000-0000-4000-8000-000000000906";
const purgeReminderId = "00000000-0000-4000-8000-000000000907";
const purgeActivityId = "00000000-0000-4000-8000-000000000908";
const purgeFileId = "00000000-0000-4000-8000-000000000909";

describe("complete Manager learner and account operations API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let managerCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash, updated_at = now()`,
        [DEMO_IDS.manager, await createCredentialHash("manager-pass"), DEMO_IDS.operator, await createCredentialHash("operator-pass")]
      );
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'learner.deletion_requested', 'user', $4, $5::jsonb, $6)`,
        [deleteRequestId, DEMO_IDS.organization, DEMO_IDS.operator, DEMO_IDS.learner,
          JSON.stringify({ status: "pending", reason: "Yêu cầu xoá từ người học", requestedBy: DEMO_IDS.operator }), "00000000-0000-4000-8000-000000000904"]
      );
      await client.query(
        `insert into users (id, organization_id, role, display_name, email, avatar, status)
         values ($1, $2, 'learner', 'Tài khoản chờ xoá', 'purge@e4s.local', '{"color":"rose","acc":"star","bg":2}'::jsonb, 'deleted')`,
        [purgeAccountId, DEMO_IDS.organization]
      );
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [purgeAccountId, await createCredentialHash("purge-pass")]);
      await client.query(
        "insert into sessions (id, user_id, token_hash, expires_at) values ($1, $2, 'purge-session-token', now() + interval '1 day')",
        [purgeSessionId, purgeAccountId]
      );
      await client.query(
        `insert into learner_profiles (user_id, profile, completed_at)
         values ($1, '{"fullName":"Nguyễn Văn Test","contact":"base-user","concerns":"Thông tin riêng"}'::jsonb, now())`,
        [purgeAccountId]
      );
      await client.query(
        `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
         select $1, id, $2, 'A2', true from programs where organization_id = $3 order by start_date desc limit 1`,
        [purgeEnrollmentId, purgeAccountId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into reminders (id, learner_id, reason, message, status, created_by)
         values ($1, $2, 'Có email purge@e4s.local', 'Chào Nguyễn Văn Test', 'queued', $3)`,
        [purgeReminderId, purgeAccountId, DEMO_IDS.manager]
      );
      await client.query(
        `insert into activities (id, learner_id, activity_type, reference_type, minutes, evidence)
         values ($1, $2, 'lesson', 'lesson', 10, '{"freeText":"Nguyễn Văn Test"}'::jsonb)`,
        [purgeActivityId, purgeAccountId]
      );
      await client.query(
        `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
         values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', 'assessment-audio/purge/private.webm', 'audio/webm', 12, 'purge-sha')`,
        [purgeFileId, DEMO_IDS.organization, purgeAccountId]
      );
    } finally { client.release(); }
    await app.ready();

    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    managerCookie = await login("manager@e4s.local", "manager-pass");
    operatorCookie = await login("operator@e4s.local", "operator-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns a scoped learner quick-view and denies the Operator", async () => {
    const manager = await app.inject({ method: "GET", url: `/api/v1/manager/learners/${DEMO_IDS.learner}`, headers: { cookie: managerCookie } });
    const operator = await app.inject({ method: "GET", url: `/api/v1/manager/learners/${DEMO_IDS.learner}`, headers: { cookie: operatorCookie } });

    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toMatchObject({
      learner: { id: DEMO_IDS.learner, displayName: "Học viên Demo", status: "active" },
      profile: expect.any(Object),
      metrics: expect.objectContaining({ completedLessons: expect.any(Number), rewardPoints: expect.any(Number) })
    });
    expect(operator.statusCode).toBe(403);
    const operatorRequests = await app.inject({ method: "GET", url: "/api/v1/manager/delete-requests", headers: { cookie: operatorCookie } });
    expect(operatorRequests.statusCode).toBe(403);
  });

  it("lets a Manager restore trash and anonymize a deleted account without breaking history", async () => {
    const requests = await app.inject({ method: "GET", url: "/api/v1/manager/delete-requests", headers: { cookie: managerCookie } });
    expect(requests.statusCode, requests.body).toBe(200);
    expect(requests.json()).toMatchObject({ requests: [expect.objectContaining({ id: deleteRequestId, status: "pending", learnerId: DEMO_IDS.learner })] });

    const decided = await app.inject({
      method: "POST", url: `/api/v1/manager/delete-requests/${deleteRequestId}/decision`, headers: { cookie: managerCookie },
      payload: { status: "approved", note: "Đã xác nhận yêu cầu." }
    });
    expect(decided.statusCode, decided.body).toBe(200);
    expect(decided.json()).toMatchObject({ id: deleteRequestId, status: "approved" });

    const trash = await app.inject({ method: "GET", url: "/api/v1/manager/trash", headers: { cookie: managerCookie } });
    expect(trash.statusCode, trash.body).toBe(200);
    expect(trash.json()).toMatchObject({ accounts: expect.arrayContaining([expect.objectContaining({ id: DEMO_IDS.learner, status: "deleted" })]) });

    const restored = await app.inject({ method: "POST", url: `/api/v1/manager/trash/${DEMO_IDS.learner}/restore`, headers: { cookie: managerCookie } });
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({ id: DEMO_IDS.learner, status: "active" });

    await pool.query("update users set status = 'deleted' where id = $1", [purgeAccountId]);
    const confirmation = await app.inject({ method: "POST", url: `/api/v1/manager/trash/${purgeAccountId}/purge-confirmation`, headers: { cookie: managerCookie }, payload: {} });
    expect(confirmation.statusCode, confirmation.body).toBe(200);
    expect(confirmation.json()).toMatchObject({
      accountId: purgeAccountId,
      token: expect.any(String),
      confirmationPhrase: "XOA VINH VIEN",
      countdownSeconds: 5,
      expiresAt: expect.any(String)
    });
    const missingConfirmation = await app.inject({ method: "DELETE", url: `/api/v1/manager/trash/${purgeAccountId}`, headers: { cookie: managerCookie }, payload: {} });
    expect(missingConfirmation.statusCode).toBe(400);
    const invalidConfirmation = await app.inject({
      method: "DELETE", url: `/api/v1/manager/trash/${purgeAccountId}`, headers: { cookie: managerCookie },
      payload: { confirmationToken: "invalid-confirmation-token", confirmationPhrase: "XOA VINH VIEN" }
    });
    expect(invalidConfirmation.statusCode).toBe(409);
    const purged = await app.inject({
      method: "DELETE", url: `/api/v1/manager/trash/${purgeAccountId}`, headers: { cookie: managerCookie },
      payload: { confirmationToken: confirmation.json().token, confirmationPhrase: confirmation.json().confirmationPhrase }
    });
    expect(purged.statusCode, purged.body).toBe(204);
    await expect(pool.query("select used_at from manager_destructive_confirmations where target_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [expect.objectContaining({ used_at: expect.anything() })] });
    await expect(pool.query("select display_name, email, avatar, status from users where id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ display_name: "Người học đã xoá", email: null, avatar: {}, status: "purged" }] });
    await expect(pool.query("select count(*)::int as count from user_credentials where user_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(pool.query("select count(*)::int as count from sessions where user_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(pool.query("select count(*)::int as count from learner_profiles where user_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(pool.query("select count(*)::int as count from files where owner_user_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(pool.query("select cefr from enrollments where learner_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ cefr: "A2" }] });
    await expect(pool.query("select minutes, evidence from activities where learner_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ minutes: 10, evidence: {} }] });
    await expect(pool.query("select reason, message from reminders where learner_id = $1", [purgeAccountId])).resolves.toMatchObject({ rows: [{ reason: "Tài khoản đã ẩn danh", message: "Nội dung đã được xoá khi ẩn danh tài khoản." }] });
    const accountsAfterPurge = await app.inject({ method: "GET", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie } });
    const trashAfterPurge = await app.inject({ method: "GET", url: "/api/v1/manager/trash", headers: { cookie: managerCookie } });
    expect(accountsAfterPurge.body).not.toContain(purgeAccountId);
    expect(trashAfterPurge.body).not.toContain(purgeAccountId);
    const reusedConfirmation = await app.inject({
      method: "DELETE", url: `/api/v1/manager/trash/${purgeAccountId}`, headers: { cookie: managerCookie },
      payload: { confirmationToken: confirmation.json().token, confirmationPhrase: confirmation.json().confirmationPhrase }
    });
    expect(reusedConfirmation.statusCode).toBe(409);
    const operatorConfirmation = await app.inject({ method: "POST", url: `/api/v1/manager/trash/${purgeAccountId}/purge-confirmation`, headers: { cookie: operatorCookie }, payload: {} });
    expect(operatorConfirmation.statusCode).toBe(403);
    const operatorPurge = await app.inject({ method: "DELETE", url: `/api/v1/manager/trash/${purgeAccountId}`, headers: { cookie: operatorCookie } });
    expect(operatorPurge.statusCode).toBe(403);
  });

  it("persists and resolves Manager-only PIN reports", async () => {
    const created = await app.inject({
      method: "POST", url: "/api/v1/manager/pin-reports", headers: { cookie: managerCookie },
      payload: { accountId: DEMO_IDS.learner, note: "Người học không nhớ mã PIN." }
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ id: expect.any(String), subjectUserId: DEMO_IDS.learner, status: "open" });

    const reports = await app.inject({ method: "GET", url: "/api/v1/manager/pin-reports", headers: { cookie: managerCookie } });
    expect(reports.statusCode, reports.body).toBe(200);
    expect(reports.json()).toMatchObject({ reports: [expect.objectContaining({ subjectUserId: DEMO_IDS.learner, status: "open" })] });

    const resolved = await app.inject({
      method: "POST", url: `/api/v1/manager/pin-reports/${created.json().id}/resolve`, headers: { cookie: managerCookie }, payload: {}
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolved.json()).toMatchObject({ id: created.json().id, status: "done" });

    const operator = await app.inject({ method: "GET", url: "/api/v1/manager/pin-reports", headers: { cookie: operatorCookie } });
    expect(operator.statusCode).toBe(403);
  });
});
