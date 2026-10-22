-- Keep the active weekly lesson prompt aligned with the current API contract.
-- Prompt versions are immutable, so publish a new active copy with explicit
-- title and schema rules instead of mutating an existing version.
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
       content || E'\n\nFINAL WEEKLY LESSON RULES:\n- Return exactly 5 lessons with dayNumber 1, 2, 3, 4, 5 and the exact parts array required by the API. Never use legacy keys day, theory, examples, vocab, pron, practice, wordclass or worduse.\n- Each lesson title must be a short grammar formula or sentence frame that names the structure being learned, such as "S + V + O", "I work in… as…", "Do/Does + S + V?" or "be going to + verb".\n- Do not use descriptive titles such as "Present simple for routines", "Talking about daily tasks", "Describing work" or "Learning...". Keep titles under 6 words, with no trailing full stop.',
       'active', created_by
from next_version;
