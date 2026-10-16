create table if not exists topic_strikes (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  topic text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists topic_strikes_learner_created_idx
  on topic_strikes (learner_id, created_at desc);

create table if not exists topic_reports (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  topic text not null,
  reason text not null,
  strike_count integer not null default 3,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_by uuid references users(id),
  resolved_at timestamptz
);

create index if not exists topic_reports_status_created_idx
  on topic_reports (status, created_at desc);
