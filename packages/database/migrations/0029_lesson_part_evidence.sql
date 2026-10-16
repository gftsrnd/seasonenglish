create table if not exists lesson_part_attempts (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  part_code text not null,
  request_key uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('wrong_retry', 'wrong_exhausted', 'correct', 'translated')),
  answer text,
  score numeric(6, 2),
  feedback text,
  artifact_key text,
  created_at timestamptz not null default now(),
  unique (learner_id, request_key)
);

create index if not exists lesson_part_attempts_part_idx
  on lesson_part_attempts (learner_id, lesson_id, part_code, created_at desc);

create table if not exists lesson_part_appeals (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  part_code text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists lesson_part_appeals_pending_unique
  on lesson_part_appeals (learner_id, lesson_id, part_code)
  where status = 'pending';

create index if not exists lesson_part_appeals_learner_idx
  on lesson_part_appeals (learner_id, created_at desc);
