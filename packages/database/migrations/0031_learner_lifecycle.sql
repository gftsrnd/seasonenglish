create table if not exists learner_vocabulary_unlocks (
  learner_id uuid not null references users(id) on delete cascade,
  word text not null,
  unlocked_at timestamptz not null default now(),
  primary key (learner_id, word)
);

create index if not exists learner_vocabulary_unlocks_learner_idx
  on learner_vocabulary_unlocks (learner_id, unlocked_at desc);

create table if not exists level_up_challenge_results (
  id uuid primary key,
  assessment_attempt_id uuid not null unique references assessment_attempts(id) on delete cascade,
  session_id uuid not null unique references coach_sessions(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  completed_turns integer not null check (completed_turns >= 0),
  average numeric(5, 2) not null check (average >= 0),
  off_topic integer not null check (off_topic >= 0),
  passed boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists level_up_challenge_results_learner_idx
  on level_up_challenge_results (learner_id, created_at desc);

create table if not exists practice_appeals (
  id uuid primary key,
  submission_id uuid not null unique references practice_submissions(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists practice_appeals_learner_idx
  on practice_appeals (learner_id, created_at desc);
