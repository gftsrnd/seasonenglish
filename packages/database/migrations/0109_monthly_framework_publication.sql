alter table month_frameworks
  add column published_at timestamptz,
  add column published_on date,
  add constraint month_framework_publication_dates check ((published_at is null) = (published_on is null));

create function monthly_framework_ready_for_publication(target uuid) returns boolean
language sql stable as $$
  select mf.status = 'approved' and pm.brief_status = 'approved'
    and jsonb_array_length(
      case when jsonb_typeof(mf.curriculum_contract->'daySpecs') = 'array'
           then mf.curriculum_contract->'daySpecs' else '[]'::jsonb end
    ) = pm.lesson_count
    and (
      select count(*) from month_lessons ml
      join lessons l on l.id = ml.lesson_id
      join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
      where ml.framework_id = mf.id and ml.status = 'approved' and ml.scope_hash = mf.scope_hash
        and exists (select from lesson_versions lv where lv.lesson_id = l.id and lv.status = 'published')
        and mf.curriculum_contract->'daySpecs' @> jsonb_build_array(
          jsonb_build_object('lessonNumber', ml.lesson_number, 'date', ml.lesson_date::text)
        )
    ) = pm.lesson_count
  from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
  where mf.id = target
$$;

-- Complete pre-gate months were already accessible. Keep their original cohort dates.
update month_frameworks mf
set published_at = coalesce((select max(ml.approved_at) from month_lessons ml where ml.framework_id = mf.id), mf.approved_at, mf.updated_at),
    published_on = (pm.month || '-01')::date
from program_months pm
where pm.id = mf.program_month_id and monthly_framework_ready_for_publication(mf.id);

drop trigger inbox_monthly_lesson_publication on month_lessons;

create or replace function notify_monthly_lesson_publication() returns trigger language plpgsql as $$
declare
  lesson_org uuid;
  lesson_level text;
  lesson_month text;
  framework uuid;
begin
  if tg_table_name = 'month_frameworks' then
    if new.published_at is null or old.published_at is not null then return new; end if;
    framework := new.id;
  else
    if new.status <> 'published' or old.status = 'published' then return new; end if;
    select framework_id into framework from month_lessons where id = new.month_lesson_id;
  end if;
  select pm.organization_id, mf.cefr, pm.month into lesson_org, lesson_level, lesson_month
  from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
  where mf.id = framework and mf.published_at is not null;
  if lesson_org is not null then
    perform notify_level_cohort(lesson_org, lesson_level,
      'lesson-update:' || framework || ':' || organization_system_date(lesson_org), 'lesson_published', lesson_month);
  end if;
  return new;
end;
$$;

create trigger inbox_monthly_framework_publication after update of published_at on month_frameworks
for each row execute function notify_monthly_lesson_publication();
