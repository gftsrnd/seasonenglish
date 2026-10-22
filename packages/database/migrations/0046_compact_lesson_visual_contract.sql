-- Tighten the active lesson prompt so regenerated lessons match the compact
-- study card and sourced-photo presentation used by the web application.
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
       content || E'\n\nCOMPACT VISUAL CONTRACT:\n- objective.content.text is one focused, measurable sentence of at most 16 words. Do not start with “Sau bài học, bạn có thể”.\n- grammar usage and pronunciation tip are one short sentence each. Grammar has 2-3 complete English examples; pronunciation has exactly 3 word-and-IPA examples.\n- Every vocabulary imageQuery describes one clear real-world workplace photograph with the target visible. Never request icons, logos, diagrams, charts, screenshots, SVG, or text-heavy images.\n- Keep umbrella, synonym, antonym, and family words concise and genuine because the interface presents each as a directly playable control.',
       'active', created_by
from next_version;
