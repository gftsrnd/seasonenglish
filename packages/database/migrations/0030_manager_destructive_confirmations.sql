create table manager_destructive_confirmations (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  manager_id uuid not null references users(id) on delete cascade,
  action text not null check (action in ('purge_account')),
  target_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index manager_destructive_confirmations_lookup_idx
  on manager_destructive_confirmations (organization_id, manager_id, action, target_id, created_at desc);
