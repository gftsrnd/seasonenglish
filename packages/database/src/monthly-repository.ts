import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  CefrLevel, ContentLessonDraftInput, MonthFrameworkView, MonthLessonCellView, MonthLessonDetailView,
  MonthlyLevelSummaryView, MonthlyOperatorOverviewView
} from "@e4s/contracts";
import {
  buildMonthlyCalendar, operatorVisibleMonths, DEFAULT_MONTH_FRAMEWORK_SETTINGS, type MonthFrameworkSettings
} from "@e4s/domain/calendar";
import { buildLessonFromDayPlan, distributeFramework, type MonthFramework } from "@e4s/domain";
import { validateLessonDraft } from "@e4s/domain/content";

const LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1"];

interface FrameworkRow {
  id: string; program_month_id: string; cefr: CefrLevel; status: string; version: number; vocabulary: unknown; grammar_topics: unknown;
  sounds: unknown; distribution_plan: Record<string, unknown>; source: "ai" | "sample" | "manual"; generation_error: string | null;
  exam_assessment_version_id: string | null; exam_status: MonthFrameworkView["exam"]["status"]; exam_generation_error: string | null;
  exam_approved_at: Date | null; approved_at: Date | null; approved_by_name: string | null; month: string; exam_date: string; lesson_count: number; generation_job_id: string | null;
  organization_id: string;
}

/**
 * Nội dung theo tháng cho Vận hành và worker. Bài ngày dùng lại lesson_sets/lesson_set_versions/lessons
 * (lesson_sets.month_framework_id) để editor, kháng nghị và tiến độ học viên dùng nguyên vẹn.
 */
export class MonthlyContentRepository {
  constructor(private readonly pool: Pool) {}

