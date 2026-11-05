import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

const complaintKind = z.enum(["exam_eligibility", "lesson_unlock", "account_unlock", "attendance", "lesson_count", "account"]);
const createComplaintInput = z.object({ kind: complaintKind, reason: z.string().trim().min(5).max(2000) });
const decisionInput = z.object({ decision: z.enum(["approved", "rejected"]), resolution: z.string().trim().min(1).max(2000) });
const holidayInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).refine(({ date }) => {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}, { message: "Holiday must be a weekday", path: ["date"] });
const uuidParams = z.object({ id: z.uuid() });

export function registerHolidayComplaintRoutes(app: FastifyInstance, pool: Pool): void {
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const managerOnly = createRoleGuard(pool, ["manager"]);

  app.get("/api/v1/learner/complaints", { preHandler: learnerOnly }, async (request) => {
    const learnerId = request.e4sSession!.user.id;
    await pool.query(
      `update learner_complaints set status = 'auto_approved', resolution = 'Tự duyệt do quá hạn', resolved_at = now()
       where learner_id = $1 and kind = 'exam_eligibility' and status = 'pending' and due_at <= now()`, [learnerId]
    );
    const result = await pool.query(
      `select id, kind, reason, status, resolution, submitted_at as "submittedAt", due_at as "dueAt", resolved_at as "resolvedAt"
         from learner_complaints where learner_id = $1 order by submitted_at desc`, [learnerId]
    );
    return { complaints: result.rows };
  });

  app.post("/api/v1/learner/complaints", { preHandler: learnerOnly }, async (request, reply) => {
    const parsed = createComplaintInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "LEARNER_COMPLAINT_INVALID" });
    const learnerId = request.e4sSession!.user.id;
    const requestId = randomUUID();
    const dueHours = parsed.data.kind === "exam_eligibility" ? 24 : null;
    const result = await pool.query(
      `insert into learner_complaints (id, organization_id, learner_id, kind, reason, related_data, due_at)
       select $1, u.organization_id, u.id, $3, $4,
              case when $3 = 'exam_eligibility' then jsonb_build_object('month', organization_system_date(u.organization_id)::text, 'status', 'attendance-review') else '{}'::jsonb end,
              case when $5::int is null then null else now() + make_interval(hours => $5::int) end
         from users u where u.id = $2 and u.role = 'learner' and u.status = 'active'
       on conflict (learner_id, kind) where status = 'pending' do nothing
       returning id, kind, reason, status, submitted_at as "submittedAt", due_at as "dueAt"`,
      [requestId, learnerId, parsed.data.kind, parsed.data.reason, dueHours]
    );
    if (!result.rowCount) return reply.code(409).send({ code: "LEARNER_COMPLAINT_ALREADY_PENDING" });
    return reply.code(201).send({ complaint: result.rows[0] });
  });

  app.get("/api/v1/manager/complaints", { preHandler: managerOnly }, async (request) => {
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    // Exam complaints are automatically approved at their 24-hour deadline.
    await pool.query(
      `update learner_complaints set status = 'auto_approved', resolution = 'Tự duyệt do quá hạn', resolved_at = now()
       where organization_id = $1 and kind = 'exam_eligibility' and status = 'pending' and due_at <= now()`,
      [organizationId]
    );
    const result = await pool.query(
      `select c.id, c.learner_id as "learnerId", u.display_name as "learnerName", c.kind, c.reason,
              c.status, c.resolution, c.related_data as "relatedData", c.submitted_at as "submittedAt",
              c.due_at as "dueAt", c.resolved_at as "resolvedAt"
         from learner_complaints c join users u on u.id = c.learner_id
        where c.organization_id = $1 order by (c.status = 'pending') desc, c.due_at nulls last, c.submitted_at desc`,
      [organizationId]
    );
    return { complaints: result.rows };
  });

  app.post<{ Params: { id: string } }>("/api/v1/manager/complaints/:id/decision", { preHandler: managerOnly }, async (request, reply) => {
    const params = uuidParams.safeParse(request.params);
    const parsed = decisionInput.safeParse(request.body);
    if (!params.success || !parsed.success) return reply.code(400).send({ code: "MANAGER_COMPLAINT_DECISION_INVALID" });
    const result = await pool.query(
      `update learner_complaints c set status = $3, resolution = $4, resolved_by = $2, resolved_at = now()
         from users manager where c.id = $1 and c.organization_id = manager.organization_id
          and manager.id = $2 and manager.role = 'manager' and c.status = 'pending'
       returning c.id, c.kind, c.status, c.resolution, c.resolved_at`,
      [params.data.id, request.e4sSession!.user.id, parsed.data.decision, parsed.data.resolution]
    );
    if (!result.rowCount) return reply.code(409).send({ code: "MANAGER_COMPLAINT_NOT_PENDING" });
    return { complaint: result.rows[0] };
  });

  app.get("/api/v1/manager/holidays", { preHandler: managerOnly }, async (request) => {
    const organizationId = await managerOrganizationId(pool, request.e4sSession!.user.id);
    const result = await pool.query(
      `select h.id, h.holiday_date::text as date, h.created_at, u.display_name as created_by_name
         from organization_holidays h left join users u on u.id = h.created_by
        where h.organization_id = $1 order by h.holiday_date`, [organizationId]
    );
    return { holidays: result.rows };
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
