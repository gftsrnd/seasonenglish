import {
  MONTHLY_SURVEY_LIMITS as limits,
  type LearnerMonthlySurveysView,
  type ManagerMonthlySurveyView,
  type MonthlySurveyAnswer,
  type MonthlySurveyDefinition,
  type MonthlySurveyDraft,
  type MonthlySurveyPublished,
  type MonthlySurveyQuestion,
  type MonthlySurveySubmission
} from "@e4s/contracts";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { createRoleGuard } from "../identity/policy.js";

const managerPath = "/api/v1/manager/monthly-surveys";
const learnerPath = "/api/v1/learner/monthly-surveys";
const monthKey = z.string().regex(/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/);
const monthParams = z.object({ month: monthKey });
const baseRevision = z.number().int().min(0).max(2_147_483_646);
const revision = baseRevision.min(1);
const questionFields = {
  prompt: z.string().trim().max(limits.prompt),
  required: z.boolean()
};
const question = z.discriminatedUnion("kind", [
  z.strictObject({ ...questionFields, kind: z.literal("text") }),
  z.strictObject({ ...questionFields, kind: z.literal("rating") }),
  z.strictObject({
    ...questionFields,
    kind: z.literal("single_choice"),
    options: z.array(z.string().trim().max(limits.option)).max(limits.options)
  })
]);
const draftInput = z.strictObject({
  baseRevision,
  version: revision.nullable(),
  title: z.string().trim().max(limits.title),
  questions: z.array(question).max(limits.questions)
});
const publishInput = z.strictObject({ revision, version: revision });
const copyInput = z.strictObject({ baseRevision });
const submissionInput = z.strictObject({
  revision,
  answers: z.array(z.strictObject({
    questionIndex: z.number().int().min(0).max(limits.questions - 1),
    value: z.union([z.string().trim().min(1).max(limits.answer), z.number().int().min(1).max(limits.ratingMax)])
  })).max(limits.questions)
});

const formColumns = 'month, revision, version, title, questions, to_jsonb(published_at) as "publishedAt"';

function invalidSurvey() {
  return { status: 400, body: { code: "MONTHLY_SURVEY_INVALID" } };
}
function conflict() {
  return { status: 409, body: { code: "MONTHLY_SURVEY_REVISION_CONFLICT" } };
}

