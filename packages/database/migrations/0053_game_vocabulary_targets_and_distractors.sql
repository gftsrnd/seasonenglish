update ai_tasks
set output_schema = '{"type":"object","required":["topic","words","distractors"]}'::jsonb
where task_key = 'vocabulary_generation';

insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), latest.organization_id, 'vocabulary_generation', latest.version + 1,
       'Return valid JSON only. Create exactly 12 useful workplace-English target words or short phrases for the requested topic and CEFR level in words, plus exactly 8 plausible but off-topic distractors in distractors. Every item needs a unique stable lowercase id, English form, concise Vietnamese meaning, simple English definition and one partOfSpeech from noun, verb, adjective, adverb, preposition or phrase. Avoid duplicates and unsafe content.',
       'active', latest.created_by
from (
  select distinct on (organization_id) organization_id, version, created_by
  from prompt_versions
  where task_key = 'vocabulary_generation'
  order by organization_id, version desc
) latest
where not exists (
  select 1 from prompt_versions existing
  where existing.organization_id = latest.organization_id
    and existing.task_key = 'vocabulary_generation'
    and existing.content like '%exactly 12%'
    and existing.content like '%exactly 8%'
);
