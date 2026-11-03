import { buildMonthlyCalendar, buildMonthlyCurriculum, type MonthlyCurriculumInput } from "@e4s/domain";
import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { MonthlyContentRepository } from "../src/monthly-content-repository.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const month = "2026-11";

describe("monthly content persistence", () => {
  const client = new Client({ connectionString: databaseUrl });
  const repository = new MonthlyContentRepository(client);

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
  }, 30_000);

  afterAll(async () => client.end());

  it("persists one shared brief, materializes immutable day specs, and leaves the first ten days pending", async () => {
    const brief = await repository.saveBrief(DEMO_IDS.operator, {
      month,
      title: "Preparing a quarterly budget review",
      brief: "Teams prepare and explain a quarterly budget review.",
      context: "Finance team planning meeting",
      communicationGoal: "Explain costs and request approval"
    });
    expect(brief).toMatchObject({ month, version: 1, status: "draft" });
    await repository.approveBrief(DEMO_IDS.operator, month);
    await expect(repository.saveBrief(DEMO_IDS.operator, { month, title: "Changed", brief: "Changed", context: "Changed", communicationGoal: "Changed" })).rejects.toThrow(/approved/i);

    const framework = await repository.saveFramework(DEMO_IDS.operator, buildContract());
    expect(framework).toMatchObject({ cefr: "A1", version: 1, status: "draft" });

    const overview = await repository.getOverview(DEMO_IDS.operator, month);
    expect(overview.brief).toMatchObject({ title: "Preparing a quarterly budget review", version: 1 });
    expect(overview.frameworks[0]?.lessons).toHaveLength(buildMonthlyCalendar(month).lessonCount);
    expect(overview.frameworks[0]?.lessons.slice(0, 10).map((lesson) => lesson.status)).toEqual(Array(10).fill("pending"));
    expect(await repository.recommendedBatch(DEMO_IDS.operator, framework.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("allows game sets to belong to a monthly learning cycle", async () => {
    const column = await client.query(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'game_sets' and column_name = 'program_month_id'"
    );
    expect(column.rows).toHaveLength(1);
  });

  it("rejects framework replacement after approval and records the approval", async () => {
    const framework = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    await repository.approveFramework(DEMO_IDS.operator, framework.id);
    await expect(repository.saveFramework(DEMO_IDS.operator, buildContract())).rejects.toThrow(/approved framework/i);

    const audit = await client.query<{ action: string; entity_id: string }>(
      "select action, entity_id from audit_events where entity_id = $1 order by created_at",
      [framework.id]
    );
    expect(audit.rows).toEqual(expect.arrayContaining([
      { action: "monthly.framework_approved", entity_id: framework.id }
    ]));
  });

  it("requires acknowledgement for each light finding and keeps approved day versions immutable", async () => {
    const framework = (await repository.getOverview(DEMO_IDS.operator, month)).frameworks[0]!;
    const report = {
      contractVersion: framework.version,
      severe: [],
      light: [{ severity: "light" as const, code: "MONTHLY_SYNONYM_OR_ANTONYM_MISSING", message: "Missing a lexical relation", dayNumber: 1, component: "vocabulary" }]
    };
    await repository.saveMonthlyDayDraft(DEMO_IDS.operator, framework.id, 1, { title: "Budget words", parts: [] }, report);
    await expect(repository.approveMonthlyDay(DEMO_IDS.operator, framework.id, 1)).rejects.toThrow(/acknowledge/i);
    await repository.acknowledgeMonthlyDayQuality(DEMO_IDS.operator, framework.id, 1, ["MONTHLY_SYNONYM_OR_ANTONYM_MISSING:1:vocabulary"]);
    await repository.approveMonthlyDay(DEMO_IDS.operator, framework.id, 1);

    await expect(repository.saveMonthlyDayDraft(DEMO_IDS.operator, framework.id, 1, { title: "Replacement", parts: [] }, report)).rejects.toThrow(/immutable/i);
    const correctionId = await repository.createMonthlyCorrection(DEMO_IDS.operator, framework.id, 1, "Fix an approved example");
    await repository.saveMonthlyCorrection(DEMO_IDS.operator, correctionId, { title: "Corrected budget words", parts: [] }, { severe: [], light: [], contractVersion: framework.version });
    await repository.approveMonthlyCorrection(DEMO_IDS.operator, correctionId);
    const correction = await client.query<{ status: string; original_lesson_version_id: string; correction_lesson_version_id: string }>(
      "select status, original_lesson_version_id, correction_lesson_version_id from month_lesson_corrections where id = $1",
      [correctionId]
    );
    expect(correction.rows[0]).toMatchObject({ status: "published" });
    expect(correction.rows[0]?.correction_lesson_version_id).not.toBe(correction.rows[0]?.original_lesson_version_id);
    const overview = await repository.getOverview(DEMO_IDS.operator, month);
    expect(overview.frameworks[0]?.lessons[0]).toMatchObject({ status: "approved", locked: true, correctionCount: 1 });
  });

  it("makes only approved monthly lessons at the learner's CEFR available to the learner", async () => {
    await client.query("update enrollments set cefr = 'A1' where learner_id = $1", [DEMO_IDS.learner]);
    const lessons = await createRepositories(client as unknown as Pool).learning.listMonthlyLessons(DEMO_IDS.learner, month);

    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ dayNumber: 1, weekNumber: 0, cefr: "A1", weekTopic: "Preparing a quarterly budget review" });
  });
});

function buildContract() {
  const calendar = buildMonthlyCalendar(month);
  const newDays = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 5).length;
  const input: MonthlyCurriculumInput = {
    month,
    cefr: "A1",
    theme: { version: 1, title: "Preparing a quarterly budget review", brief: "Teams prepare and explain a quarterly budget review.", context: "Finance team planning meeting", communicationGoal: "Explain costs and request approval" },
    coreTerms: Array.from({ length: newDays * 3 }, (_, index) => ({ id: `core-${index + 1}`, word: `term-${index + 1}`, meaning: `meaning ${index + 1}`, type: "noun", ipa: "/tɜːm/" })),
    supportTerms: [{ id: "support-1", word: "quarterly", meaning: "hàng quý", type: "adjective", source: "example", dayNumber: 1 }],
    grammarTopics: Array.from({ length: 2 }, (_, index) => ({ id: `grammar-${index + 1}`, title: `Grammar ${index + 1}`, steps: [{ id: `grammar-${index + 1}-step-1`, focus: "focus", formula: "S + V", usage: "usage", examples: ["Example sentence."] }] })),
    sounds: Array.from({ length: 4 }, (_, index) => ({ id: `sound-${index + 1}`, ipa: "/t/", label: "T sound", examples: Array.from({ length: Math.ceil(calendar.lessonCount / 4) * 3 }, (_, exampleIndex) => ({ id: `sound-${index + 1}-example-${exampleIndex + 1}`, word: `soundword-${index + 1}-${exampleIndex + 1}`, ipa: "/t/" })) }))
  };
  return buildMonthlyCurriculum(input);
}
