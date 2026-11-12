-- Mini-game topic moderation: a topic whose THEME is unsuitable (identity, religion, politics,
-- gambling, …) but not abusive is refused gently and stored as a 'soft' attempt that does not
-- count toward the 3-strike lock. Only repeated soft attempts within the window (or abusive /
-- nonsense topics) are stored as 'strike'. Existing rows are strikes.
alter table topic_strikes add column if not exists kind text not null default 'strike';
alter table topic_strikes drop constraint if exists topic_strikes_kind_check;
alter table topic_strikes add constraint topic_strikes_kind_check check (kind in ('strike', 'soft'));

create index if not exists topic_strikes_learner_kind_created_idx
  on topic_strikes (learner_id, kind, created_at desc);
