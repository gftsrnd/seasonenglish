import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
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
process.env.E4S_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

describe("manager progress and operations API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, reminderEmailSender: { sendReminder: async () => ({ externalId: "test-email" }) } });
  let managerCookie = "";
  let learnerCookie = "";
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
          DEMO_IDS.manager, await createCredentialHash("test-manager-pw"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          emptyManagerId, await createCredentialHash("empty-test-manager-pw"),
          DEMO_IDS.checker, await createCredentialHash("checker-pass")
        ]
      );
      await client.query(`insert into user_credentials (user_id, credential_hash) values ($1, $2)
        on conflict (user_id) do update set credential_hash = excluded.credential_hash`, [DEMO_IDS.learner, await createPinHash("123456")]);
    } finally { client.release(); }
    await app.ready();

    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    managerCookie = await login("quoc.bao.le@e4s.local", "test-manager-pw");
    operatorCookie = await login("thu.ha.tran@e4s.local", "operator-pass");
    checkerCookie = await login("gia.huy.pham@e4s.local", "checker-pass");
    emptyManagerCookie = await login("empty-manager@e4s.local", "empty-test-manager-pw");
    const learnerLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    expect(learnerLogin.statusCode, learnerLogin.body).toBe(200);
    learnerCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";
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

  it("retires the Manager weekly-practice assignment endpoint", async () => {
    const managerAssignment = await app.inject({
      method: "POST", url: `/api/v1/manager/learners/${DEMO_IDS.learner}/weekly-practice`,
      headers: { cookie: managerCookie }, payload: {}
    });
    expect(managerAssignment.statusCode, managerAssignment.body).toBe(410);
    expect(managerAssignment.json()).toEqual({ code: "WEEKLY_PRACTICE_RETIRED" });
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

    // Role changes apply at session-guard time; restore the Operator so later Operator-denial checks stay meaningful.
    const restored = await app.inject({
      method: "PATCH",
      url: `/api/v1/manager/accounts/${DEMO_IDS.operator}/role`,
      headers: { cookie: managerCookie },
      payload: { role: "operator" }
    });
    expect(restored.statusCode, restored.body).toBe(200);
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

  it("lets only a Manager reveal a recoverable learner PIN without resetting it", async () => {
    const created = await app.inject({
      method: "POST", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie },
      payload: { displayName: "PIN Reveal API", email: "pin-reveal-api@e4s.local", role: "learner", password: "246802" }
    });
    expect(created.statusCode, created.body).toBe(201);
    const accountId = created.json().id as string;

    const managerReveal = await app.inject({ method: "GET", url: `/api/v1/manager/accounts/${accountId}/pin`, headers: { cookie: managerCookie } });
    const nonManagerReveal = await app.inject({ method: "GET", url: `/api/v1/manager/accounts/${accountId}/pin`, headers: { cookie: checkerCookie } });
    const legacyReveal = await app.inject({ method: "GET", url: `/api/v1/manager/accounts/${DEMO_IDS.learner}/pin`, headers: { cookie: managerCookie } });

    expect(managerReveal.statusCode, managerReveal.body).toBe(200);
    expect(managerReveal.json()).toEqual({ pin: "246802" });
    expect(nonManagerReveal.statusCode).toBe(403);
    expect(legacyReveal.statusCode).toBe(409);
    expect(legacyReveal.json()).toEqual({ code: "MANAGER_ACCOUNT_PIN_UNAVAILABLE" });
  });

  it("lets only a Manager reveal a recoverable staff password", async () => {
    const created = await app.inject({
      method: "POST", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie },
      payload: { displayName: "Staff Credential Reveal", email: "staff-credential@e4s.local", role: "operator", password: "test-staff-pw-123" }
    });
    expect(created.statusCode, created.body).toBe(201);
    const accountId = created.json().id as string;

    const managerReveal = await app.inject({ method: "GET", url: `/api/v1/manager/accounts/${accountId}/credential`, headers: { cookie: managerCookie } });
    const nonManagerReveal = await app.inject({ method: "GET", url: `/api/v1/manager/accounts/${accountId}/credential`, headers: { cookie: checkerCookie } });

    expect(managerReveal.statusCode, managerReveal.body).toBe(200);
    expect(managerReveal.json()).toEqual({ credential: "test-staff-pw-123", kind: "password" });
    expect(nonManagerReveal.statusCode).toBe(403);
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
      payload: { requestId: "api-audit-invalid", channel: "email" }
    });
    const missingReminder = await app.inject({
      method: "POST", url: `/api/v1/manager/reminders/${missingAccountId}`, headers: { cookie: managerCookie },
      payload: { requestId: "api-audit-missing", channel: "email" }
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

    const invalidReset = await app.inject({
      method: "POST", url: `/api/v1/manager/accounts/${created.json().id}/password-reset`, headers: { cookie: managerCookie },
      payload: { password: "not-a-pin" }
    });
    expect(invalidReset.statusCode).toBe(400);
    expect(invalidReset.json()).toEqual({ code: "MANAGER_ACCOUNT_PASSWORD_INVALID" });

    const reset = await app.inject({
      method: "POST", url: `/api/v1/manager/accounts/${created.json().id}/password-reset`, headers: { cookie: managerCookie },
      payload: { password: "246802" }
    });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(reset.json()).toEqual({ saved: true });
    expect((await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin: "135790" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin: "246802" } })).statusCode).toBe(200);

    const accounts = await app.inject({
      method: "GET", url: "/api/v1/manager/accounts", headers: { cookie: managerCookie }
    });
    expect(accounts.statusCode, accounts.body).toBe(200);
    expect(accounts.json().accounts).toContainEqual(expect.objectContaining({ email, role: "learner", status: "active" }));
  });

  let settingsBeforeReminders: unknown = null;
  let reminderLessonId = "";

  /**
   * Reminder eligibility counts missed weekdays of the learner's approved level that had an approved
   * monthly lesson. Test date 2026-11-10, level start 2026-11-04: four missed days (04, 05, 06, 09).
   */
  async function useReminderMonth() {
    const learners = [reminderLearnerId, copiedReminderLearnerId, dismissedReminderLearnerId, staleReminderLearnerId];
    settingsBeforeReminders = (await pool.query<{ configuration: unknown }>(
      "select configuration from organization_settings where organization_id = $1", [DEMO_IDS.organization]
    )).rows[0]?.configuration ?? null;
    await pool.query(
      `insert into organization_settings (organization_id, configuration) values ($1, jsonb_build_object('simulatedSystemDate', '2026-11-10'))
       on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
      [DEMO_IDS.organization]
    );
    for (const learnerId of learners) {
      await pool.query(
        `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on)
         values (gen_random_uuid(), $1, $2, 'A1', true, '2026-11-04')
         on conflict (program_id, learner_id) do update set cefr = 'A1', cefr_approved = true, cefr_started_on = excluded.cefr_started_on`,
        [DEMO_IDS.program, learnerId]
      );
    }
    const framework = await pool.query<{ id: string }>(
      `with month as (
         insert into program_months (id, organization_id, month, exam_date, lesson_count)
         values (gen_random_uuid(), $1, '2026-11', '2026-11-30', 20) returning id
       )
       insert into month_frameworks (id, program_month_id, cefr, status, scope_hash, published_at, published_on)
       select gen_random_uuid(), id, 'A1', 'approved', 'scope', now(), '2026-11-01' from month returning id`,
      [DEMO_IDS.organization]
    );
    const lessonSet = await pool.query<{ id: string }>(
      "insert into lesson_sets (id, month_framework_id, cefr) values (gen_random_uuid(), $1, 'A1') returning id", [framework.rows[0]!.id]
    );
    for (const [index, lessonDate] of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"].entries()) {
      const lesson = await pool.query<{ id: string }>(
        `with version as (
           insert into lesson_set_versions (id, lesson_set_id, version, status) values (gen_random_uuid(), $1, $2, 'published') returning id
         ), lesson as (
           insert into lessons (id, lesson_set_version_id, day_number, title) select gen_random_uuid(), id, $2, 'Lesson' from version returning id
         ), lesson_version as (
           insert into lesson_versions (id, lesson_id, version, status, content) select gen_random_uuid(), id, 1, 'published', '{}'::jsonb from lesson
         )
         insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status)
         select gen_random_uuid(), $3, $2, $4::date, id, 'scope', 'approved' from lesson returning lesson_id as id`,
        [lessonSet.rows[0]!.id, index + 1, framework.rows[0]!.id, lessonDate]
      );
      if (lessonDate === "2026-11-09") reminderLessonId = lesson.rows[0]!.id;
    }
  }

  it("selects inactive learners and sends an idempotent audited reminder", async () => {
    await pool.query(
      `insert into users (id, organization_id, role, display_name, email, created_at)
       values
         ($1, $2, 'learner', 'Học viên Cần nhắc', 'reminder@e4s.local', now() - interval '4 days'),
         ($3, $2, 'learner', 'Học viên Copy', 'reminder-copy@e4s.local', now() - interval '4 days'),
         ($4, $2, 'learner', 'Học viên Nhắc tay', 'reminder-dismiss@e4s.local', now() - interval '4 days'),
         ($5, $2, 'learner', 'Học viên Vừa học lại', 'reminder-stale@e4s.local', now() - interval '4 days')
       on conflict (id) do nothing`,
      [reminderLearnerId, DEMO_IDS.organization, copiedReminderLearnerId, dismissedReminderLearnerId, staleReminderLearnerId]
    );
    await useReminderMonth();
    const candidates = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(candidates.statusCode, candidates.body).toBe(200);
    expect(candidates.json()).toMatchObject({
      inactiveDays: expect.any(Number),
      webhookConfigured: false,
      candidates: expect.arrayContaining([expect.objectContaining({ learnerId: reminderLearnerId, learnerEmail: "reminder@e4s.local" })]),
      history: []
    });
    expect(candidates.json().candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ learnerId: reminderLearnerId, learnerName: "Học viên Cần nhắc", missedDays: 4 })
      ])
    );

    const request = { method: "POST" as const, url: `/api/v1/manager/reminders/${reminderLearnerId}`, headers: { cookie: managerCookie }, payload: { requestId: "reminder-retry-1", channel: "email" } };
    const responses = await Promise.all([app.inject(request), app.inject(request)]);
    for (const response of responses) expect(response.statusCode, response.body).toBe(200);
    // Idempotent retry: both calls return the same reminder. Only the call that claims the email
    // delivery sends it; a concurrent duplicate returns that reminder as still "queued" (or "sent"
    // when the delivery already finished), so which response carries "sent" is not fixed.
    const sent = responses.find((response) => response.json().status === "sent")!;
    expect(sent, responses.map((response) => response.body).join(" | ")).toBeDefined();
    expect(sent.json()).toMatchObject({ learnerId: reminderLearnerId, status: "sent", deliveryStatus: "sent", provider: "resend" });
    for (const response of responses) {
      expect(response.json()).toMatchObject({ reminderId: sent.json().reminderId, status: expect.stringMatching(/^(sent|queued)$/u) });
    }
    const reusedForDifferentLearner = await app.inject({
      method: "POST", url: `/api/v1/manager/reminders/${copiedReminderLearnerId}`, headers: { cookie: managerCookie },
      payload: { requestId: "reminder-retry-1", channel: "email" }
    });
    expect(reusedForDifferentLearner.statusCode, reusedForDifferentLearner.body).toBe(409);
    expect(reusedForDifferentLearner.json()).toEqual({ code: "MANAGER_REMINDER_REQUEST_REUSED" });
    await expect(pool.query("select count(*)::int as count from reminders where learner_id = $1", [reminderLearnerId]))
      .resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(pool.query("select count(*)::int as count from audit_events where action = 'reminder.queued' and entity_id = $1", [reminderLearnerId]))
      .resolves.toMatchObject({ rows: [{ count: 1 }] });

    const afterSend = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(afterSend.json().candidates).not.toEqual(expect.arrayContaining([expect.objectContaining({ learnerId: reminderLearnerId })]));
    expect(afterSend.json()).toMatchObject({
      history: [expect.objectContaining({
        reminderId: sent.json().reminderId,
        learnerId: reminderLearnerId,
        learnerName: "Học viên Cần nhắc",
        recipient: "reminder@e4s.local",
        missedDays: 4,
        status: "sent",
        deliveryStatus: "sent",
        provider: "resend"
      })]
    });
  });

  it("rejects every reminder action when a previously listed learner is no longer eligible", async () => {
    // The learner completes the 09/11 lesson, which ends the absence streak.
    await pool.query(
      `insert into progress_records (id, learner_id, lesson_id, status, evidence, started_at, completed_at)
       values (gen_random_uuid(), $1, $2, 'completed', '{}'::jsonb, '2026-11-09 09:00+07', '2026-11-09 09:10+07')`,
      [staleReminderLearnerId, reminderLessonId]
    );
    const sent = await app.inject({
      method: "POST", url: `/api/v1/manager/reminders/${staleReminderLearnerId}`, headers: { cookie: managerCookie },
      payload: { requestId: "stale-reminder-request", channel: "email" }
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

  it("records a copied reminder in history, keeps it pending for repeat copy and keeps the action Manager-only", async () => {
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
    expect(afterCopy.json().candidates).toEqual(
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
    await pool.query(
      "update organization_settings set configuration = coalesce($2::jsonb, configuration - 'simulatedSystemDate') where organization_id = $1",
      [DEMO_IDS.organization, settingsBeforeReminders === null ? null : JSON.stringify(settingsBeforeReminders)]
    );
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
    const originalPilotStartDate = (current.json() as { pilotStartDate: string }).pilotStartDate;
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...(current.json() as Record<string, unknown>), organizationName: undefined, programName: "E4S Workplace", reminderInactiveDays: 5, weeklyReportEnabled: false, pilotStartDate: "2030-01-07" }
    });
    const reloaded = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });

    expect(operatorRead.statusCode).toBe(403);
    expect(invalid.statusCode).toBe(400);
    expect(saved.statusCode, saved.body).toBe(200);
    expect(reloaded.statusCode, reloaded.body).toBe(200);
    expect(reloaded.json()).toMatchObject({ programName: "E4S Workplace", reminderInactiveDays: 5, weeklyReportEnabled: false, pilotStartDate: originalPilotStartDate });
    const activeProgram = await pool.query("select name from programs where organization_id = $1 and status = 'active'", [DEMO_IDS.organization]);
    expect(activeProgram.rows[0]?.name).toBe("E4S Workplace");
    expect(JSON.stringify(reloaded.json())).not.toMatch(/secret|api.?key|provider.?key/i);
  });
  it("persists the Manager-selected system date and keeps it out of Operator writes", async () => {
    const before = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    expect(before.statusCode, before.body).toBe(200);
    const settings = before.json() as Record<string, unknown>;
    const managerWrite = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...settings, simulatedSystemDate: "2026-11-14" }
    });
    expect(managerWrite.statusCode, managerWrite.body).toBe(200);
    expect(managerWrite.json()).toMatchObject({ simulatedSystemDate: "2026-11-14" });

    const operatorWrite = await app.inject({
      method: "PUT", url: "/api/v1/operator/settings", headers: { cookie: operatorCookie },
      payload: { ...(managerWrite.json() as Record<string, unknown>), simulatedSystemDate: "2026-11-15" }
    });
    expect(operatorWrite.statusCode, operatorWrite.body).toBe(200);
    const after = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    expect(after.json()).toMatchObject({ simulatedSystemDate: "2026-11-14" });
  });

  it("keeps holiday and complaint actions tenant-scoped and requires a recorded decision", async () => {
    const weekendHoliday = await app.inject({ method: "POST", url: "/api/v1/manager/holidays", headers: { cookie: managerCookie }, payload: { date: "2027-01-02" } });
    expect(weekendHoliday.statusCode).toBe(400);
    const holiday = await app.inject({ method: "POST", url: "/api/v1/manager/holidays", headers: { cookie: managerCookie }, payload: { date: "2027-01-01" } });
    expect(holiday.statusCode, holiday.body).toBe(201);
    const duplicateHoliday = await app.inject({ method: "POST", url: "/api/v1/manager/holidays", headers: { cookie: managerCookie }, payload: { date: "2027-01-01" } });
    expect(duplicateHoliday.statusCode).toBe(409);
    const operatorHolidayRead = await app.inject({ method: "GET", url: "/api/v1/manager/holidays", headers: { cookie: operatorCookie } });
    expect(operatorHolidayRead.statusCode).toBe(403);

    const screenshot = { mimeType: "image/png", base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf2sAAAAASUVORK5CYII=" };
    const scope = "Điểm danh ngày 06/11";
    // exam_eligibility complaints need an over-absence month; an attendance complaint exercises the same evidence and decision flow.
    const invalid = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie: learnerCookie },
      payload: { kind: "attendance", reason: "Một ngày điểm danh bị thiếu.", screenshot: { ...screenshot, mimeType: "image/jpeg" } } });
    expect(invalid.statusCode).toBe(400);
    const complaint = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie: learnerCookie },
      payload: { kind: "attendance", reason: "Một ngày điểm danh bị thiếu.", scope, screenshot } });
    expect(complaint.statusCode, complaint.body).toBe(201);
    const duplicateComplaint = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie: learnerCookie }, payload: { kind: "attendance", reason: "Gửi trùng đơn." } });
    expect(duplicateComplaint.statusCode).toBe(409);
    const complaintId = (complaint.json() as { complaint: { id: string } }).complaint.id;
    const url = `/api/v1/request-evidence/complaint/${complaintId}`;
    for (const cookie of [learnerCookie, managerCookie]) {
      const proof = await app.inject({ method: "GET", url, headers: { cookie } });
      expect(proof.statusCode).toBe(200);
      expect(proof.headers["content-type"]).toBe("image/png");
      expect(proof.headers["cache-control"]).toBe("private, no-store");
      expect(proof.rawPayload.toString("base64")).toBe(screenshot.base64);
    }
    for (const cookie of [operatorCookie, emptyManagerCookie]) {
      expect((await app.inject({ method: "GET", url, headers: { cookie } })).statusCode).toBe(404);
    }
    const inbox = await app.inject({ method: "GET", url: "/api/v1/manager/complaints", headers: { cookie: managerCookie } });
    expect(inbox.json().complaints).toContainEqual(expect.objectContaining({ id: complaintId, scope, hasEvidence: true }));
    expect(inbox.body).not.toContain(screenshot.base64);
    const missingReason = await app.inject({ method: "POST", url: `/api/v1/manager/complaints/${complaintId}/decision`, headers: { cookie: managerCookie }, payload: { decision: "rejected", resolution: "" } });
    expect(missingReason.statusCode).toBe(400);
    const approved = await app.inject({ method: "POST", url: `/api/v1/manager/complaints/${complaintId}/decision`, headers: { cookie: managerCookie }, payload: { decision: "approved", resolution: "Đã sửa điểm danh." } });
    expect(approved.statusCode, approved.body).toBe(200);
    const ownComplaints = await app.inject({ method: "GET", url: "/api/v1/learner/complaints", headers: { cookie: learnerCookie } });
    expect(ownComplaints.json()).toMatchObject({ complaints: [{ id: complaintId, status: "approved", resolution: "Đã sửa điểm danh.", scope, hasEvidence: true }] });
  });

  it("uses frozen survey revisions and monthly scores for a historical filtered Manager view", async () => {
    const month = "2025-01";
    const rating = { kind: "rating", prompt: "Đánh giá", required: false };
    const text = { kind: "text", prompt: "Góp ý", required: false };
    const [unanswered, textOnly] = (await pool.query<{ id: string }>(
      `insert into users (id, organization_id, role, display_name, email, created_at)
       values (gen_random_uuid(), $1, 'learner', 'Chưa chấm điểm', 'unanswered-manager-test@example.com', '2025-01-01'),
              (gen_random_uuid(), $1, 'learner', 'Phản hồi chữ', 'text-manager-test@example.com', '2025-01-01')
       returning id`, [DEMO_IDS.organization]
    )).rows;
    for (const [revision, learnerId, questions, answers] of [
      [1, DEMO_IDS.learner, [rating, rating], [{ questionIndex: 0, value: 4 }, { questionIndex: 1, value: 2 }]],
      [2, unanswered!.id, [text, rating], [{ questionIndex: 0, value: "5" }]],
      [3, textOnly!.id, [text], [{ questionIndex: 0, value: "5" }]]
    ] as const) {
      await pool.query(
        `insert into monthly_survey_forms (organization_id, month, revision, title, questions, published_at)
         values ($1, $2, $3, 'Khảo sát', $4::jsonb, '2025-01-31')`,
        [DEMO_IDS.organization, month, revision, JSON.stringify(questions)]
      );
      await pool.query(
        `insert into monthly_survey_submissions (organization_id, month, learner_id, revision, answers)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [DEMO_IDS.organization, month, learnerId, revision, JSON.stringify(answers)]
      );
    }
    const insertScores = async (kind: "final" | "pass_course" | "placement", key: string, scores: number[]) => {
      const { rows: [attempt] } = await pool.query<{ id: string }>(
        `with definition as (
           insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
           values (gen_random_uuid(), $1, $2, $3, 'Manager score fixture') returning id
         ), version as (
           insert into assessment_versions (id, definition_id, version, status, blueprint)
           select gen_random_uuid(), id, 1, 'published', '{}'::jsonb from definition returning id
         )
         insert into assessment_attempts (id, assessment_version_id, learner_id, status, started_at, submitted_at)
         select gen_random_uuid(), id, $4, 'approved', '2025-01-31', '2025-01-31' from version
         returning id`, [DEMO_IDS.organization, key, kind, DEMO_IDS.learner]
      );
      await pool.query(
        `insert into assessment_scores (id, attempt_id, section, score, source)
         select gen_random_uuid(), $1, section, score, 'human'
         from unnest(array['listening', 'reading', 'writing', 'speaking'], $2::int[]) as item(section, score)`,
        [attempt!.id, scores]
      );
    };
    await insertScores("final", `monthly-final-${month}-a2`, [21, 22, 17, 18]);
    await insertScores("pass_course", "manager-test-pass-course", [18, 37, 16, 16]);


    const url = `/api/v1/manager/monthly-overview?month=${month}`;
    const view = await app.inject({ method: "GET", url, headers: { cookie: managerCookie } });
    expect(view.statusCode, view.body).toBe(200);
    expect(view.json()).toMatchObject({
      month, survey: { submissions: 3, ratingResponses: 2, withoutRatingQuestion: 1, unansweredRating: 1, average: 3 }
    });
    const filtered = await app.inject({ method: "GET", url: url + "&cefr=A2", headers: { cookie: managerCookie } });
    expect(filtered.statusCode, filtered.body).toBe(200);
    expect(filtered.json()).toMatchObject({
      cefr: "A2", survey: { submissions: 1, ratingResponses: 2, average: 3 },
      learners: [{ learnerId: DEMO_IDS.learner, exam: { status: "approved", scores: { listening: 21, reading: 22, writing: 17, speaking: 18 }, total: 78 } }]
    });
    expect(filtered.body).not.toMatch(/passCourse|placementScore|credential|pin/i);
    const profile = await app.inject({ method: "GET", url: `/api/v1/manager/learners/${DEMO_IDS.learner}`, headers: { cookie: managerCookie } });
    expect(profile.statusCode, profile.body).toBe(200);
    expect(profile.json().assessmentScores).toEqual({ placement: 55, passCourse: 87 });
    const current = await app.inject({ method: "GET", url: "/api/v1/manager/monthly-overview", headers: { cookie: managerCookie } });
    expect(current.statusCode, current.body).toBe(200);
    expect(current.json().survey).toEqual({ submissions: 0, ratingResponses: 0, withoutRatingQuestion: 0, unansweredRating: 0, average: null });
    const outside = await app.inject({ method: "GET", url, headers: { cookie: emptyManagerCookie } });
    expect(outside.statusCode, outside.body).toBe(200);
    expect(outside.json()).toMatchObject({ survey: { submissions: 0 }, learners: [] });
  });

  it("renames a same-organisation learner with an audit record and keeps other roles and organisations out", async () => {
    const url = (learnerId: string) => `/api/v1/manager/learners/${learnerId}/display-name`;
    const rename = (cookie: string, learnerId: string, displayName: string) => app.inject({
      method: "PATCH", url: url(learnerId), headers: { cookie }, payload: { displayName }
    });
    expect((await rename(learnerCookie, DEMO_IDS.learner, "Tên mới")).statusCode).toBe(403);
    expect((await rename(operatorCookie, DEMO_IDS.learner, "Tên mới")).statusCode).toBe(403);
    expect((await rename(managerCookie, outsideLearnerId, "Tên mới")).statusCode).toBe(404);
    expect((await rename(managerCookie, DEMO_IDS.learner, " ")).statusCode).toBe(400);
    const saved = await rename(managerCookie, DEMO_IDS.learner, "  Minh Anh Mới  ");
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toEqual({ displayName: "Minh Anh Mới" });
    expect((await rename(managerCookie, DEMO_IDS.learner, "Minh Anh Mới")).statusCode).toBe(200);
    const audit = await pool.query(
      `select actor_user_id, payload from audit_events where action = 'account.display_name.change' and entity_id = $1`,
      [DEMO_IDS.learner]
    );
    expect(audit.rows).toEqual([{ actor_user_id: DEMO_IDS.manager, payload: { previousDisplayName: "Nguyễn Minh Anh", displayName: "Minh Anh Mới" } }]);
  });

});
