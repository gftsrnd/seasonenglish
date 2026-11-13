-- Seasons per CEFR level (additive).
--
-- 1. learner_level_periods records when a learner entered each level (any path:
--    placement approval, level-up, appeal, override, lowering). It is filled by a
--    trigger on enrollments and backfilled from the existing level history. The
--    Season ladder uses the points earned since the learner entered the current
--    level; the first level of a learner counts every point (placement start
--    counts as entering the level).
-- 2. Badge catalog: one "Chuỗi ngày học" (streak) badge with per-level threshold
--    replaces "Chuỗi 3 ngày" / "Chuỗi 5 ngày" (kept in old ledgers, marked
--    retired, never counted); new "Điểm thi tháng" (monthly_final_score); the
--    first-try badge is now called "Chuẩn ngay lần đầu". Holders of streak5 keep
--    the new streak badge (same award time, no new notification); streak3 alone
--    does not carry over.
-- 3. learner_season_milestones is keyed by level. Rows of the retired 60/180/360
--    ladder are kept with cefr = 'legacy' (all celebrated). Seasons already
--    reached under the new rules at the current level are recorded as celebrated,
--    so nobody gets a congratulation modal for them.

create table if not exists learner_level_periods (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  learner_id uuid not null references users(id) on delete cascade,
  cefr text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1')),
  started_at timestamptz not null default now(),
  source text not null default 'enrollment'
);

create index if not exists learner_level_periods_learner_idx
  on learner_level_periods (learner_id, started_at desc, seq desc);

-- Backfill from the level history: the first known level (from the earliest
-- change, otherwise the current level) from enrolment, then every applied
-- level-up and every direct staff change.
with current_level as (
  select distinct on (e.learner_id) e.learner_id, e.cefr, e.enrolled_at, e.cefr_started_on
  from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
  where e.cefr_approved and e.cefr in ('A1', 'A2', 'B1', 'B2', 'C1')
  order by e.learner_id, e.enrolled_at desc
), changes as (
  select c.learner_id, c.from_cefr, c.to_cefr, coalesce(c.applied_at, c.effective_at) as changed_at
  from scheduled_level_changes c where c.status = 'applied'
  union all
  select ae.entity_id, nullif(ae.payload->>'previousLevel', ''), ae.payload->>'targetLevel', ae.created_at
  from audit_events ae
  where ae.action = 'assessment.learner.level_changed' and ae.payload->>'mode' = 'direct' and ae.entity_id is not null
    and ae.payload->>'targetLevel' in ('A1', 'A2', 'B1', 'B2', 'C1')
    and ae.payload->>'previousLevel' is distinct from ae.payload->>'targetLevel'
), firsts as (
  select distinct on (learner_id) learner_id, from_cefr, changed_at from changes order by learner_id, changed_at
)
insert into learner_level_periods (learner_id, cefr, started_at, source)
select cl.learner_id, coalesce(f.from_cefr, cl.cefr), least(cl.enrolled_at, f.changed_at - interval '1 second'), 'backfill_initial'
from current_level cl left join firsts f on f.learner_id = cl.learner_id
where f.learner_id is null or f.from_cefr in ('A1', 'A2', 'B1', 'B2', 'C1')
union all
select ch.learner_id, ch.to_cefr, ch.changed_at, 'backfill_change'
from changes ch join current_level cl on cl.learner_id = ch.learner_id;

-- The latest period must be the current level; otherwise add it from the recorded level start.
with current_level as (
  select distinct on (e.learner_id) e.learner_id, e.cefr, e.cefr_started_on
  from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
  where e.cefr_approved and e.cefr in ('A1', 'A2', 'B1', 'B2', 'C1')
  order by e.learner_id, e.enrolled_at desc
)
insert into learner_level_periods (learner_id, cefr, started_at, source)
select cl.learner_id, cl.cefr,
       greatest(coalesce((cl.cefr_started_on::timestamp at time zone 'Asia/Ho_Chi_Minh'), now()),
                coalesce((select max(p.started_at) + interval '1 second' from learner_level_periods p where p.learner_id = cl.learner_id), '-infinity'::timestamptz)),
       'backfill_current'
from current_level cl
where cl.cefr is distinct from (
  select p.cefr from learner_level_periods p where p.learner_id = cl.learner_id order by p.started_at desc, p.seq desc limit 1
);

create or replace function record_learner_level_period() returns trigger language plpgsql as $$
begin
  if new.cefr_approved and new.cefr in ('A1', 'A2', 'B1', 'B2', 'C1') and (
    tg_op = 'INSERT' or not old.cefr_approved or new.cefr is distinct from old.cefr
  ) and new.cefr is distinct from (
    select p.cefr from learner_level_periods p where p.learner_id = new.learner_id
    order by p.started_at desc, p.seq desc limit 1
  ) then
    insert into learner_level_periods (learner_id, cefr, started_at) values (new.learner_id, new.cefr, now());
  end if;
  return new;
end
$$;

drop trigger if exists learner_level_period on enrollments;
create trigger learner_level_period after insert or update of cefr, cefr_approved on enrollments
for each row execute function record_learner_level_period();

-- The learner's approved level used by rewards (null before the first approval).
create or replace function learner_current_cefr(target uuid) returns text language sql stable as $$
  select e.cefr from enrollments e join programs p on p.id = e.program_id and p.status = 'active'
  where e.learner_id = target and e.cefr_approved and e.cefr is not null
  order by e.enrolled_at desc limit 1
$$;

