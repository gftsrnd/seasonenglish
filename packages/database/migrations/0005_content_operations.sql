alter table program_weeks
  add column if not exists key_vocab_hint text not null default '';

create or replace function prevent_published_lesson_set_version_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    if tg_op = 'DELETE' then
      raise exception 'published lesson set version is immutable';
    end if;
    if new.status = 'retired'
      and new.lesson_set_id = old.lesson_set_id
      and new.version = old.version
      and new.payload = old.payload
      and new.created_by is not distinct from old.created_by
      and new.approved_by is not distinct from old.approved_by
      and new.created_at = old.created_at
      and new.published_at is not distinct from old.published_at then
      return new;
    end if;
    raise exception 'published lesson set version is immutable';
  end if;
  return new;
end;
$$;

create or replace function prevent_active_prompt_version_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'active' then
    raise exception 'active prompt version is immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists prompt_versions_active_immutable on prompt_versions;
create trigger prompt_versions_active_immutable
before update or delete on prompt_versions
for each row execute function prevent_active_prompt_version_change();

create or replace function prevent_active_rubric_version_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'active' then
    raise exception 'active rubric version is immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists rubric_versions_active_immutable on rubric_versions;
create trigger rubric_versions_active_immutable
before update or delete on rubric_versions
for each row execute function prevent_active_rubric_version_change();
