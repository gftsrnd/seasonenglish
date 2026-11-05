-- Approved monthly resources (month_frameworks.status = 'approved') stay locked.
-- An Operator may ask a Manager to reopen them; the Manager decides with a
-- reason. Approval returns the framework to a draft resource pool (handled in
-- the repository transaction); this table keeps the request history.
create table if not exists month_framework_reopen_requests (
  id uuid primary key,
  framework_id uuid not null references month_frameworks(id) on delete cascade,
  framework_version integer not null,
  requested_by uuid not null references users(id),
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'authorized', 'rejected')),
  decided_by uuid references users(id),
  decided_at timestamptz,
  decision_reason text,
  removed_lesson_count integer,
  created_at timestamptz not null default now()
);

-- At most one open request per framework.
create unique index if not exists month_framework_reopen_requests_open_unique
  on month_framework_reopen_requests (framework_id)
  where status = 'requested';

create index if not exists month_framework_reopen_requests_framework_index
  on month_framework_reopen_requests (framework_id, created_at desc);
