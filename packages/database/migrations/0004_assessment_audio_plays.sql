create table assessment_audio_plays (
  id uuid primary key,
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  section text not null,
  group_key text not null,
  play_count integer not null check (play_count between 1 and 100),
  last_played_at timestamptz not null default now(),
  unique (attempt_id, section, group_key)
);

create index assessment_audio_plays_attempt_idx
  on assessment_audio_plays (attempt_id, section);
