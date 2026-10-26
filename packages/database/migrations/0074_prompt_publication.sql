create or replace function prevent_active_prompt_version_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'active' then
    if tg_op = 'UPDATE'
      and new.status = 'retired'
      and new.id = old.id
      and new.organization_id = old.organization_id
      and new.task_key = old.task_key
      and new.version = old.version
      and new.content = old.content
      and new.created_by is not distinct from old.created_by
      and new.created_at = old.created_at then
      return new;
    end if;
    raise exception 'active prompt version is immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
