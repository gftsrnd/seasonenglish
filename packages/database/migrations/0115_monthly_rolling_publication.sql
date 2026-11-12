-- A month can be published once the next three consecutive lesson days are approved, counted from the
-- organisation's (simulated) date: today's lesson, or the next one, plus the two after it. The window
-- moves forward as days pass. Before the month starts this is lessons 1-3; near the end it is whatever
-- lessons remain. Learners only ever see approved lessons, so later days stay hidden until approved.
create or replace function monthly_framework_ready_for_publication(target uuid) returns boolean
language sql stable as $$
  with framework as (
    select mf.id, mf.status, mf.scope_hash, mf.curriculum_contract, pm.brief_status, pm.lesson_count,
           organization_system_date(pm.organization_id) as today
    from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
    where mf.id = target
  ),
  upcoming as (
    select ml.* from month_lessons ml, framework f
    where ml.framework_id = f.id and ml.lesson_date >= f.today
    order by ml.lesson_number
    limit 3
  ),
  window_lessons as (
    select * from upcoming
    union all
    -- The month is already over: fall back to its last three lessons.
    select * from (
      select ml.* from month_lessons ml, framework f
      where ml.framework_id = f.id and not exists (select from upcoming)
      order by ml.lesson_number desc limit 3
    ) tail
  )
  select f.status = 'approved' and f.brief_status = 'approved'
    and jsonb_array_length(
      case when jsonb_typeof(f.curriculum_contract->'daySpecs') = 'array'
           then f.curriculum_contract->'daySpecs' else '[]'::jsonb end
    ) = f.lesson_count
    and exists (select from window_lessons)
    and not exists (
      select from window_lessons wl
      where not (
        wl.status = 'approved' and wl.scope_hash = f.scope_hash
        and exists (
          select from lessons l
          join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
          where l.id = wl.lesson_id
            and exists (select from lesson_versions lv where lv.lesson_id = l.id and lv.status = 'published')
        )
        and f.curriculum_contract->'daySpecs' @> jsonb_build_array(
          jsonb_build_object('lessonNumber', wl.lesson_number, 'date', wl.lesson_date::text)
        )
      )
    )
  from framework f
$$;
