-- A-009: version exercise generation and grading evidence requirements.
with candidate as (
  select distinct on (organization_id, task_key)
         organization_id, task_key, content, created_by
  from prompt_versions
  where task_key in ('weekly_lessons', 'micro_grading') and status = 'active'
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
       content || case task_key
         when 'weekly_lessons' then E'\n\nA-009 EXERCISE QUALITY CONTRACT:\n- Every closed question has exactly four distinct plausible options and an answer that exactly matches one option.\n- Fill-in writing has exactly one blank. Open/self-writing requires a meaningful model answer of at least two words.\n- Listening and reading use different source content. Reject ambiguous, duplicate, or contradictory items before publication.'
         else E'\n\nA-009 GRADING EVIDENCE CONTRACT:\n- Return citedError as the exact learner-answer text that supports a specific correction, or null when no specific error is claimed.\n- Never invent a word, phrase, grammar error, pronunciation event, or omission not present in the submitted evidence.\n- For open answers without reliable evidence, require manual review rather than fabricating feedback.'
       end,
       'active', created_by
from next_version;
