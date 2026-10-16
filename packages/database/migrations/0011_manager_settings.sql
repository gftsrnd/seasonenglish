create table organization_settings (
  organization_id uuid primary key references organizations(id) on delete cascade,
  reminder_inactive_days integer not null default 3 check (reminder_inactive_days between 1 and 30),
  weekly_report_enabled boolean not null default true,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);
