-- Phase 1 of the arena rules: one 0–100 round score for all six mini games.
-- Backward compatible: every new column is nullable or defaulted, old rows keep
-- rules_version 1 and stay valid; only rules_version 2 results count as records.
alter table game_results add column if not exists arena_score integer;
alter table game_results add column if not exists raw_score integer;
alter table game_results add column if not exists raw_max integer;
alter table game_results add column if not exists gameplay_ms integer;
alter table game_results add column if not exists units_assigned integer;
alter table game_results add column if not exists rules_version integer not null default 1;

alter table game_results drop constraint if exists game_results_round_score_check;
alter table game_results add constraint game_results_round_score_check check (
  (arena_score is null or arena_score between 0 and 100)
  and (raw_score is null or raw_score >= 0)
  and (raw_max is null or raw_max >= 0)
  and (raw_score is null or raw_max is null or raw_score <= raw_max)
  and (gameplay_ms is null or gameplay_ms >= 0)
  and (units_assigned is null or units_assigned >= 0)
  and rules_version >= 1
);

-- Records under the new rule: best round score per learner and game.
create index if not exists game_results_round_record_idx
  on game_results (learner_id, game_key, arena_score desc, gameplay_ms)
  where rules_version >= 2;

-- The unit list a fixed round was dealt (word ids in play order, plus game and seed).
-- Null for an ordinary word set: its rounds are derived from the words and the round seed.
alter table game_sets add column if not exists round_units jsonb;
