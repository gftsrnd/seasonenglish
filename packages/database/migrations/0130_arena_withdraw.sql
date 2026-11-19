-- Arena: the poster may withdraw an open challenge or a friendly invite nobody has answered yet.
alter table arena_matches drop constraint if exists arena_matches_cancel_reason_check;
alter table arena_matches add constraint arena_matches_cancel_reason_check
  check (cancel_reason in ('level_changed', 'both_timeout', 'season_changed', 'withdrawn'));
