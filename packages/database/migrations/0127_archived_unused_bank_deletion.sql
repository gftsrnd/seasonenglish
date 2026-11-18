-- Normalized sources and the original manifest both count as exam history.
create function assessment_bank_version_used(vid uuid) returns boolean language sql stable as $$
  select exists(select 1 from assessment_attempts where assessment_version_id=vid)
    or exists(select 1 from assessment_bank_attempt_sources where version_id=vid)
    or exists(select 1 from assessment_bank_attempts
      where manifest->>'anchor'=vid::text
        or manifest->'groups' @> jsonb_build_array(jsonb_build_object('versionId',vid::text)))
$$;

create or replace function protect_assessment_bank_version() returns trigger language plpgsql as $$
begin
  if exists (select 1 from assessment_definitions where id=old.definition_id and kind<>'final') then
    if tg_op='DELETE' then
      if assessment_bank_version_used(old.id) or
        exists(select 1 from assessment_bank_policy_sources where version_id=old.id) or
        (old.bank_managed and old.status<>'retired' and (old.status='published' or old.published_at is not null)) then
        raise exception 'ASSESSMENT_BANK_VERSION_IN_USE' using errcode='23514';
      end if;
      return old;
    end if;
    -- Publication remains immutable; deletion is the only exception for unused archives.
    if old.blueprint is distinct from new.blueprint or old.definition_id is distinct from new.definition_id or
      old.rubric_version_id is distinct from new.rubric_version_id or old.version is distinct from new.version or
      (old.status<>'draft' and new.status='draft') then
      if (old.bank_managed and (old.status='published' or old.published_at is not null)) or
        assessment_bank_version_used(old.id) or
        exists(select 1 from assessment_bank_policy_sources where version_id=old.id) then
        raise exception 'ASSESSMENT_BANK_VERSION_IN_USE' using errcode='23514';
      end if;
    end if;
    if new.status<>'published' and old.status='published' and
      exists(select 1 from assessment_bank_policy_sources where version_id=old.id) then
      raise exception 'ASSESSMENT_BANK_SOURCE_CONFIGURED' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
