import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRepositories, learnerConsecutiveLearningAbsences, learnerMonthlyAttendanceDates, migrateDatabase,
  resetPublicSchema, seedDemo, syncStaffDateNotices
} from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import { monthlyExamEligibility } from "../src/modules/learning/routes.js";

// The Manager test date ("ngày thử") drives attendance, locks, settings and staff notices.
// Dates sit in 2030 so the test date is always ahead of the real Vietnam date.
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test" });
const app = buildApi({ pool, secureCookies: false });
const repositories = createRepositories(pool);
const month = "2030-03";
const frameworkId = randomUUID();
// Monday 4 March 2030 onwards, weekdays only.
const lessonDates = ["2030-03-04", "2030-03-05", "2030-03-06", "2030-03-07", "2030-03-08", "2030-03-11", "2030-03-12", "2030-03-13", "2030-03-14", "2030-03-15"];
const lessonIds = lessonDates.map(() => randomUUID());
let managerCookie: string;

async function setTestDate(date: string | null) {
  await pool.query(
    `insert into organization_settings (organization_id, configuration) values ($1, '{}'::jsonb)
     on conflict (organization_id) do nothing`, [DEMO_IDS.organization]
  );
  await pool.query(
    `update organization_settings set configuration = case when $2::text is null then configuration - 'simulatedSystemDate'
       else configuration || jsonb_build_object('simulatedSystemDate', $2::text) end where organization_id = $1`,
    [DEMO_IDS.organization, date]
  );
}

async function learner(startedOn: string) {
  const id = randomUUID();
  await pool.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Test-date learner', $3)", [id, DEMO_IDS.organization, `${id}@e4s.local`]);
  await pool.query(
    "insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on) values (gen_random_uuid(), $1, $2, 'A1', true, $3)",
    [DEMO_IDS.program, id, startedOn]
  );
  return id;
}

const staffNotices = async (kind: string, role: "operator" | "manager") => (await pool.query<{ event_key: string; context: string }>(
  "select event_key, context from inbox_notifications where organization_id = $1 and kind = $2 and recipient_role = $3 and recipient_id = $4 order by event_key",
  [DEMO_IDS.organization, kind, role, role === "operator" ? DEMO_IDS.operator : DEMO_IDS.manager]
)).rows;

