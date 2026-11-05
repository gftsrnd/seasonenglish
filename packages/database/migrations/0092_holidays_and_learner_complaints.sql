create table if not exists organization_holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  holiday_date date not null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, holiday_date)
);

create index if not exists organization_holidays_org_date_idx
  on organization_holidays (organization_id, holiday_date);

create table if not exists organization_holiday_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  holiday_date date not null,
  action text not null check (action in ('added', 'removed')),
  actor_id uuid references users(id),
  acted_at timestamptz not null default now()
);

create index if not exists organization_holiday_audit_org_date_idx
  on organization_holiday_audit (organization_id, holiday_date, acted_at desc);

create table if not exists learner_complaints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('exam_eligibility', 'lesson_unlock', 'account_unlock', 'attendance', 'lesson_count', 'account')),
  reason text not null check (char_length(trim(reason)) between 5 and 2000),
  related_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'auto_approved')),
  resolution text,
  resolved_by uuid references users(id),
  submitted_at timestamptz not null default now(),
  due_at timestamptz,
  resolved_at timestamptz,
  check (kind <> 'exam_eligibility' or due_at is not null)
);

create unique index if not exists learner_complaints_one_pending_kind_idx
  on learner_complaints (learner_id, kind) where status = 'pending';
create index if not exists learner_complaints_org_queue_idx
  on learner_complaints (organization_id, status, due_at, submitted_at);
create index if not exists learner_complaints_learner_idx
  on learner_complaints (learner_id, submitted_at desc);