  async organizationFor(userId: string): Promise<{ organizationId: string; activeLevels: CefrLevel[]; settings: MonthFrameworkSettings & { examDurationMinutes: number } } | null> {
    const result = await this.pool.query<{ organization_id: string; configuration: Record<string, unknown> | null; levels: unknown }>(
      `select u.organization_id, os.configuration,
              (select levels from content_lesson_level_settings clls
                 join programs p on p.id = clls.program_id
                where p.organization_id = u.organization_id and p.status = 'active'
                order by p.start_date desc limit 1) as levels
       from users u left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const monthly = (row.configuration?.monthly ?? {}) as Partial<MonthFrameworkSettings & { examDurationMinutes: number }>;
    const levels = Array.isArray(row.levels) ? row.levels.filter((level): level is CefrLevel => LEVELS.includes(level as CefrLevel)) : [];
    return {
      organizationId: row.organization_id,
      activeLevels: levels.length ? levels : [...LEVELS],
      settings: {
        vocabularyCount: monthly.vocabularyCount ?? DEFAULT_MONTH_FRAMEWORK_SETTINGS.vocabularyCount,
        grammarTopicCount: monthly.grammarTopicCount ?? DEFAULT_MONTH_FRAMEWORK_SETTINGS.grammarTopicCount,
        soundCount: monthly.soundCount ?? DEFAULT_MONTH_FRAMEWORK_SETTINGS.soundCount,
        examDurationMinutes: monthly.examDurationMinutes ?? 60
      }
    };
  }

  /** Tạo (nếu chưa có) dòng program_months theo lịch tháng. */
  async ensureProgramMonth(organizationId: string, month: string, client: Pool | PoolClient = this.pool): Promise<{ id: string; examDate: string; lessonCount: number }> {
    const calendar = buildMonthlyCalendar(month);
    const result = await client.query<{ id: string; exam_date: string; lesson_count: number }>(
      `insert into program_months (id, organization_id, month, exam_date, lesson_count)
       values ($1, $2, $3, $4, $5)
       on conflict (organization_id, month) do update set exam_date = excluded.exam_date, lesson_count = excluded.lesson_count
       returning id, exam_date::text, lesson_count`,
      [randomUUID(), organizationId, month, calendar.examDate, calendar.lessonCount]
    );
    const row = result.rows[0]!;
    return { id: row.id, examDate: row.exam_date, lessonCount: row.lesson_count };
  }

  async overview(staffId: string, today: string, aiConnected: boolean): Promise<MonthlyOperatorOverviewView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const visible = operatorVisibleMonths(today);
    const months = [visible.previous, visible.current, visible.next];
    const rows = await this.pool.query<{ month: string; cefr: CefrLevel; status: string; exam_status: MonthlyLevelSummaryView["examStatus"]; approved_lessons: string; total_lessons: string }>(
      `select pm.month, mf.cefr, mf.status, mf.exam_status,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id and ml.status = 'approved')::text as approved_lessons,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id)::text as total_lessons
       from program_months pm join month_frameworks mf on mf.program_month_id = pm.id
       where pm.organization_id = $1 and pm.month = any($2::text[])`,
      [organization.organizationId, months]
    );
    return {
      today,
      activeLevels: organization.activeLevels,
      settings: organization.settings,
      aiConnected,
      months: months.map((month) => {
        const calendar = buildMonthlyCalendar(month);
        return {
          month,
          label: monthLabel(month),
          examDate: calendar.examDate,
          lessonCount: calendar.lessonCount,
          studyDayCount: calendar.studyDays.length,
          editable: visible.editable.includes(month),
          levels: organization.activeLevels.map((cefr) => {
            const row = rows.rows.find((candidate) => candidate.month === month && candidate.cefr === cefr);
            const approvedLessons = Number(row?.approved_lessons ?? 0);
            const totalLessons = Number(row?.total_lessons ?? 0);
            const frameworkStatus = frameworkStatusOf(row?.status, row ? null : undefined);
            return {
              cefr,
              frameworkStatus,
              approvedLessons,
              totalLessons: totalLessons || calendar.lessonCount,
              examStatus: row?.exam_status ?? "none",
              readyForLearners: frameworkStatus === "approved" && totalLessons > 0 && approvedLessons === totalLessons && row?.exam_status === "approved"
            };
          })
        };
      })
    };
  }

  async framework(staffId: string, month: string, cefr: CefrLevel, today: string): Promise<MonthFrameworkView | null> {
    const organization = await this.organizationFor(staffId);
    if (!organization) return null;
    const row = await this.frameworkRow({ organizationId: organization.organizationId, month, cefr });
    const calendar = buildMonthlyCalendar(month);
    const editable = operatorVisibleMonths(today).editable.includes(month);
    if (!row) {
      return {
        id: null, month, cefr, status: "missing", version: 0, source: null, generationError: null, approvedAt: null, approvedBy: null,
        vocabulary: [], grammarTopics: [], sounds: [], firstReviewLesson: null,
        lessons: calendar.effectiveDays.map((date, index) => ({ lessonNumber: index + 1, date, status: "pending", title: null, lessonId: null, error: null, approvedAt: null, review: false })),
        lessonSetVersionId: null, exam: { status: "none", error: null, assessmentVersionId: null, approvedAt: null }, readyForLearners: false, editable
      };
    }
    return this.viewFromRow(row, editable);
  }

  async frameworkById(frameworkId: string): Promise<(MonthFrameworkView & { id: string; organizationId: string; programMonthId: string }) | null> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) return null;
    const view = await this.viewFromRow(row, true);
    return { ...view, id: row.id, organizationId: row.organization_id, programMonthId: row.program_month_id };
  }

  private async frameworkRow(where: { id: string } | { organizationId: string; month: string; cefr: CefrLevel }): Promise<FrameworkRow | null> {
    const condition = "id" in where ? "mf.id = $1" : "pm.organization_id = $1 and pm.month = $2 and mf.cefr = $3";
    const params = "id" in where ? [where.id] : [where.organizationId, where.month, where.cefr];
    const result = await this.pool.query<FrameworkRow>(
      `select mf.*, pm.month, pm.exam_date::text as exam_date, pm.lesson_count, pm.organization_id, approver.display_name as approved_by_name
       from month_frameworks mf
       join program_months pm on pm.id = mf.program_month_id
       left join users approver on approver.id = mf.approved_by
       where ${condition}`,
      params
    );
    return result.rows[0] ?? null;
  }

  private async viewFromRow(row: FrameworkRow, editable: boolean): Promise<MonthFrameworkView> {
    const calendar = buildMonthlyCalendar(row.month);
    const cells = await this.pool.query<{ lesson_number: number; lesson_date: string; status: MonthLessonCellView["status"]; lesson_id: string | null; title: string | null; generation_error: string | null; approved_at: Date | null }>(
      `select ml.lesson_number, ml.lesson_date::text, ml.status, ml.lesson_id, l.title, ml.generation_error, ml.approved_at
       from month_lessons ml left join lessons l on l.id = ml.lesson_id
       where ml.framework_id = $1 order by ml.lesson_number`,
      [row.id]
    );
    const version = await this.pool.query<{ id: string }>(
      `select lsv.id from lesson_sets ls join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where ls.month_framework_id = $1 and lsv.status <> 'retired' order by lsv.version desc limit 1`,
      [row.id]
    );
    const firstReviewLesson = typeof row.distribution_plan.firstReviewLesson === "number" ? row.distribution_plan.firstReviewLesson : null;
    const lessons: MonthLessonCellView[] = calendar.effectiveDays.map((date, index) => {
      const cell = cells.rows.find((candidate) => candidate.lesson_number === index + 1);
      return {
        lessonNumber: index + 1, date,
        status: cell?.status ?? "pending", title: cell?.title ?? null, lessonId: cell?.lesson_id ?? null,
        error: cell?.generation_error ?? null, approvedAt: cell?.approved_at?.toISOString() ?? null,
        review: firstReviewLesson !== null && index + 1 >= firstReviewLesson
      };
    });
    const status = frameworkStatusOf(row.status, row.generation_error);
    const allApproved = lessons.length > 0 && lessons.every((cell) => cell.status === "approved");
    return {
      id: row.id, month: row.month, cefr: row.cefr, status, version: row.version, source: row.source,
      generationError: row.generation_error, approvedAt: row.approved_at?.toISOString() ?? null, approvedBy: row.approved_by_name,
      vocabulary: asArray(row.vocabulary), grammarTopics: asArray(row.grammar_topics), sounds: asArray(row.sounds),
      firstReviewLesson, lessons, lessonSetVersionId: version.rows[0]?.id ?? null,
      exam: { status: row.exam_status, error: row.exam_generation_error, assessmentVersionId: row.exam_assessment_version_id, approvedAt: row.exam_approved_at?.toISOString() ?? null },
      readyForLearners: status === "approved" && allApproved && row.exam_status === "approved",
      editable
    };
  }

  /** Vận hành bấm "Sinh (lại) khung": đặt trạng thái generating và xếp job worker. */
  async requestFrameworkGeneration(staffId: string, month: string, cefr: CefrLevel, today: string): Promise<{ frameworkId: string; jobId: string }> {
    const organization = await this.organizationFor(staffId);
    if (!organization) throw new Error("MONTHLY_ORGANIZATION_NOT_FOUND");
    if (!operatorVisibleMonths(today).editable.includes(month)) throw new Error("MONTHLY_MONTH_NOT_EDITABLE");
    if (!organization.activeLevels.includes(cefr)) throw new Error("MONTHLY_LEVEL_NOT_ACTIVE");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const programMonth = await this.ensureProgramMonth(organization.organizationId, month, client);
      const existing = await client.query<{ id: string; status: string }>(
        "select id, status from month_frameworks where program_month_id = $1 and cefr = $2 for update",
        [programMonth.id, cefr]
      );
      if (existing.rows[0]?.status === "approved") throw new Error("MONTHLY_FRAMEWORK_ALREADY_APPROVED");
      let frameworkId = existing.rows[0]?.id;
      if (frameworkId) {
        await client.query(
          `update month_frameworks set version = version + 1, generation_error = null, created_by = $2, updated_at = now() where id = $1`,
          [frameworkId, staffId]
        );
      } else {
        frameworkId = randomUUID();
        await client.query(
          `insert into month_frameworks (id, program_month_id, cefr, status, created_by) values ($1, $2, $3, 'draft', $4)`,
          [frameworkId, programMonth.id, cefr, staffId]
        );
      }
      const jobId = randomUUID();
      await client.query(
        `insert into jobs (id, kind, payload, max_attempts) values ($1, 'monthly.framework.generate', $2::jsonb, 2)`,
        [jobId, JSON.stringify({ frameworkId, actorId: staffId })]
      );
      await client.query("update month_frameworks set generation_job_id = $2 where id = $1", [frameworkId, jobId]);
      await this.audit(client, organization.organizationId, staffId, "monthly.framework.generation-requested", frameworkId, { month, cefr });
      await client.query("commit");
      return { frameworkId, jobId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  /** Worker ghi kết quả sinh khung (AI hoặc khung mẫu). */
  async storeGeneratedFramework(frameworkId: string, framework: MonthFramework, source: "ai" | "sample"): Promise<void> {
    await this.pool.query(
      `update month_frameworks
       set vocabulary = $2::jsonb, grammar_topics = $3::jsonb, sounds = $4::jsonb, source = $5, generation_error = null, generation_job_id = null, updated_at = now()
       where id = $1 and status <> 'approved'`,
      [frameworkId, JSON.stringify(framework.vocabulary), JSON.stringify(framework.grammarTopics), JSON.stringify(framework.sounds), source]
    );
  }

  async failFrameworkGeneration(frameworkId: string, message: string): Promise<void> {
    await this.pool.query(
      "update month_frameworks set generation_error = $2, generation_job_id = null, updated_at = now() where id = $1 and status <> 'approved'",
      [frameworkId, message.slice(0, 500)]
    );
  }

  /** Duyệt khung: khoá khung, xếp job chia bài ngày. */
  async approveFramework(staffId: string, frameworkId: string): Promise<{ jobId: string }> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    await this.assertSameOrganization(staffId, row.organization_id);
    if (row.status === "approved") throw new Error("MONTHLY_FRAMEWORK_ALREADY_APPROVED");
    if (row.generation_job_id) throw new Error("MONTHLY_FRAMEWORK_GENERATING");
    if (!asArray(row.vocabulary).length) throw new Error("MONTHLY_FRAMEWORK_EMPTY");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "update month_frameworks set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1",
        [frameworkId, staffId]
      );
      const calendar = buildMonthlyCalendar(row.month);
      for (const [index, date] of calendar.effectiveDays.entries()) {
        await client.query(
          `insert into month_lessons (id, framework_id, lesson_number, lesson_date, status)
           values ($1, $2, $3, $4, 'generating')
           on conflict (framework_id, lesson_number) do update set status = 'generating', lesson_date = excluded.lesson_date, generation_error = null, updated_at = now()`,
          [randomUUID(), frameworkId, index + 1, date]
        );
      }
      const jobId = randomUUID();
      await client.query(
        "insert into jobs (id, kind, payload, max_attempts) values ($1, 'monthly.lessons.distribute', $2::jsonb, 2)",
        [jobId, JSON.stringify({ frameworkId, actorId: staffId })]
      );
      await this.audit(client, row.organization_id, staffId, "monthly.framework.approved", frameworkId, { month: row.month, cefr: row.cefr });
      await client.query("commit");
      return { jobId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  /** Worker: chia khung thành bài ngày và tạo lesson set nháp. Chạy lần lượt, ghi tiến độ từng bài. */
  async distributeLessons(frameworkId: string, actorId: string | null): Promise<void> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row || row.status !== "approved") throw new Error("MONTHLY_FRAMEWORK_NOT_APPROVED");
    const framework: MonthFramework = { cefr: row.cefr, vocabulary: asArray(row.vocabulary), grammarTopics: asArray(row.grammar_topics), sounds: asArray(row.sounds) };
    const calendar = buildMonthlyCalendar(row.month);
    const plan = distributeFramework(framework, calendar.lessonCount);
    const client = await this.pool.connect();
    let versionId: string;
    try {
      await client.query("begin");
      const set = await client.query<{ id: string }>("select id from lesson_sets where month_framework_id = $1 for update", [frameworkId]);
      let lessonSetId = set.rows[0]?.id;
      if (!lessonSetId) {
        lessonSetId = randomUUID();
        await client.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, $3)", [lessonSetId, frameworkId, row.cefr]);
      }
      await client.query("update lesson_set_versions set status = 'retired' where lesson_set_id = $1 and status = 'draft'", [lessonSetId]);
      const latest = await client.query<{ version: number }>("select coalesce(max(version), 0) as version from lesson_set_versions where lesson_set_id = $1", [lessonSetId]);
      versionId = randomUUID();
      await client.query(
        `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by)
         values ($1, $2, $3, 'draft', $4::jsonb, $5)`,
        [versionId, lessonSetId, Number(latest.rows[0]?.version ?? 0) + 1, JSON.stringify({ month: row.month, source: "monthly-framework", frameworkVersion: row.version }), actorId]
      );
      await client.query(
        "update month_frameworks set distribution_plan = $2::jsonb, updated_at = now() where id = $1",
        [frameworkId, JSON.stringify(plan)]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }

    for (const day of plan.days) {
      try {
        const built = buildLessonFromDayPlan(framework, day);
        const validation = validateLessonDraft([built]);
        if (!validation.valid) throw new Error(validation.issues.map((issue) => issue.message).join(" "));
        const lessonId = randomUUID();
        await this.pool.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, $4)", [lessonId, versionId, day.lessonNumber, built.title]);
        await this.pool.query(
          "insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'draft', $3::jsonb)",
          [randomUUID(), lessonId, JSON.stringify({ durationMinutes: built.durationMinutes, parts: built.parts })]
        );
        await this.pool.query(
          "update month_lessons set lesson_id = $3, status = 'draft', generation_error = null, approved_by = null, approved_at = null, updated_at = now() where framework_id = $1 and lesson_number = $2",
          [frameworkId, day.lessonNumber, lessonId]
        );
      } catch (error) {
        await this.pool.query(
          "update month_lessons set status = 'failed', generation_error = $3, updated_at = now() where framework_id = $1 and lesson_number = $2",
          [frameworkId, day.lessonNumber, (error instanceof Error ? error.message : String(error)).slice(0, 500)]
        );
      }
    }
  }

  async lessonDetail(staffId: string, frameworkId: string, lessonNumber: number): Promise<MonthLessonDetailView | null> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) return null;
    await this.assertSameOrganization(staffId, row.organization_id);
    const result = await this.pool.query<{ lesson_date: string; status: MonthLessonDetailView["status"]; lesson_id: string; title: string; content: { durationMinutes?: number; parts?: ContentLessonDraftInput["parts"] } }>(
      `select ml.lesson_date::text, ml.status, l.id as lesson_id, l.title, lv.content
       from month_lessons ml join lessons l on l.id = ml.lesson_id
       join lateral (select content from lesson_versions where lesson_id = l.id order by version desc limit 1) lv on true
       where ml.framework_id = $1 and ml.lesson_number = $2`,
      [frameworkId, lessonNumber]
    );
    const lesson = result.rows[0];
    if (!lesson) return null;
    return {
      frameworkId, lessonNumber, date: lesson.lesson_date, status: lesson.status,
      lesson: { id: lesson.lesson_id, dayNumber: lessonNumber, title: lesson.title, durationMinutes: lesson.content.durationMinutes ?? 15, parts: lesson.content.parts ?? [] }
    };
  }

  /** Soạn tay một bài ngày: thêm lesson_version mới; bài đã duyệt quay về nháp để duyệt lại. */
  async saveLessonDay(staffId: string, frameworkId: string, lessonNumber: number, lesson: ContentLessonDraftInput): Promise<MonthLessonDetailView> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    await this.assertSameOrganization(staffId, row.organization_id);
    if (lesson.dayNumber !== lessonNumber) throw new Error("CONTENT_DAY_MISMATCH");
    const validation = validateLessonDraft([lesson]);
    if (!validation.valid) throw Object.assign(new Error("CONTENT_VALIDATION_FAILED"), { issues: validation.issues });
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const cell = await client.query<{ lesson_id: string | null }>(
        "select lesson_id from month_lessons where framework_id = $1 and lesson_number = $2 for update",
        [frameworkId, lessonNumber]
      );
      const lessonId = cell.rows[0]?.lesson_id;
      if (!lessonId) throw new Error("MONTHLY_LESSON_NOT_READY");
      await client.query("update lessons set title = $2 where id = $1", [lessonId, lesson.title.trim()]);
      await client.query(
        `insert into lesson_versions (id, lesson_id, version, status, content)
         select $2, $1, coalesce(max(version), 0) + 1, 'draft', $3::jsonb from lesson_versions where lesson_id = $1`,
        [lessonId, randomUUID(), JSON.stringify({ durationMinutes: lesson.durationMinutes, parts: lesson.parts })]
      );
      await client.query(
        "update month_lessons set status = 'draft', approved_by = null, approved_at = null, updated_at = now() where framework_id = $1 and lesson_number = $2",
        [frameworkId, lessonNumber]
      );
      await this.unpublishIfNeeded(client, frameworkId);
      await this.audit(client, row.organization_id, staffId, "monthly.lesson.saved", lessonId, { month: row.month, cefr: row.cefr, lessonNumber });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const detail = await this.lessonDetail(staffId, frameworkId, lessonNumber);
    if (!detail) throw new Error("MONTHLY_LESSON_NOT_READY");
    return detail;
  }

  /** Duyệt một bài ngày; khi mọi bài đã duyệt thì publish lesson set cho học viên. */
  async approveLessonDay(staffId: string, frameworkId: string, lessonNumber: number): Promise<MonthFrameworkView> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    await this.assertSameOrganization(staffId, row.organization_id);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query(
        `update month_lessons set status = 'approved', approved_by = $3, approved_at = now(), updated_at = now()
         where framework_id = $1 and lesson_number = $2 and status in ('draft', 'approved') and lesson_id is not null`,
        [frameworkId, lessonNumber, staffId]
      );
      if (!updated.rowCount) throw new Error("MONTHLY_LESSON_NOT_READY");
      const remaining = await client.query<{ count: string }>(
        "select count(*)::text as count from month_lessons where framework_id = $1 and status <> 'approved'",
        [frameworkId]
      );
      if (remaining.rows[0]?.count === "0") await this.publishLessonSet(client, frameworkId, staffId);
      await this.audit(client, row.organization_id, staffId, "monthly.lesson.approved", frameworkId, { month: row.month, cefr: row.cefr, lessonNumber });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const view = await this.frameworkById(frameworkId);
    if (!view) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    return view;
  }

  private async publishLessonSet(client: PoolClient, frameworkId: string, staffId: string): Promise<void> {
    const version = await client.query<{ id: string; lesson_set_id: string }>(
      `select lsv.id, lsv.lesson_set_id from lesson_sets ls join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where ls.month_framework_id = $1 and lsv.status in ('draft', 'review') order by lsv.version desc limit 1 for update`,
      [frameworkId]
    );
    const target = version.rows[0];
    if (!target) return;
    await client.query("update lesson_set_versions set status = 'retired' where lesson_set_id = $1 and status = 'published' and id <> $2", [target.lesson_set_id, target.id]);
    await client.query("update lesson_set_versions set status = 'published', approved_by = $2, published_at = now() where id = $1", [target.id, staffId]);
    await client.query(
      `update lesson_versions lv set status = 'published' from lessons l
       where l.id = lv.lesson_id and l.lesson_set_version_id = $1
         and lv.version = (select max(version) from lesson_versions where lesson_id = l.id)`,
      [target.id]
    );
  }

  private async unpublishIfNeeded(client: PoolClient, frameworkId: string): Promise<void> {
    await client.query(
      `update lesson_set_versions lsv set status = 'draft', published_at = null, approved_by = null
       from lesson_sets ls where ls.id = lsv.lesson_set_id and ls.month_framework_id = $1 and lsv.status = 'published'`,
      [frameworkId]
    );
  }

  /** Bài thi tháng: xếp job sinh đề từ khung (không lấy phần soạn tay). */
  async requestExamGeneration(staffId: string, frameworkId: string): Promise<{ jobId: string }> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    await this.assertSameOrganization(staffId, row.organization_id);
    if (row.status !== "approved") throw new Error("MONTHLY_FRAMEWORK_NOT_APPROVED");
    if (row.exam_status === "approved") throw new Error("MONTHLY_EXAM_ALREADY_APPROVED");
    const jobId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("update month_frameworks set exam_status = 'generating', exam_generation_error = null, updated_at = now() where id = $1", [frameworkId]);
      await client.query("insert into jobs (id, kind, payload, max_attempts) values ($1, 'monthly.exam.generate', $2::jsonb, 2)", [jobId, JSON.stringify({ frameworkId, actorId: staffId })]);
      await this.audit(client, row.organization_id, staffId, "monthly.exam.generation-requested", frameworkId, { month: row.month, cefr: row.cefr });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    return { jobId };
  }

  /** Worker ghi đề thi tháng vào assessment_definitions (kind monthly_exam) ở trạng thái draft. */
  async storeGeneratedExam(frameworkId: string, blueprint: Record<string, unknown> & { title: string }): Promise<void> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const key = `monthly-exam-${row.month}-${row.cefr.toLowerCase()}`;
      const definition = await client.query<{ id: string }>(
        `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
         values ($1, $2, $3, 'monthly_exam', $4)
         on conflict do nothing returning id`,
        [randomUUID(), row.organization_id, key, blueprint.title]
      );
      const definitionId = definition.rows[0]?.id ?? (await client.query<{ id: string }>(
        "select id from assessment_definitions where organization_id = $1 and assessment_key = $2 and kind = 'monthly_exam'",
        [row.organization_id, key]
      )).rows[0]?.id;
      if (!definitionId) throw new Error("MONTHLY_EXAM_DEFINITION_FAILED");
      await client.query("update assessment_definitions set title = $2 where id = $1", [definitionId, blueprint.title]);
      await client.query("update assessment_versions set status = 'retired' where definition_id = $1 and status = 'draft'", [definitionId]);
      const versionId = randomUUID();
      await client.query(
        `insert into assessment_versions (id, definition_id, version, status, blueprint)
         select $1, $2, coalesce(max(version), 0) + 1, 'draft', $3::jsonb from assessment_versions where definition_id = $2`,
        [versionId, definitionId, JSON.stringify(blueprint)]
      );
      await client.query(
        "update month_frameworks set exam_assessment_version_id = $2, exam_status = 'draft', exam_generation_error = null, updated_at = now() where id = $1",
        [frameworkId, versionId]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async failExamGeneration(frameworkId: string, message: string): Promise<void> {
    await this.pool.query("update month_frameworks set exam_status = 'failed', exam_generation_error = $2, updated_at = now() where id = $1", [frameworkId, message.slice(0, 500)]);
  }

  async approveExam(staffId: string, frameworkId: string): Promise<MonthFrameworkView> {
    const row = await this.frameworkRow({ id: frameworkId });
    if (!row) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    await this.assertSameOrganization(staffId, row.organization_id);
    if (row.exam_status !== "draft" || !row.exam_assessment_version_id) throw new Error("MONTHLY_EXAM_NOT_READY");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `update assessment_versions set status = 'retired' where definition_id = (select definition_id from assessment_versions where id = $1) and status = 'published' and id <> $1`,
        [row.exam_assessment_version_id]
      );
      await client.query("update assessment_versions set status = 'published', published_at = now() where id = $1", [row.exam_assessment_version_id]);
      await client.query("update month_frameworks set exam_status = 'approved', exam_approved_by = $2, exam_approved_at = now(), updated_at = now() where id = $1", [frameworkId, staffId]);
      await this.audit(client, row.organization_id, staffId, "monthly.exam.approved", frameworkId, { month: row.month, cefr: row.cefr });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
    const view = await this.frameworkById(frameworkId);
    if (!view) throw new Error("MONTHLY_FRAMEWORK_NOT_FOUND");
    return view;
  }

  /** Prompt đang active của tổ chức cho một task key (worker dùng cho month_framework). */
  async activePrompt(organizationId: string, taskKey: string): Promise<string | null> {
    const result = await this.pool.query<{ content: string }>(
      `select concat_ws(E'

', base.content, task.content) as content
       from (select content from prompt_versions where organization_id = $1 and task_key = $2 and status = 'active' order by version desc limit 1) task
       left join lateral (select content from prompt_versions where organization_id = $1 and task_key = 'system_rules' and status = 'active' order by version desc limit 1) base on true`,
      [organizationId, taskKey]
    );
    return result.rows[0]?.content ?? null;
  }

  /** Từ vựng đã dùng ở các khung khác của tổ chức (để AI không lặp). */
  async usedFrameworkVocabulary(organizationId: string, excludeFrameworkId: string): Promise<string[]> {
    const result = await this.pool.query<{ word: string }>(
      `select distinct lower(item->>'word') as word
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       cross join lateral jsonb_array_elements(mf.vocabulary) item
       where pm.organization_id = $1 and mf.id <> $2 and mf.status = 'approved'`,
      [organizationId, excludeFrameworkId]
    );
    return result.rows.map((row) => row.word).filter(Boolean);
  }

  private async assertSameOrganization(staffId: string, organizationId: string): Promise<void> {
    const result = await this.pool.query<{ organization_id: string }>("select organization_id from users where id = $1", [staffId]);
    if (result.rows[0]?.organization_id !== organizationId) throw new Error("MONTHLY_FORBIDDEN");
  }

  private async audit(client: PoolClient, organizationId: string, actorId: string | null, action: string, entityId: string, payload: Record<string, unknown>): Promise<void> {
    await client.query(
      `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, $4, 'month_framework', $5, $6::jsonb, $7)`,
      [randomUUID(), organizationId, actorId, action, entityId, JSON.stringify(payload), randomUUID()]
    );
  }
}

function frameworkStatusOf(status: string | undefined, generationError: string | null | undefined): MonthFrameworkView["status"] {
  if (status === undefined) return "missing";
  if (status === "approved") return "approved";
  if (generationError) return "failed";
  return "draft";
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `Tháng ${Number(monthNumber)}/${year}`;
}
