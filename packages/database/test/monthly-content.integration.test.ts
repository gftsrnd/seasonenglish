import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildSampleFramework } from "@e4s/domain";
import { DEMO_IDS, MonthlyContentRepository, migrateDatabase, resetPublicSchema, seedDemo } from "../src/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("monthly content repository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const monthly = new MonthlyContentRepository(pool);
  const today = "2026-11-10";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
    } finally {
      client.release();
    }
  }, 60_000);

  afterAll(async () => {
    await pool.end();
  });

  it("migration 0081/0082 chạy trên DB có dữ liệu tuần cũ và giữ nguyên program_weeks", async () => {
    const weeks = await pool.query("select count(*)::int as count from program_weeks");
    expect(weeks.rows[0].count).toBeGreaterThan(0);
    const column = await pool.query("select is_nullable from information_schema.columns where table_name = 'lesson_sets' and column_name = 'program_week_id'");
    expect(column.rows[0].is_nullable).toBe("YES");
  });

  it("Vận hành thấy 3 tháng: trước (chỉ xem), này và sau (sinh được)", async () => {
    const overview = await monthly.overview(DEMO_IDS.operator, today, false);
    expect(overview?.months.map((month) => [month.month, month.editable])).toEqual([["2026-10", false], ["2026-11", true], ["2026-12", true]]);
    expect(overview?.months[1]?.lessonCount).toBe(20);
    expect(overview?.months[1]?.examDate).toBe("2026-11-30");
    expect(overview?.settings).toMatchObject({ vocabularyCount: 60, grammarTopicCount: 3, soundCount: 4, examDurationMinutes: 30 });
  });

  it("không sinh khung cho tháng trước", async () => {
    await expect(monthly.requestFrameworkGeneration(DEMO_IDS.operator, "2026-10", "A2", today)).rejects.toThrow("MONTHLY_MONTH_NOT_EDITABLE");
  });

  it("đi trọn luồng: sinh khung → duyệt → chia 20 bài → duyệt từng bài → publish → đề thi tháng", async () => {
    const cefr = "A2";
    const requested = await monthly.requestFrameworkGeneration(DEMO_IDS.operator, "2026-11", cefr, today);
    const job = await pool.query("select kind, payload from jobs where id = $1", [requested.jobId]);
    expect(job.rows[0]).toMatchObject({ kind: "monthly.framework.generate", payload: { frameworkId: requested.frameworkId } });

    // Worker (không AI): khung mẫu.
    await monthly.storeGeneratedFramework(requested.frameworkId, buildSampleFramework(cefr), "sample");
    let view = await monthly.framework(DEMO_IDS.operator, "2026-11", cefr, today);
    expect(view).toMatchObject({ status: "draft", source: "sample", version: 1 });
    expect(view?.vocabulary).toHaveLength(60);

    // Sinh lại được nhiều lần trước khi duyệt.
    const again = await monthly.requestFrameworkGeneration(DEMO_IDS.operator, "2026-11", cefr, today);
    expect(again.frameworkId).toBe(requested.frameworkId);
    await monthly.storeGeneratedFramework(requested.frameworkId, buildSampleFramework(cefr), "sample");
    view = await monthly.framework(DEMO_IDS.operator, "2026-11", cefr, today);
    expect(view?.version).toBe(2);

    const approved = await monthly.approveFramework(DEMO_IDS.operator, requested.frameworkId);
    expect(approved.jobId).toBeTruthy();
    await expect(monthly.requestFrameworkGeneration(DEMO_IDS.operator, "2026-11", cefr, today)).rejects.toThrow("MONTHLY_FRAMEWORK_ALREADY_APPROVED");

    await monthly.distributeLessons(requested.frameworkId, DEMO_IDS.operator);
    view = await monthly.framework(DEMO_IDS.operator, "2026-11", cefr, today);
    expect(view?.lessons).toHaveLength(20);
    expect(view?.lessons.filter((cell) => cell.status !== "draft" || !cell.lessonId).map((cell) => [cell.lessonNumber, cell.status, cell.error])).toEqual([]);
    expect(view?.lessons[0]).toMatchObject({ lessonNumber: 1, date: "2026-11-02" });
    expect(view?.lessons[19]).toMatchObject({ lessonNumber: 20, date: "2026-11-27" });
    expect(view?.firstReviewLesson).toBeNull();
    expect(view?.readyForLearners).toBe(false);

    // Soạn tay bài 1 rồi duyệt.
    const detail = await monthly.lessonDetail(DEMO_IDS.operator, requested.frameworkId, 1);
    expect(detail?.lesson.parts.map((part) => part.code)).toContain("pronunciation");
    const edited = await monthly.saveLessonDay(DEMO_IDS.operator, requested.frameworkId, 1, { ...detail!.lesson, title: "Bài 1 (soạn tay)" });
    expect(edited.lesson.title).toBe("Bài 1 (soạn tay)");
    expect(edited.status).toBe("draft");

    for (let lessonNumber = 1; lessonNumber <= 20; lessonNumber += 1) {
      view = await monthly.approveLessonDay(DEMO_IDS.operator, requested.frameworkId, lessonNumber);
    }
    expect(view?.lessons.every((cell) => cell.status === "approved")).toBe(true);
    const published = await pool.query<{ status: string }>(
      "select lsv.status from lesson_sets ls join lesson_set_versions lsv on lsv.lesson_set_id = ls.id where ls.month_framework_id = $1",
      [requested.frameworkId]
    );
    expect(published.rows.map((row) => row.status)).toEqual(["published"]);
    expect(view?.readyForLearners).toBe(false); // còn thiếu bài thi tháng

    await monthly.requestExamGeneration(DEMO_IDS.operator, requested.frameworkId);
    await monthly.storeGeneratedExam(requested.frameworkId, { title: "Bài thi tháng 11/2026 · A2", kind: "monthly_exam", sections: [] });
    view = await monthly.framework(DEMO_IDS.operator, "2026-11", cefr, today);
    expect(view?.exam.status).toBe("draft");
    view = await monthly.approveExam(DEMO_IDS.operator, requested.frameworkId);
    expect(view?.exam.status).toBe("approved");
    expect(view?.readyForLearners).toBe(true);

    const definition = await pool.query<{ kind: string; status: string }>(
      "select ad.kind, av.status from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id where av.id = $1",
      [view?.exam.assessmentVersionId]
    );
    expect(definition.rows[0]).toEqual({ kind: "monthly_exam", status: "published" });

    // Sửa tay sau khi publish → quay về nháp, học viên không thấy nữa cho tới khi duyệt lại.
    await monthly.saveLessonDay(DEMO_IDS.operator, requested.frameworkId, 2, { ...(await monthly.lessonDetail(DEMO_IDS.operator, requested.frameworkId, 2))!.lesson, title: "Sửa lại" });
    view = await monthly.framework(DEMO_IDS.operator, "2026-11", cefr, today);
    expect(view?.readyForLearners).toBe(false);
    const overview = await monthly.overview(DEMO_IDS.operator, today, false);
    expect(overview?.months[1]?.levels.find((level) => level.cefr === cefr)).toMatchObject({ frameworkStatus: "approved", approvedLessons: 19, totalLessons: 20, examStatus: "approved" });
  }, 60_000);
});
