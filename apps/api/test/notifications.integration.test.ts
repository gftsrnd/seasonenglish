import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const webhookReminderLearnerId = "00000000-0000-4000-8000-000000000120";

describe("learner notifications API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)`,
        [
          DEMO_IDS.learner, await createCredentialHash("learner-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
      await client.query("update users set created_at = now() - interval '5 days' where id = $1", [DEMO_IDS.learner]);
      await client.query("update activities set occurred_at = now() - interval '5 days' where learner_id = $1", [DEMO_IDS.learner]);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email, created_at)
         values ($1, $2, 'learner', 'Học viên Webhook', 'webhook-reminder@e4s.local', now() - interval '5 days')`,
        [webhookReminderLearnerId, DEMO_IDS.organization]
      );
    } finally {
      client.release();
    }
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("exposes a manager-queued reminder to its learner with delivery evidence", async () => {
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "manager@e4s.local", password: "manager-pass" }
    });
    expect(managerLogin.statusCode, managerLogin.body).toBe(200);
    const managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const queued = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${DEMO_IDS.learner}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "notification-focused-1" }
    });
    expect(queued.statusCode, queued.body).toBe(200);
    const reminderId = queued.json().reminderId as string;

    const learnerLogin = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    expect(learnerLogin.statusCode, learnerLogin.body).toBe(200);
    const learnerCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const response = await app.inject({
      method: "GET", url: "/api/v1/notifications", headers: { cookie: learnerCookie }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: [expect.objectContaining({
        id: reminderId,
        status: "queued",
        deliveries: [expect.objectContaining({ provider: "local_queue", status: "queued" })]
      })]
    });
  });

  it("keeps notifications learner-owned", async () => {
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "manager@e4s.local", password: "manager-pass" }
    });
    const managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const forbidden = await app.inject({ method: "GET", url: "/api/v1/notifications", headers: { cookie: managerCookie } });
    expect(forbidden.statusCode, forbidden.body).toBe(403);
  });

  it("creates a worker delivery job only when the Base webhook is configured", async () => {
    await pool.query(
      `insert into organization_settings (organization_id, configuration, updated_by)
       values ($1, $2::jsonb, $3)
       on conflict (organization_id) do update set configuration = excluded.configuration, updated_by = excluded.updated_by`,
      [DEMO_IDS.organization, JSON.stringify({ baseWebhookUrl: "http://127.0.0.1:3999/base", baseWebhookTemplate: "{\"base_content\":\"{message}\"}" }), DEMO_IDS.manager]
    );
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "manager@e4s.local", password: "manager-pass" }
    });
    const managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const queued = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${webhookReminderLearnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "notification-webhook-focused-1" }
    });
    expect(queued.statusCode, queued.body).toBe(200);
    expect(queued.json()).toMatchObject({ provider: "base_webhook", deliveryStatus: "queued" });
    await expect(pool.query(
      "select kind, state, payload from jobs where kind = 'notification.base-webhook' and payload->>'reminderId' = $1",
      [queued.json().reminderId]
    )).resolves.toMatchObject({ rows: [{ kind: "notification.base-webhook", state: "queued", payload: { reminderId: queued.json().reminderId } }] });
  });
});
