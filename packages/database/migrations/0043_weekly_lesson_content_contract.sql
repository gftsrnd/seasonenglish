-- Keep the persisted prompt in sync with the enriched learner lesson schema.
-- The prompt table is versioned; publish a new active copy rather than mutating
-- the active row so audit history remains intact.
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
       content || E'\n\nFINAL CONTENT CONTRACT:\n- Return exactly 11 parts in this order: objective, instruction, vocabulary, grammar, pronunciation, listening, reading, writing, word_class, word_use, speaking.\n- vocabulary.items has exactly 3 items. Each has a short imageQuery only (never imageUrl, icons, emoji or SVG), exactly 3 collocations, and concise family/umbrella/synonyms/antonyms fields.\n- pronunciation.words has exactly 3 objects with word and IPA. listening always has a 15-30 word audio text, prompt, exactly 4 options and answer matching one option. reading, word_class and word_use also have exactly 4 options and a matching answer.\n- Keep relation notes and all explanations concise so the complete five-day output stays within the token budget. Do not omit learner-facing fields to save tokens.',
       'active', created_by
from next_version;
