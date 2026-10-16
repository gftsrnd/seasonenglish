create table manager_pin_reports (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  subject_user_id uuid not null references users(id),
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  created_by uuid not null references users(id),
  resolved_by uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index manager_pin_reports_org_status_idx
  on manager_pin_reports (organization_id, status, created_at desc);
