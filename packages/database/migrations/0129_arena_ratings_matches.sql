-- Phase 2 of the arena rules (RULE-DAU-TRUONG A.5–A.9, A.11): XH rating, open ranked
-- challenges, friendly invites and the match ledger. Additive only: the retired `duels`
-- table and its rows stay untouched.

-- Seasons of three months per organization. The first start date is the Manager
-- setting; later seasons follow on. The current season is the row whose
-- [starts_on, ends_on) contains the organization's Vietnam day.
create table if not exists arena_seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'closed')),
  created_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (organization_id, starts_on)
);

-- One rating per learner × game × level × season. Never negative; starts at 1 000.
create table if not exists arena_ratings (
  learner_id uuid not null references users(id) on delete cascade,
  game_key text not null check (game_key in ('scramble', 'crossword', 'eggs', 'mario', 'sort', 'typing')),
  cefr text not null check (cefr in ('B1', 'B2', 'C1')),
  season_id uuid not null references arena_seasons(id) on delete cascade,
  rating integer not null default 1000 check (rating >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, cefr, game_key, learner_id)
);

create index if not exists arena_ratings_learner_idx on arena_ratings (learner_id, season_id, cefr);

-- The match ledger.
create table if not exists arena_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Common
  mode text not null check (mode in ('ranked', 'friendly')),
  game_key text not null check (game_key in ('scramble', 'crossword', 'eggs', 'mario', 'sort', 'typing')),
  cefr text not null check (cefr in ('B1', 'B2', 'C1')),
  season_id uuid references arena_seasons(id) on delete set null,
  -- Players: the poster (ranked) or inviter (friendly), and the one who accepted / was invited
  poster_id uuid not null references users(id) on delete cascade,
  opponent_id uuid references users(id) on delete cascade,
  poster_cefr text not null check (poster_cefr in ('B1', 'B2', 'C1')),
  opponent_cefr text check (opponent_cefr in ('B1', 'B2', 'C1')),
  request_key text not null,
  -- Set: snapshot of the words and the dealt round units, its kind and topic
  game_set_id uuid not null references game_sets(id),
  set_kind text not null check (set_kind in ('curriculum', 'personal')),
  set_topic text not null default '',
  -- State
  status text not null check (status in ('open', 'invited', 'accepted', 'settled', 'expired', 'cancelled', 'declined')),
  cancel_reason text check (cancel_reason in ('level_changed', 'both_timeout', 'season_changed')),
  -- Time
  created_at timestamptz not null default now(),
  accept_deadline timestamptz not null,
  accepted_at timestamptz,
  play_deadline timestamptz,
  settled_at timestamptz,
  -- Snapshot at acceptance (ranked): the ratings of this game and the meeting of the day
  poster_rating_snapshot integer,
  opponent_rating_snapshot integer,
  meeting_day date,
  meeting_index integer check (meeting_index is null or meeting_index >= 1),
  -- Results of both sides
  poster_started_at timestamptz,
  opponent_started_at timestamptz,
  poster_result_id uuid references game_results(id) on delete set null,
  opponent_result_id uuid references game_results(id) on delete set null,
  poster_score integer check (poster_score is null or poster_score between 0 and 100),
  opponent_score integer check (opponent_score is null or opponent_score between 0 and 100),
  poster_gameplay_ms integer,
  opponent_gameplay_ms integer,
  forfeited_by uuid references users(id) on delete set null,
  outcome text check (outcome in ('poster', 'opponent', 'draw')),
  decided_by text check (decided_by in ('score', 'time', 'forfeit', 'timeout')),
  -- Transfer (ranked only)
  base_points integer,
  decay_percent integer,
  transfer_points integer check (transfer_points is null or transfer_points >= 0),
  poster_rating_before integer,
  poster_rating_after integer check (poster_rating_after is null or poster_rating_after >= 0),
  opponent_rating_before integer,
  opponent_rating_after integer check (opponent_rating_after is null or opponent_rating_after >= 0),
  check (opponent_id is null or opponent_id <> poster_id),
  check (mode = 'friendly' or season_id is not null or status in ('expired', 'cancelled')),
  check (status not in ('accepted', 'settled') or opponent_id is not null),
  check (status <> 'settled' or (outcome is not null and decided_by is not null)),
  unique (poster_id, request_key)
);

-- One ranked match in play per pair (whoever posted it).
create unique index if not exists arena_matches_ranked_pair_unique
  on arena_matches (least(poster_id, opponent_id), greatest(poster_id, opponent_id))
  where mode = 'ranked' and status = 'accepted';
create index if not exists arena_matches_open_idx
  on arena_matches (organization_id, cefr, accept_deadline) where status = 'open';
create index if not exists arena_matches_poster_idx on arena_matches (poster_id, created_at desc);
create index if not exists arena_matches_opponent_idx on arena_matches (opponent_id, created_at desc);
create index if not exists arena_matches_due_idx
  on arena_matches (play_deadline) where status = 'accepted';
create index if not exists arena_matches_meeting_idx
  on arena_matches (meeting_day, least(poster_id, opponent_id), greatest(poster_id, opponent_id))
  where mode = 'ranked' and meeting_day is not null;

-- An arena round is an ordinary mini game result linked to its match, once per side.
alter table game_results add column if not exists arena_match_id uuid references arena_matches(id) on delete set null;
create unique index if not exists game_results_arena_side_unique
  on game_results (arena_match_id, learner_id) where arena_match_id is not null;

-- A level change cancels every match of the learner still open or in play (no XH change).
create or replace function cancel_arena_matches_on_level_change() returns trigger language plpgsql as $$
begin
  update arena_matches
  set status = 'cancelled', cancel_reason = 'level_changed', settled_at = now()
  where status in ('open', 'invited', 'accepted')
    and (poster_id = new.learner_id or opponent_id = new.learner_id);
  return new;
end;
$$;

drop trigger if exists arena_level_change on enrollments;
create trigger arena_level_change after update of cefr, cefr_approved on enrollments
for each row when (old.cefr is distinct from new.cefr or old.cefr_approved is distinct from new.cefr_approved)
execute function cancel_arena_matches_on_level_change();

-- Bell: only two kinds. "Tới lượt bạn chơi" (arena_turn) when someone accepted your
-- challenge or invite, or you got a friendly invite; "Trận đã có kết quả" (arena_result).
create or replace function notify_arena_match() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'invited' and new.opponent_id is not null then
      perform notify_inbox(new.organization_id, 'learner', new.opponent_id, 'arena:' || new.id || ':turn', 'arena_turn', 'games');
    end if;
  elsif old.status is distinct from new.status then
    if new.status = 'accepted' then
      perform notify_inbox(new.organization_id, 'learner', new.poster_id, 'arena:' || new.id || ':turn', 'arena_turn', 'games');
    elsif new.status = 'settled' then
      perform notify_inbox(new.organization_id, 'learner', new.poster_id, 'arena:' || new.id || ':result', 'arena_result', 'games');
      perform notify_inbox(new.organization_id, 'learner', new.opponent_id, 'arena:' || new.id || ':result', 'arena_result', 'games');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists inbox_arena_match on arena_matches;
create trigger inbox_arena_match after insert or update of status on arena_matches
for each row execute function notify_arena_match();
