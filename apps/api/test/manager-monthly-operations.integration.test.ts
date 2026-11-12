import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const month = "2031-03";
const ids = {
  operatorTwo: "00000000-0000-4000-8000-00000000a001",
  programMonth: "00000000-0000-4000-8000-00000000a002",
  frameworkA2: "00000000-0000-4000-8000-00000000a003",
  frameworkB1: "00000000-0000-4000-8000-00000000a004",
  lessonSet: "00000000-0000-4000-8000-00000000a005",
  setVersionDay1First: "00000000-0000-4000-8000-00000000a006",
  setVersionDay1Second: "00000000-0000-4000-8000-00000000a007",
  setVersionDay2: "00000000-0000-4000-8000-00000000a008",
  lessonDay1First: "00000000-0000-4000-8000-00000000a009",
  lessonDay1Second: "00000000-0000-4000-8000-00000000a00a",
  lessonDay2: "00000000-0000-4000-8000-00000000a00b",
  monthLessonDay1: "00000000-0000-4000-8000-00000000a00c",
  monthLessonDay2: "00000000-0000-4000-8000-00000000a00d",
  progress: "00000000-0000-4000-8000-00000000a00e",
  finalVersion: "00000000-0000-4000-8000-00000000a00f",
  reminder: "00000000-0000-4000-8000-00000000a010",
  delivery: "00000000-0000-4000-8000-00000000a011"
};
const monthlyFinalTask = "00000000-0000-4000-8000-000000001171";

type OperatorRow = {
  operatorId: string; poolsCreated: number; poolsApproved: number; lessonsDrafted: number; lessonsResaved: number;
  lessonsApproved: number; lessonsPublished: number; averageDraftToApprovalHours: number | null; finalsGenerated: number;
  finalGenerationFailures: number; finalsPublished: number; completions: number; averageScore: number | null;
  resourcePools: { cefr: string; status: string; createdByOperator: boolean; approvedByOperator: boolean; published: boolean }[];
};