export function registerMonthlySurveyRoutes(app: FastifyInstance, pool: Pool): void {
  const managerOnly = createRoleGuard(pool, ["manager"]);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get(managerPath, { preHandler: managerOnly }, async (request, reply) => {
    const query = monthParams.partial().safeParse(request.query);
    if (!query.success) return reply.code(400).send(invalidSurvey().body);
    const result = await pool.query<ManagerMonthlySurveyView>(
      `with scope as (
         select organization_id, to_char(organization_system_date(organization_id), 'YYYY-MM') as current_month
         from users where id = $1 and role = 'manager' and status = 'active'
       ), target as (
         select *, coalesce($2::text, current_month) as month from scope
       ), forms as (
         select ${formColumns}
         from monthly_survey_forms where (organization_id, month) in (select organization_id, month from target)
       )
       select current_month as "currentMonth", target.month,
              (select max(month) from monthly_survey_forms
                where organization_id = target.organization_id and month < target.month
                  and published_at is not null) as "previousPublishedMonth",
              (select to_jsonb(forms) from forms where "publishedAt" is null) as draft,
              coalesce((select jsonb_agg(forms order by revision desc) from forms where "publishedAt" is not null), '[]') as "publishedForms",
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'learnerId', s.learner_id, 'learnerName', learner.display_name,
                  'revision', s.revision, 'answers', s.answers, 'submittedAt', s.submitted_at
                ) order by s.submitted_at desc, s.learner_id)
                from monthly_survey_submissions s join users learner on learner.id = s.learner_id
                where s.organization_id = target.organization_id and s.month = target.month
              ), '[]') as submissions
       from target`,
      [request.e4sSession!.user.id, query.data.month ?? null]
    );
    reply.header("Cache-Control", "private, no-store");
    return result.rows[0] ?? reply.code(403).send({ code: "FORBIDDEN" });
  });

  app.put(`${managerPath}/:month/draft`, { preHandler: managerOnly }, async (request, reply) => {
    const params = monthParams.safeParse(request.params);
    const input = draftInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send(invalidSurvey().body);
    const { month } = params.data;
    const result = await withSurveyMonth(pool, request.e4sSession!.user.id, "manager", month, async (client, organizationId) => {
      const { draft, published } = await monthState(client, organizationId, month);
      if ((published?.revision ?? 0) !== input.data.baseRevision || (draft?.version ?? null) !== input.data.version) {
        return conflict();
      }
      const saved = await saveDraft(client, organizationId, month, input.data.baseRevision + 1, input.data);
      return { status: 200, body: saved };
    });
    return reply.code(result.status).send(result.body);
  });

  app.post(`${managerPath}/:month/copy-previous`, { preHandler: managerOnly }, async (request, reply) => {
    const params = monthParams.safeParse(request.params);
    const input = copyInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send(invalidSurvey().body);
    const { month } = params.data;
    const result = await withSurveyMonth(pool, request.e4sSession!.user.id, "manager", month, async (client, organizationId) => {
      const { draft, published } = await monthState(client, organizationId, month);
      if (draft || (published?.revision ?? 0) !== input.data.baseRevision) return conflict();
      const source = await client.query<MonthlySurveyDefinition>(
        `select title, questions from monthly_survey_forms
         where organization_id = $1 and month < $2 and published_at is not null
         order by month desc, revision desc limit 1`,
        [organizationId, month]
      );
      if (!source.rows[0]) return { status: 404, body: { code: "MONTHLY_SURVEY_PREVIOUS_NOT_FOUND" } };
      const saved = await saveDraft(client, organizationId, month, input.data.baseRevision + 1, source.rows[0]);
      return { status: 200, body: saved };
    });
    return reply.code(result.status).send(result.body);
  });

  app.post(`${managerPath}/:month/publish`, { preHandler: managerOnly }, async (request, reply) => {
    const params = monthParams.safeParse(request.params);
    const input = publishInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send(invalidSurvey().body);
    const { month } = params.data;
    const result = await withSurveyMonth(pool, request.e4sSession!.user.id, "manager", month, async (client, organizationId) => {
      const { draft } = await monthState(client, organizationId, month);
      if (!draft || draft.revision !== input.data.revision || draft.version !== input.data.version) return conflict();
      if (!draft.title || !draft.questions.length || draft.questions.some(question => !publishableQuestion(question))) {
        return { status: 400, body: { code: "MONTHLY_SURVEY_DRAFT_INCOMPLETE" } };
      }
      const published = await client.query<MonthlySurveyPublished>(
        `update monthly_survey_forms set published_at = now()
         where organization_id = $1 and month = $2 and revision = $3 and published_at is null
         returning ${formColumns}`,
        [organizationId, month, draft.revision]
      );
      return { status: 200, body: published.rows[0]! };
    });
    return reply.code(result.status).send(result.body);
  });

  app.get(learnerPath, { preHandler: learnerOnly }, async (request, reply) => {
    const result = await pool.query<LearnerMonthlySurveysView>(
      `with scope as (
         select id, organization_id, to_char(organization_system_date(organization_id), 'YYYY-MM') as current_month
         from users where id = $1 and role = 'learner' and status = 'active'
       ), surveys as (
         select distinct on (form.month) form.month,
                jsonb_build_object(
                  'month', form.month, 'revision', form.revision, 'version', form.version, 'title', form.title,
                  'questions', form.questions, 'publishedAt', form.published_at
                ) as form,
                case when s.learner_id is not null then jsonb_build_object(
                  'revision', s.revision, 'answers', s.answers, 'submittedAt', s.submitted_at
                ) end as submission
         from scope
         join monthly_survey_forms form on form.organization_id = scope.organization_id
         left join monthly_survey_submissions s on s.organization_id = form.organization_id and s.month = form.month
          and s.learner_id = scope.id and s.revision = form.revision
         where form.published_at is not null and (form.month <= scope.current_month or s.learner_id is not null)
         order by form.month, (s.learner_id is not null) desc, form.revision desc
       )
       select current_month as "currentMonth",
              coalesce((select jsonb_agg(jsonb_build_object('form', form, 'submission', submission) order by month desc)
                        from surveys), '[]') as surveys
       from scope`,
      [request.e4sSession!.user.id]
    );
    reply.header("Cache-Control", "private, no-store");
    return result.rows[0] ?? reply.code(403).send({ code: "FORBIDDEN" });
  });

  app.post(`${learnerPath}/:month/submissions`, { preHandler: learnerOnly }, async (request, reply) => {
    const params = monthParams.safeParse(request.params);
    const input = submissionInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send(invalidSurvey().body);
    const { month } = params.data;
    const learnerId = request.e4sSession!.user.id;
    const result = await withSurveyMonth(pool, learnerId, "learner", month, async (client, organizationId) => {
      const existing = await client.query(
        "select 1 from monthly_survey_submissions where organization_id = $1 and month = $2 and learner_id = $3",
        [organizationId, month, learnerId]
      );
      const duplicate = { status: 409, body: { code: "MONTHLY_SURVEY_ALREADY_SUBMITTED" } };
      if (existing.rowCount) return duplicate;
      const calendar = await client.query<{ current_month: string }>(
        `select to_char(organization_system_date($1), 'YYYY-MM') as current_month`, [organizationId]
      );
      if (month > calendar.rows[0]!.current_month) return { status: 404, body: { code: "MONTHLY_SURVEY_NOT_PUBLISHED" } };
      const { published } = await monthState(client, organizationId, month);
      if (!published) return { status: 404, body: { code: "MONTHLY_SURVEY_NOT_PUBLISHED" } };
      if (published.revision !== input.data.revision) return conflict();
      if (!validAnswers(published.questions, input.data.answers)) {
        return { status: 400, body: { code: "MONTHLY_SURVEY_ANSWERS_INVALID" } };
      }
      const saved = await client.query<MonthlySurveySubmission>(
        `insert into monthly_survey_submissions (organization_id, month, learner_id, revision, answers)
         values ($1, $2, $3, $4, $5::jsonb)
         on conflict (organization_id, month, learner_id) do nothing
         returning revision, answers, to_jsonb(submitted_at) as "submittedAt"`,
        [organizationId, month, learnerId, published.revision, JSON.stringify(input.data.answers)]
      );
      return saved.rows[0] ? { status: 201, body: saved.rows[0] } : duplicate;
    });
    return reply.code(result.status).send(result.body);
  });
}

