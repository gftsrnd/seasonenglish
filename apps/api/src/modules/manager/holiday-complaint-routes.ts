import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { requestEvidenceFields } from "./request-evidence.js";
import { createRoleGuard } from "../identity/policy.js";
import { vietnamPublicHolidays } from "@e4s/domain/monthly";
import { autoApproveExpiredEligibilityComplaints, learnerMonthlyAccess } from "@e4s/database";
import { monthlyExamEligibility } from "../learning/routes.js";

const complaintKind = z.enum(["exam_eligibility", "lesson_unlock", "account_unlock", "attendance", "lesson_count", "account"]);
const createComplaintInput = z.object({ kind: complaintKind, reason: z.string().trim().min(5).max(2000), ...requestEvidenceFields });
const decisionInput = z.object({ decision: z.enum(["approved", "rejected"]), resolution: z.string().trim().min(1).max(2000) });
const holidayInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).refine(({ date }) => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}, { message: "Holiday must be a weekday", path: ["date"] });
const uuidParams = z.object({ id: z.uuid() });
const historyParams = uuidParams.extend({ kind: z.enum(["complaint", "reopen"]) });
const historyInput = z.object({ archived: z.boolean() });

const appealHistorySources = ["appeals", "practice_appeals", "lesson_part_appeals"].map(table => ({
  table,
  status: "('accepted', 'rejected')",
  from: "users learner join users actor on actor.organization_id = learner.organization_id",
  scope: "item.learner_id = learner.id and learner.role = 'learner'"
}));

const requestHistorySources = {
  complaint: [{
    table: "learner_complaints",
    status: "('approved', 'rejected', 'auto_approved')",
    from: "users actor",
    scope: "item.organization_id = actor.organization_id"
  }],
  reopen: [{
    table: "month_lesson_corrections",
    status: "('authorized', 'published', 'rejected')",
    from: `month_lessons lesson
      join month_frameworks framework on framework.id = lesson.framework_id
      join program_months month on month.id = framework.program_month_id
      join users actor on actor.organization_id = month.organization_id`,
    scope: "item.month_lesson_id = lesson.id"
  }, {
    table: "month_framework_reopen_requests",
    status: "('authorized', 'rejected')",
    from: `month_frameworks framework
      join program_months month on month.id = framework.program_month_id
      join users actor on actor.organization_id = month.organization_id`,
    scope: "item.framework_id = framework.id"
  }]
};

