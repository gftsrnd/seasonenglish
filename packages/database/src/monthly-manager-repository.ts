import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { CefrLevel, ManagerMonthlyView } from "@e4s/contracts";
import {
  addDays, buildMonthlyCalendar, consecutiveAbsentStudyDays, localDateString, monthOf, nextMonth, shouldLockForAbsence
} from "@e4s/domain/calendar";

/**
 * Quản lý và job hằng ngày cho cơ chế tháng:
 * - khoá tài khoản vắng 5 ngày học liên tiếp (Quản lý mở lại);
 * - bỏ thi tháng → khoá bài học tháng sau; học viên gửi báo cáo xin mở; Quản lý mở thì vào thẳng tháng mới,
 *   tháng đó không tính vào số tháng xét lên mức;
 * - khiếu nại không đủ điều kiện thi: quá 24 giờ tự cho thi.
 * Mọi thao tác ghi audit_events.
 */
export class MonthlyManagerRepository {
  constructor(private readonly pool: Pool) {}

  /** Chạy mỗi ngày (worker job `monthly.daily-maintenance`, idempotent theo ngày) hoặc lười khi Quản lý/học viên mở màn. */
  async runDailyMaintenance(now: Date): Promise<{ lockedForAbsence: number; lockedMissedExam: number; autoApprovedAppeals: number }> {
    const today = localDateString(now);
    const autoApprovedAppeals = await this.autoApproveExpiredAppeals(now);
    const lockedForAbsence = await this.lockConsecutiveAbsences(today);
    const lockedMissedExam = await this.lockMissedExams(today, now);
    return { lockedForAbsence, lockedMissedExam, autoApprovedAppeals };
  }

  private async autoApproveExpiredAppeals(now: Date): Promise<number> {
    const result = await this.pool.query(
      `update monthly_exam_appeals set status = 'auto_approved', resolution = 'Quá 24 giờ chưa xử lý: hệ thống tự cho thi.', resolved_at = $1
       where status = 'pending' and deadline_at <= $1`,
      [now]
    );
    return result.rowCount ?? 0;
  }

  /** Vắng 5 ngày học liên tiếp (T2–T6, bỏ ngày thi) tính từ ngày bắt đầu của ghi danh tháng. */
  private async lockConsecutiveAbsences(today: string): Promise<number> {
    const month = monthOf(today);
    const learners = await this.pool.query<{ learner_id: string; organization_id: string; starts_on: string | null; effective_days: unknown }>(
      `select lme.learner_id, u.organization_id, lme.starts_on::text, lme.effective_days
       from learner_month_enrollments lme
       join program_months pm on pm.id = lme.program_month_id and pm.month = $1
       join users u on u.id = lme.learner_id and u.status = 'active'
       where lme.mode in ('join_current_month', 'unlocked_by_manager')
         and not exists (select 1 from account_locks al where al.learner_id = lme.learner_id and al.unlocked_at is null)`,
      [month]
    );
    let locked = 0;
    for (const row of learners.rows) {
      const effectiveDays = Array.isArray(row.effective_days) ? row.effective_days as string[] : [];
      const countFrom = row.starts_on ?? effectiveDays[0] ?? today;
      // Tháng trước cũng tính vào chuỗi nếu học viên đã học tháng trước (xuyên tháng).
      const previous = await this.pool.query<{ starts_on: string | null }>(
        `select lme.starts_on::text from learner_month_enrollments lme join program_months pm on pm.id = lme.program_month_id
         where lme.learner_id = $1 and pm.month = $2 and lme.mode in ('join_current_month', 'unlocked_by_manager')`,
        [row.learner_id, previousMonthOf(month)]
      );
      const since = previous.rows[0]?.starts_on ?? countFrom;
      const attended = await this.pool.query<{ attendance_date: string }>(
        "select attendance_date::text from learner_attendance_days where learner_id = $1 and attendance_date >= $2",
        [row.learner_id, since]
      );
      const streak = consecutiveAbsentStudyDays({ today, attendedDates: new Set(attended.rows.map((item) => item.attendance_date)), countFrom: since });
      if (!shouldLockForAbsence(streak)) continue;
      await this.lockAccount(row.learner_id, row.organization_id, "consecutive_absence", { consecutiveAbsentDays: streak, today });
      locked += 1;
    }
    return locked;
  }

