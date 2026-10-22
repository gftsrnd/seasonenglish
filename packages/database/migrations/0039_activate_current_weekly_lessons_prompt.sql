-- 0038 restored the legacy prototype prompt for weekly_lessons, but the
-- current lesson authoring API validates the structured dayNumber/parts shape.
-- Active prompt versions are immutable by design. Insert a new active copy of
-- the newest prompt that describes the current schema; existing lesson drafts
-- are not touched.
insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), candidate.organization_id, candidate.task_key,
       (select coalesce(max(existing.version), 0) + 1
        from prompt_versions existing
        where existing.organization_id = candidate.organization_id
          and existing.task_key = candidate.task_key),
       candidate.content, 'active', candidate.created_by
from (
  select distinct on (organization_id, task_key)
         organization_id, task_key, version, content, created_by
  from prompt_versions
  where task_key = 'weekly_lessons'
    and content like '%dayNumber%'
    and content like '%parts%'
  order by organization_id, task_key, version desc
) as candidate
where not exists (
  select 1
  from prompt_versions existing
  where existing.organization_id = candidate.organization_id
    and existing.task_key = candidate.task_key
    and existing.version = (select coalesce(max(next_version.version), 0) + 1
                            from prompt_versions next_version
                            where next_version.organization_id = candidate.organization_id
                              and next_version.task_key = candidate.task_key)
);
