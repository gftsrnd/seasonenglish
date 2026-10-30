import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CefrLevel, LearnerMonthLessonView, LearnerMonthView, LessonContent, LessonProgressView, LessonLockView } from "@e4s/contracts";
import {
  buildAttendanceReport, buildExamWindow, buildMonthlyCalendar, examAccessAt, examAppealDeadline, isLessonLearnable,
  localDateString, monthOf, nextMonth, placeNewcomer, type MonthlyCalendar
} from "@e4s/domain/calendar";

export interface LearnerMonthContext {
  learnerId: string;
  organizationId: string;
  cefr: CefrLevel | null;
  examDurationMinutes: number;
  coachMonthlyTarget: number;
  coachDailyLimit: number;
}

export interface LearnerMonthEnrollmentRecord {
  id: string;
  programMonthId: string;
  month: string;
  cefr: CefrLevel;
  mode: LearnerMonthView["enrollment"] extends infer T ? (T extends { mode: infer M } ? M : never) : never;
  effectiveDays: string[];
  maxAbsences: number;
  ratioPercent: number | null;
  approvedAt: Date;
  startsOn: string | null;
  reason: string;
  countsForLevelUp: boolean;
}

/** Bài tháng đọc theo hợp đồng bài học hiện có để /api/v1/lessons/:id dùng lại nguyên vẹn. */
export interface LearnerMonthLessonRecord {
  id: string;
  title: string;
  lessonNumber: number;
  date: string;
  cefr: CefrLevel;
  content: LessonContent & { durationMinutes?: number };
  progressStatus: LessonProgressView["status"];
  progressScore: string | null;
  progressEvidence: Record<string, unknown>;
  progressUpdatedAt: Date | null;
  month: string;
  lessonCount: number;
}

/**
 * Học viên theo tháng: ghi danh (cơ chế người mới), mở bài theo ngày + tuần tự, điểm danh,
 * điều kiện thi và khiếu nại 24 giờ. Luật nằm ở @e4s/domain/calendar; đây chỉ là truy vấn + ghi.
 */
export class LearnerMonthlyRepository {
  constructor(private readonly pool: Pool) {}