-- Start of the current level's Season ladder; null = from the beginning (first level).
create or replace function learner_season_started_at(target uuid) returns timestamptz language sql stable as $$
  select case when (select count(*) from learner_level_periods p where p.learner_id = target) > 1 then (
    select p.started_at from learner_level_periods p where p.learner_id = target
    order by p.started_at desc, p.seq desc limit 1
  ) end
$$;

-- Points earned in the current level (Season ladder); lifetime points stay in reward_events.
create or replace function learner_points_in_level(target uuid) returns integer language sql stable as $$
  select coalesce(sum(re.points), 0)::int from reward_events re
  where re.learner_id = target
    and re.created_at >= coalesce(learner_season_started_at(target), '-infinity'::timestamptz)
$$;

-- The level a learner was at, at a moment (a badge award); before the first period: the first level.
create or replace function learner_level_at(target uuid, at_time timestamptz) returns text language sql stable as $$
  select coalesce(
    (select p.cefr from learner_level_periods p where p.learner_id = target and p.started_at <= at_time
     order by p.started_at desc, p.seq desc limit 1),
    (select p.cefr from learner_level_periods p where p.learner_id = target order by p.started_at, p.seq limit 1)
  )
$$;

create or replace function ensure_organization_badges(target uuid) returns void
language sql as $$
  insert into badges (id, organization_id, badge_key, label, rule)
  select gen_random_uuid(), target, catalog.badge_key, catalog.label,
         jsonb_build_object('description', catalog.description, 'seasonLevel', catalog.season_level)
  from (values
    ('starter', 'Khởi đầu', 'Hoàn thành bài học mới đầu tiên', 2),
    ('streak', 'Chuỗi ngày học', 'Học liên tiếp các ngày có bài theo lịch tháng (A1–A2: 10 ngày, B1–C1: 5 ngày)', 2),
    ('week_complete', 'Tuần trọn vẹn', 'Hoàn thành mọi bài của các tuần trong lịch học tháng (A1–A2: 3 tuần, B1–C1: 2 tuần)', 3),
    ('friday', 'Ôn tập đúng hẹn', 'Hoàn thành bài Ôn tuần đúng ngày đã xếp lịch (A1–A2: 4 bài, B1–C1: 3 bài)', 3),
    ('coach_friend', 'Bạn của Season', 'Lượt luyện hợp lệ với Season (A1 20, A2 30, B1 50, B2 70, C1 100)', 3),
    ('first_try', 'Chuẩn ngay lần đầu', 'Bài có Nghe, Đọc, Viết, Nói đều đúng ngay lần đầu (A1 1, A2 2, B1 3, B2–C1 5)', 4),
    ('monthly_final_score', 'Điểm thi tháng', 'Một bài thi tháng đạt (A1) hoặc từ 75 / 80 / 85 / 90 điểm (A2 / B1 / B2 / C1)', 4),
    ('wordsmith', 'Thợ chữ', 'Từ khác nhau dùng khi luyện với Season (A1 15, A2 20, B1 30, B2 40, C1 50)', 4)
  ) as catalog(badge_key, label, description, season_level)
  where exists (select 1 from organizations o where o.id = target)
  on conflict (organization_id, badge_key) do update
    set label = excluded.label, rule = (badges.rule - 'retired') || excluded.rule;
$$;

select ensure_organization_badges(id) from organizations;

update badges set rule = rule || jsonb_build_object('retired', true)
where badge_key in ('streak3', 'streak5') and not coalesce((rule->>'retired')::boolean, false);

-- streak5 holders keep the new streak badge (same award time, no new notification).
insert into reward_events (id, learner_id, badge_id, points, source_type, source_id, created_at)
select gen_random_uuid(), old.learner_id, streak.id, 0, 'achievement', old.learner_id, old.created_at
from reward_events old
join badges retired on retired.id = old.badge_id and retired.badge_key = 'streak5'
join badges streak on streak.organization_id = retired.organization_id and streak.badge_key = 'streak'
on conflict (learner_id, badge_id) where badge_id is not null do nothing;

alter table learner_season_milestones add column if not exists cefr text;
update learner_season_milestones set cefr = 'legacy', celebrated_at = coalesce(celebrated_at, now()) where cefr is null;
alter table learner_season_milestones alter column cefr set not null;
alter table learner_season_milestones drop constraint if exists learner_season_milestones_pkey;
alter table learner_season_milestones add primary key (learner_id, cefr, season_level);
drop index if exists learner_season_milestones_pending_idx;
create index if not exists learner_season_milestones_pending_idx
  on learner_season_milestones (learner_id, cefr, season_level desc) where celebrated_at is null;

-- Seasons already reached at the current level under the new ladder: recorded as celebrated.
with learners as (
  select u.id as learner_id, learner_current_cefr(u.id) as cefr, learner_points_in_level(u.id) as points,
         coalesce((select array_agg(b.badge_key) from reward_events re join badges b on b.id = re.badge_id
                   where re.learner_id = u.id and not coalesce((b.rule->>'retired')::boolean, false)), '{}'::text[]) as badge_keys
  from users u where u.role = 'learner'
), reached as (
  select learner_id, cefr,
         case
           when not (points >= 500 and badge_keys @> array['starter', 'streak']) then 1
           when not (points >= 2000 and badge_keys @> array['week_complete', 'friday', 'coach_friend']) then 2
           when not (points >= 5000 and badge_keys @> array['first_try', 'monthly_final_score', 'wordsmith']) then 3
           else 4
         end as season_level
  from learners where cefr is not null
)
insert into learner_season_milestones (learner_id, cefr, season_level, reached_at, celebrated_at)
select reached.learner_id, reached.cefr, level, now(), now()
from reached cross join generate_series(2, 4) as level
where level <= reached.season_level
on conflict do nothing;
