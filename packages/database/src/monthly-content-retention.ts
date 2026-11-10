import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

interface CompactionScope {
  actorId: string;
  organizationId: string;
  month: string;
}

const writePayload = {
  brief: `update program_months set (theme_brief, theme_context, communication_goal) =
    (select brief, context, goal from jsonb_to_record($2::jsonb) as content(brief text, context text, goal text)) where id = $1`,
  framework: "update month_frameworks set curriculum_contract = $2::jsonb where id = $1",
  checkpoint: "update monthly_resource_generation_checkpoints set categories = $2::jsonb where id = $1",
  lesson: "update lesson_versions set content = $2::jsonb where id = $1",
  exam: "update assessment_versions set blueprint = $2::jsonb where id = $1"
};

interface PayloadRow {
  kind: keyof typeof writePayload;
  id: string;
  before_payload: unknown;
  after_payload: unknown;
  reason: string | null;
  appeal_ids: string[];
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function buildPlan(client: PoolClient, scope: CompactionScope) {
  const { rows: [month] } = await client.query<{ id: string }>(
    `select pm.id from program_months pm
     join users actor on actor.id = $1 and actor.organization_id = pm.organization_id
        and actor.role = 'manager' and actor.status = 'active'
     where pm.organization_id = $2 and pm.month = $3
       and pm.month < to_char(organization_system_date(pm.organization_id) - interval '1 month', 'YYYY-MM')`,
    [scope.actorId, scope.organizationId, scope.month]
  );
  if (!month) throw new Error("RETENTION_MONTH_NOT_ELIGIBLE");
  const { rows } = await client.query<PayloadRow>(
    `with frameworks as (
       select * from month_frameworks where program_month_id = $1
     ), month_lesson_versions as (
       select lv.* from lesson_versions lv
       join lessons l on l.id = lv.lesson_id
       join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id
       join lesson_sets ls on ls.id = lsv.lesson_set_id
       join frameworks f on f.id = ls.month_framework_id
     ), pending_lesson_parts as (
       select a.id as appeal_id, a.part_code, source.id as version_id
       from lesson_part_appeals a
       join lateral (
         select lv.id from month_lesson_versions lv
         where lv.lesson_id = a.lesson_id and lv.status = 'published'
           and (lv.id = a.exercise_version_id or (
             a.exercise_version_id is null and lv.content->'parts' @> jsonb_build_array(jsonb_build_object('code', a.part_code))
           ))
         order by lv.version desc limit 1
       ) source on true
       where a.status = 'pending'
       union
       select a.id, a.part_code, latest.id from lesson_part_appeals a
       join lateral (
         select lv.id from month_lesson_versions lv
         where lv.lesson_id = a.lesson_id and lv.status = 'published'
         order by lv.version desc limit 1
       ) latest on true
       where a.status = 'pending' and a.exercise_version_id is not null
     ), pending_reopens as (
       select original_lesson_version_id, correction_lesson_version_id
       from month_lesson_corrections where status in ('requested', 'authorized')
     ), month_exams as (
       select av.* from assessment_versions av join assessment_definitions ad on ad.id = av.definition_id
       where ad.organization_id = $2 and ad.kind = 'final'
         and ad.assessment_key ~ ('^monthly-final-' || $3::text || '-(a1|a2|b1|b2|c1)$')
     ), exam_holds as (
       select aa.assessment_version_id,
              array_agg(distinct a.id::text order by a.id::text) filter (where a.id is not null) as appeal_ids
       from assessment_attempts aa join month_exams exam on exam.id = aa.assessment_version_id
       left join appeals a on a.attempt_id = aa.id and a.status = 'pending'
       left join assessment_decisions d on d.attempt_id = aa.id
       where a.id is not null or aa.status in ('in_progress', 'submitted', 'pending_review')
          or d.decided_at is null or d.decided_at + interval '3 days' >= now()
       group by aa.assessment_version_id
     ), payloads as (
       select 'brief' as kind, pm.id,
         jsonb_build_object('brief', pm.theme_brief, 'context', pm.theme_context, 'goal', pm.communication_goal) as before_payload,
         '{"brief":"","context":"","goal":""}'::jsonb as after_payload, null::text as reason, '{}'::text[] as appeal_ids
       from program_months pm where pm.id = $1
       union all
       select 'framework', f.id, f.curriculum_contract,
         jsonb_build_object('month', $3::text, 'cefr', f.cefr, 'version', f.version,
           'coreTerms', '[]'::jsonb, 'supportTerms', '[]'::jsonb, 'grammarTopics', '[]'::jsonb, 'sounds', '[]'::jsonb)
           || case when jsonb_typeof(f.curriculum_contract->'daySpecs') = 'array' then jsonb_build_object('daySpecs', (
                select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                  'lessonNumber', spec->'lessonNumber', 'date', spec->'date', 'kind', spec->'kind',
                  'newLessonNumber', spec->'newLessonNumber', 'reviewWeekNumber', spec->'reviewWeekNumber',
                  'reviewFromPreviousMonth', spec->'reviewFromPreviousMonth', 'reviewGatesNextWeek', spec->'reviewGatesNextWeek',
                  'reviewPrerequisiteLessonNumbers', spec->'reviewPrerequisiteLessonNumbers'
                )) order by ord), '[]'::jsonb)
                from jsonb_array_elements(f.curriculum_contract->'daySpecs') with ordinality planned(spec, ord)
              )) else '{}'::jsonb end, null, '{}'::text[]
       from frameworks f
       union all
       select 'checkpoint', id, categories, '{}'::jsonb, null, '{}'::text[]
       from monthly_resource_generation_checkpoints where program_month_id = $1
       union all
       select 'lesson', lv.id, lv.content,
         case when reopen.active then lv.content else
           jsonb_strip_nulls(jsonb_build_object('title', lv.content->'title', 'durationMinutes', lv.content->'durationMinutes'))
           || jsonb_build_object('parts', coalesce((
             select jsonb_agg(part order by ord)
             from jsonb_array_elements(case when jsonb_typeof(lv.content->'parts') = 'array'
               then lv.content->'parts' else '[]'::jsonb end) with ordinality parts(part, ord)
             where exists (select 1 from pending_lesson_parts hold where hold.version_id = lv.id and hold.part_code = part->>'code')
           ), '[]'::jsonb)) end,
         case when reopen.active then 'reopen evidence'
              when cardinality(lesson_holds.ids) > 0 then 'lesson appeal parts' end,
         lesson_holds.ids
       from month_lesson_versions lv
       cross join lateral (select exists(select 1 from pending_reopens where lv.id in (original_lesson_version_id, correction_lesson_version_id)) as active) reopen
       cross join lateral (select array(select distinct appeal_id::text from pending_lesson_parts hold
         where hold.version_id = lv.id order by appeal_id::text) as ids) lesson_holds
       union all
       select 'exam', exam.id, exam.blueprint,
         case when hold.assessment_version_id is not null then exam.blueprint else
           jsonb_strip_nulls(jsonb_build_object(
             'key', exam.blueprint->'key', 'kind', exam.blueprint->'kind', 'title', exam.blueprint->'title',
             'version', exam.blueprint->'version', 'totalMinutes', exam.blueprint->'totalMinutes', 'totalScore', exam.blueprint->'totalScore'
           )) || jsonb_build_object('sections', (
             select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'code', section->'code', 'label', section->'label', 'durationMinutes', section->'durationMinutes',
               'maxScore', section->'maxScore', 'groups', '[]'::jsonb
             )) order by ord), '[]'::jsonb)
             from jsonb_array_elements(case when jsonb_typeof(exam.blueprint->'sections') = 'array'
               then exam.blueprint->'sections' else '[]'::jsonb end) with ordinality sections(section, ord)
           )) end,
         case when hold.assessment_version_id is not null then 'exam evidence' end, coalesce(hold.appeal_ids, '{}'::text[])
       from month_exams exam left join exam_holds hold on hold.assessment_version_id = exam.id
     ) select * from payloads order by kind, id`,
    [month.id, scope.organizationId, scope.month]
  );
  const manifestRows = rows.map(row => ({
    kind: row.kind, id: row.id,
    before: digest(row.before_payload), after: digest(row.after_payload),
    reason: row.reason, appealIds: row.appeal_ids
  }));
  const manifest = {
    monthId: month.id,
    digest: digest([scope.actorId, scope.organizationId, scope.month, month.id, manifestRows]),
    changes: manifestRows.filter(row => row.before !== row.after),
    held: manifestRows.filter(row => row.reason !== null)
  };
  return { manifest, rows };
}

export async function previewExpiredMonthCompaction(client: PoolClient, scope: CompactionScope) {
  return (await buildPlan(client, scope)).manifest;
}

/**
 * Disposable verification only. This module has no runtime export, route, or
 * scheduled caller. A future production operation needs its own execution policy.
 */
export async function compactExpiredMonthForTest(client: PoolClient, scope: CompactionScope, confirmedDigest: string): Promise<number> {
  const { rows: [guard] } = await client.query<{ allowed: boolean }>(
    "select current_database() = 'e4s_test' and current_setting('e4s.retention_disposable', true) = 'on' as allowed"
  );
  if (!guard?.allowed) throw new Error("RETENTION_TEST_ONLY");
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    // Disposable DB locks freeze the scope and pending dependencies until commit.
    await client.query(`lock table users, organization_settings, program_months, month_frameworks,
      monthly_resource_generation_checkpoints, lesson_sets, lesson_set_versions, lessons, lesson_versions,
      lesson_part_appeals, month_lesson_corrections, assessment_definitions, assessment_versions,
      assessment_attempts, assessment_decisions, appeals in share row exclusive mode`);
    const { manifest, rows } = await buildPlan(client, scope);
    if (manifest.digest !== confirmedDigest) throw new Error("RETENTION_PLAN_CHANGED");
    const changes = new Set(manifest.changes.map(row => `${row.kind}:${row.id}`));
    for (const row of rows) {
      if (changes.has(`${row.kind}:${row.id}`)) await client.query(writePayload[row.kind], [row.id, JSON.stringify(row.after_payload)]);
    }
    if (manifest.changes.length) await client.query(
      `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
       values ($1, $2, $3, 'monthly.retention_compacted', 'program_month', $4, $5::jsonb, $6)`,
      [randomUUID(), scope.organizationId, scope.actorId, manifest.monthId, JSON.stringify({ month: scope.month, ...manifest }), randomUUID()]
    );
    await client.query("commit");
    return manifest.changes.length;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