describe("Manager test date", () => {
  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
    } finally { client.release(); }
    const monthId = randomUUID();
    const days = lessonDates.map((date, index) => ({ lessonNumber: index + 1, date, kind: new Date(`${date}T00:00:00Z`).getUTCDay() === 5 ? "review" : "new", lessonId: lessonIds[index] }));
    await pool.query(
      "insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, '2030-03-29', $4, 'approved')",
      [monthId, DEMO_IDS.organization, month, days.length]
    );
    await pool.query(
      `insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash, published_at, published_on)
       values ($1, $2, 'A1', 'approved', $3, 'scope', now(), '2030-03-01')`,
      [frameworkId, monthId, JSON.stringify({ month, daySpecs: days, coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] })]
    );
    const setId = randomUUID();
    await pool.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A1')", [setId, frameworkId]);
    for (const day of days) {
      const versionId = randomUUID();
      await pool.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day.lessonNumber]);
      await pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [day.lessonId, versionId, day.lessonNumber]);
      await pool.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'published', '{}'::jsonb)", [randomUUID(), day.lessonId]);
      await pool.query(
        "insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', 'approved')",
        [randomUUID(), frameworkId, day.lessonNumber, day.date, day.lessonId]
      );
    }
    await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.manager, await createCredentialHash("manager-pass")]);
    const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" } });
    expect(response.statusCode, response.body).toBe(200);
    managerCookie = String(response.headers["set-cookie"]).split(";")[0]!;
  }, 60_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("records completions on the test date and counts attendance from it", async () => {
    await setTestDate("2030-03-12");
    const id = await learner("2030-03-04");
    await pool.query(
      `insert into progress_records (id, learner_id, lesson_id, status, started_at, completed_at)
       values (gen_random_uuid(), $1, $2, 'completed', now(), now())`, [id, lessonIds[6]]
    );
    const stored = await pool.query<{ completed_on: string }>("select completed_on::text from progress_records where learner_id = $1", [id]);
    expect(stored.rows[0]?.completed_on).toBe("2030-03-12");
    const attendance = await learnerMonthlyAttendanceDates(pool, id, [month], { cefr: "A1" });
    expect(attendance.get(month)).toContain("2030-03-12");
    // A backdated timestamp keeps its own Vietnam calendar date.
    await pool.query("update progress_records set completed_at = '2030-03-05 09:00+07' where learner_id = $1", [id]);
    expect((await pool.query<{ completed_on: string }>("select completed_on::text from progress_records where learner_id = $1", [id])).rows[0]?.completed_on).toBe("2030-03-05");
  });

  it("never locks learners because of a test date ahead of the real date", async () => {
    await setTestDate("2030-03-12");
    const id = await learner("2030-03-04");
    expect(await learnerConsecutiveLearningAbsences(pool, id)).toBeGreaterThanOrEqual(5);
    await repositories.manager.lockInactiveLearners();
    const status = await pool.query<{ status: string }>("select status from users where id = $1", [id]);
    expect(status.rows[0]?.status).toBe("active");
  });

  it("decides the exam entry window by the test date, not the real time of day", async () => {
    await setTestDate("2030-03-29");
    const id = await learner("2030-03-04");
    expect(await monthlyExamEligibility(pool, id)).toMatchObject({ systemDate: "2030-03-29", examDate: "2030-03-29", entryClosed: false });
  });

  it("counts exam-day absences only for approved lessons while keeping the full allowance", async () => {
    await setTestDate("2030-03-29");
    const id = await learner("2030-03-04");
    // March 2030 has 19 effective weekdays before the exam, but lessons exist only on the first 10.
    const empty = await monthlyExamEligibility(pool, id);
    expect(empty).toMatchObject({ effectiveDays: 19, elapsedEffectiveDays: 10, absenceDays: 10, maxAbsences: 5 });
    for (const [index, date] of lessonDates.slice(0, 8).entries()) {
      await pool.query(
        `insert into progress_records (id, learner_id, lesson_id, status, started_at, completed_at)
         values (gen_random_uuid(), $1, $2, 'completed', $3::timestamptz, $3::timestamptz)`, [id, lessonIds[index], `${date} 09:00+07`]
      );
    }
    const attended = await monthlyExamEligibility(pool, id);
    expect(attended).toMatchObject({ attendedDays: 8, absenceDays: 2, attendanceEligible: true });
    expect(attended.reasons).not.toContain("MONTHLY_ATTENDANCE_LIMIT_EXCEEDED");
  });

  it("returns to the real date and keeps background-music fields on save", async () => {
    await setTestDate("2030-03-12");
    await pool.query(
      `update organization_settings set configuration = configuration || '{"backgroundMusic":{"enabled":true,"url":"","volume":30,"customUrl":"https://www.youtube.com/watch?v=abc","playlistId":"focus"}}'::jsonb
       where organization_id = $1`, [DEMO_IDS.organization]
    );
    const current = await app.inject({ url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    expect(current.statusCode, current.body).toBe(200);
    const settings = current.json() as Record<string, unknown> & { backgroundMusic: Record<string, unknown> };
    expect(settings.simulatedSystemDate).toBe("2030-03-12");

    const invalid = await app.inject({ method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie }, payload: { ...settings, simulatedSystemDate: "2030-02-31" } });
    expect(invalid.statusCode).toBe(400);

    // The settings form only sends enabled/url/volume; the other music fields must survive.
    const { customUrl: _customUrl, playlistId: _playlistId, ...formMusic } = settings.backgroundMusic;
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...settings, simulatedSystemDate: "", backgroundMusic: { ...formMusic, volume: 40 } }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({ simulatedSystemDate: "" });
    const row = await pool.query<{ configuration: Record<string, unknown>; today: string; real_today: string }>(
      `select configuration, organization_system_date(organization_id)::text as today,
              ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text as real_today
       from organization_settings where organization_id = $1`, [DEMO_IDS.organization]
    );
    expect(row.rows[0]?.configuration).not.toHaveProperty("simulatedSystemDate");
    expect(row.rows[0]?.today).toBe(row.rows[0]?.real_today);
    expect(row.rows[0]?.configuration.backgroundMusic).toMatchObject({ volume: 40, customUrl: "https://www.youtube.com/watch?v=abc", playlistId: "focus" });

    // Saving other settings while on the real date does not freeze a test date.
    const again = await app.inject({ method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie }, payload: saved.json() });
    expect(again.statusCode, again.body).toBe(200);
    const after = await pool.query<{ configuration: Record<string, unknown> }>("select configuration from organization_settings where organization_id = $1", [DEMO_IDS.organization]);
    expect(after.rows[0]?.configuration).not.toHaveProperty("simulatedSystemDate");
  });

  it("tells Managers and Operators while a test date is set, once per change", async () => {
    const settings = (await app.inject({ url: "/api/v1/manager/settings", headers: { cookie: managerCookie } })).json() as Record<string, unknown>;
    const put = (simulatedSystemDate: string) => app.inject({ method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie }, payload: { ...settings, simulatedSystemDate } });
    expect((await put("2030-03-12")).statusCode).toBe(200);
    const realToday = (await pool.query<{ d: string }>("select ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text as d")).rows[0]!.d;
    expect(await staffNotices("test_date_active", "manager")).toEqual([{ event_key: "test-date:2030-03-12", context: `2030-03-12:${realToday}` }]);
    expect(await staffNotices("test_date_active", "operator")).toHaveLength(1);
    await syncStaffDateNotices(pool);
    expect(await staffNotices("test_date_active", "manager")).toHaveLength(1);

    expect((await put("2030-03-13")).statusCode).toBe(200);
    expect(await staffNotices("test_date_active", "manager")).toEqual([{ event_key: "test-date:2030-03-13", context: `2030-03-13:${realToday}` }]);
    const inbox = await app.inject({ url: "/api/v1/me/notifications", headers: { cookie: managerCookie } });
    expect(inbox.json().items).toContainEqual(expect.objectContaining({ kind: "test_date_active", context: `2030-03-13:${realToday}` }));

    expect((await put("")).statusCode).toBe(200);
    expect(await staffNotices("test_date_active", "manager")).toEqual([]);
    expect(await staffNotices("test_date_active", "operator")).toEqual([]);
  });

  it("warns staff about unapproved lessons in a published month's next three lesson days", async () => {
    await setTestDate("2030-03-12");
    // Window from 12/03: lessons 7, 8, 9. Lesson 8 (13/03) goes back to draft.
    await pool.query("update month_lessons set status = 'draft' where framework_id = $1 and lesson_number = 8", [frameworkId]);
    await pool.query("update month_lessons set status = 'draft' where framework_id = $1 and lesson_number = 10", [frameworkId]);
    await syncStaffDateNotices(pool);
    const operator = await staffNotices("lesson_window_unapproved", "operator");
    expect(operator.map(row => row.context)).toEqual(["2030-03-13:A1"]);
    expect(operator[0]?.event_key).toMatch(/^lesson-window:[0-9a-f-]{36}:2030-03-12$/);
    expect((await staffNotices("lesson_window_unapproved_manager", "manager")).map(row => row.context)).toEqual(["2030-03-13:A1"]);
    // Idempotent within the day.
    await syncStaffDateNotices(pool);
    expect(await staffNotices("lesson_window_unapproved", "operator")).toHaveLength(1);

    // The window moves with the date: from 14/03 lesson 10 (15/03) enters it, lesson 8 leaves it.
    await setTestDate("2030-03-14");
    await syncStaffDateNotices(pool);
    expect((await staffNotices("lesson_window_unapproved", "operator")).map(row => row.context)).toEqual(["2030-03-15:A1"]);

    // Approval resolves the notice at once.
    await pool.query("update month_lessons set status = 'approved' where framework_id = $1 and lesson_number in (8, 10)", [frameworkId]);
    expect(await staffNotices("lesson_window_unapproved", "operator")).toEqual([]);
    expect(await staffNotices("lesson_window_unapproved_manager", "manager")).toEqual([]);
    await syncStaffDateNotices(pool);
    expect(await staffNotices("lesson_window_unapproved", "operator")).toEqual([]);
  });
});
