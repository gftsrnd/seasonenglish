create or replace function organization_system_date(target_organization_id uuid)
returns date
language sql
stable
as $$
  select coalesce(
    nullif(settings.configuration->>'simulatedSystemDate', '')::date,
    (now() at time zone 'Asia/Ho_Chi_Minh')::date
  )
  from organizations organization
  left join organization_settings settings on settings.organization_id = organization.id
  where organization.id = target_organization_id
$$;

alter table enrollments add column cefr_started_on date;
alter table users add column attendance_reset_on date;
alter table appeals add column proposed_level text check (proposed_level in ('A1', 'A2', 'B1', 'B2', 'C1'));

create function record_learning_level_start() returns trigger language plpgsql as $$
begin
  if new.cefr_approved and new.cefr is not null and (
    tg_op = 'INSERT' or not old.cefr_approved or new.cefr is distinct from old.cefr
  ) then
    new.cefr_started_on := coalesce(
      case when tg_op = 'INSERT' then new.cefr_started_on end,
      (select organization_system_date(organization_id) from users where id = new.learner_id)
    );
  end if;
  return new;
end
$$;

create trigger learning_level_start before insert or update of cefr, cefr_approved on enrollments
for each row execute function record_learning_level_start();

create function reset_learning_absence_streak() returns trigger language plpgsql as $$
begin
  if new.role = 'learner' and old.status = 'disabled' and new.status = 'active' then
    new.attendance_reset_on := organization_system_date(new.organization_id);
  end if;
  return new;
end
$$;

create trigger learning_absence_reset before update of status on users
for each row execute function reset_learning_absence_streak();
