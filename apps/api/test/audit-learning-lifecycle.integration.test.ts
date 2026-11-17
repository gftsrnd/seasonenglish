import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRepositories, learnerConsecutiveLearningAbsences, learnerMonthlyAccess, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import { monthlyExamEligibility } from "../src/modules/learning/routes.js";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test" });
const app = buildApi({ pool, secureCookies: false });
const repositories = createRepositories(pool);
let managerCookie: string;

async function systemDate(date: string) {
  await pool.query(`insert into organization_settings (organization_id, configuration)
    values ($1, jsonb_build_object('simulatedSystemDate', $2::text))
    on conflict (organization_id) do update set configuration = excluded.configuration`, [DEMO_IDS.organization, date]);
}

async function learner(cefr: string | null, startedOn: string, credentials = false) {
  const id = randomUUID();
  const email = `${id}@e4s.local`;
  await pool.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Audit learner', $3)", [id, DEMO_IDS.organization, email]);
  if (cefr) await pool.query(`insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, cefr_started_on)
    values (gen_random_uuid(), $1, $2, $3, true, $4)`, [DEMO_IDS.program, id, cefr, startedOn]);
  if (credentials) await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [id, await createPinHash("123456")]);
  return { id, email };
}

async function login(email: string) {
  const response = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin: "123456" } });
  expect(response.statusCode, response.body).toBe(200);
  return String(response.headers["set-cookie"]).split(";")[0]!;
}

