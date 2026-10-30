import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("manager reminder channel API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
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
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.manager, await createCredentialHash("manager-pass")]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
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
      [DEMO_IDS.organization, JSON.stringify({ baseWebhookUrl: "", baseWebhookTemplate: "{\"base_content\":\"{message}\"}" }), DEMO_IDS.manager]
    );
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
    await app.close();
    await pool.end();
  });

  async function createLearner(email: string | null) {
    const learnerId = randomUUID();
    await pool.query(
      `insert into users (id, organization_id, role, display_name, email, status, created_at)
       values ($1, $2, 'learner', 'Reminder API Learner', $3, 'active', now() - interval '5 days')`,
      [learnerId, DEMO_IDS.organization, email]
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

  it("queues Base.vn only without invoking Resend", async () => {
    const learnerId = await createLearner("base-learner@example.com");
    await pool.query(
      "update organization_settings set configuration = coalesce(configuration, '{}'::jsonb) || $2::jsonb where organization_id = $1",
      [DEMO_IDS.organization, JSON.stringify({ baseWebhookUrl: "https://base.example.test/reminders" })]
    );
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