  private async lockAccount(learnerId: string, organizationId: string, reason: "consecutive_absence" | "manual", detail: Record<string, unknown>, actorId: string | null = null): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("insert into account_locks (id, learner_id, reason, detail) values ($1, $2, $3, $4::jsonb)", [randomUUID(), learnerId, reason, JSON.stringify(detail)]);
      await client.query("update users set status = 'disabled', updated_at = now() where id = $1 and status = 'active'", [learnerId]);
      await client.query("update sessions set revoked_at = coalesce(revoked_at, now()) where user_id = $1 and revoked_at is null", [learnerId]);
      await this.audit(client, organizationId, actorId, "account.locked", learnerId, { reason, ...detail });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  /** Sau ngày thi của tháng trước: học viên có ghi danh học mà không có lượt thi nào → khoá tháng này. */
  private async lockMissedExams(today: string, now: Date): Promise<number> {
    const month = monthOf(today);
    const previous = previousMonthOf(month);
    const previousCalendar = buildMonthlyCalendar(previous);
    if (today <= previousCalendar.examDate) return 0;
    const rows = await this.pool.query<{ learner_id: string; organization_id: string; cefr: CefrLevel; exam_version_id: string | null }>(
      `select lme.learner_id, u.organization_id, lme.cefr, mf.exam_assessment_version_id as exam_version_id
       from learner_month_enrollments lme
       join program_months pm on pm.id = lme.program_month_id and pm.month = $1
       join users u on u.id = lme.learner_id and u.status in ('active', 'disabled')
       left join month_frameworks mf on mf.program_month_id = pm.id and mf.cefr = lme.cefr and mf.exam_status = 'approved'
       where lme.mode in ('join_current_month', 'unlocked_by_manager')
         and not exists (
           select 1 from learner_month_enrollments next_month join program_months npm on npm.id = next_month.program_month_id
           where next_month.learner_id = lme.learner_id and npm.month = $2
         )`,
      [previous, month]
    );
    let locked = 0;
    for (const row of rows.rows) {
      // Không có đề thi đã duyệt thì không phạt học viên.
      if (!row.exam_version_id) continue;
      const attempt = await this.pool.query<{ count: string }>(
        "select count(*)::text as count from assessment_attempts where learner_id = $1 and assessment_version_id = $2 and status <> 'in_progress'",
        [row.learner_id, row.exam_version_id]
      );
      if (attempt.rows[0]?.count !== "0") continue;
      const programMonth = await this.ensureProgramMonth(row.organization_id, month);
      const inserted = await this.pool.query(
        `insert into learner_month_enrollments (id, learner_id, program_month_id, cefr, mode, effective_days, max_absences, ratio_percent, approved_at, starts_on, reason, counts_for_level_up)
         values ($1, $2, $3, $4, 'locked_missed_exam', '[]'::jsonb, 0, 0, $5, null, 'missed_exam', false)
         on conflict (learner_id, program_month_id) do nothing`,
        [randomUUID(), row.learner_id, programMonth.id, row.cefr, now]
      );
      if (inserted.rowCount) {
        const client = await this.pool.connect();
        try { await this.audit(client, row.organization_id, null, "monthly.locked_missed_exam", row.learner_id, { missedMonth: previous, lockedMonth: month }); } finally { client.release(); }
        locked += 1;
      }
    }
    return locked;
  }

  // ---------- Học viên: báo cáo xin mở ----------

