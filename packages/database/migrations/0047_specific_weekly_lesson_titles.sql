-- Publish a final title rule for existing organizations. Prompt versions are
-- immutable, so retain history and append a stricter active version.
with candidate as (
  select distinct on (organization_id, task_key)
         organization_id, task_key, content, created_by
  from prompt_versions
  where task_key = 'weekly_lessons'
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
       content || E'\n\nFINAL SPECIFIC TITLE RULE:\n- Every lesson title must be the concrete sentence frame taught on that day, such as "It is + adjective", "Could I + V?" or "I work in… as…".\n- Never use a generic placeholder such as "S + V" or "S + V + O" as a lesson title, and never repeat one title across multiple days. Generic notation may appear only inside the grammar section.',
       'active', created_by
from next_version;
