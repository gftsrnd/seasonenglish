create table coach_turn_reservations (
  learner_id uuid not null references users(id) on delete cascade,
  session_id uuid not null references coach_sessions(id) on delete cascade,
  request_id uuid not null,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  primary key (learner_id, request_id)
);

create index coach_turn_reservations_daily_idx
  on coach_turn_reservations (learner_id, reserved_at, expires_at);
