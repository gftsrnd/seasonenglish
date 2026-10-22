-- The topic generator must mirror the operator's active CEFR columns exactly.
with candidate as (
  select distinct on (organization_id, task_key)
         organization_id, task_key, content, created_by
  from prompt_versions
  where task_key = 'week_suggestions'
    and status = 'active'
  order by organization_id, task_key, version desc
), next_version as (
  select candidate.organization_id, candidate.task_key, candidate.content, candidate.created_by,
         coalesce(max(existing.version), 0) + 1 as version
  from candidate
  left join prompt_versions existing
    on existing.organization_id = candidate.organization_id
   and existing.task_key = candidate.task_key
  group by candidate.organization_id, candidate.task_key, candidate.content, candidate.created_by
)
insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), organization_id, task_key, version,
       content || E'\n\nACTIVE LEVEL CONTRACT:\n- The levels input is authoritative. Return levels exactly as received, in the same order.\n- Create exactly one five-day plan for every level in levels and no plan key for any other CEFR level.\n- If a level is absent from levels, do not invent or mention it in the output.',
       'active', created_by
from next_version;
