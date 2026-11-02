-- Game word sets now belong to an approved monthly learning cycle.
alter table game_sets add column if not exists program_month_id uuid references program_months(id) on delete cascade;

create index if not exists game_sets_month_learner_index
  on game_sets (program_month_id, learner_id, game_key, created_at desc);

create unique index if not exists game_sets_active_month_learner_unique
  on game_sets (program_month_id, learner_id, game_key)
  where program_month_id is not null and learner_id is not null and status = 'published';
