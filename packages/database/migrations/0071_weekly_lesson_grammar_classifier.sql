-- A-008: require classification from lesson evidence before grammar generation.
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
       content || E'\n\nA-008 GRAMMAR CLASSIFIER CONTRACT:\n- Classify before generating: grammar_rule, sentence_pattern, usage_rule, word_formation, pronunciation_rule, no_suitable_content, or insufficient_evidence.\n- A classified target needs explicit or repeated evidence from the objective, language note, examples, or exercise. A single incidental sentence is never enough.\n- Keep scope to the exact taught forms; do not add negative, question, tense, exception, or terminology outside the evidence.\n- Vocabulary-only lessons return no_suitable_content. Low-confidence or insufficient evidence cannot be published automatically.\n- Generation must consume the accepted classifier target and preserve its scope.',
       'active', created_by
from next_version;
