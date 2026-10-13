alter table practice_submissions add column if not exists request_key text;
create unique index if not exists practice_submissions_learner_week_unique
  on practice_submissions (learner_id, program_week_id);
create unique index if not exists practice_submissions_request_unique
  on practice_submissions (learner_id, request_key) where request_key is not null;

alter table game_results add column if not exists game_key text;
alter table game_results add column if not exists max_score integer;
alter table game_results add column if not exists request_key text;
alter table game_results add column if not exists duel_id uuid references duels(id);
create unique index if not exists game_results_request_unique
  on game_results (learner_id, request_key) where request_key is not null;
alter table duels add column if not exists game_key text;

create index if not exists game_results_leaderboard_idx
  on game_results (learner_id, completed_at desc);
create index if not exists duels_participants_idx
  on duels (challenger_id, opponent_id, state, created_at desc);
