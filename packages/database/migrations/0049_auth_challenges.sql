create table if not exists auth_challenges (
  id uuid primary key,
  kind text not null check (kind in ('registration', 'pin_reset')),
  email text not null,
  user_id uuid references users(id) on delete cascade,
  code_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  reset_token_hash text,
  reset_token_expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_challenges_email_kind_created_idx
  on auth_challenges (lower(email), kind, created_at desc);

create unique index if not exists auth_challenges_reset_token_unique
  on auth_challenges (reset_token_hash)
  where reset_token_hash is not null;
