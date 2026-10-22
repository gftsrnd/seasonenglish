-- Keep AI-generated week topics as short learning titles. Prompt versions are
-- immutable, so publish a new active copy instead of editing the old one.
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
       content || E'\n\nSTRICT TOPIC TITLE RULES:\n- topic must be a concise English learning title of 2–6 words.\n- Name the skill or workplace situation learners will study; do not write a full sentence, explanation, benefit, objective, or long description.\n- Put context and detail in description instead. Prefer titles such as "Introducing yourself & your job", "Scheduling meetings", "Asking for directions", or "Giving project updates". Never use a title like "Learning how to ... in the office".',
       'active', created_by
from next_version;