async function withSurveyMonth<T extends { status: number; body: object }>(
  pool: Pool, actorId: string, role: "manager" | "learner", month: string,
  action: (client: PoolClient, organizationId: string) => Promise<T>
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const actor = await client.query<{ organization_id: string }>(
      "select organization_id from users where id = $1 and role = $2 and status = 'active' for share",
      [actorId, role]
    );
    const organizationId = actor.rows[0]?.organization_id;
    if (!organizationId) {
      await client.query("rollback");
      return { status: 403, body: { code: "FORBIDDEN" } };
    }
    // Publishing, editing and submitting must agree on the latest revision.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`monthly-survey:${organizationId}:${month}`]);
    const result = await action(client, organizationId);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function monthState(client: PoolClient, organizationId: string, month: string) {
  const { rows } = await client.query<MonthlySurveyDraft | MonthlySurveyPublished>(
    `select ${formColumns} from monthly_survey_forms
     where organization_id = $1 and month = $2 order by revision desc limit 2`,
    [organizationId, month]
  );
  return {
    draft: rows.find((form): form is MonthlySurveyDraft => form.publishedAt === null),
    published: rows.find((form): form is MonthlySurveyPublished => form.publishedAt !== null)
  };
}

async function saveDraft(
  client: PoolClient, organizationId: string, month: string, revision: number, { title, questions }: MonthlySurveyDefinition
) {
  const result = await client.query<MonthlySurveyDraft>(
    `insert into monthly_survey_forms (organization_id, month, revision, title, questions)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (organization_id, month, revision) do update
       set title = excluded.title, questions = excluded.questions, version = monthly_survey_forms.version + 1
       where monthly_survey_forms.published_at is null
     returning ${formColumns}`,
    [organizationId, month, revision, title, JSON.stringify(questions)]
  );
  return result.rows[0]!;
}

function publishableQuestion(question: MonthlySurveyQuestion) {
  if (!question.prompt) return false;
  if (question.kind !== "single_choice") return true;
  const normalized = question.options.map(option => option.toLocaleLowerCase("vi").normalize());
  return normalized.length >= 2 && normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

function validAnswers(questions: MonthlySurveyQuestion[], answers: MonthlySurveyAnswer[]) {
  const byIndex = new Map(answers.map(answer => [answer.questionIndex, answer.value]));
  if (byIndex.size !== answers.length || answers.some(answer => answer.questionIndex >= questions.length)) return false;
  return questions.every((question, index) => {
    const answer = byIndex.get(index);
    if (answer === undefined) return !question.required;
    if (question.kind === "rating") return typeof answer === "number";
    if (question.kind === "single_choice") return typeof answer === "string" && question.options.includes(answer);
    return typeof answer === "string";
  });
}
