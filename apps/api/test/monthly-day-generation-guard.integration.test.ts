import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCredentialHash } from "@e4s/domain";
import { DEMO_IDS, MonthlyContentRepository, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

/**
 * December 2026 re-run (docs/ai-quality-december-2026.md §12, N1 and N3):
 * an approved day must be refused before any model call, and a failed AI
 * generation keeps its final candidate beside (never over) the day's draft.
 */
describe("monthly day generation guard", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const aiCalls: string[] = [];
  const app = buildApi({
    pool, secureCookies: false,
    aiRunner: { runTask: async (taskId: string) => { aiCalls.push(taskId); throw new Error("the model must not be called"); } } as never
  });
  const repository = new MonthlyContentRepository(pool);
  const frameworkId = randomUUID();
  const draftFrameworkId = randomUUID();
  const goodReport = { severe: [], light: [{ severity: "light", code: "MONTHLY_LIGHT", message: "Một cảnh báo nhẹ.", component: "reading" }], contractVersion: 1 };
  let cookie = "";
  let month = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.operator, await createCredentialHash("operator-pass")]);
      month = (await client.query<{ month: string }>("select to_char(organization_system_date($1), 'YYYY-MM') as month", [DEMO_IDS.organization])).rows[0]!.month;
      const programMonthId = randomUUID();
      await client.query(
        "insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, ($3 || '-28')::date, 3, 'approved') on conflict (organization_id, month) do nothing",
        [programMonthId, DEMO_IDS.organization, month]
      );
      const monthId = (await client.query<{ id: string }>("select id from program_months where organization_id = $1 and month = $2", [DEMO_IDS.organization, month])).rows[0]!.id;
      const contract = JSON.stringify({ month, cefr: "A1", version: 1, theme: { version: 1, title: "Họp nhóm", brief: "", context: "", communicationGoal: "" }, coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [], daySpecs: [1, 2, 3].map((lessonNumber) => ({ lessonNumber, kind: "new", date: `${month}-0${lessonNumber}`, coreTermIds: [], expandedTermIds: [], grammarStepIds: [], pronunciationExampleIds: [] })) });
      await client.query(
        `insert into month_frameworks (id, program_month_id, cefr, status, version, curriculum_contract, scope_hash)
         values ($1, $3, 'A1', 'approved', 1, $4::jsonb, 'scope'), ($2, $3, 'A2', 'draft', 1, $4::jsonb, 'scope')`,
        [frameworkId, draftFrameworkId, monthId, contract]
      );
      await client.query(
        `insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash, status, quality_report)
         values ($1, $4, 1, ($5 || '-01')::date, 'scope', 'approved', $6::jsonb),
                ($2, $4, 2, ($5 || '-02')::date, 'scope', 'draft', $6::jsonb),
                ($3, $4, 3, ($5 || '-03')::date, 'scope', 'pending', '{"severe":[],"light":[],"contractVersion":1}'::jsonb)`,
        [randomUUID(), randomUUID(), randomUUID(), frameworkId, month, JSON.stringify(goodReport)]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("refuses an approved day, a day outside the plan and unlocked resources before calling the model", async () => {
    for (const route of ["days", "reviews"]) {
      const approved = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/${route}/1/generate`, headers: { cookie } });
      expect(approved.statusCode, approved.body).toBe(409);
      expect(approved.json()).toMatchObject({ code: "MONTHLY_DAY_ALREADY_APPROVED", message: expect.stringContaining("Yêu cầu mở lại") });
    }
    const missing = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/days/9/generate`, headers: { cookie } });
    expect(missing.statusCode, missing.body).toBe(409);
    expect(missing.json()).toMatchObject({ code: "MONTHLY_DAY_NOT_MATERIALIZED" });
    const unlocked = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${draftFrameworkId}/days/1/generate`, headers: { cookie } });
    expect(unlocked.statusCode, unlocked.body).toBe(409);
    expect(unlocked.json()).toMatchObject({ code: "MONTHLY_RESOURCES_NOT_LOCKED" });
    expect(aiCalls).toEqual([]);
  });

  it("stores a failed candidate beside the draft without touching the draft, its status or an approved day", async () => {
    const failingReport = { severe: [{ severity: "severe" as const, code: "MONTHLY_PRONUNCIATION_HOMOPHONE", message: "team / teem là từ đồng âm.", component: "pronunciation" }], light: [], contractVersion: 1 };
    const candidate = { title: "Ôn tập tuần 1", parts: [{ code: "pronunciation", content: { focus: "/iː/", pairs: [["team", "teem"]] } }] };
    for (const dayNumber of [1, 2, 3]) await repository.saveMonthlyDayGenerationFailure(DEMO_IDS.operator, frameworkId, dayNumber, { candidate, report: failingReport, attempts: 3 });
    const rows = (await pool.query<{ lesson_number: number; status: string; quality_report: unknown; generation_error: { kind?: string; candidate?: unknown } | null }>(
      "select lesson_number, status, quality_report, generation_error from month_lessons where framework_id = $1 order by lesson_number", [frameworkId]
    )).rows;
    expect(rows.map((row) => row.status)).toEqual(["approved", "draft", "pending"]);
    expect(rows[0]!.generation_error).toBeNull();
    expect(rows[1]!.quality_report).toEqual(goodReport);
    expect(rows[1]!.generation_error).toMatchObject({ kind: "ai_generation_failed", attempts: 3, candidate });
    expect(rows[2]!.generation_error).toMatchObject({ kind: "ai_generation_failed", candidate });

    const overview = await app.inject({ method: "GET", url: `/api/v1/content/months/${month}`, headers: { cookie } });
    expect(overview.statusCode, overview.body).toBe(200);
    const lessons = overview.json<{ frameworks: Array<{ id: string; lessons: Array<{ lessonNumber: number; status: string; generationFailure?: unknown; quality: unknown }> }> }>()
      .frameworks.find((framework) => framework.id === frameworkId)!.lessons;
    expect(lessons.find((lesson) => lesson.lessonNumber === 1)!.generationFailure).toBeUndefined();
    expect(lessons.find((lesson) => lesson.lessonNumber === 2)).toMatchObject({
      status: "draft", quality: { light: goodReport.light },
      generationFailure: { attempts: 3, report: { severe: failingReport.severe, light: [] }, candidate }
    });

    // A failed candidate is never approvable; the existing draft's gate is unchanged.
    const approve = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/days/3/approve`, headers: { cookie } });
    expect(approve.statusCode, approve.body).toBe(404);
  });
});
