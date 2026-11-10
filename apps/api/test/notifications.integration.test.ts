import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const webhookReminderLearnerId = "00000000-0000-4000-8000-000000000120";

describe("learner notifications API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const originalEncryptionKey = process.env.E4S_SETTINGS_ENCRYPTION_KEY;
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, reminderEmailSender: { sendReminder: async () => ({ externalId: "test-notification-email" }) } });

  beforeAll(async () => {
    process.env.E4S_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)`,
        [
          DEMO_IDS.learner, await createPinHash("123456"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass")
        ]
      );
      await client.query("update users set created_at = now() - interval '5 days' where id = $1", [DEMO_IDS.learner]);
      await client.query("update activities set occurred_at = now() - interval '5 days' where learner_id = $1", [DEMO_IDS.learner]);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email, created_at)
         values ($1, $2, 'learner', 'Học viên Webhook', 'webhook-reminder@e4s.local', now() - interval '5 days')`,
        [webhookReminderLearnerId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into organization_settings (organization_id, configuration) values ($1, '{"simulatedSystemDate":"2026-11-10"}')
         on conflict (organization_id) do update set configuration = excluded.configuration`, [DEMO_IDS.organization]
      );
      await client.query(
        `with month as (
           insert into program_months (id, organization_id, month, exam_date, lesson_count)
           values (gen_random_uuid(), $1, '2026-11', '2026-11-30', 20) returning id
         )
         insert into month_frameworks (id, program_month_id, cefr, status, published_at, published_on)
         select gen_random_uuid(), id, 'A2', 'approved', now(), '2026-11-01' from month`, [DEMO_IDS.organization]
      );
      await client.query(
        `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on)
         values (gen_random_uuid(), $1, $2, 'A2', true, '2026-11-04')
         on conflict (program_id, learner_id) do update set cefr_started_on = excluded.cefr_started_on`,
        [DEMO_IDS.program, webhookReminderLearnerId]
      );
      await client.query("update enrollments set cefr_started_on = '2026-11-04' where learner_id = $1", [DEMO_IDS.learner]);
    } finally {
      client.release();
    }
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    if (originalEncryptionKey === undefined) delete process.env.E4S_SETTINGS_ENCRYPTION_KEY;
    else process.env.E4S_SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
    await app.close();
    await pool.end();
  });

  it("exposes a manager-queued reminder to its learner with delivery evidence", async () => {
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    expect(managerLogin.statusCode, managerLogin.body).toBe(200);
    const managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const queued = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${DEMO_IDS.learner}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "notification-focused-1", channel: "email" }
    });
    expect(queued.statusCode, queued.body).toBe(200);
    const reminderId = queued.json().reminderId as string;

    const learnerLogin = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
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
        status: "sent",
        deliveries: [expect.objectContaining({ provider: "resend", status: "sent" })]
      })]
    });
  });

  it("delivers a complaint to the Manager and returns the decision to its learner", async () => {
    const cookieFor = async (url: string, payload: object) => {
      const login = await app.inject({ method: "POST", url, payload });
      expect(login.statusCode, login.body).toBe(200);
      return String(login.headers["set-cookie"]).split(";")[0]!;
    };
    const learner = await cookieFor("/api/auth/learner/login", { email: "minh.anh.nguyen@e4s.local", pin: "123456" });
    const manager = await cookieFor("/api/auth/staff/login", { email: "quoc.bao.le@e4s.local", password: "manager-pass" });
    const inbox = "/api/v1/me/notifications";
    const submitted = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie: learner }, payload: { kind: "attendance", reason: "Điểm danh chưa được ghi nhận" } });
    expect(submitted.statusCode, submitted.body).toBe(201);
    const complaintId = submitted.json().complaint.id;
    expect((await app.inject({ url: inbox })).statusCode).toBe(401);

    const queue = await app.inject({ url: inbox, headers: { cookie: manager } });
    expect(queue.statusCode, queue.body).toBe(200);
    expect(queue.json()).toMatchObject({ unreadCount: 1, items: [{ kind: "complaint_received", readAt: null }] });
    const notificationId = queue.json().items[0].id;
    const read = (cookie: string) => app.inject({ method: "PATCH", url: inbox + "/read", headers: { cookie }, payload: { ids: [notificationId] } });
    await read(learner);
    expect((await app.inject({ url: inbox + "?limit=0", headers: { cookie: manager } })).json().unreadCount).toBe(1);
    expect((await read(manager)).json().unreadCount).toBe(0);

    const decision = await app.inject({ method: "POST", url: "/api/v1/manager/complaints/" + complaintId + "/decision", headers: { cookie: manager }, payload: { decision: "approved", resolution: "Đã kiểm tra" } });
    expect(decision.statusCode, decision.body).toBe(200);
    const result = await app.inject({ url: inbox, headers: { cookie: learner } });
    expect(result.json()).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ kind: "complaint_approved" })]) });
    expect(result.body).not.toContain("Đã kiểm tra");
  });

  it("routes all four submitted exam types to Operator and results to their learner", async () => {
    const operatorLogin = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    const learnerLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    expect(operatorLogin.statusCode, operatorLogin.body).toBe(200);
    expect(learnerLogin.statusCode, learnerLogin.body).toBe(200);
    const operator = String(operatorLogin.headers["set-cookie"]).split(";")[0]!;
    const learner = String(learnerLogin.headers["set-cookie"]).split(";")[0]!;
    const inbox = "/api/v1/me/notifications";
    const examKinds = ["placement", "final", "level_up", "pass_course"];
    const attempts = [];
    for (const kind of examKinds) {
      const result = await pool.query<{ id: string }>(
        `with definition as (
           insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
           values (gen_random_uuid(), $1, $2 || '-inbox-scenario', $2, 'Scenario') returning id
         ), version as (
           insert into assessment_versions (id, definition_id, version, blueprint)
           select gen_random_uuid(), id, 1, '{}' from definition returning id
         )
         insert into assessment_attempts (id, assessment_version_id, learner_id)
         select gen_random_uuid(), id, $3 from version returning id`,
        [DEMO_IDS.organization, kind, DEMO_IDS.learner]
      );
      attempts.push(result.rows[0]!.id);
    }
    await pool.query("update assessment_attempts set status = 'pending_review' where id = any($1::uuid[])", [attempts]);
    await pool.query("update assessment_attempts set status = 'pending_review' where id = any($1::uuid[])", [attempts]);

    const first = await app.inject({ url: inbox + "?limit=2", headers: { cookie: operator } });
    expect(first.statusCode, first.body).toBe(200);
    const page = first.json();
    expect(page.items).toHaveLength(2);
    const second = await app.inject({ url: inbox + "?limit=20&cursor=" + page.nextCursor, headers: { cookie: operator } });
    const received = [...page.items, ...second.json().items].filter((item) => item.kind === "assessment_received");
    expect(received.map(item => item.context).sort()).toEqual(examKinds.slice().sort());
    const learnerBefore = await app.inject({ url: inbox, headers: { cookie: learner } });
    expect(learnerBefore.json().items).not.toEqual(expect.arrayContaining([expect.objectContaining({ kind: "assessment_received" })]));

    await pool.query("update assessment_attempts set status = 'needs_retry' where id = any($1::uuid[])", [attempts]);
    const learnerAfter = await app.inject({ url: inbox, headers: { cookie: learner } });
    const results = learnerAfter.json().items.filter((item: { kind: string }) => item.kind === "assessment_retry");
    expect(results.map((item: { context: string }) => item.context).sort()).toEqual(examKinds.slice().sort());
  });

  it("keeps notifications learner-owned", async () => {
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    const managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const forbidden = await app.inject({ method: "GET", url: "/api/v1/notifications", headers: { cookie: managerCookie } });
    expect(forbidden.statusCode, forbidden.body).toBe(403);
  });

  it("creates a worker delivery job only when the Base webhook is configured", async () => {
    await createRepositories(pool).manager.saveLearnerBaseNotification(DEMO_IDS.manager, webhookReminderLearnerId, { webhookUrl: "https://base.example.test/personal", webhookTemplate: '{"base_content":"{message}"}', destinationLabel: "Base riêng" });
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    const managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const queued = await app.inject({
      method: "POST",
      url: `/api/v1/manager/reminders/${webhookReminderLearnerId}`,
      headers: { cookie: managerCookie },
      payload: { requestId: "notification-webhook-focused-1", channel: "base" }
    });
    expect(queued.statusCode, queued.body).toBe(200);
    expect(queued.json()).toMatchObject({ provider: "base_webhook", deliveryStatus: "queued" });
    await expect(pool.query(
      "select kind, state, payload from jobs where kind = 'notification.base-webhook' and payload->>'reminderId' = $1",
      [queued.json().reminderId]
    )).resolves.toMatchObject({ rows: [{ kind: "notification.base-webhook", state: "queued", payload: { reminderId: queued.json().reminderId } }] });
  });

  it("keeps downgrade wording and exam publication scoped to the learner's current level", async () => {
    const operatorLogin = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    const learnerLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    const operator = String(operatorLogin.headers["set-cookie"]).split(";")[0]!;
    const learner = String(learnerLogin.headers["set-cookie"]).split(";")[0]!;
    await pool.query("update enrollments set cefr = 'A2', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
    const change = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/level`,
      headers: { cookie: operator }, payload: { mode: "direct", targetLevel: "A1", reason: "Điều chỉnh mức theo đánh giá", evidence: "Bài nói thử" }
    });
    expect(change.statusCode, change.body).toBe(200);

    const exams = await pool.query<{ id: string }>(
      `with definitions as (
         insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
         select gen_random_uuid(), $1, 'monthly-final-2099-09-' || cefr, 'final', 'Notification fixture'
         from unnest(array['a1', 'a2']) as cefr returning id
       )
       insert into assessment_versions (id, definition_id, version, blueprint)
       select gen_random_uuid(), id, 1, '{}' from definitions returning id`,
      [DEMO_IDS.organization]
    );
    await pool.query("update assessment_versions set status = 'published' where id = any($1::uuid[])", [exams.rows.map(row => row.id)]);
    const feed = await app.inject({ url: "/api/v1/me/notifications", headers: { cookie: learner } });
    expect(feed.statusCode, feed.body).toBe(200);
    const items = feed.json().items;
    expect(items).toContainEqual(expect.objectContaining({ kind: "level_changed", context: "lower:A1" }));
    expect(items.filter((item: { kind: string }) => item.kind === "monthly_exam_published")).toEqual([
      expect.objectContaining({ context: "2099-09" })
    ]);
    expect(items.some((item: { kind: string }) => item.kind === "monthly_exam_ready")).toBe(false);
  });

});
