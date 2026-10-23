-- A-007: version the lexical-relation, IPA and TTS evidence contract.
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
       content || E'\n\nA-007 LEXICAL QUALITY CONTRACT:\n- Synonyms and antonyms must have the same part of speech, same intended sense, and be substitutable in the supplied context. A derived family word is never a synonym merely because it shares a root.\n- Return an empty antonym slot when no natural true opposite exists; never invent one.\n- Each relation includes partOfSpeech, sense, and a contextual example containing the relation word.\n- Every target includes slash-delimited IPA, stress metadata, exact ttsText, and matching <speak> SSML. Mark heteronyms by the intended lesson sense.\n- Reject output that fails these structural checks before publication.',
       'active', created_by
from next_version;