export function registerHolidayComplaintRoutes(app: FastifyInstance, pool: Pool): void {
  const learnerSupport = createRoleGuard(pool, ["learner"], { allowDisabledLearner: true });
  const managerOnly = createRoleGuard(pool, ["manager"]);
  const operatorOnly = createRoleGuard(pool, ["operator"]);

  app.get("/api/v1/learner/complaints", { preHandler: learnerSupport }, async (request, reply) => {
    const session = request.e4sSession!;
    const locked = session.accountStatus === "disabled";
    reply.header("Cache-Control", "private, no-store");
    if (!locked) {
      await autoApproveExpiredEligibilityComplaints(pool, { learnerId: session.user.id });
    }
    // While locked, only unlock requests from the current lock count: a request decided before
    // the latest lock (e.g. the approval that ended a previous lock) is a finished cycle.
    const result = await pool.query(
      `with lock_started as (
         select max(created_at) as at from audit_events
          where $2::boolean and entity_type = 'user' and entity_id = $1
            and (action = 'learner.inactivity_locked' or (action = 'account.status.changed' and payload->>'to' = 'disabled'))
       )
       select id, kind, reason, status, resolution, submitted_at as "submittedAt", due_at as "dueAt", resolved_at as "resolvedAt",
              request_scope as scope, screenshot is not null as "hasEvidence", nullif(left(related_data->>'month', 7), '') as month
         from learner_complaints cross join lock_started
        where learner_id = $1 and (not $2::boolean or (kind = 'account_unlock'
          and (status = 'pending' or lock_started.at is null or coalesce(resolved_at, submitted_at) >= lock_started.at)))
         order by submitted_at desc`,
      [session.user.id, locked]
    );
    return { complaints: result.rows };
  });

  app.post("/api/v1/learner/complaints", { preHandler: learnerSupport }, async (request, reply) => {
    const parsed = createComplaintInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "LEARNER_COMPLAINT_INVALID" });
    const session = request.e4sSession!;
    if (session.accountStatus === "disabled" && parsed.data.kind !== "account_unlock") {
      return reply.code(403).send({ code: "FORBIDDEN" });
    }
    const requestId = randomUUID();
    const dueHours = parsed.data.kind === "exam_eligibility" ? 24 : null;
    let relatedData = {};
    if (parsed.data.kind === "exam_eligibility") {
      const eligibility = await monthlyExamEligibility(pool, session.user.id, { includeLate: false });
      const access = await learnerMonthlyAccess(pool, session.user.id);
      if (eligibility.accessState !== "appeal_required" || eligibility.systemDate > eligibility.examDate || !access?.cefr) {
        return reply.code(409).send({ code: "EXAM_ELIGIBILITY_COMPLAINT_NOT_APPLICABLE" });
      }
      relatedData = { month: eligibility.month, cefr: access.cefr, examDate: eligibility.examDate, absenceDays: eligibility.absenceDays, maxAbsences: eligibility.maxAbsences };
    } else if (parsed.data.kind === "lesson_unlock") {
      const access = await learnerMonthlyAccess(pool, session.user.id);
      if (access?.state !== "missed_exam") return reply.code(409).send({ code: "LESSON_UNLOCK_COMPLAINT_NOT_APPLICABLE" });
      relatedData = { month: access.month };
    }
    const result = await pool.query(
      `insert into learner_complaints (id, organization_id, learner_id, kind, reason, related_data, due_at, request_scope, screenshot, screenshot_type)
       select $1, u.organization_id, u.id, $3, $4,
              $9::jsonb,
              case when $5::int is null then null else now() + make_interval(hours => $5::int) end, $6, $7, $8
         from users u where u.id = $2 and u.role = 'learner'
          and (u.status = 'active' or (u.status = 'disabled' and $3 = 'account_unlock'))
          and not exists (select 1 from learner_complaints previous
            where previous.learner_id = u.id and previous.kind = $3
              and left(previous.related_data->>'month', 7) = $9::jsonb->>'month'
              and (($3 = 'exam_eligibility' and previous.status in ('approved', 'auto_approved'))
                or ($3 = 'lesson_unlock' and previous.status = 'rejected' and previous.resolved_at > now() - interval '1 day')))
       on conflict (learner_id, kind) where status = 'pending' do nothing
       returning id, kind, reason, status, submitted_at as "submittedAt", due_at as "dueAt", request_scope as scope, screenshot is not null as "hasEvidence"`,
      [requestId, session.user.id, parsed.data.kind, parsed.data.reason, dueHours, parsed.data.scope ?? null,
        parsed.data.screenshot?.bytes ?? null, parsed.data.screenshot?.mimeType ?? null, JSON.stringify(relatedData)]
    );
    if (!result.rowCount) return reply.code(409).send({ code: "LEARNER_COMPLAINT_ALREADY_PENDING" });
    return reply.code(201).send({ complaint: result.rows[0] });
  });

  app.get("/api/v1/manager/complaints", { preHandler: managerOnly }, async (request) => {
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    // Exam complaints are automatically approved at their 24-hour deadline.
    await autoApproveExpiredEligibilityComplaints(pool, { organizationId });
    const result = await pool.query(
      `select c.id, c.learner_id as "learnerId", u.display_name as "learnerName", c.kind, c.reason,
              c.status, c.resolution, c.related_data as "relatedData", c.submitted_at as "submittedAt",
              c.due_at as "dueAt", c.resolved_at as "resolvedAt", c.archived_at as "archivedAt",
              c.request_scope as scope, c.screenshot is not null as "hasEvidence"
         from learner_complaints c join users u on u.id = c.learner_id
        where c.organization_id = $1 and c.staff_deleted_at is null order by (c.status = 'pending') desc, c.due_at nulls last, c.submitted_at desc`,
      [organizationId]
    );
    return { complaints: result.rows };
  });

  app.post<{ Params: { id: string } }>("/api/v1/manager/complaints/:id/decision", { preHandler: managerOnly }, async (request, reply) => {
    const params = uuidParams.safeParse(request.params);
    const parsed = decisionInput.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ code: "MANAGER_COMPLAINT_DECISION_INVALID" });
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    await autoApproveExpiredEligibilityComplaints(pool, { organizationId });
    const result = await pool.query(
      `with resolved as (
        update learner_complaints c set status = $3, resolution = $4, resolved_by = $2, resolved_at = now(),
          related_data = c.related_data || jsonb_build_object('resolvedOn', organization_system_date(c.organization_id))
            || case when c.kind = 'lesson_unlock' and $3 = 'approved'
                    then jsonb_build_object('month', to_char(organization_system_date(c.organization_id), 'YYYY-MM'))
                    else '{}'::jsonb end
         from users manager where c.id = $1 and c.organization_id = manager.organization_id
          and manager.id = $2 and manager.role = 'manager' and c.status = 'pending'
          and (c.kind <> 'exam_eligibility' or c.due_at > now())
        returning c.id, c.kind, c.status, c.resolution, c.resolved_at, c.learner_id, c.organization_id
      ), unlocked as (
        update users set status = 'active', updated_at = now() from resolved
        where users.id = resolved.learner_id and users.status = 'disabled'
          and resolved.kind = 'account_unlock' and resolved.status = 'approved'
      ), audit as (
        insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
        select gen_random_uuid(), organization_id, $2, 'learner.complaint.decided', 'learner_complaint', id,
               jsonb_build_object('status', status, 'kind', kind, 'resolution', resolution), gen_random_uuid()::text
        from resolved
      )
      select id, kind, status, resolution, resolved_at from resolved`,
      [params.data.id, request.e4sSession!.user.id, parsed.data.decision, parsed.data.resolution]
    );
    if (!result.rowCount) return reply.code(409).send({ code: "MANAGER_COMPLAINT_NOT_PENDING" });
    return { complaint: result.rows[0] };
  });

  app.patch("/api/v1/manager/request-history/:kind/:id", { preHandler: managerOnly }, async (request, reply) => {
    const params = historyParams.safeParse(request.params);
    const input = historyInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ code: "MANAGER_REQUEST_HISTORY_INVALID" });

    const { kind, id } = params.data;
    const action = input.data.archived ? "archive" : "restore";
    const changed = await updateStaffRequestHistory(pool, request, "manager", requestHistorySources[kind], id, action);
    return changed ? reply.code(204).send() : reply.code(409).send({ code: "MANAGER_REQUEST_NOT_HANDLED" });
  });

  app.delete("/api/v1/manager/request-history/:kind/:id", { preHandler: managerOnly }, async (request, reply) => {
    const params = historyParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MANAGER_REQUEST_HISTORY_INVALID" });
    const { kind, id } = params.data;
    const changed = await updateStaffRequestHistory(pool, request, "manager", requestHistorySources[kind], id, "delete");
    return changed ? reply.code(204).send() : reply.code(409).send({ code: "MANAGER_REQUEST_NOT_HANDLED" });
  });

  app.delete("/api/v1/content/review/appeals/:id", { preHandler: operatorOnly }, async (request, reply) => {
    const params = uuidParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "INVALID_REVIEW_APPEAL" });
    const changed = await updateStaffRequestHistory(pool, request, "operator", appealHistorySources, params.data.id, "delete");
    return changed ? reply.code(204).send() : reply.code(409).send({ code: "REVIEW_APPEAL_NOT_HANDLED" });
  });

  app.get("/api/v1/manager/holidays", { preHandler: managerOnly }, async (request) => {
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    const result = await pool.query(
      `select h.id, h.holiday_date::text as date, h.created_at, u.display_name as created_by_name
         from organization_holidays h left join users u on u.id = h.created_by
        where h.organization_id = $1 order by h.holiday_date`, [organizationId]
    );
    const system = await pool.query<{ year: number }>("select extract(year from organization_system_date($1))::int as year", [organizationId]);
    const year = system.rows[0]!.year;
    const automatic = vietnamPublicHolidays(year).map(day => ({ ...day, id: `vn:${day.date}`, created_at: `${year}-01-01T00:00:00Z`, created_by_name: "Lịch lễ Việt Nam" }));
    const nationalDates = new Set(automatic.map(day => day.date));
    return { holidays: [...automatic, ...result.rows.filter((row: { date: string }) => !nationalDates.has(row.date)).map(row => ({ ...row, source: "organization" }))].sort((a, b) => a.date.localeCompare(b.date)) };
  });

  app.post("/api/v1/manager/holidays", { preHandler: managerOnly }, async (request, reply) => {
    const parsed = holidayInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "MANAGER_HOLIDAY_INVALID" });
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    const fallbackExamDate = lastWeekdayOfMonth(parsed.data.date.slice(0, 7));
    const client = await pool.connect();
    let holiday: { id: string; date: string } | undefined;
    try {
      await client.query("begin");
      const result = await client.query<{ id: string; date: string }>(
      `insert into organization_holidays (organization_id, holiday_date, created_by)
       select $1, $2::date, $3 where coalesce((
         select pm.exam_date from program_months pm where pm.organization_id = $1 and pm.month = to_char($2::date, 'YYYY-MM')
       ), $4::date) <> $2::date and not exists (
         select 1 from program_months pm where pm.organization_id = $1
          and pm.month = to_char($2::date, 'YYYY-MM') and pm.exam_date = $2::date
       ) on conflict (organization_id, holiday_date) do nothing
       returning id, holiday_date::text as date`,
      [organizationId, parsed.data.date, request.e4sSession!.user.id, fallbackExamDate]
      );
      holiday = result.rows[0];
      if (holiday) await client.query("insert into organization_holiday_audit (organization_id, holiday_date, action, actor_id) values ($1, $2::date, 'added', $3)", [organizationId, parsed.data.date, request.e4sSession!.user.id]);
      await client.query(holiday ? "commit" : "rollback");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    if (!holiday) return reply.code(409).send({ code: "MANAGER_HOLIDAY_EXISTS_OR_EXAM_DAY" });
    return reply.code(201).send({ holiday });
  });

  app.delete<{ Params: { id: string } }>("/api/v1/manager/holidays/:id", { preHandler: managerOnly }, async (request, reply) => {
    const params = uuidParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ code: "MANAGER_HOLIDAY_ID_INVALID" });
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    const client = await pool.connect();
    let removedDate: string | undefined;
    try {
      await client.query("begin");
      const result = await client.query<{ id: string; holiday_date: string }>(
        `delete from organization_holidays where id = $1 and organization_id = $2 returning id, holiday_date::text as holiday_date`,
      [params.data.id, organizationId]
      );
      const removed = result.rows[0];
      if (removed) removedDate = removed.holiday_date;
      if (removed && removedDate) await client.query("insert into organization_holiday_audit (organization_id, holiday_date, action, actor_id) values ($1, $2::date, 'removed', $3)", [organizationId, removedDate, request.e4sSession!.user.id]);
      await client.query(removed ? "commit" : "rollback");
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    if (!removedDate) return reply.code(404).send({ code: "MANAGER_HOLIDAY_NOT_FOUND" });
    return { deleted: true };
  });
}

