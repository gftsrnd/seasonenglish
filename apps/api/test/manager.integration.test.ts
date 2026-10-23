import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const emptyOrganizationId = "00000000-0000-4000-8000-000000000002";
const outsideOrganizationId = "00000000-0000-4000-8000-000000000003";
const emptyManagerId = "00000000-0000-4000-8000-000000000105";
const outsideLearnerId = "00000000-0000-4000-8000-000000000106";
const reminderLearnerId = "00000000-0000-4000-8000-000000000107";
const copiedReminderLearnerId = "00000000-0000-4000-8000-000000000108";
const dismissedReminderLearnerId = "00000000-0000-4000-8000-000000000109";
const staleReminderLearnerId = "00000000-0000-4000-8000-000000000110";

describe("manager progress and operations API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let managerCookie = "";
  let operatorCookie = "";
  let checkerCookie = "";
  let emptyManagerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into organizations (id, name, slug) values
          ($1, 'Trống Demo', 'empty-demo'),
          ($2, 'Ngoài Demo', 'outside-demo')`,
        [emptyOrganizationId, outsideOrganizationId]
      );
      await client.query(
        `insert into users (id, organization_id, role, display_name, email) values
          ($1, $2, 'manager', 'Quản lý Trống', 'empty-manager@e4s.local'),
          ($3, $4, 'learner', 'Học viên Ngoài tổ chức', 'outside@e4s.local')`,
        [emptyManagerId, emptyOrganizationId, outsideLearnerId, outsideOrganizationId]
      );
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)`,
        [
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          emptyManagerId, await createCredentialHash("empty-manager-pass"),
          DEMO_IDS.checker, await createCredentialHash("checker-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();

    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    managerCookie = await login("quoc.bao.le@e4s.local", "manager-pass");
    operatorCookie = await login("thu.ha.tran@e4s.local", "operator-pass");
    checkerCookie = await login("gia.huy.pham@e4s.local", "checker-pass");
    emptyManagerCookie = await login("empty-manager@e4s.local", "empty-manager-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("rejects unauthenticated and operator access to Manager dashboards", async () => {
    const unauthenticated = await app.inject({ method: "GET", url: "/api/v1/manager/progress" });
    const operator = await app.inject({ method: "GET", url: "/api/v1/manager/operations", headers: { cookie: operatorCookie } });
    const operatorAccounts = await app.inject({ method: "GET", url: "/api/v1/manager/accounts", headers: { cookie: operatorCookie } });
    const operatorRoleChange = await app.inject({
      method: "PATCH",
      url: `/api/v1/manager/accounts/${DEMO_IDS.learner}/role`,
      headers: { cookie: operatorCookie },
      payload: { role: "operator" }
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(operator.statusCode).toBe(403);
    expect(operatorAccounts.statusCode).toBe(403);
    expect(operatorRoleChange.statusCode).toBe(403);
  });

  it("keeps provider configuration Manager-only", async () => {
    const managerRead = await app.inject({ method: "GET", url: "/api/v1/manager/provider-settings", headers: { cookie: managerCookie } });
    const operatorRead = await app.inject({ method: "GET", url: "/api/v1/manager/provider-settings", headers: { cookie: operatorCookie } });
    const provider = { provider: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo" };
    const managerWrite = await app.inject({ method: "PUT", url: "/api/v1/manager/provider-settings", headers: { cookie: managerCookie }, payload: provider });
    const operatorWrite = await app.inject({ method: "PUT", url: "/api/v1/manager/provider-settings", headers: { cookie: operatorCookie }, payload: provider });
    const managerTest = await app.inject({ method: "POST", url: "/api/v1/manager/provider-settings/test", headers: { cookie: managerCookie }, payload: {} });
    const operatorTest = await app.inject({ method: "POST", url: "/api/v1/manager/provider-settings/test", headers: { cookie: operatorCookie }, payload: {} });

    expect(managerRead.statusCode, managerRead.body).toBe(200);
    expect(managerWrite.statusCode, managerWrite.body).toBe(200);
    expect(managerTest.statusCode, managerTest.body).not.toBe(403);
    expect(operatorRead.statusCode).toBe(403);
    expect(operatorWrite.statusCode).toBe(403);
    expect(operatorTest.statusCode).toBe(403);
  });

  it("returns organisation-scoped progress and operational data for a Manager", async () => {
    const progress = await app.inject({ method: "GET", url: "/api/v1/manager/progress", headers: { cookie: managerCookie } });
    const operations = await app.inject({ method: "GET", url: "/api/v1/manager/operations", headers: { cookie: managerCookie } });

    expect(progress.statusCode, progress.body).toBe(200);
    expect(progress.json()).toMatchObject({
      organizationName: "GFT Demo",
      summary: expect.objectContaining({ learnerCount: 1, completedLessons: 5 }),
      learners: [expect.objectContaining({
        learnerName: "Nguyễn Minh Anh", completedLessons: 5,
        activityDatesThisWeek: expect.any(Array),
        earnedBadgeDetails: expect.arrayContaining([expect.objectContaining({ key: expect.any(String), label: expect.any(String), description: expect.any(String) })])
      })],
      activityByDay: expect.arrayContaining([
        expect.objectContaining({ date: expect.any(String), activeLearners: 1, sessions: 1, minutes: 10 })
      ]),
      regularByWeek: expect.arrayContaining([
        expect.objectContaining({ week: expect.any(Number), regularLearners: expect.any(Number), totalLearners: 1, percent: expect.any(Number) })
      ]),
      weekStartDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(JSON.stringify(progress.json())).not.toContain("Học viên Ngoài tổ chức");
    expect(progress.json().learners).toEqual(expect.arrayContaining([expect.objectContaining({ learnerName: "Nguyễn Minh Anh" })]));
    expect(progress.json().learners).not.toEqual(expect.arrayContaining([expect.objectContaining({ learnerName: "Thư Demo" })]));

    expect(operations.statusCode, operations.body).toBe(200);
    expect(operations.json()).toMatchObject({
      organizationName: "GFT Demo",
      content: expect.objectContaining({ published: 1 }),
      queues: expect.objectContaining({ assessmentReview: expect.any(Number) }),
      automation: expect.objectContaining({ pendingJobs: expect.any(Number), aiFailures: expect.any(Number) }),
      readiness: expect.objectContaining({
        requiredSets: expect.any(Number),
        readySets: expect.any(Number),
        missing: expect.any(Array),
        orphanLegacySets: expect.any(Number)
      }),
      operators: expect.arrayContaining([expect.objectContaining({ operatorName: "Trần Thu Hà" })])
    });
  });

  it("returns honest empty states for a Manager organisation with no learners or operations", async () => {
    const progress = await app.inject({ method: "GET", url: "/api/v1/manager/progress", headers: { cookie: emptyManagerCookie } });
    const operations = await app.inject({ method: "GET", url: "/api/v1/manager/operations", headers: { cookie: emptyManagerCookie } });

    expect(progress.statusCode, progress.body).toBe(200);
    expect(progress.json()).toMatchObject({ organizationName: "Trống Demo", summary: { learnerCount: 0 }, learners: [] });
    expect(operations.statusCode, operations.body).toBe(200);
    expect(operations.json()).toMatchObject({ organizationName: "Trống Demo", recentActivity: [] });
  });

  it("lets Manager and Operator assign one canonical weekly practice", async () => {
    const managerAssignment = await app.inject({
      method: "POST", url: `/api/v1/manager/learners/${DEMO_IDS.learner}/weekly-practice`,
      headers: { cookie: managerCookie }, payload: {}
    });
    expect(managerAssignment.statusCode, managerAssignment.body).toBe(200);
    expect(managerAssignment.json()).toMatchObject({
      status: "assigned", learnerId: DEMO_IDS.learner, weekNumber: 1,
      topic: expect.any(String), task: expect.any(String), guidance: expect.any(String)
    });

    const operatorAssignment = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/weekly-practice`,
      headers: { cookie: operatorCookie }, payload: {}
    });
    expect(operatorAssignment.statusCode, operatorAssignment.body).toBe(200);
    expect(operatorAssignment.json()).toMatchObject({
      status: "already_assigned",
      submissionId: managerAssignment.json().submissionId
    });
    await expect(pool.query(
      "select count(*)::int as count from practice_submissions where learner_id = $1 and program_week_id = $2 and superseded_at is null",
      [DEMO_IDS.learner, DEMO_IDS.week]
    )).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("lets a Manager list organisation accounts and persist another account's role change", async () => {
    const accounts = await app.inject({ method: "GET", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie } });
    expect(accounts.statusCode, accounts.body).toBe(200);
    expect(accounts.json()).toMatchObject({
      organizationName: "GFT Demo",
      accounts: expect.arrayContaining([
        expect.objectContaining({ id: DEMO_IDS.learner, displayName: "Nguyễn Minh Anh", role: "learner" }),
        expect.objectContaining({ id: DEMO_IDS.operator, displayName: "Trần Thu Hà", role: "operator" })
      ])
    });
    expect(JSON.stringify(accounts.json())).not.toContain("Học viên Ngoài tổ chức");

    const changed = await app.inject({
      method: "PATCH",
      url: `/api/v1/manager/accounts/${DEMO_IDS.operator}/role`,
      headers: { cookie: managerCookie },
      payload: { role: "manager" }
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json()).toMatchObject({ id: DEMO_IDS.operator, role: "manager" });
    await expect(pool.query("select role from users where id = $1", [DEMO_IDS.operator]))
      .resolves.toMatchObject({ rows: [{ role: "manager" }] });
    await expect(pool.query(
      "select action, actor_user_id, entity_id from audit_events where action = 'account.role.changed' order by created_at desc limit 1"
    )).resolves.toMatchObject({ rows: [{ action: "account.role.changed", actor_user_id: DEMO_IDS.manager, entity_id: DEMO_IDS.operator }] });
  });

  it("rejects a Manager's self-demotion", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/manager/accounts/${DEMO_IDS.manager}/role`,
      headers: { cookie: managerCookie },
      payload: { role: "operator" }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "MANAGER_SELF_ROLE_CHANGE_FORBIDDEN" });
  });

  it("returns stable client statuses for invalid and missing account or learner identifiers", async () => {
    const missingAccountId = "00000000-0000-4000-8000-000000009999";
    const missingRole = await app.inject({
      method: "PATCH", url: `/api/v1/manager/accounts/${missingAccountId}/role`, headers: { cookie: managerCookie },
      payload: { role: "operator" }
    });
    const missingStatus = await app.inject({
      method: "PATCH", url: `/api/v1/manager/accounts/${missingAccountId}/status`, headers: { cookie: managerCookie },
      payload: { status: "disabled" }
    });
    const missingPassword = await app.inject({
      method: "POST", url: `/api/v1/manager/accounts/${missingAccountId}/password-reset`, headers: { cookie: managerCookie },
      payload: { password: "new-pass-123" }
    });
    const invalidRoleId = await app.inject({
      method: "PATCH", url: "/api/v1/manager/accounts/not-a-uuid/role", headers: { cookie: managerCookie },
      payload: { role: "operator" }
    });
    const invalidReminderId = await app.inject({
      method: "POST", url: "/api/v1/manager/reminders/not-a-uuid", headers: { cookie: managerCookie },
      payload: { requestId: "api-audit-invalid" }
    });
    const missingReminder = await app.inject({
      method: "POST", url: `/api/v1/manager/reminders/${missingAccountId}`, headers: { cookie: managerCookie },
      payload: { requestId: "api-audit-missing" }
    });

    expect(missingRole.statusCode).toBe(404);
    expect(missingRole.json()).toEqual({ code: "MANAGER_ACCOUNT_NOT_FOUND" });
    expect(missingStatus.statusCode).toBe(404);
    expect(missingStatus.json()).toEqual({ code: "MANAGER_ACCOUNT_NOT_FOUND" });
    expect(missingPassword.statusCode).toBe(404);
    expect(missingPassword.json()).toEqual({ code: "MANAGER_ACCOUNT_NOT_FOUND" });
    expect(invalidRoleId.statusCode).toBe(400);
    expect(invalidRoleId.json()).toEqual({ code: "MANAGER_ACCOUNT_ID_INVALID" });
    expect(invalidReminderId.statusCode).toBe(400);
    expect(invalidReminderId.json()).toEqual({ code: "MANAGER_REMINDER_LEARNER_ID_INVALID" });
    expect(missingReminder.statusCode).toBe(404);
    expect(missingReminder.json()).toEqual({ code: "MANAGER_REMINDER_LEARNER_NOT_FOUND" });
  });

  it("makes account creation, role changes, lock and password reset effective at login and session guard time", async () => {
    const created = await app.inject({
      method: "POST", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie },
      payload: { displayName: "Lifecycle API", email: "lifecycle-api@e4s.local", role: "operator", password: "initial-pass-123" }
    });
    expect(created.statusCode, created.body).toBe(201);
    const accountId = created.json().id as string;
    expect(created.json()).toMatchObject({ id: accountId, role: "operator", status: "active" });

    const initialLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login", payload: { email: "lifecycle-api@e4s.local", password: "initial-pass-123" }
    });
    expect(initialLogin.statusCode, initialLogin.body).toBe(200);
    const initialCookie = String(initialLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const promoted = await app.inject({
      method: "PATCH", url: `/api/v1/manager/accounts/${accountId}/role`, headers: { cookie: managerCookie },
      payload: { role: "manager" }
    });
    expect(promoted.statusCode, promoted.body).toBe(200);
    expect(promoted.json()).toMatchObject({ id: accountId, role: "manager" });
    const promotedSession = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: initialCookie } });
    expect(promotedSession.statusCode, promotedSession.body).toBe(200);
    expect(promotedSession.json()).toMatchObject({ role: "manager" });

    const reset = await app.inject({
      method: "POST", url: `/api/v1/manager/accounts/${accountId}/password-reset`, headers: { cookie: managerCookie },
      payload: { password: "reset-pass-123" }
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(reset.json()).toEqual({ saved: true });
    const revokedSession = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: initialCookie } });
    expect(revokedSession.statusCode).toBe(401);
    const oldPassword = await app.inject({
      method: "POST", url: "/api/auth/staff/login", payload: { email: "lifecycle-api@e4s.local", password: "initial-pass-123" }
    });
    expect(oldPassword.statusCode).toBe(401);
    const resetLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login", payload: { email: "lifecycle-api@e4s.local", password: "reset-pass-123" }
    });
    expect(resetLogin.statusCode, resetLogin.body).toBe(200);
    const resetCookie = String(resetLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const locked = await app.inject({
      method: "PATCH", url: `/api/v1/manager/accounts/${accountId}/status`, headers: { cookie: managerCookie },
      payload: { status: "disabled" }
    });
    expect(locked.statusCode, locked.body).toBe(200);
    expect(locked.json()).toMatchObject({ id: accountId, status: "disabled" });
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: resetCookie } })).statusCode).toBe(401);
    expect((await app.inject({
      method: "POST", url: "/api/auth/staff/login", payload: { email: "lifecycle-api@e4s.local", password: "reset-pass-123" }
    })).statusCode).toBe(401);

    const unlocked = await app.inject({
      method: "PATCH", url: `/api/v1/manager/accounts/${accountId}/status`, headers: { cookie: managerCookie },
      payload: { status: "active" }
    });
    expect(unlocked.statusCode, unlocked.body).toBe(200);
    expect(unlocked.json()).toMatchObject({ id: accountId, status: "active" });
    expect((await app.inject({
      method: "POST", url: "/api/auth/staff/login", payload: { email: "lifecycle-api@e4s.local", password: "reset-pass-123" }
    })).statusCode).toBe(200);
  });

  it("creates a learner account that can sign in with its initial PIN", async () => {
    const email = "new-learner-api@e4s.local";
    const created = await app.inject({
      method: "POST", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie },
      payload: { displayName: "Học viên mới", email, role: "learner", password: "135790" }
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ displayName: "Học viên mới", email, role: "learner", status: "active" });

    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login", payload: { email, pin: "135790" }
    });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json()).toMatchObject({ role: "learner", user: { displayName: "Học viên mới", email } });

    const accounts = await app.inject({
      method: "GET", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie }
    });
    expect(accounts.statusCode, accounts.body).toBe(200);
    expect(accounts.json().accounts).toContainEqual(expect.objectContaining({ email, role: "learner", status: "active" }));
  });

  it("selects inactive learners and sends an idempotent audited reminder", async () => {
    await pool.query(
      `insert into users (id, organization_id, role, display_name, email, created_at)
       values
         ($1, $2, 'learner', 'Học viên Cần nhắc', 'reminder@e4s.local', now() - interval '5 days'),
         ($3, $2, 'learner', 'Học viên Copy', 'reminder-copy@e4s.local', now() - interval '5 days'),
         ($4, $2, 'learner', 'Học viên Nhắc tay', 'reminder-dismiss@e4s.local', now() - interval '5 days'),
         ($5, $2, 'learner', 'Học viên Vừa học lại', 'reminder-stale@e4s.local', now() - interval '5 days')
       on conflict (id) do nothing`,
      [reminderLearnerId, DEMO_IDS.organization, copiedReminderLearnerId, dismissedReminderLearnerId, staleReminderLearnerId]
    );
    const candidates = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(candidates.statusCode, candidates.body).toBe(200);
    expect(candidates.json()).toMatchObject({
      inactiveDays: expect.any(Number),
      webhookConfigured: false,
      history: []
    });
    expect(candidates.json().candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ learnerId: reminderLearnerId, learnerName: "Học viên Cần nhắc", missedDays: 5 })
      ])
    );

    const request = { method: "POST" as const, url: `/api/v1/manager/reminders/${reminderLearnerId}`, headers: { cookie: managerCookie }, payload: { requestId: "reminder-retry-1" } };
    const sent = await app.inject(request);
    const retried = await app.inject(request);
    expect(sent.statusCode, sent.body).toBe(200);
    expect(retried.statusCode, retried.body).toBe(200);
    expect(sent.json()).toMatchObject({ learnerId: reminderLearnerId, status: "queued", deliveryStatus: "queued", provider: "local_queue" });
    expect(retried.json()).toMatchObject({ reminderId: sent.json().reminderId });
    const reusedForDifferentLearner = await app.inject({
      method: "POST", url: `/api/v1/manager/reminders/${copiedReminderLearnerId}`, headers: { cookie: managerCookie },
      payload: { requestId: "reminder-retry-1" }
    });
    expect(reusedForDifferentLearner.statusCode, reusedForDifferentLearner.body).toBe(409);
    expect(reusedForDifferentLearner.json()).toEqual({ code: "MANAGER_REMINDER_REQUEST_REUSED" });
    await expect(pool.query("select count(*)::int as count from reminders where learner_id = $1", [reminderLearnerId]))
      .resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("select count(*)::int as count from audit_events where action = 'reminder.queued' and entity_id = $1", [reminderLearnerId]))
      .resolves.toMatchObject({ rows: [{ count: 1 }] });

    const afterSend = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(afterSend.json()).toMatchObject({
      history: [expect.objectContaining({
        reminderId: sent.json().reminderId,
        learnerId: reminderLearnerId,
        learnerName: "Học viên Cần nhắc",
        missedDays: 5,
        status: "queued",
        deliveryStatus: "queued",
        provider: "local_queue"
      })]
    });
  });

  it("rejects every reminder action when a previously listed learner is no longer eligible", async () => {
    await pool.query(
      `insert into activities (id, learner_id, activity_type, reference_type, minutes, evidence, occurred_at)
       values ('00000000-0000-4000-8000-000000000111', $1, 'lesson', 'lesson', 10, '{}'::jsonb, now())`,
      [staleReminderLearnerId]
    );
    const sent = await app.inject({
      method: "POST", url: `/api/v1/manager/reminders/${staleReminderLearnerId}`, headers: { cookie: managerCookie },
      payload: { requestId: "stale-reminder-request" }
    });
    const copied = await app.inject({ method: "POST", url: `/api/v1/manager/reminders/${staleReminderLearnerId}/copy`, headers: { cookie: managerCookie } });
    const dismissed = await app.inject({ method: "POST", url: `/api/v1/manager/reminders/${staleReminderLearnerId}/dismiss`, headers: { cookie: managerCookie } });

    for (const response of [sent, copied, dismissed]) {
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toEqual({ code: "MANAGER_REMINDER_NOT_ELIGIBLE" });
    }
    await expect(pool.query("select count(*)::int as count from reminders where learner_id = $1", [staleReminderLearnerId]))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("records a copied reminder in history, removes it from pending and keeps the action Manager-only", async () => {
    const copied = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${copiedReminderLearnerId}/copy`,
      headers: { cookie: managerCookie }
    });
    const forbidden = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${copiedReminderLearnerId}/copy`,
      headers: { cookie: checkerCookie }
    });
    const afterCopy = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });

    expect(copied.statusCode, copied.body).toBe(200);
    expect(forbidden.statusCode).toBe(403);
    expect(copied.json()).toMatchObject({ learnerId: copiedReminderLearnerId, status: "copied" });
    expect(afterCopy.json().candidates).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ learnerId: copiedReminderLearnerId })])
    );
    expect(afterCopy.json().history).toEqual(
      expect.arrayContaining([expect.objectContaining({ learnerId: copiedReminderLearnerId, status: "copied" })])
    );
    await expect(pool.query(
      "select count(*)::int as count from audit_events where action = 'reminder.copied' and entity_id = $1",
      [copiedReminderLearnerId]
    )).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("records one manual reminder dismissal and rejects a stale retry", async () => {
    const request = {
      method: "POST" as const,
      url: `/api/v1/manager/reminders/${dismissedReminderLearnerId}/dismiss`,
      headers: { cookie: managerCookie }
    };
    const dismissed = await app.inject(request);
    const retried = await app.inject(request);
    const operator = await app.inject({ ...request, headers: { cookie: checkerCookie } });

    expect(dismissed.statusCode, dismissed.body).toBe(200);
    expect(operator.statusCode).toBe(403);
    expect(dismissed.json()).toMatchObject({ learnerId: dismissedReminderLearnerId, status: "dismissed" });
    expect(retried.statusCode).toBe(409);
    expect(retried.json()).toEqual({ code: "MANAGER_REMINDER_NOT_ELIGIBLE" });
    await expect(pool.query(
      "select count(*)::int as count from reminders where learner_id = $1 and status = 'dismissed'",
      [dismissedReminderLearnerId]
    )).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query(
      "select count(*)::int as count from audit_events where action = 'reminder.dismissed' and entity_id = $1",
      [dismissedReminderLearnerId]
    )).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it("returns only organisation data in the Manager report", async () => {
    const report = await app.inject({ method: "GET", url: "/api/v1/manager/report", headers: { cookie: managerCookie } });

    expect(report.statusCode, report.body).toBe(200);
    expect(report.json()).toMatchObject({
      organizationName: "GFT Demo",
      progress: expect.objectContaining({ learnerCount: expect.any(Number) }),
      operations: expect.objectContaining({ content: expect.any(Object) }),
      activityByDay: expect.any(Array),
      regularByWeek: expect.any(Array),
      levelDistribution: expect.arrayContaining([expect.objectContaining({ cefr: "A2", learners: 1 })]),
      totals: expect.objectContaining({
        approvedLessonSets: 1,
        approvedLessons: 5,
        coachTurns: expect.any(Number),
        practiceSubmissions: expect.any(Number),
        reviewedPracticeSubmissions: expect.any(Number),
        reminders: expect.any(Number),
        appeals: expect.any(Number),
        pendingAppeals: expect.any(Number)
      }),
      surveyResponses: expect.any(Array)
    });
    expect(JSON.stringify(report.json())).not.toContain("Học viên Ngoài tổ chức");
  });

  it("persists public Manager settings and rejects invalid or Operator requests", async () => {
    const operatorRead = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: checkerCookie } });
    const current = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    const invalid = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { reminderInactiveDays: 0, weeklyReportEnabled: true }
    });
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...(current.json() as Record<string, unknown>), organizationName: undefined, programName: "E4S Workplace", reminderInactiveDays: 5, weeklyReportEnabled: false }
    });
    const reloaded = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });

    expect(operatorRead.statusCode).toBe(403);
    expect(invalid.statusCode).toBe(400);
    expect(saved.statusCode, saved.body).toBe(200);
    expect(reloaded.statusCode, reloaded.body).toBe(200);
    expect(reloaded.json()).toMatchObject({ programName: "E4S Workplace", reminderInactiveDays: 5, weeklyReportEnabled: false });
    const activeProgram = await pool.query("select name from programs where organization_id = $1 and status = 'active'", [DEMO_IDS.organization]);
    expect(activeProgram.rows[0]?.name).toBe("E4S Workplace");
    expect(JSON.stringify(reloaded.json())).not.toMatch(/secret|api.?key|provider.?key/i);
  });
});
