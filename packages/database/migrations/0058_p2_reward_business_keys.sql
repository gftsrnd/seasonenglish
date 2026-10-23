drop index if exists reward_events_learner_source_unique;

-- Historical local data may contain repeated zero-point badge awards for the
-- same learner. Keep the earliest award before enforcing badge idempotency.
with ranked_badge_awards as (
  select id,
         row_number() over (
           partition by learner_id, badge_id
           order by created_at asc, id asc
         ) as position
  from reward_events
  where badge_id is not null
)
delete from reward_events reward
using ranked_badge_awards ranked
where reward.id = ranked.id
  and ranked.position > 1;

create unique index if not exists reward_events_points_business_key_unique
  on reward_events (learner_id, source_type, source_id)
  where badge_id is null;

create unique index if not exists reward_events_badge_business_key_unique
  on reward_events (learner_id, badge_id)
  where badge_id is not null;
