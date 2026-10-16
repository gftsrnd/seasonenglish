alter table manager_destructive_confirmations
  drop constraint if exists manager_destructive_confirmations_action_check;

alter table manager_destructive_confirmations
  add constraint manager_destructive_confirmations_action_check
  check (action in ('purge_account', 'seed_demo', 'wipe_data'));

alter table manager_destructive_confirmations
  add column if not exists details jsonb not null default '{}'::jsonb;

create table manager_maintenance_backups (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  manager_id uuid not null references users(id) on delete cascade,
  action text not null check (action in ('seed_demo', 'wipe_data')),
  snapshot jsonb not null,
  snapshot_sha256 text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index manager_maintenance_backups_lookup_idx
  on manager_maintenance_backups (organization_id, manager_id, action, created_at desc);