describe("Manager monthly operations, reminder-history and holiday deletion API", () => {
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
        `insert into users (id, organization_id, role, display_name, email, avatar, status)
         values ($1, $2, 'operator', 'Vận hành Hai', 'van.hanh.hai@e4s.local', '{"color":"rose","acc":"star","bg":2}'::jsonb, 'active')`,
        [ids.operatorTwo, DEMO_IDS.organization]
      );
      await client.query(
        `insert into program_months (id, organization_id, month, exam_date, lesson_count, theme_title, brief_status)
         values ($1, $2, $3, '2031-03-31', 2, 'Chủ đề thử', 'approved')`,
        [ids.programMonth, DEMO_IDS.organization, month]
      );
      // A2: created, approved and published by Operator 1. B1: a draft created by Operator 2.
      await client.query(
        `insert into month_frameworks (id, program_month_id, cefr, status, created_by, approved_by, approved_at, published_at, published_on)
         values ($1, $3, 'A2', 'approved', $4, $4, now(), now(), '2031-03-01'),
                ($2, $3, 'B1', 'draft', $5, null, null, null, null)`,
        [ids.frameworkA2, ids.frameworkB1, ids.programMonth, DEMO_IDS.operator, ids.operatorTwo]
      );
      await client.query("insert into lesson_sets (id, program_week_id, month_framework_id, cefr) values ($1, null, $2, 'A2')", [ids.lessonSet, ids.frameworkA2]);
      // Day 1 was saved twice by Operator 1 (first draft, then the version that was approved 2 hours later).
      await client.query(
        `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by, created_at) values
           ($1, $4, 1, 'draft', '{"source":"monthly","month":"2031-03","dayNumber":1}', $5, now() - interval '5 hours'),
           ($2, $4, 2, 'published', '{"source":"monthly","month":"2031-03","dayNumber":1}', $5, now() - interval '3 hours'),
           ($3, $4, 3, 'draft', '{"source":"monthly","month":"2031-03","dayNumber":2}', $6, now() - interval '1 hour')`,
        [ids.setVersionDay1First, ids.setVersionDay1Second, ids.setVersionDay2, ids.lessonSet, DEMO_IDS.operator, ids.operatorTwo]
      );
      await client.query(
        `insert into lessons (id, lesson_set_version_id, day_number, title) values
           ($1, $4, 1, 'Ngày 1 bản đầu'), ($2, $5, 1, 'Ngày 1'), ($3, $6, 2, 'Ngày 2')`,
        [ids.lessonDay1First, ids.lessonDay1Second, ids.lessonDay2, ids.setVersionDay1First, ids.setVersionDay1Second, ids.setVersionDay2]
      );
      await client.query(
        `insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status, approved_by, approved_at) values
           ($1, $3, 1, '2031-03-03', $4, 'scope', 'approved', $6, now() - interval '1 hour'),
           ($2, $3, 2, '2031-03-04', $5, 'scope', 'draft', null, null)`,
        [ids.monthLessonDay1, ids.monthLessonDay2, ids.frameworkA2, ids.lessonDay1Second, ids.lessonDay2, DEMO_IDS.operator]
      );
      await client.query(
        `insert into progress_records (id, learner_id, lesson_id, status, score, completed_at)
         values ($1, $2, $3, 'completed', 90, now())`,
        [ids.progress, DEMO_IDS.learner, ids.lessonDay1Second]
      );
      await client.query(
        `insert into ai_runs (id, task_id, user_id, provider, model, status, input_hash, trace_id, request_key, error_code) values
           (gen_random_uuid(), $1, $2, 'test', 'test', 'succeeded', 'h1', 'trace-final-1', $4, null),
           (gen_random_uuid(), $1, $2, 'test', 'test', 'failed', 'h2', 'trace-final-2', $5, 'MONTHLY_FINAL_GENERATION_QUALITY_FAILED'),
           (gen_random_uuid(), $1, $3, 'test', 'test', 'succeeded', 'h3', 'trace-final-3', $6, null),
           (gen_random_uuid(), $1, $3, 'test', 'test', 'succeeded', 'h4', 'trace-final-4', 'monthly-final:not-a-framework:4', null)`,
        [monthlyFinalTask, DEMO_IDS.operator, ids.operatorTwo,
          `monthly-final:${ids.frameworkA2}:1`, `monthly-final:${ids.frameworkA2}:2`, `monthly-final:${ids.frameworkB1}:3`]
      );
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values (gen_random_uuid(), $1, $2, 'monthly_final.published', 'assessment_version', $3, $4::jsonb, 'trace-final-published')`,
        [DEMO_IDS.organization, DEMO_IDS.operator, ids.finalVersion, JSON.stringify({ frameworkId: ids.frameworkA2, month, cefr: "A2" })]
      );
      await client.query(
        `insert into reminders (id, learner_id, reason, message, status, created_by)
         values ($1, $2, 'inactive_learning', 'Nhắc học thử', 'sent', $3)`,
        [ids.reminder, DEMO_IDS.learner, DEMO_IDS.manager]
      );
      await client.query(
        "insert into notification_deliveries (id, reminder_id, provider, status, response) values ($1, $2, 'resend', 'sent', '{}'::jsonb)",
        [ids.delivery, ids.reminder]
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
  }, 60_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns per-Operator monthly counts from frameworks, lessons, AI runs and audit", async () => {
    const response = await app.inject({ method: "GET", url: `/api/v1/manager/operations?month=${month}`, headers: { cookie: managerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    const view = response.json() as { month: string; availableMonths: string[]; monthSummary: Record<string, number>; operators: OperatorRow[] };
    expect(view.month).toBe(month);
    expect(view.availableMonths).toContain(month);
    expect(view.monthSummary).toEqual({ frameworks: 2, approvedFrameworks: 1, publishedFrameworks: 1, lessons: 2, approvedLessons: 1, failedLessons: 0 });
    const one = view.operators.find((operator) => operator.operatorId === DEMO_IDS.operator)!;
    const two = view.operators.find((operator) => operator.operatorId === ids.operatorTwo)!;
    expect(one).toMatchObject({
      poolsCreated: 1, poolsApproved: 1, lessonsDrafted: 1, lessonsResaved: 1, lessonsApproved: 1, lessonsPublished: 1,
      averageDraftToApprovalHours: 2, finalsGenerated: 1, finalGenerationFailures: 1, finalsPublished: 1, completions: 1, averageScore: 90,
      resourcePools: [{ cefr: "A2", status: "approved", createdByOperator: true, approvedByOperator: true, published: true }]
    });
    expect(two).toMatchObject({
      poolsCreated: 1, poolsApproved: 0, lessonsDrafted: 1, lessonsResaved: 0, lessonsApproved: 0, lessonsPublished: 0,
      averageDraftToApprovalHours: null, finalsGenerated: 1, finalGenerationFailures: 0, finalsPublished: 0, completions: 0, averageScore: null,
      resourcePools: [{ cefr: "B1", status: "draft", createdByOperator: true, approvedByOperator: false, published: false }]
    });
    expect(one).not.toHaveProperty("byWeek");

    const otherMonth = await app.inject({ method: "GET", url: "/api/v1/manager/operations?month=2031-04", headers: { cookie: managerCookie } });
    expect((otherMonth.json() as { operators: OperatorRow[] }).operators.find((operator) => operator.operatorId === DEMO_IDS.operator)).toMatchObject({ poolsCreated: 0, lessonsDrafted: 0, finalsGenerated: 0, completions: 0 });
  });

  it("keeps the monthly performance view Manager-only and validates the month", async () => {
    expect((await app.inject({ method: "GET", url: `/api/v1/manager/operations?month=${month}`, headers: { cookie: operatorCookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/v1/manager/operations?month=2031-13", headers: { cookie: managerCookie } })).statusCode).toBe(400);
  });

  it("removes one reminder from the history log only, with an audit event", async () => {
    const history = async () => ((await app.inject({ method: "GET", url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } })).json() as { history: { reminderId: string }[] }).history;
    expect((await history()).map((item) => item.reminderId)).toContain(ids.reminder);
    const denied = await app.inject({ method: "DELETE", url: `/api/v1/manager/reminders/history/${ids.reminder}`, headers: { cookie: operatorCookie } });
    expect(denied.statusCode).toBe(403);
    const removed = await app.inject({ method: "DELETE", url: `/api/v1/manager/reminders/history/${ids.reminder}`, headers: { cookie: managerCookie } });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toEqual({ deleted: true });
    expect((await history()).map((item) => item.reminderId)).not.toContain(ids.reminder);
    const stored = await pool.query<{ status: string; staff_deleted_by: string | null; deliveries: string }>(
      "select status, staff_deleted_by, (select count(*) from notification_deliveries where reminder_id = r.id)::text as deliveries from reminders r where id = $1", [ids.reminder]);
    expect(stored.rows[0]).toEqual({ status: "sent", staff_deleted_by: DEMO_IDS.manager, deliveries: "1" });
    const audit = await pool.query("select 1 from audit_events where action = 'manager.reminder_history_deleted' and entity_id = $1 and actor_user_id = $2", [ids.reminder, DEMO_IDS.manager]);
    expect(audit.rowCount).toBe(1);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/manager/reminders/history/${ids.reminder}`, headers: { cookie: managerCookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/api/v1/manager/reminders/history/not-a-uuid", headers: { cookie: managerCookie } })).statusCode).toBe(400);
  });

  it("deleting an organization holiday removes it from the monthly calendar again", async () => {
    // The Operator calendar only serves the three-month content window, so use next month's second Wednesday.
    const { rows: [window] } = await pool.query<{ next_month: string }>(
      "select to_char((organization_system_date($1) + interval '1 month')::date, 'YYYY-MM') as next_month", [DEMO_IDS.organization]);
    const calendarMonth = window!.next_month;
    const wednesdays = Array.from({ length: 28 }, (_, index) => `${calendarMonth}-${String(index + 1).padStart(2, "0")}`)
      .filter((date) => new Date(`${date}T12:00:00Z`).getUTCDay() === 3);
    const holidayDate = wednesdays[1]!;
    const calendarDay = async (date: string) => {
      const response = await app.inject({ method: "GET", url: `/api/v1/content/months/${calendarMonth}`, headers: { cookie: operatorCookie } });
      expect(response.statusCode, response.body).toBe(200);
      return (response.json() as { calendar: { date: string; holiday?: { source: string } }[] }).calendar.find((day) => day.date === date);
    };
    expect((await calendarDay(holidayDate))?.holiday).toBeUndefined();
    const created = await app.inject({ method: "POST", url: "/api/v1/manager/holidays", headers: { cookie: managerCookie }, payload: { date: holidayDate } });
    expect(created.statusCode, created.body).toBe(201);
    const holidayId = (created.json() as { holiday: { id: string } }).holiday.id;
    expect((await calendarDay(holidayDate))?.holiday?.source).toBe("organization");

    expect((await app.inject({ method: "DELETE", url: `/api/v1/manager/holidays/${holidayId}`, headers: { cookie: operatorCookie } })).statusCode).toBe(403);
    const removed = await app.inject({ method: "DELETE", url: `/api/v1/manager/holidays/${holidayId}`, headers: { cookie: managerCookie } });
    expect(removed.statusCode, removed.body).toBe(200);
    expect((await calendarDay(holidayDate))?.holiday).toBeUndefined();
    expect((await pool.query("select 1 from organization_holidays where id = $1", [holidayId])).rowCount).toBe(0);
    const audit = await pool.query("select 1 from organization_holiday_audit where holiday_date = $1::date and action = 'removed' and actor_id = $2", [holidayDate, DEMO_IDS.manager]);
    expect(audit.rowCount).toBe(1);
    expect((await app.inject({ method: "DELETE", url: `/api/v1/manager/holidays/${holidayId}`, headers: { cookie: managerCookie } })).statusCode).toBe(404);
  });
});