describe("audited monthly learning lifecycle", () => {
  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
    } finally { client.release(); }
    await pool.query(`insert into program_months (id, organization_id, month, exam_date, lesson_count)
      values (gen_random_uuid(), $1, '2026-11', '2026-11-30', 20), (gen_random_uuid(), $1, '2026-12', '2026-12-31', 22)`, [DEMO_IDS.organization]);
    await pool.query(`insert into month_frameworks (id, program_month_id, cefr, status, published_at, published_on)
      select gen_random_uuid(), id, 'A1', 'approved', now(), (month || '-01')::date from program_months
      where organization_id = $1 and month in ('2026-11', '2026-12')`, [DEMO_IDS.organization]);
    // Attendance only includes dates with learner-visible published content.
    const { rows: [framework] } = await pool.query<{ id: string }>(`select mf.id from month_frameworks mf
      join program_months pm on pm.id = mf.program_month_id where pm.month = '2026-11'`);
    const setId = randomUUID();
    await pool.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A1')", [setId, framework!.id]);
    await pool.query("update month_frameworks set scope_hash = 'scope' where id = $1", [framework!.id]);
    const weekdays = Array.from({ length: 28 }, (_, index) => new Date(Date.UTC(2026, 10, index + 1)))
      .filter(day => day.getUTCDay() >= 1 && day.getUTCDay() <= 5);
    for (const scheduled of weekdays) {
      const date = scheduled.toISOString().slice(0, 10);
      const lessonId = randomUUID();
      const versionId = randomUUID();
      const day = Number(date.slice(8));
      await pool.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day]);
      await pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Audit lesson')", [lessonId, versionId, day]);
      await pool.query("insert into lesson_versions (id, lesson_id, version, status, content) values (gen_random_uuid(), $1, 1, 'published', '{}'::jsonb)", [lessonId]);
      await pool.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values (gen_random_uuid(), $1, $2, $3, $4, 'scope', 'approved')",
        [framework!.id, day, date, lessonId]);
    }
    await pool.query(`with definition as (
      insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
      values (gen_random_uuid(), $1, 'monthly-final-2026-11-a1', 'final', 'November A1') returning id
    )
    insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
    select gen_random_uuid(), definition.id, 1, 'published', v.blueprint || '{"kind":"final","title":"November A1"}', now()
    from definition cross join lateral (
      select v.blueprint from assessment_versions v join assessment_definitions d on d.id = v.definition_id
      where d.kind = 'placement' and d.organization_id = $1 and v.status = 'published' limit 1
    ) v`, [DEMO_IDS.organization]);
    await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.manager, await createCredentialHash("manager-pass")]);
    const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" } });
    expect(response.statusCode, response.body).toBe(200);
    managerCookie = String(response.headers["set-cookie"]).split(";")[0]!;
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("opens a counted learner's daily lesson after sign-in and records one attendance", async () => {
    await systemDate("2026-11-02");
    const account = await learner("A1", "2026-11-01", true);
    const cookie = await login(account.email);
    const home = () => app.inject({ url: "/api/v1/learner/home", headers: { cookie } });
    const before = await home();
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json()).toMatchObject({ nextLesson: { lessonDate: "2026-11-02", lock: null }, monthlyEligibility: { attendedDays: 0 } });
    const lessonId = before.json().nextLesson.id as string;
    const content = await app.inject({ url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    expect(content.statusCode, content.body).toBe(200);
    const completion = await app.inject({ method: "PUT", url: `/api/v1/lessons/${lessonId}/progress`, headers: { cookie }, payload: { markComplete: true } });
    expect(completion.statusCode, completion.body).toBe(200);
    expect(completion.json()).toMatchObject({ status: "completed" });
    const after = await home();
    expect(after.statusCode, after.body).toBe(200);
    expect(after.json()).toMatchObject({ monthlyEligibility: { attendedDays: 1, attendanceDaysSoFar: 1, absenceDays: 0 } });
  });

  it("counts ended learning dates, credits a holiday and resets the streak on manager reopen", async () => {
    const placed = await learner("A1", "2026-11-04", true);
    const unplaced = await learner(null, "2026-11-01");
    await systemDate("2026-11-06");
    expect(await learnerConsecutiveLearningAbsences(pool, placed.id)).toBe(2);
    expect((await monthlyExamEligibility(pool, placed.id)).absenceDays).toBe(2);
    await systemDate("2026-11-11");
    await pool.query("insert into organization_holidays (organization_id, holiday_date) values ($1, '2026-11-05')", [DEMO_IDS.organization]);
    expect(await learnerConsecutiveLearningAbsences(pool, placed.id)).toBe(3);
    const list = await app.inject({ url: "/api/v1/manager/reminders", headers: { cookie: managerCookie } });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.body).toContain(placed.id);
    expect(list.body).not.toContain(unplaced.id);
    await pool.query("delete from organization_holidays where organization_id = $1 and holiday_date = '2026-11-05'", [DEMO_IDS.organization]);
    await repositories.manager.lockInactiveLearners();
    const cookie = await login(placed.email);
    expect((await app.inject({ url: "/api/v1/learner/home", headers: { cookie } })).statusCode).toBe(401);
    const complaint = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie }, payload: { kind: "account_unlock", reason: "Xin mở lại tài khoản học." } });
    expect(complaint.statusCode, complaint.body).toBe(201);
    const reopened = await app.inject({ method: "POST", url: `/api/v1/manager/complaints/${complaint.json().complaint.id}/decision`, headers: { cookie: managerCookie }, payload: { decision: "approved", resolution: "Đồng ý mở lại." } });
    expect(reopened.statusCode, reopened.body).toBe(200);
    expect(await learnerConsecutiveLearningAbsences(pool, placed.id)).toBe(0);
    expect((await monthlyExamEligibility(pool, placed.id)).absenceDays).toBe(5);

    // A second lock starts a fresh cycle: the approval that ended the first lock no longer counts.
    const relocked = await app.inject({ method: "PATCH", url: `/api/v1/manager/accounts/${placed.id}/status`, headers: { cookie: managerCookie }, payload: { status: "disabled" } });
    expect(relocked.statusCode, relocked.body).toBe(200);
    const lockedCookie = await login(placed.email);
    const stale = await app.inject({ url: "/api/v1/learner/complaints", headers: { cookie: lockedCookie } });
    expect(stale.statusCode, stale.body).toBe(200);
    expect(stale.json().complaints).toEqual([]);
    const second = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie: lockedCookie }, payload: { kind: "account_unlock", reason: "Xin mở lại tài khoản lần hai." } });
    expect(second.statusCode, second.body).toBe(201);
    const rejected = await app.inject({ method: "POST", url: `/api/v1/manager/complaints/${second.json().complaint.id}/decision`, headers: { cookie: managerCookie }, payload: { decision: "rejected", resolution: "Chưa đủ lý do." } });
    expect(rejected.statusCode, rejected.body).toBe(200);
    const current = await app.inject({ url: "/api/v1/learner/complaints", headers: { cookie: lockedCookie } });
    expect(current.json().complaints).toEqual([expect.objectContaining({ id: second.json().complaint.id, status: "rejected", resolution: "Chưa đủ lý do." })]);
  });

  it("prorates newcomers and lets late learners study an uncounted month", async () => {
    await systemDate("2026-11-11");
    const active = await learner("A1", "2026-11-09");
    const deferred = await learner("A1", "2026-11-10");
    expect(await monthlyExamEligibility(pool, active.id)).toMatchObject({ effectiveDays: 15, absenceDays: 2, maxAbsences: 4, seasonTurnsRequired: 75 });
    expect(await learnerMonthlyAccess(pool, deferred.id)).toMatchObject({ state: "uncounted", startDate: "2026-12-01" });
    expect(await learnerConsecutiveLearningAbsences(pool, deferred.id)).toBe(0);
    expect(await monthlyExamEligibility(pool, deferred.id)).toMatchObject({ effectiveDays: 0, absenceDays: 0, accessEligible: false, seasonTurnsRequired: 0 });
    const review = await app.inject({ url: "/api/v1/assessment-reviews/overview", headers: { cookie: managerCookie } });
    expect(review.statusCode, review.body).toBe(200);
    expect(review.json()).toMatchObject({ placementTrial: { month: "2026-11", countsFrom: "2026-12-01", levels: ["A1"] } });
    const approved = review.json().approvedLearners as Array<{ learnerId: string; trialCountsFrom?: string }>;
    expect(approved.find(row => row.learnerId === deferred.id)?.trialCountsFrom).toBe("2026-12-01");
    expect(approved.find(row => row.learnerId === active.id)?.trialCountsFrom).toBeUndefined();
  });

  it("shows the November 17 learner a trial month and starts counting on December 1", async () => {
    await systemDate("2026-11-17");
    const account = await learner("A1", "2026-11-17", true);
    const cookie = await login(account.email);
    const home = () => app.inject({ url: "/api/v1/learner/home", headers: { cookie } });
    expect(await learnerMonthlyAccess(pool, account.id)).toMatchObject({ state: "uncounted", effectiveDays: 9, startDate: "2026-12-01" });
    const november = await home();
    expect(november.statusCode, november.body).toBe(200);
    expect(november.json()).toMatchObject({ monthlyUncounted: { countsFrom: "2026-12-01" }, monthlyExam: null, metrics: { completedLessons: 0, totalLessons: 0 } });
    await systemDate("2026-12-01");
    expect(await learnerMonthlyAccess(pool, account.id)).toMatchObject({ state: "active", startDate: "2026-12-01" });
    expect((await home()).json().monthlyUncounted).toBeUndefined();
  });

  it("uses the late complaint for its original exam across a month boundary and resumes the same attempt", async () => {
    await systemDate("2026-11-20");
    const learnerAccount = await learner("A1", "2026-11-02", true);
    const cookie = await login(learnerAccount.email);
    const complaint = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie }, payload: { kind: "exam_eligibility", reason: "Xin xem xét cho tôi dự thi tháng." } });
    expect(complaint.statusCode, complaint.body).toBe(201);
    await systemDate("2026-12-01");
    const approved = await app.inject({ method: "POST", url: `/api/v1/manager/complaints/${complaint.json().complaint.id}/decision`, headers: { cookie: managerCookie }, payload: { decision: "approved", resolution: "Đồng ý cho dự thi." } });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await monthlyExamEligibility(pool, learnerAccount.id)).toMatchObject({ month: "2026-11", accessEligible: true, attendanceOverride: true, lessonsEligible: false, seasonEligible: false });
    const start = await app.inject({ method: "POST", url: "/api/v1/assessments/monthly/start", headers: { cookie } });
    expect(start.statusCode, start.body).toBe(201);
    expect(start.json().definition.title).toBe("November A1");
    await pool.query("update learner_complaints set resolved_at = now() - interval '25 hours' where id = $1", [complaint.json().complaint.id]);
    const resumed = await app.inject({ method: "POST", url: "/api/v1/assessments/monthly/start", headers: { cookie } });
    expect(resumed.statusCode, resumed.body).toBe(201);
    expect(resumed.json().attempt.id).toBe(start.json().attempt.id);
    await pool.query("update assessment_attempts set status = 'pending_review', submitted_at = now() where id = $1", [start.json().attempt.id]);
    expect(await repositories.assessments.listAppealableResults(learnerAccount.id)).toEqual([]);
    await pool.query("update assessment_attempts set status = 'approved' where id = $1", [start.json().attempt.id]);
    await pool.query("insert into assessment_decisions (id, attempt_id, status, decided_at) values (gen_random_uuid(), $1, 'approved', now() - interval '2 days')", [start.json().attempt.id]);
    expect(await repositories.assessments.listAppealableResults(learnerAccount.id)).toHaveLength(1);
    await pool.query("update assessment_decisions set decided_at = now() - interval '4 days' where attempt_id = $1", [start.json().attempt.id]);
    expect(await repositories.assessments.listAppealableResults(learnerAccount.id)).toEqual([]);
  });

  it("locks lessons after a missed eligible exam and applies the newcomer cutoff at reopening", async () => {
    await systemDate("2026-12-10");
    const learnerAccount = await learner("A1", "2026-11-02", true);
    await pool.query(`insert into learner_complaints
      (organization_id, learner_id, kind, reason, related_data, status, due_at, resolved_at)
      values ($1, $2, 'exam_eligibility', 'Xin dự thi tháng', '{"month":"2026-11","cefr":"A1","resolvedOn":"2026-11-25"}',
              'approved', now() - interval '8 days', now() - interval '9 days')`, [DEMO_IDS.organization, learnerAccount.id]);
    expect(await learnerMonthlyAccess(pool, learnerAccount.id)).toMatchObject({ state: "missed_exam" });
    const cookie = await login(learnerAccount.email);
    const request = await app.inject({ method: "POST", url: "/api/v1/learner/complaints", headers: { cookie }, payload: { kind: "lesson_unlock", reason: "Xin mở lại các bài tháng này." } });
    expect(request.statusCode, request.body).toBe(201);
    const approved = await app.inject({ method: "POST", url: `/api/v1/manager/complaints/${request.json().complaint.id}/decision`, headers: { cookie: managerCookie }, payload: { decision: "approved", resolution: "Đồng ý mở lại bài học." } });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(await learnerMonthlyAccess(pool, learnerAccount.id)).toMatchObject({ state: "uncounted", startDate: "2027-01-01" });
  });
});