  async createUnlockRequest(learnerId: string, reason: string, now: Date): Promise<{ status: string }> {
    const month = monthOf(localDateString(now));
    const lock = await this.pool.query<{ program_month_id: string; organization_id: string }>(
      `select lme.program_month_id, u.organization_id from learner_month_enrollments lme
       join program_months pm on pm.id = lme.program_month_id and pm.month = $2
       join users u on u.id = lme.learner_id
       where lme.learner_id = $1 and lme.mode = 'locked_missed_exam'`,
      [learnerId, month]
    );
    const row = lock.rows[0];
    if (!row) throw new Error("MONTHLY_UNLOCK_NOT_NEEDED");
    const previousMonthId = await this.pool.query<{ id: string }>(
      "select id from program_months where organization_id = $1 and month = $2",
      [row.organization_id, previousMonthOf(month)]
    );
    const missedId = previousMonthId.rows[0]?.id ?? row.program_month_id;
    const result = await this.pool.query(
      `insert into monthly_unlock_requests (id, learner_id, missed_program_month_id, reason, status, created_at) values ($1, $2, $3, $4, 'pending', $5)
       on conflict (learner_id, missed_program_month_id) do nothing`,
      [randomUUID(), learnerId, missedId, reason.trim(), now]
    );
    if (!result.rowCount) throw new Error("MONTHLY_UNLOCK_EXISTS");
    return { status: "pending" };
  }

  async unlockRequestFor(learnerId: string, now: Date): Promise<{ status: string; createdAt: Date; resolution: string | null } | null> {
    const month = monthOf(localDateString(now));
    const result = await this.pool.query<{ status: string; created_at: Date; resolution: string | null }>(
      `select r.status, r.created_at, r.resolution from monthly_unlock_requests r
       join program_months pm on pm.id = r.missed_program_month_id
       where r.learner_id = $1 and pm.month in ($2, $3) order by r.created_at desc limit 1`,
      [learnerId, previousMonthOf(month), month]
    );
    const row = result.rows[0];
    return row ? { status: row.status, createdAt: row.created_at, resolution: row.resolution } : null;
  }

  // ---------- Quản lý ----------

