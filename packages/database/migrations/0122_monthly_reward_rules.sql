-- Monthly reward rules (additive).
--
-- 1. Every organisation gets the eight Season badge definitions, not only the
--    demo organisation: existing organisations are backfilled here and a new
--    organisation gets them from the insert trigger. Labels and descriptions
--    follow the monthly calendar ("Tuần trọn vẹn" = one calendar week of the
--    monthly calendar, "Ôn tập đúng hẹn" = the Friday review on its day).
-- 2. learner_season_milestones remembers each Season a learner reached once, so
--    the bell notification and the congratulation modal are shown one time.
--    Seasons already reached before this migration are recorded as celebrated,
--    so nobody gets a modal for an old Season.

create or replace function ensure_organization_badges(target uuid) returns void
language sql as $$
  insert into badges (id, organization_id, badge_key, label, rule)
  select gen_random_uuid(), target, catalog.badge_key, catalog.label,
         jsonb_build_object('description', catalog.description, 'seasonLevel', catalog.season_level)
  from (values
    ('starter', 'Khởi đầu', 'Hoàn thành bài học đầu tiên', 2),
    ('streak3', 'Chuỗi 3 ngày', 'Học 3 ngày làm việc liên tiếp (T2–T6)', 2),
    ('week_complete', 'Tuần trọn vẹn', 'Hoàn thành mọi bài của một tuần trong lịch học tháng', 3),
    ('friday', 'Ôn tập đúng hẹn', 'Hoàn thành bài Ôn tuần đúng ngày đã xếp lịch', 3),
    ('coach_friend', 'Bạn của Season', 'Có 10 lượt luyện hợp lệ với Season', 3),
    ('streak5', 'Chuỗi 5 ngày', 'Học 5 ngày làm việc liên tiếp (T2–T6)', 4),
    ('first_try', 'Đúng ngay lần đầu', 'Một bài có Nghe, Đọc, Viết, Nói đều đúng ngay lần đầu', 4),
    ('wordsmith', 'Thợ chữ', 'Dùng 15 từ khác nhau khi luyện với Season', 4)
  ) as catalog(badge_key, label, description, season_level)
  where exists (select 1 from organizations o where o.id = target)
  on conflict (organization_id, badge_key) do update
    set label = excluded.label, rule = badges.rule || excluded.rule;
$$;

create or replace function organization_badges_on_insert() returns trigger
language plpgsql as $$
begin
  perform ensure_organization_badges(new.id);
  return new;
end;
$$;

drop trigger if exists organization_badges_on_insert on organizations;
create trigger organization_badges_on_insert after insert on organizations
for each row execute function organization_badges_on_insert();

select ensure_organization_badges(id) from organizations;

create table if not exists learner_season_milestones (
  learner_id uuid not null references users(id) on delete cascade,
  season_level integer not null check (season_level between 2 and 4),
  reached_at timestamptz not null default now(),
  celebrated_at timestamptz,
  primary key (learner_id, season_level)
);

create index if not exists learner_season_milestones_pending_idx
  on learner_season_milestones (learner_id, season_level desc) where celebrated_at is null;

-- Seasons reached before this migration (same ladder as seasonForRewards: in order,
-- each tier needs its points and all of its badges).
with totals as (
  select u.id as learner_id, coalesce(sum(re.points), 0) as points,
         coalesce(array_agg(b.badge_key) filter (where b.id is not null), '{}'::text[]) as badge_keys
  from users u
  left join reward_events re on re.learner_id = u.id
  left join badges b on b.id = re.badge_id
  where u.role = 'learner'
  group by u.id
), reached as (
  select learner_id,
         case
           when not (points >= 60 and badge_keys @> array['starter', 'streak3']) then 1
           when not (points >= 180 and badge_keys @> array['week_complete', 'friday', 'coach_friend']) then 2
           when not (points >= 360 and badge_keys @> array['streak5', 'first_try', 'wordsmith']) then 3
           else 4
         end as season_level
  from totals
)
insert into learner_season_milestones (learner_id, season_level, reached_at, celebrated_at)
select reached.learner_id, level, now(), now()
from reached cross join generate_series(2, 4) as level
where level <= reached.season_level
on conflict do nothing;
