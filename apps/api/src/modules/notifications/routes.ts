import type { LearnerNotificationsView } from "@e4s/contracts";
import { createRepositories, InboxNotificationRepository, syncLearnerAbsenceNotice, syncMissedExamNotice, syncStaffDateNotices } from "@e4s/database";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";
import { monthlyExamEligibility } from "../learning/routes.js";

export function registerNotificationRoutes(app: FastifyInstance, pool: Pool): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/notifications", { preHandler: learnerOnly }, async (request): Promise<LearnerNotificationsView> => ({
    notifications: await repositories.notifications.listForLearner(request.e4sSession!.user.id)
  }));

  const inbox = new InboxNotificationRepository(pool);
  const signedIn = createRoleGuard(pool, ["learner", "operator", "manager"]);
  const query = z.object({
    limit: z.coerce.number().int().min(0).max(50).default(20),
    unreadOnly: z.enum(["true", "false"]).optional(),
    cursor: z.uuid().optional()
  });
  const readInput = z.union([
    z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict(),
    z.object({ all: z.literal(true) }).strict()
  ]);

  app.get("/api/v1/me/notifications", { preHandler: signedIn }, async (request, reply) => {
    const parsed = query.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ code: "INBOX_QUERY_INVALID" });
    const { limit, unreadOnly, cursor } = parsed.data;
    reply.header("cache-control", "private, no-store");
    const session = request.e4sSession!;
    if (session.role === "learner" && !cursor) {
      try {
        await syncMonthlyExamNotice(pool, session.user.id);
      } catch (error) {
        request.log.warn({ err: error }, "Unable to sync monthly exam notification");
      }
    }
    if (session.role === "learner" && !cursor) {
      try {
        await syncMonthlySurveyNotice(pool, session.user.id);
      } catch (error) {
        request.log.warn({ err: error }, "Unable to sync monthly survey notification");
      }
      try {
        await syncLearnerAbsenceNotice(pool, session.user.id);
      } catch (error) {
        request.log.warn({ err: error }, "Unable to sync absence notification");
      }
      try {
        await syncMissedExamNotice(pool, session.user.id);
      } catch (error) {
        request.log.warn({ err: error }, "Unable to sync locked lessons notification");
      }
    }
    if (session.role !== "learner" && !cursor) {
      try {
        await syncStaffDateNotices(pool, { userId: session.user.id });
      } catch (error) {
        request.log.warn({ err: error }, "Unable to sync staff date notifications");
      }
    }
    return inbox.list(session.user.id, limit, unreadOnly === "true", cursor);
  });

  app.patch("/api/v1/me/notifications/read", { preHandler: signedIn }, async (request, reply) => {
    const parsed = readInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: "INBOX_READ_INVALID" });
    reply.header("cache-control", "private, no-store");
    return inbox.markRead(request.e4sSession!.user.id, parsed.data);
  });
}

async function syncMonthlySurveyNotice(pool: Pool, learnerId: string): Promise<void> {
  await pool.query(
    `with learner as (
       select organization_id, to_char(organization_system_date(organization_id), 'YYYY-MM') as month
       from users where id = $1 and role = 'learner' and status = 'active'
     )
     select notify_inbox(organization_id, 'learner', $1, 'survey-open:' || month, 'monthly_survey_open', month)
     from learner
     where exists (
       select 1 from monthly_survey_forms f
       where f.organization_id = learner.organization_id and f.month = learner.month and f.published_at is not null
     ) and not exists (
       select 1 from monthly_survey_submissions s
       where s.learner_id = $1 and s.organization_id = learner.organization_id and s.month = learner.month
     ) and not exists (
       select 1 from inbox_notifications n where n.recipient_id = $1 and n.event_key = 'survey-open:' || learner.month
     )`,
    [learnerId]
  );
}

async function syncMonthlyExamNotice(pool: Pool, learnerId: string): Promise<void> {
  const { rows } = await pool.query<{ org: string; month: string; cefr: string }>(
    `select u.organization_id as org, pm.month, e.cefr
     from users u
     join enrollments e on e.learner_id = u.id and e.cefr_approved and e.cefr is not null
     join programs p on p.id = e.program_id and p.status = 'active'
     join program_months pm on pm.organization_id = u.organization_id and pm.exam_date = organization_system_date(u.organization_id)
     where u.id = $1 and not exists (
       select 1 from inbox_notifications n where n.recipient_id = u.id
         and n.event_key = 'exam-open:' || pm.month || ':' || e.cefr
     ) and not exists (
       select 1 from assessment_attempts a
       join assessment_versions v on v.id = a.assessment_version_id
       join assessment_definitions d on d.id = v.definition_id
       where a.learner_id = u.id and d.assessment_key = 'monthly-final-' || pm.month || '-' || lower(e.cefr)
     ) limit 1`,
    [learnerId]
  );
  const exam = rows[0];
  if (!exam || !(await monthlyExamEligibility(pool, learnerId)).accessEligible) return;
  await pool.query("select notify_inbox($1, 'learner', $2, $3, 'monthly_exam_ready', $4)",
    [exam.org, learnerId, `exam-open:${exam.month}:${exam.cefr}`, exam.month]);
}
