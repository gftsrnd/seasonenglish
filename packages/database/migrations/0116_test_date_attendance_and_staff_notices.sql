-- Attendance follows the organisation date (the Manager test date when one is set), not the real
-- clock. Each completion stores the organisation date it happened on; older rows keep the Vietnam
-- calendar date of their timestamp.
alter table progress_records add column completed_on date;

update progress_records
set completed_on = (completed_at at time zone 'Asia/Ho_Chi_Minh')::date
where completed_at is not null;

create function record_progress_completed_on() returns trigger language plpgsql as $$
begin
  if new.completed_at is null then
    new.completed_on := null;
    return new;
  end if;
  -- An explicit organisation date wins; an unchanged timestamp keeps its stored date.
  if tg_op = 'INSERT' and new.completed_on is not null then return new; end if;
  if tg_op = 'UPDATE' and new.completed_on is not null
     and (new.completed_on is distinct from old.completed_on or new.completed_at is not distinct from old.completed_at) then
    return new;
  end if;
  -- A completion written now happened on today's organisation date; a backdated timestamp keeps
  -- its own Vietnam calendar date.
  new.completed_on := case
    when new.completed_at = now() then (select organization_system_date(organization_id) from users where id = new.learner_id)
    else (new.completed_at at time zone 'Asia/Ho_Chi_Minh')::date
  end;
  if new.completed_on is null then new.completed_on := (new.completed_at at time zone 'Asia/Ho_Chi_Minh')::date; end if;
  return new;
end
$$;

create trigger progress_completed_on before insert or update of completed_at, completed_on on progress_records
for each row execute function record_progress_completed_on();

create index progress_records_completed_on_idx on progress_records (learner_id, completed_on) where completed_on is not null;

-- Lessons of a published month that sit in the upcoming three-lesson window (from the organisation
-- date) but are not yet visible to learners.
create function pending_lesson_window(target_org uuid)
returns table (month_lesson_id uuid, lesson_date date, cefr text)
language sql stable as $$
  with frameworks as (
    select mf.id, mf.cefr, mf.scope_hash, mf.curriculum_contract, organization_system_date(pm.organization_id) as today
    from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
    where pm.organization_id = target_org and mf.status = 'approved' and mf.published_at is not null
  )
  select w.id, w.lesson_date, f.cefr
  from frameworks f
  cross join lateral (
    select ml.* from month_lessons ml
    where ml.framework_id = f.id and ml.lesson_date >= f.today
    order by ml.lesson_number limit 3
  ) w
  where not (
    w.status = 'approved' and w.scope_hash = f.scope_hash
    and exists (
      select from lessons l
      join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
      where l.id = w.lesson_id
        and exists (select from lesson_versions lv where lv.lesson_id = l.id and lv.status = 'published')
    )
    and f.curriculum_contract->'daySpecs' @> jsonb_build_array(
      jsonb_build_object('lessonNumber', w.lesson_number, 'date', w.lesson_date::text)
    )
  )
$$;

-- Staff notices driven by the organisation date. Run by the API at start, every Vietnam midnight
-- and whenever the Manager changes the test date.
create function sync_staff_date_notices(target_org uuid) returns void language plpgsql as $$
declare
  today date := organization_system_date(target_org);
  real_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  simulated text;
  test_context text;
begin
  if today is null then return; end if;
  select nullif(configuration->>'simulatedSystemDate', '') into simulated
  from organization_settings where organization_id = target_org;

  -- Test date: one notice per test date, kept current with the real date, gone once back to real.
  if simulated is null or today = real_today then
    delete from inbox_notifications where organization_id = target_org and kind = 'test_date_active';
  else
    test_context := today::text || ':' || real_today::text;
    delete from inbox_notifications
    where organization_id = target_org and kind = 'test_date_active' and event_key <> 'test-date:' || today::text;
    update inbox_notifications set context = test_context
    where organization_id = target_org and kind = 'test_date_active' and context <> test_context;
    perform notify_inbox(target_org, 'manager', null, 'test-date:' || today::text, 'test_date_active', test_context);
    perform notify_inbox(target_org, 'operator', null, 'test-date:' || today::text, 'test_date_active', test_context);
  end if;

  -- Upcoming lessons not approved: one notice per lesson per day while it stays in the window.
  delete from inbox_notifications n
  where n.organization_id = target_org
    and n.kind in ('lesson_window_unapproved', 'lesson_window_unapproved_manager')
    and not exists (
      select from pending_lesson_window(target_org) p
      where n.event_key = 'lesson-window:' || p.month_lesson_id || ':' || today::text
    );
  perform notify_inbox(target_org, 'operator', null, 'lesson-window:' || p.month_lesson_id || ':' || today::text,
    'lesson_window_unapproved', p.lesson_date::text || ':' || p.cefr)
  from pending_lesson_window(target_org) p;
  perform notify_inbox(target_org, 'manager', null, 'lesson-window:' || p.month_lesson_id || ':' || today::text,
    'lesson_window_unapproved_manager', p.lesson_date::text || ':' || p.cefr)
  from pending_lesson_window(target_org) p;
end;
$$;

-- An approved lesson resolves its notices at once; the next sync re-checks the full window.
create function resolve_lesson_window_notices() returns trigger language plpgsql as $$
begin
  delete from inbox_notifications
  where kind in ('lesson_window_unapproved', 'lesson_window_unapproved_manager')
    and event_key like 'lesson-window:' || new.id || ':%';
  return new;
end;
$$;

create trigger inbox_lesson_window_resolved after update of status on month_lessons
for each row when (new.status = 'approved' and old.status is distinct from 'approved')
execute function resolve_lesson_window_notices();