  async context(learnerId: string): Promise<LearnerMonthContext | null> {
    const result = await this.pool.query<{ organization_id: string; cefr: CefrLevel | null; configuration: Record<string, unknown> | null }>(
      `select u.organization_id, e.cefr, os.configuration
       from users u
       left join enrollments e on e.learner_id = u.id and e.cefr_approved = true
       left join organization_settings os on os.organization_id = u.organization_id
       where u.id = $1
       order by e.enrolled_at desc nulls last limit 1`,
      [learnerId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const monthly = (row.configuration?.monthly ?? {}) as { examDurationMinutes?: number; coachMonthlyTarget?: number };
    const coachDailyLimit = Number((row.configuration as { coachDailyLimit?: unknown } | null)?.coachDailyLimit ?? 30);
    return {
      learnerId,
      organizationId: row.organization_id,
      cefr: row.cefr,
      examDurationMinutes: monthly.examDurationMinutes ?? 30,
      coachMonthlyTarget: monthly.coachMonthlyTarget ?? 100,
      coachDailyLimit: Number.isFinite(coachDailyLimit) ? coachDailyLimit : 30
    };
  }

  /**
   * Cơ chế người mới: gọi khi duyệt mức đầu vào / lên mức / khiếu nại được duyệt / trượt pass course /
   * được học tháng mới sau khiếu nại / level vừa được duyệt nội dung đủ.
   * Trả về ghi danh của tháng hiện hành (join hoặc wait) sau khi upsert.
   */
  async placeLearner(learnerId: string, cefr: CefrLevel, approvedAt: Date, reason: string, client?: PoolClient): Promise<LearnerMonthEnrollmentRecord> {
    const runner = client ?? this.pool;
    const organization = await runner.query<{ organization_id: string }>("select organization_id from users where id = $1", [learnerId]);
    const organizationId = organization.rows[0]?.organization_id;
    if (!organizationId) throw new Error("LEARNER_NOT_FOUND");
    const placement = placeNewcomer(approvedAt);
    const programMonth = await this.ensureProgramMonth(organizationId, placement.month, runner);
    const id = randomUUID();
    const common = [learnerId, programMonth.id, cefr, placement.ratioPercent, approvedAt, reason] as const;
    if (placement.mode === "join_current_month") {
      await runner.query(
        `insert into learner_month_enrollments (id, learner_id, program_month_id, cefr, mode, effective_days, max_absences, ratio_percent, approved_at, starts_on, reason)
         values ($1, $2, $3, $4, 'join_current_month', $5::jsonb, $6, $7, $8, $9, $10)
         on conflict (learner_id, program_month_id) do update
           set cefr = excluded.cefr, mode = excluded.mode, effective_days = excluded.effective_days, max_absences = excluded.max_absences,
               ratio_percent = excluded.ratio_percent, approved_at = excluded.approved_at, starts_on = excluded.starts_on, reason = excluded.reason`,
        [id, common[0], common[1], common[2], JSON.stringify(placement.effectiveDays), placement.maxAbsences, common[3], common[4], placement.effectiveDays[0] ?? null, common[5]]
      );
    } else {
      await runner.query(
        `insert into learner_month_enrollments (id, learner_id, program_month_id, cefr, mode, effective_days, max_absences, ratio_percent, approved_at, starts_on, reason)
         values ($1, $2, $3, $4, 'wait_next_month', '[]'::jsonb, 0, $5, $6, $7, $8)
         on conflict (learner_id, program_month_id) do update
           set cefr = excluded.cefr, mode = excluded.mode, effective_days = excluded.effective_days, max_absences = excluded.max_absences,
               ratio_percent = excluded.ratio_percent, approved_at = excluded.approved_at, starts_on = excluded.starts_on, reason = excluded.reason`,
        [id, common[0], common[1], common[2], common[3], common[4], placement.startsOn, common[5]]
      );
    }
    const stored = await this.enrollmentFor(learnerId, placement.month, runner);
    if (!stored) throw new Error("MONTHLY_ENROLLMENT_FAILED");
    return stored;
  }

  /** Tháng mới bắt đầu: học viên đã duyệt mức, không bị khoá thì tự ghi danh trọn tháng từ bài 1. */
  private async ensureCurrentMonthEnrollment(context: LearnerMonthContext, month: string, now: Date): Promise<LearnerMonthEnrollmentRecord | null> {
    const existing = await this.enrollmentFor(context.learnerId, month);
    if (existing) return existing;
    if (!context.cefr) return null;
    // Khoá tháng sau khi bỏ thi tháng trước (giai đoạn 4 đặt mode locked_missed_exam cho tháng này).
    const previous = await this.enrollmentFor(context.learnerId, previousMonth(month));
    if (previous?.mode === "wait_next_month" || previous?.mode === "join_current_month" || previous?.mode === "unlocked_by_manager" || !previous) {
      const calendar = buildMonthlyCalendar(month);
      const programMonth = await this.ensureProgramMonth(context.organizationId, month);
      await this.pool.query(
        `insert into learner_month_enrollments (id, learner_id, program_month_id, cefr, mode, effective_days, max_absences, ratio_percent, approved_at, starts_on, reason)
         values ($1, $2, $3, $4, 'join_current_month', $5::jsonb, $6, 100, $7, $8, $9)
         on conflict (learner_id, program_month_id) do nothing`,
        [randomUUID(), context.learnerId, programMonth.id, context.cefr, JSON.stringify(calendar.effectiveDays), calendar.maxAbsences, now, calendar.effectiveDays[0] ?? null, previous?.mode === "wait_next_month" ? "wait_next_month_started" : "new_month"]
      );
      return this.enrollmentFor(context.learnerId, month);
    }
    return null;
  }

  async enrollmentFor(learnerId: string, month: string, client: Pool | PoolClient = this.pool): Promise<LearnerMonthEnrollmentRecord | null> {
    const result = await client.query<{
      id: string; program_month_id: string; month: string; cefr: CefrLevel; mode: LearnerMonthEnrollmentRecord["mode"]; effective_days: unknown;
      max_absences: number; ratio_percent: string | null; approved_at: Date; starts_on: string | null; reason: string; counts_for_level_up: boolean;
    }>(
      `select lme.id, lme.program_month_id, pm.month, lme.cefr, lme.mode, lme.effective_days, lme.max_absences, lme.ratio_percent::text,
              lme.approved_at, lme.starts_on::text, lme.reason, lme.counts_for_level_up
       from learner_month_enrollments lme join program_months pm on pm.id = lme.program_month_id
       where lme.learner_id = $1 and pm.month = $2`,
      [learnerId, month]
    );
    const row = result.rows[0];
    return row ? {
      id: row.id, programMonthId: row.program_month_id, month: row.month, cefr: row.cefr, mode: row.mode,
      effectiveDays: Array.isArray(row.effective_days) ? row.effective_days as string[] : [],
      maxAbsences: row.max_absences, ratioPercent: row.ratio_percent === null ? null : Number(row.ratio_percent),
      approvedAt: row.approved_at, startsOn: row.starts_on, reason: row.reason, countsForLevelUp: row.counts_for_level_up
    } : null;
  }

  private async ensureProgramMonth(organizationId: string, month: string, client: Pool | PoolClient = this.pool): Promise<{ id: string }> {
    const calendar = buildMonthlyCalendar(month);
    const result = await client.query<{ id: string }>(
      `insert into program_months (id, organization_id, month, exam_date, lesson_count) values ($1, $2, $3, $4, $5)
       on conflict (organization_id, month) do update set exam_date = excluded.exam_date returning id`,
      [randomUUID(), organizationId, month, calendar.examDate, calendar.lessonCount]
    );
    return { id: result.rows[0]!.id };
  }

  /** Khung + mọi bài ngày + đề thi đã duyệt cho (tháng, level). */
  async contentReadiness(organizationId: string, month: string, cefr: CefrLevel): Promise<{ ready: boolean; frameworkId: string | null; examVersionId: string | null }> {
    const result = await this.pool.query<{ id: string; status: string; exam_status: string; exam_assessment_version_id: string | null; pending: string; total: string }>(
      `select mf.id, mf.status, mf.exam_status, mf.exam_assessment_version_id,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id and ml.status <> 'approved')::text as pending,
              (select count(*) from month_lessons ml where ml.framework_id = mf.id)::text as total
       from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
       where pm.organization_id = $1 and pm.month = $2 and mf.cefr = $3`,
      [organizationId, month, cefr]
    );
    const row = result.rows[0];
    if (!row) return { ready: false, frameworkId: null, examVersionId: null };
    const ready = row.status === "approved" && row.exam_status === "approved" && row.pending === "0" && Number(row.total) > 0;
    return { ready, frameworkId: row.id, examVersionId: row.exam_assessment_version_id };
  }

  /** Bài của tháng từ lesson set đã publish (dùng chung bảng lessons với editor). */
  async listMonthLessons(learnerId: string, organizationId: string, month: string, cefr: CefrLevel): Promise<LearnerMonthLessonRecord[]> {
    const result = await this.pool.query<{
      id: string; title: string; day_number: number; lesson_date: string; cefr: CefrLevel; content: LessonContent & { durationMinutes?: number };
      lesson_count: string; progress_status: LessonProgressView["status"] | null; progress_score: string | null; progress_evidence: Record<string, unknown> | null; progress_updated_at: Date | null;
    }>(
      `select l.id, l.title, l.day_number, ml.lesson_date::text, ls.cefr, lv.content,
              (select count(*) from lessons all_lessons where all_lessons.lesson_set_version_id = lsv.id)::text as lesson_count,
              pr.status as progress_status, pr.score::text as progress_score, pr.evidence as progress_evidence, pr.updated_at as progress_updated_at
       from program_months pm
       join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = $4
       join lesson_sets ls on ls.month_framework_id = mf.id
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       join lessons l on l.lesson_set_version_id = lsv.id
       join month_lessons ml on ml.framework_id = mf.id and ml.lesson_number = l.day_number
       join lateral (select content from lesson_versions where lesson_id = l.id order by version desc limit 1) lv on true
       left join progress_records pr on pr.lesson_id = l.id and pr.learner_id = $1
       where pm.organization_id = $2 and pm.month = $3
       order by l.day_number`,
      [learnerId, organizationId, month, cefr]
    );
    return result.rows.map((row) => ({
      id: row.id, title: row.title, lessonNumber: row.day_number, date: row.lesson_date, cefr: row.cefr, content: row.content,
      progressStatus: row.progress_status ?? "not_started", progressScore: row.progress_score, progressEvidence: row.progress_evidence ?? {},
      progressUpdatedAt: row.progress_updated_at, month, lessonCount: Number(row.lesson_count)
    }));
  }

  /** Một bài tháng theo id (cho /api/v1/lessons/:id). Kèm khoá theo ngày và tuần tự. */
  async findMonthLesson(learnerId: string, lessonId: string, now: Date): Promise<{ record: LearnerMonthLessonRecord; lock: LessonLockView | null } | null> {
    const owner = await this.pool.query<{ organization_id: string; month: string; cefr: CefrLevel }>(
      `select pm.organization_id, pm.month, ls.cefr
       from lessons l join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
       join lesson_sets ls on ls.id = lsv.lesson_set_id join month_frameworks mf on mf.id = ls.month_framework_id
       join program_months pm on pm.id = mf.program_month_id
       join users u on u.id = $1 and u.organization_id = pm.organization_id
       where l.id = $2`,
      [learnerId, lessonId]
    );
    const info = owner.rows[0];
    if (!info) return null;
    const context = await this.context(learnerId);
    if (!context || context.cefr !== info.cefr) return null;
    const enrollment = await this.enrollmentFor(learnerId, info.month);
    if (!enrollment || enrollment.mode === "wait_next_month" || enrollment.mode === "locked_missed_exam") return null;
    const lessons = await this.listMonthLessons(learnerId, info.organization_id, info.month, info.cefr);
    const record = lessons.find((lesson) => lesson.id === lessonId);
    if (!record) return null;
    const today = localDateString(now);
    return { record, lock: lockFor(buildMonthlyCalendar(info.month), lessons, record, today) };
  }

  /** 1 ngày điểm danh = ngày học (T2–T6, không phải ngày thi) có hoàn thành ≥ 1 bài. */
  async recordAttendance(learnerId: string, lessonId: string, now: Date): Promise<void> {
    const date = localDateString(now);
    const calendar = buildMonthlyCalendar(monthOf(date));
    if (!calendar.effectiveDays.includes(date)) return;
    await this.pool.query(
      `insert into learner_attendance_days (learner_id, attendance_date, lesson_id) values ($1, $2, $3)
       on conflict (learner_id, attendance_date) do nothing`,
      [learnerId, date, lessonId]
    );
  }

  async attendanceDates(learnerId: string, month: string): Promise<string[]> {
    const result = await this.pool.query<{ attendance_date: string }>(
      "select attendance_date::text from learner_attendance_days where learner_id = $1 and to_char(attendance_date, 'YYYY-MM') = $2 order by attendance_date",
      [learnerId, month]
    );
    return result.rows.map((row) => row.attendance_date);
  }

  async monthView(learnerId: string, now: Date): Promise<LearnerMonthView | null> {
    const context = await this.context(learnerId);
    if (!context) return null;
    const today = localDateString(now);
    const month = monthOf(today);
    const calendar = buildMonthlyCalendar(month);
    const enrollment = await this.ensureCurrentMonthEnrollment(context, month, now);
    const readiness = context.cefr ? await this.contentReadiness(context.organizationId, month, context.cefr) : { ready: false, frameworkId: null, examVersionId: null };
    const active = Boolean(enrollment && (enrollment.mode === "join_current_month" || enrollment.mode === "unlocked_by_manager"));
    const lessonsRaw = active && readiness.ready && context.cefr ? await this.listMonthLessons(learnerId, context.organizationId, month, context.cefr) : [];
    const lessons: LearnerMonthLessonView[] = lessonsRaw.map((lesson) => ({
      id: lesson.id, lessonNumber: lesson.lessonNumber, date: lesson.date, title: lesson.title, status: lesson.progressStatus,
      lock: lockFor(calendar, lessonsRaw, lesson, today), review: false
    }));
    const attended = await this.attendanceDates(learnerId, month);
    const learnerEffectiveDays = enrollment?.effectiveDays ?? [];
    const attendance = buildAttendanceReport({ learnerEffectiveDays, completedAt: attended.map((date) => new Date(`${date}T12:00:00+07:00`)), today });
    const window = buildExamWindow(calendar.examDate, context.examDurationMinutes);
    const access = examAccessAt(window, now);
    const appeal = enrollment ? await this.examAppeal(learnerId, enrollment.programMonthId, now) : null;
    const attemptStatus = readiness.examVersionId ? await this.examAttemptStatus(learnerId, readiness.examVersionId) : "none";
    const appealGranted = appeal?.status === "approved" || appeal?.status === "auto_approved";
    const eligible = attendance.eligible || appealGranted;
    const seasonOnlyReason = !enrollment ? null
      : enrollment.mode === "wait_next_month" ? "waiting_next_month"
        : enrollment.mode === "locked_missed_exam" ? "locked_missed_exam"
          : !readiness.ready ? "no_content" : null;
    const blockedReason = !active || !enrollment ? "waiting"
      : !readiness.examVersionId ? "no_exam"
        : attemptStatus !== "none" && attemptStatus !== "in_progress" ? "already_submitted"
          : access === "not_open_yet" ? "not_open_yet"
            : access === "locked" ? "locked"
              : !eligible ? "not_eligible" : null;
    const coach = await this.coachTurnsThisMonth(learnerId, month);
    return {
      month, label: `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`, today, examDate: calendar.examDate,
      lessonCount: calendar.lessonCount, studyDayCount: calendar.studyDays.length, cefr: context.cefr,
      enrollment: enrollment ? {
        mode: enrollment.mode, reason: enrollment.reason, ratioPercent: enrollment.ratioPercent, startsOn: enrollment.startsOn,
        effectiveDayCount: enrollment.effectiveDays.length, maxAbsences: enrollment.maxAbsences, countsForLevelUp: enrollment.countsForLevelUp
      } : null,
      contentReady: readiness.ready,
      seasonOnly: Boolean(enrollment) && seasonOnlyReason !== null,
      seasonOnlyReason,
      lessons,
      nextLesson: lessons.find((lesson) => lesson.status !== "completed") ?? null,
      completedLessons: lessons.filter((lesson) => lesson.status === "completed").length,
      attendance,
      exam: {
        date: calendar.examDate, durationMinutes: context.examDurationMinutes, opensAt: window.opensAt.toISOString(), locksAt: window.locksAt.toISOString(),
        access, available: Boolean(readiness.examVersionId), eligible, attemptStatus,
        appeal: appeal ? { status: appeal.status, deadlineAt: appeal.deadlineAt.toISOString(), createdAt: appeal.createdAt.toISOString(), resolution: appeal.resolution } : null,
        canStart: blockedReason === null, blockedReason
      },
      coach: { turnsThisMonth: coach, monthlyTarget: context.coachMonthlyTarget, dailyLimit: context.coachDailyLimit }
    };
  }

  /** Đề thi tháng đã duyệt cho level & tháng hiện hành của học viên. */
  async publishedExamForLearner(learnerId: string, now: Date): Promise<{ versionId: string; definitionId: string; assessmentKey: string; title: string; version: number; blueprint: Record<string, unknown> } | null> {
    const context = await this.context(learnerId);
    if (!context?.cefr) return null;
    const month = monthOf(localDateString(now));
    const result = await this.pool.query<{ version_id: string; definition_id: string; assessment_key: string; title: string; version: number; blueprint: Record<string, unknown> }>(
      `select av.id as version_id, ad.id as definition_id, ad.assessment_key, ad.title, av.version, av.blueprint
       from program_months pm join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = $3 and mf.exam_status = 'approved'
       join assessment_versions av on av.id = mf.exam_assessment_version_id and av.status = 'published'
       join assessment_definitions ad on ad.id = av.definition_id
       where pm.organization_id = $1 and pm.month = $2`,
      [context.organizationId, month, context.cefr]
    );
    const row = result.rows[0];
    return row ? { versionId: row.version_id, definitionId: row.definition_id, assessmentKey: row.assessment_key, title: row.title, version: row.version, blueprint: row.blueprint } : null;
  }

  private async examAttemptStatus(learnerId: string, versionId: string): Promise<LearnerMonthView["exam"]["attemptStatus"]> {
    const result = await this.pool.query<{ status: LearnerMonthView["exam"]["attemptStatus"] }>(
      "select status from assessment_attempts where learner_id = $1 and assessment_version_id = $2 order by started_at desc limit 1",
      [learnerId, versionId]
    );
    return result.rows[0]?.status ?? "none";
  }

  /** Khiếu nại không đủ điều kiện thi; quá 24 giờ chưa xử lý thì tự cho thi. */
  async createExamAppeal(learnerId: string, reason: string, now: Date): Promise<{ status: string; deadlineAt: Date }> {
    const view = await this.monthView(learnerId, now);
    if (!view?.enrollment || view.attendance.eligible) throw new Error("MONTHLY_APPEAL_NOT_NEEDED");
    if (view.exam.appeal) throw new Error("MONTHLY_APPEAL_EXISTS");
    const enrollment = await this.enrollmentFor(learnerId, view.month);
    if (!enrollment) throw new Error("MONTHLY_APPEAL_NOT_NEEDED");
    const deadline = examAppealDeadline(now);
    await this.pool.query(
      `insert into monthly_exam_appeals (id, learner_id, program_month_id, reason, status, deadline_at, created_at) values ($1, $2, $3, $4, 'pending', $5, $6)`,
      [randomUUID(), learnerId, enrollment.programMonthId, reason.trim(), deadline, now]
    );
    return { status: "pending", deadlineAt: deadline };
  }

  private async examAppeal(learnerId: string, programMonthId: string, now: Date): Promise<{ status: LearnerMonthView["exam"]["appeal"] extends infer T ? (T extends { status: infer S } ? S : never) : never; deadlineAt: Date; createdAt: Date; resolution: string | null } | null> {
    // Quá hạn 24 giờ mà Quản lý chưa xử lý → tự cho thi (ghi rõ auto_approved).
    await this.pool.query(
      `update monthly_exam_appeals set status = 'auto_approved', resolution = 'Quá 24 giờ chưa xử lý: hệ thống tự cho thi.', resolved_at = $3
       where learner_id = $1 and program_month_id = $2 and status = 'pending' and deadline_at <= $3`,
      [learnerId, programMonthId, now]
    );
    const result = await this.pool.query<{ status: "pending" | "approved" | "rejected" | "auto_approved"; deadline_at: Date; created_at: Date; resolution: string | null }>(
      "select status, deadline_at, created_at, resolution from monthly_exam_appeals where learner_id = $1 and program_month_id = $2",
      [learnerId, programMonthId]
    );
    const row = result.rows[0];
    return row ? { status: row.status, deadlineAt: row.deadline_at, createdAt: row.created_at, resolution: row.resolution } : null;
  }

  private async coachTurnsThisMonth(learnerId: string, month: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count from coach_turns ct join coach_sessions cs on cs.id = ct.session_id
       where cs.learner_id = $1 and ct.speaker = 'learner' and to_char(ct.created_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM') = $2`,
      [learnerId, month]
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, m! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lockFor(calendar: MonthlyCalendar, lessons: readonly LearnerMonthLessonRecord[], lesson: LearnerMonthLessonRecord, today: string): LessonLockView | null {
  const completed = new Set(lessons.filter((item) => item.progressStatus === "completed").map((item) => item.lessonNumber));
  if (isLessonLearnable(calendar, lesson.lessonNumber, completed, today)) return null;
  const blocker = lessons.find((item) => item.lessonNumber < lesson.lessonNumber && !completed.has(item.lessonNumber));
  if (blocker) {
    return {
      reason: "prior",
      message: `Bạn chưa hoàn thành Bài ${blocker.lessonNumber} · ${blocker.title} (bài ${blocker.lessonNumber}/${lessons.length}). Các bài nối tiếp nhau nên cần học bài trước rồi mới học bài sau.`,
      dayNumber: lesson.lessonNumber, totalLessons: lessons.length,
      blocker: { id: blocker.id, dayNumber: blocker.lessonNumber, title: blocker.title }
    };
  }
  return {
    reason: "date",
    message: "Bạn đã xong các bài trước; hôm nay có thể luyện thêm với Season.",
    dayNumber: lesson.lessonNumber, totalLessons: lessons.length, opensAt: lesson.date
  };
}

export { nextMonth as nextLearnerMonth };
