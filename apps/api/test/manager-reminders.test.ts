import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("manager reminder channel API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const originalEncryptionKey = process.env.E4S_SETTINGS_ENCRYPTION_KEY;
  process.env.E4S_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = "resend-test-key";
  process.env.RESEND_FROM_EMAIL = "E4S <reminders@example.com>";
  const app = buildApi({ pool, secureCookies: false });
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      const framework = await client.query<{ id: string }>(
        `with month as (
           insert into program_months (id, organization_id, month, exam_date, lesson_count)
           values (gen_random_uuid(), $1, '2026-11', '2026-11-30', 20) returning id
         )
         insert into month_frameworks (id, program_month_id, cefr, status, scope_hash, published_at, published_on)
         select gen_random_uuid(), id, 'A1', 'approved', 'scope', now(), '2026-11-01' from month returning id`,
        [DEMO_IDS.organization]
      );
      // A missed weekday counts as an absence only when an approved lesson was available on it.
      const lessonSetId = randomUUID();
      await client.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A1')", [lessonSetId, framework.rows[0]!.id]);
      const lessonDates = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
      for (const [index, lessonDate] of lessonDates.entries()) {
        const versionId = randomUUID();
        const lessonId = randomUUID();
        await client.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, lessonSetId, index + 1]);
        await client.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [lessonId, versionId, index + 1]);
        await client.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'published', '{}'::jsonb)", [randomUUID(), lessonId]);
        await client.query(
          "insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', 'approved')",
          [randomUUID(), framework.rows[0]!.id, index + 1, lessonDate, lessonId]
        );
      }
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.manager, await createCredentialHash("test-manager-pw")]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "test-manager-pw" }
    });
    managerCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  beforeEach(async () => {
    vi.unstubAllGlobals();
    await pool.query(
      `insert into organization_settings (organization_id, configuration, updated_by)
       values ($1, $2::jsonb, $3)
       on conflict (organization_id) do update
       set configuration = excluded.configuration, updated_by = excluded.updated_by, updated_at = now()`,
      [DEMO_IDS.organization, JSON.stringify({ simulatedSystemDate: "2026-11-10", baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}" }), DEMO_IDS.manager]
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (originalEncryptionKey === undefined) delete process.env.E4S_SETTINGS_ENCRYPTION_KEY;
    else process.env.E4S_SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
    await app.close();
    await pool.end();
  });

  async function createLearner(email: string | null, levelStart: string | null = "2026-11-04") {
    const learnerId = randomUUID();
    await pool.query(
      `insert into users (id, organization_id, role, display_name, email, status, created_at)
       values ($1, $2, 'learner', 'Reminder API Learner', $3, 'active', now() - interval '5 days')`,
      [learnerId, DEMO_IDS.organization, email]
    );
    if (levelStart) await pool.query(
      `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on)
       values (gen_random_uuid(), $1, $2, 'A1', true, $3)`, [DEMO_IDS.program, learnerId, levelStart]
    );
    return learnerId;
  }

  it("sends email through Resend only and records the provider result", async () => {
    const learnerId = await createLearner("learner@example.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "resend-message-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${learnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "email-api-request-1", channel: "email" }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ learnerId, provider: "resend", status: "sent", deliveryStatus: "sent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    await expect(pool.query("select count(*)::int as count from jobs where payload->>'reminderId' = $1", [response.json().reminderId]))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("automatically disables a learner after five missed study days and audits the action", async () => {
    const learnerId = await createLearner("inactive-lock@example.com", "2026-11-03");
    const unplaced = await createLearner("unplaced@example.com", null);
    const response = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });

    expect(response.statusCode, response.body).toBe(200);
    await expect(pool.query("select status from users where id = $1", [learnerId]))
      .resolves.toMatchObject({ rows: [{ status: "disabled" }] });
    await expect(pool.query("select status from users where id = $1", [unplaced]))
      .resolves.toMatchObject({ rows: [{ status: "active" }] });
    await expect(pool.query("select action from audit_events where entity_id = $1 order by created_at desc limit 1", [learnerId]))
      .resolves.toMatchObject({ rows: [{ action: "learner.inactivity_locked" }] });
  });

  it("leaves academic appeals pending after 24 hours", async () => {
    const appealId = randomUUID();
    await pool.query(
      `insert into appeals (id, attempt_id, learner_id, reason, created_at)
       values ($1, $2, $3, 'Please review this monthly exam result.', '2026-11-05 12:00+07')`,
      [appealId, DEMO_IDS.placementAttempt, DEMO_IDS.learner]
    );

    const response = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });

    expect(response.statusCode, response.body).toBe(200);
    await expect(pool.query("select status, resolution, resolved_at from appeals where id = $1", [appealId]))
      .resolves.toMatchObject({ rows: [{ status: "pending", resolution: null, resolved_at: null }] });
    await expect(pool.query("select action from audit_events where entity_id = $1 order by created_at desc limit 1", [appealId]))
      .resolves.toMatchObject({ rows: [] });
    const appeals = await app.inject({ method: "GET", url: `/api/v1/content/review/appeals?id=${appealId}`, headers: { cookie: managerCookie } });
    expect(appeals.statusCode, appeals.body).toBe(200);
    expect(appeals.json()).toMatchObject({ appeals: [{ id: appealId, status: "pending", overdue: true }] });
  });

  it("queues Base.vn only without invoking Resend", async () => {
    const learnerId = await createLearner("base-learner@example.com");
    const saved = await app.inject({ method: "PUT", url: `/api/v1/manager/learners/${learnerId}/notifications/base`, headers: { cookie: managerCookie }, payload: { webhookUrl: "https://base.example.test/reminders", webhookTemplate: '{"base_content":"{message}"}', destinationLabel: "Base riêng" } });
    expect(saved.statusCode, saved.body).toBe(200);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${learnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "base-api-request-1", channel: "base" }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ learnerId, provider: "base_webhook", status: "queued", deliveryStatus: "queued" });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(pool.query("select kind, state from jobs where payload->>'reminderId' = $1", [response.json().reminderId]))
      .resolves.toMatchObject({ rows: [{ kind: "notification.base-webhook", state: "queued" }] });
  });

  it("scopes personal channels, masks secrets, preserves blank URLs, and snapshots queued destinations", async () => {
    const learnerId = await createLearner("personal-base@example.com");
    const otherId = await createLearner("other-base@example.com");
    const secretUrl = "https://base.example.test/incoming/secret-token";
    const save = (id: string, payload: Record<string, unknown>) => app.inject({ method: "PUT", url: `/api/v1/manager/learners/${id}/notifications/base`, headers: { cookie: managerCookie }, payload });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const saved = await save(learnerId, { webhookUrl: secretUrl, webhookTemplate: '{"base_content":"{message}"}', destinationLabel: "Base cá nhân" });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ configured: true, destinationLabel: "Base cá nhân" });
    expect(saved.body).not.toContain(secretUrl);
    const labelEdit = await save(learnerId, { webhookUrl: "", webhookTemplate: '{"base_content":"{message}"}', destinationLabel: "Base mới" });
    expect(labelEdit.statusCode, labelEdit.body).toBe(200);
    expect(labelEdit.json()).toMatchObject({ configured: true });
    const queued = await app.inject({ method: "POST", url: `/api/v1/manager/reminders/${learnerId}`, headers: { cookie: managerCookie }, payload: { requestId: "personal-base-snapshot", channel: "base" } });
    expect(queued.statusCode, queued.body).toBe(200);
    await save(learnerId, { webhookUrl: "https://base.example.test/new-secret", webhookTemplate: '{"base_content":"new {message}"}', destinationLabel: "Changed" });
    const delivery = await createRepositories(pool).notifications.findWebhookDelivery(queued.json().reminderId);
    expect(delivery).toMatchObject({ webhookUrl: secretUrl, webhookTemplate: '{"base_content":"{message}"}' });
    const missing = await app.inject({ method: "POST", url: `/api/v1/manager/reminders/${otherId}`, headers: { cookie: managerCookie }, payload: { requestId: "personal-base-other", channel: "base" } });
    expect(missing.statusCode, missing.body).toBe(422);
    const stored = await pool.query("select secret_ciphertext from learner_base_notification_channels where learner_id = $1", [learnerId]);
    expect(stored.rows[0].secret_ciphertext).not.toContain("https:");
    const history = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(history.json().history).toEqual(expect.arrayContaining([expect.objectContaining({ learnerId, provider: "base_webhook", recipient: "Base mới" })]));
    expect(history.body).not.toContain("secret-token");
    const removed = await save(learnerId, { remove: true, webhookUrl: "", webhookTemplate: '{}', destinationLabel: "" });
    expect(removed.json()).toMatchObject({ configured: false });
    expect(fetchMock).not.toHaveBeenCalled();
    const audits = await pool.query("select payload from audit_events where entity_id = $1", [learnerId]);
    expect(JSON.stringify(audits.rows)).not.toContain("secret-token");
    const foreign = randomUUID();
    await pool.query("insert into organizations (id, slug, name) values ($1, $2, 'Other organization')", [foreign, foreign]);
    const foreignLearner = randomUUID();
    await pool.query("insert into users (id, organization_id, role, display_name, status) values ($1, $2, 'learner', 'Foreign', 'active')", [foreignLearner, foreign]);
    const forbidden = await save(foreignLearner, { webhookUrl: secretUrl, webhookTemplate: '{"base_content":"{message}"}', destinationLabel: "Foreign" });
    expect(forbidden.statusCode, forbidden.body).toBe(404);
  });

  it("ignores legacy global Base configuration and validates the recipient payload without sending", async () => {
    const learnerId = await createLearner("legacy-global@example.com");
    await pool.query("update organization_settings set configuration = configuration || $2::jsonb where organization_id = $1", [DEMO_IDS.organization, JSON.stringify({ baseWebhookUrl: "https://base.example.test/global-secret" })]);
    const response = await app.inject({ method: "POST", url: `/api/v1/manager/reminders/${learnerId}`, headers: { cookie: managerCookie }, payload: { requestId: "legacy-global-is-not-personal", channel: "base" } });
    expect(response.statusCode, response.body).toBe(422);
    const invalid = await app.inject({ method: "PUT", url: `/api/v1/manager/learners/${learnerId}/notifications/base`, headers: { cookie: managerCookie }, payload: { webhookUrl: "http://base.example.test/personal", webhookTemplate: '[]', destinationLabel: "Base" } });
    expect(invalid.statusCode, invalid.body).toBe(400);
  });

  it("makes personal Base available only for its configured learner in the candidate list", async () => {
    const learnerId = await createLearner("candidate-personal-base@example.com");
    const otherId = await createLearner("candidate-no-base@example.com");
    await pool.query("update users set created_at = now() - interval '4 days' where id = any($1::uuid[])", [[learnerId, otherId]]);
    await app.inject({ method: "PUT", url: `/api/v1/manager/learners/${learnerId}/notifications/base`, headers: { cookie: managerCookie }, payload: { webhookUrl: "https://base.example.test/private-token", destinationLabel: "Base cá nhân" } });
    const response = await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ learnerId, baseNotification: expect.objectContaining({ configured: true, destinationLabel: "Base cá nhân" }) }),
      expect.objectContaining({ learnerId: otherId, baseNotification: expect.objectContaining({ configured: false }) })
    ]));
    expect(response.body).not.toContain("private-token");
  });

  it("permits explicit independent channels and deduplicates repeated Base sends", async () => {
    const learnerId = await createLearner("independent-base@example.com");
    await app.inject({ method: "PUT", url: `/api/v1/manager/learners/${learnerId}/notifications/base`, headers: { cookie: managerCookie }, payload: { webhookUrl: "https://base.example.test/independent", destinationLabel: "Base riêng" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"id":"email-independent"}', { status: 200 })));
    const send = (channel: string, requestId: string) => app.inject({ method: "POST", url: `/api/v1/manager/reminders/${learnerId}`, headers: { cookie: managerCookie }, payload: { channel, requestId } });
    const email = await send("email", "independent-email");
    const base = await send("base", "independent-base");
    expect(email.statusCode, email.body).toBe(200);
    expect(base.statusCode, base.body).toBe(200);
    const repeat = await send("base", "independent-base-again");
    expect(repeat.json().reminderId).toBe(base.json().reminderId);
    expect(base.json().reminderId).not.toBe(email.json().reminderId);
  });

  it("retires only unsent legacy Base deliveries and retains global configuration at rest", async () => {
    const learnerId = await createLearner("legacy-migration@example.com");
    const queuedId = randomUUID(); const sentId = randomUUID();
    await pool.query("insert into reminders (id, learner_id, reason, message, status, created_by) values ($1, $3, 'inactive_learning', 'Legacy queued', 'queued', $4), ($2, $3, 'inactive_learning', 'Legacy sent', 'sent', $4)", [queuedId, sentId, learnerId, DEMO_IDS.manager]);
    await pool.query("insert into notification_deliveries (id, reminder_id, provider, status) values ($1, $3, 'base_webhook', 'queued'), ($2, $4, 'base_webhook', 'sent')", [randomUUID(), randomUUID(), queuedId, sentId]);
    await pool.query("update organization_settings set configuration = configuration || $2::jsonb where organization_id = $1", [DEMO_IDS.organization, JSON.stringify({ baseWebhookUrl: "https://base.example.test/retained-secret" })]);
    const migration = await readFile(new URL("../../../packages/database/migrations/0099_personal_base_notification_channels.sql", import.meta.url), "utf8");
    await pool.query(migration.slice(migration.indexOf("with blocked as")));
    const rows = await pool.query("select reminder_id, status, response from notification_deliveries where reminder_id = any($1::uuid[])", [[queuedId, sentId]]);
    expect(rows.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ reminder_id: queuedId, status: "failed", response: { code: "BASE_RECIPIENT_CONFIGURATION_REQUIRED" } }),
      expect.objectContaining({ reminder_id: sentId, status: "sent" })
    ]));
    expect(await createRepositories(pool).notifications.findWebhookDelivery(queuedId)).toBeNull();
    const settings = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    expect(settings.body).not.toContain("retained-secret");
    const persisted = await pool.query("select configuration->>'baseWebhookUrl' as url from organization_settings where organization_id = $1", [DEMO_IDS.organization]);
    expect(persisted.rows[0].url).toBe("https://base.example.test/retained-secret");
  });

  it("reports a missing learner email without creating reminder history", async () => {
    const learnerId = await createLearner(null);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${learnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "missing-email-api-request", channel: "email" }
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toEqual({ code: "MANAGER_REMINDER_EMAIL_MISSING" });
    await expect(pool.query("select count(*)::int as count from reminders where learner_id = $1", [learnerId]))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("reports a missing Base.vn webhook without falling back to email", async () => {
    const learnerId = await createLearner("no-webhook@example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${learnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "missing-webhook-api-request", channel: "base" }
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toEqual({ code: "MANAGER_REMINDER_BASE_WEBHOOK_MISSING" });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(pool.query("select count(*)::int as count from reminders where learner_id = $1", [learnerId]))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("records a failed Resend attempt without reporting success", async () => {
    const learnerId = await createLearner("failed-email@example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider rejected", { status: 503 })));

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${learnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "failed-email-api-request", channel: "email" }
    });

    expect(response.statusCode, response.body).toBe(502);
    expect(response.json()).toEqual({ code: "MANAGER_REMINDER_EMAIL_DELIVERY_FAILED" });
    await expect(pool.query(
      `select r.status, nd.status as delivery_status, nd.provider
       from reminders r join notification_deliveries nd on nd.reminder_id = r.id
       where r.learner_id = $1`,
      [learnerId]
    )).resolves.toMatchObject({ rows: [{ status: "failed", delivery_status: "failed", provider: "resend" }] });
  });
});