  async managerView(managerId: string, now: Date): Promise<ManagerMonthlyView | null> {
    const organization = await this.pool.query<{ organization_id: string }>("select organization_id from users where id = $1 and role = 'manager'", [managerId]);
    const organizationId = organization.rows[0]?.organization_id;
    if (!organizationId) return null;
    const today = localDateString(now);
    const month = monthOf(today);
    const appeals = await this.pool.query<{ id: string; learner_id: string; learner_name: string; email: string | null; cefr: string; month: string; reason: string; status: ManagerMonthlyView["examAppeals"][number]["status"]; deadline_at: Date; created_at: Date; resolution: string | null; attended: string; absent_max: number; effective_days: unknown }>(
      `select a.id, a.learner_id, u.display_name as learner_name, u.email, lme.cefr, pm.month, a.reason, a.status, a.deadline_at, a.created_at, a.resolution,
              (select count(*)::text from learner_attendance_days d where d.learner_id = a.learner_id and to_char(d.attendance_date, 'YYYY-MM') = pm.month) as attended,
              lme.max_absences as absent_max, lme.effective_days
       from monthly_exam_appeals a
       join users u on u.id = a.learner_id
       join program_months pm on pm.id = a.program_month_id
       left join learner_month_enrollments lme on lme.learner_id = a.learner_id and lme.program_month_id = a.program_month_id
       where pm.organization_id = $1 and pm.month in ($2, $3)
       order by a.status = 'pending' desc, a.deadline_at`,
      [organizationId, month, previousMonthOf(month)]
    );
    const unlocks = await this.pool.query<{ id: string; learner_id: string; learner_name: string; email: string | null; missed_month: string; reason: string; status: ManagerMonthlyView["unlockRequests"][number]["status"]; created_at: Date; resolution: string | null }>(
      `select r.id, r.learner_id, u.display_name as learner_name, u.email, pm.month as missed_month, r.reason, r.status, r.created_at, r.resolution
       from monthly_unlock_requests r join users u on u.id = r.learner_id join program_months pm on pm.id = r.missed_program_month_id
       where pm.organization_id = $1 order by r.status = 'pending' desc, r.created_at desc limit 100`,
      [organizationId]
    );
    const locks = await this.pool.query<{ id: string; learner_id: string; learner_name: string; email: string | null; reason: ManagerMonthlyView["lockedAccounts"][number]["reason"]; detail: Record<string, unknown>; locked_at: Date; unlocked_at: Date | null; unlock_note: string | null }>(
      `select al.id, al.learner_id, u.display_name as learner_name, u.email, al.reason, al.detail, al.locked_at, al.unlocked_at, al.unlock_note
       from account_locks al join users u on u.id = al.learner_id
       where u.organization_id = $1 order by al.unlocked_at is null desc, al.locked_at desc limit 100`,
      [organizationId]
    );
    const lockedMonth = await this.pool.query<{ learner_id: string; learner_name: string; email: string | null; cefr: string }>(
      `select lme.learner_id, u.display_name as learner_name, u.email, lme.cefr from learner_month_enrollments lme
       join program_months pm on pm.id = lme.program_month_id and pm.month = $2 join users u on u.id = lme.learner_id
       where pm.organization_id = $1 and lme.mode = 'locked_missed_exam'`,
      [organizationId, month]
    );
    return {
      today, month, label: `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`,
      examAppeals: appeals.rows.map((row) => ({
        id: row.id, learnerId: row.learner_id, learnerName: row.learner_name, email: row.email, cefr: row.cefr as CefrLevel, month: row.month, reason: row.reason, status: row.status,
        deadlineAt: row.deadline_at.toISOString(), createdAt: row.created_at.toISOString(), resolution: row.resolution,
        attendedDays: Number(row.attended), effectiveDays: Array.isArray(row.effective_days) ? row.effective_days.length : 0, maxAbsences: row.absent_max ?? 0
      })),
      unlockRequests: unlocks.rows.map((row) => ({ id: row.id, learnerId: row.learner_id, learnerName: row.learner_name, email: row.email, missedMonth: row.missed_month, reason: row.reason, status: row.status, createdAt: row.created_at.toISOString(), resolution: row.resolution })),
      lockedAccounts: locks.rows.map((row) => ({ id: row.id, learnerId: row.learner_id, learnerName: row.learner_name, email: row.email, reason: row.reason, detail: row.detail, lockedAt: row.locked_at.toISOString(), unlockedAt: row.unlocked_at?.toISOString() ?? null, unlockNote: row.unlock_note })),
      lockedMonthLearners: lockedMonth.rows.map((row) => ({ learnerId: row.learner_id, learnerName: row.learner_name, email: row.email, cefr: row.cefr as CefrLevel }))
    };
  }

