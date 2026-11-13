import { randomUUID } from "node:crypto";
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
    await client.query("insert into month_frameworks (id, program_month_id, cefr, status, version, curriculum_contract, scope_hash) values ($1, $2, 'B1', 'approved', 1, $3::jsonb, 'scope')", [frameworkId, programMonthId, JSON.stringify(contract)]);
    await client.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash) values ($1, $2, 5, $3, 'scope')", [randomUUID(), frameworkId, `${month}-06`]);
  }, 30_000);

  afterAll(async () => client.end());

  const reopen = async () => {
    const lessons = await (repository as unknown as { lessonsForFramework(framework: { id: string; curriculum_contract: typeof contract }): Promise<Array<{ lessonNumber: number; content?: { title?: string; parts?: Array<{ content?: Record<string, unknown> }> } }>> })
      .lessonsForFramework({ id: frameworkId, curriculum_contract: contract });
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
});