async function updateStaffRequestHistory(
  pool: Pool, request: FastifyRequest, role: "manager" | "operator",
  sources: readonly { table: string; status: string; from: string; scope: string }[], id: string,
  action: "archive" | "restore" | "delete"
): Promise<boolean> {
  const changes = {
    archive: "archived_at = coalesce(item.archived_at, now())",
    restore: "archived_at = null",
    delete: "staff_deleted_at = now()"
  };
  const verbs = { archive: "archived", restore: "restored", delete: "deleted" };
  const actorId = request.e4sSession!.user.id;
  for (const source of sources) {
    const result = await pool.query(
      `with changed as (
         update ${source.table} item set ${changes[action]}
           from ${source.from}
          where item.id = $1 and actor.id = $2 and actor.role = $3
            and ${source.scope} and item.status in ${source.status} and item.staff_deleted_at is null
         returning item.id, actor.organization_id
       )
       insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, trace_id)
       select gen_random_uuid(), organization_id, $2, $4, $5, id, $6 from changed
       returning id`,
      [id, actorId, role, role + ".request_" + verbs[action], source.table, request.id]
    );
    if (result.rowCount) return true;
  }
  return false;
}

async function managerOrganizationId(pool: Pool, managerId: string): Promise<string> {
  const result = await pool.query<{ organization_id: string }>(
    "select organization_id from users where id = $1 and role = 'manager'", [managerId]
  );
  const organizationId = result.rows[0]?.organization_id;
  if (!organizationId) throw new Error("MANAGER_ORGANIZATION_NOT_FOUND");
  return organizationId;
}

function lastWeekdayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber!, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