  async decideExamAppeal(managerId: string, appealId: string, decision: "approved" | "rejected", resolution: string, now: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const row = await client.query<{ learner_id: string; organization_id: string; status: string }>(
        `select a.learner_id, pm.organization_id, a.status from monthly_exam_appeals a join program_months pm on pm.id = a.program_month_id
         join users m on m.id = $2 and m.role = 'manager' and m.organization_id = pm.organization_id where a.id = $1 for update of a`,
        [appealId, managerId]
      );
      const appeal = row.rows[0];
      if (!appeal) throw new Error("MONTHLY_APPEAL_NOT_FOUND");
      if (appeal.status !== "pending") throw new Error("MONTHLY_APPEAL_ALREADY_DECIDED");
      await client.query("update monthly_exam_appeals set status = $2, resolution = $3, resolved_by = $4, resolved_at = $5 where id = $1", [appealId, decision, resolution.trim() || null, managerId, now]);
      await this.audit(client, appeal.organization_id, managerId, `monthly.exam_appeal.${decision}`, appeal.learner_id, { appealId, resolution });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  /** Quản lý mở: học viên vào thẳng tháng mới từ bài 1; tháng này không tính vào số tháng xét lên mức. */
  async decideUnlockRequest(managerId: string, requestId: string, decision: "approved" | "rejected", resolution: string, now: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const row = await client.query<{ learner_id: string; organization_id: string; status: string; cefr: CefrLevel | null }>(
        `select r.learner_id, pm.organization_id, r.status, e.cefr from monthly_unlock_requests r join program_months pm on pm.id = r.missed_program_month_id
         join users m on m.id = $2 and m.role = 'manager' and m.organization_id = pm.organization_id
         left join enrollments e on e.learner_id = r.learner_id and e.cefr_approved = true
         where r.id = $1 for update of r`,
        [requestId, managerId]
      );
      const request = row.rows[0];
      if (!request) throw new Error("MONTHLY_UNLOCK_NOT_FOUND");
      if (request.status !== "pending") throw new Error("MONTHLY_UNLOCK_ALREADY_DECIDED");
      await client.query("update monthly_unlock_requests set status = $2, resolution = $3, resolved_by = $4, resolved_at = $5 where id = $1", [requestId, decision, resolution.trim() || null, managerId, now]);
      if (decision === "approved") {
        const today = localDateString(now);
        const month = monthOf(today);
        const calendar = buildMonthlyCalendar(month);
        const remaining = calendar.effectiveDays.filter((day) => day >= today);
        const programMonth = await this.ensureProgramMonth(request.organization_id, month, client);
        await client.query(
          `insert into learner_month_enrollments (id, learner_id, program_month_id, cefr, mode, effective_days, max_absences, ratio_percent, approved_at, starts_on, reason, counts_for_level_up)
           values ($1, $2, $3, $4, 'unlocked_by_manager', $5::jsonb, $6, $7, $8, $9, 'manager_unlock', false)
           on conflict (learner_id, program_month_id) do update set mode = 'unlocked_by_manager', effective_days = excluded.effective_days, max_absences = excluded.max_absences,
             ratio_percent = excluded.ratio_percent, approved_at = excluded.approved_at, starts_on = excluded.starts_on, reason = 'manager_unlock', counts_for_level_up = false`,
          [randomUUID(), request.learner_id, programMonth.id, request.cefr ?? "A1", JSON.stringify(remaining), Math.floor((remaining.length * 30) / 100), calendar.effectiveDayCount ? Math.round((remaining.length / calendar.effectiveDayCount) * 10000) / 100 : 0, now, remaining[0] ?? addDays(today, 0)]
        );
      }
      await this.audit(client, request.organization_id, managerId, `monthly.unlock_request.${decision}`, request.learner_id, { requestId, resolution });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
  }

  async unlockAccount(managerId: string, lockId: string, note: string, now: Date): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const row = await client.query<{ learner_id: string; organization_id: string }>(
        `select al.learner_id, u.organization_id from account_locks al join users u on u.id = al.learner_id
         join users m on m.id = $2 and m.role = 'manager' and m.organization_id = u.organization_id
         where al.id = $1 and al.unlocked_at is null for update of al`,
        [lockId, managerId]
      );
      const lock = row.rows[0];
      if (!lock) throw new Error("ACCOUNT_LOCK_NOT_FOUND");
      await client.query("update account_locks set unlocked_by = $2, unlocked_at = $3, unlock_note = $4 where id = $1", [lockId, managerId, now, note.trim() || null]);
      await client.query("update users set status = 'active', updated_at = now() where id = $1 and status = 'disabled'", [lock.learner_id]);
      // Mở lại thì chuỗi vắng tính lại từ hôm nay: ghi một dòng điểm danh "ân hạn" là sai luật, nên chỉ ghi mốc vào audit; job đọc theo ngày mở khoá.
      await this.audit(client, lock.organization_id, managerId, "account.unlocked", lock.learner_id, { lockId, note, since: localDateString(now) });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); }
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

  private async audit(client: PoolClient, organizationId: string, actorId: string | null, action: string, entityId: string, payload: Record<string, unknown>): Promise<void> {
    await client.query(
      `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, $4, 'learner', $5, $6::jsonb, $7)`,
      [randomUUID(), organizationId, actorId, action, entityId, JSON.stringify(payload), randomUUID()]
    );
  }
}

function previousMonthOf(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, m! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export { nextMonth as nextMonthOf };
