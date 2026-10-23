drop index if exists reward_events_learner_source_unique;

create unique index if not exists reward_events_points_business_key_unique
  on reward_events (learner_id, source_type, source_id)
  where badge_id is null;

create unique index if not exists reward_events_badge_business_key_unique
  on reward_events (learner_id, badge_id)
  where badge_id is not null;
