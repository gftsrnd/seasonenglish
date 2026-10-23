-- A-006: publish measurable lesson-objective rules without mutating prompt history.
with candidate as (
  select distinct on (organization_id, task_key)
         organization_id, task_key, content, created_by
  from prompt_versions
  where task_key = 'weekly_lessons' and status = 'active'
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
       content || E'\n\nA-006 MEASURABLE OBJECTIVES CONTRACT:\n- Produce 2-4 objectives per lesson; exactly one content objective and the remaining objectives are language objectives.\n- Every objective starts with SWBAT, uses an observable verb, and includes a condition, measurable criterion, and assessmentCode.\n- The objective mappings must cover every assessment used by the lesson.\n- explanationLanguage is vi for A1-A2 and en for B1-C1.\n- Output failing any rule must be repaired before publication.',
       'active', created_by
from next_version;
