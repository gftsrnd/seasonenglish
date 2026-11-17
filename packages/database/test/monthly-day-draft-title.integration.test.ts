import { randomUUID } from "node:crypto";
import type { MonthFrameworkView } from "@e4s/contracts";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { MonthlyContentRepository } from "../src/monthly-content-repository.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

// The saved title is stored on lessons.title, not in the lesson version content. The Operator overview must
// return it with the draft, or the editor reopens with the calendar default title and a later save reverts it.
describe("monthly day draft title", () => {
  const client = new Client({ connectionString: databaseUrl });
  const repository = new MonthlyContentRepository(client);
  const frameworkId = randomUUID();
  const contract = { version: 1, month: "", daySpecs: [{ lessonNumber: 5, kind: "review", reviewWeekNumber: 1 }] };

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
    const month = (await client.query<{ month: string }>("select to_char(organization_system_date($1), 'YYYY-MM') as month", [DEMO_IDS.organization])).rows[0]!.month;
    contract.month = month;
    const programMonthId = randomUUID();
    await client.query("insert into program_months (id, organization_id, month, exam_date, lesson_count) values ($1, $2, $3, $4, 20)", [programMonthId, DEMO_IDS.organization, month, `${month}-28`]);
    await client.query("insert into month_frameworks (id, program_month_id, cefr, status, version, curriculum_contract, scope_hash) values ($1, $2, 'B2', 'approved', 1, $3::jsonb, 'scope')", [frameworkId, programMonthId, JSON.stringify(contract)]);
    await client.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash) values ($1, $2, 5, $3, 'scope')", [randomUUID(), frameworkId, `${month}-06`]);
  }, 30_000);

  afterAll(async () => client.end());

  const reopen = async () => {
    const lessons = await (repository as unknown as { lessonsForFramework(framework: { id: string; cefr: string; curriculum_contract: typeof contract }): Promise<MonthFrameworkView["lessons"]> })
      .lessonsForFramework({ id: frameworkId, cefr: "B2", curriculum_contract: contract });
    return lessons.find((lesson) => lesson.lessonNumber === 5)!;
  };
  const instruction = (steps: string[]) => ({ code: "instruction" as const, title: "Hướng dẫn", content: { steps } });
  const clean = { contractVersion: 1, severe: [], light: [] };

  it("keeps the edited title and the other edits across consecutive saves", async () => {
    await repository.saveMonthlyDayDraft(DEMO_IDS.operator, frameworkId, 5, { title: "Week 1 review", parts: [instruction(["First fix"])] }, clean);
    let lesson = await reopen();
    expect(lesson.content).toMatchObject({ title: "Week 1 review", parts: [{ content: { steps: ["First fix"] } }] });

    // The second fix re-sends what the editor reopened with: the first fix (title) stays.
    await repository.saveMonthlyDayDraft(DEMO_IDS.operator, frameworkId, 5, { title: lesson.content!.title!, parts: [instruction(["First fix", "Second fix"])] }, clean);
    lesson = await reopen();
    expect(lesson.content).toMatchObject({ title: "Week 1 review", parts: [{ content: { steps: ["First fix", "Second fix"] } }] });
  });

  it("removes only stale B2 language findings on stored drafts and generation candidates", async () => {
    const english = "B1+ requires all learner-facing content in this section to be in English; only vocabulary meanings may be Vietnamese.";
    const finding = (component: string, code: string, message: string) => ({ severity: "severe" as const, code, component, message, dayNumber: 5 });
    const legacy = [
      finding("instruction", "MONTHLY_CONTENT_INVALID", english),
      finding("listening", "MONTHLY_CONTENT_INVALID", english),
      finding("writing", "MONTHLY_EXERCISE_TRANSLATION", "Add Vietnamese question and answer translations."),
      finding("grammar", "MONTHLY_CONTENT_INVALID", "Missing grammar formula.")
    ];
    const draft = { title: "Week 1 review", parts: [
      { ...instruction(["Read the example."]), title: "Hướng dẫn làm bài" },
      { code: "listening" as const, title: "Nghe", content: { prompt: "Nghe ví dụ rồi chọn câu trả lời." } }
    ] };
    await repository.saveMonthlyDayDraft(DEMO_IDS.operator, frameworkId, 5, draft, { ...clean, severe: legacy });
    await client.query("update month_lessons set generation_error = $2::jsonb where framework_id = $1 and lesson_number = 5", [frameworkId, JSON.stringify({
      kind: "ai_generation_failed", failedAt: "2026-11-13T11:36:59Z", attempts: 3, candidate: draft, report: { severe: legacy, light: [] }
    })]);
    const lesson = await reopen();
    expect(lesson.quality.severe).toEqual([legacy[1], legacy[3]]);
    expect(lesson.generationFailure?.report.severe).toEqual([legacy[1], legacy[3]]);
    expect(lesson.generationFailure?.candidate).toEqual(draft);
  });
});
