-- Monthly learning is additive: historic weekly records remain readable.
create table if not exists program_months (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  exam_date date not null,
  lesson_count integer not null check (lesson_count > 0),
  theme_title text not null default '',
  theme_brief text not null default '',
  theme_context text not null default '',
  communication_goal text not null default '',
  brief_version integer not null default 1,
  brief_status text not null default 'draft' check (brief_status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, month)
);

create table if not exists month_frameworks (
  id uuid primary key,
  program_month_id uuid not null references program_months(id) on delete cascade,
  cefr text not null,
  status text not null default 'draft' check (status in ('draft', 'generating', 'approved', 'failed')),
  version integer not null default 1,
  curriculum_contract jsonb not null default '{}'::jsonb,
  scope_hash text not null default '',
  quality_acknowledgement jsonb,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  generation_job_id uuid references jobs(id),
  generation_error text,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_month_id, cefr)
);

-- Monthly lessons reuse the existing immutable lesson version store.
alter table lesson_sets alter column program_week_id drop not null;
alter table lesson_sets add column if not exists month_framework_id uuid references month_frameworks(id) on delete cascade;
create unique index if not exists lesson_sets_month_framework_unique on lesson_sets (month_framework_id) where month_framework_id is not null;
alter table lesson_sets drop constraint if exists lesson_sets_week_or_month_check;
alter table lesson_sets add constraint lesson_sets_week_or_month_check
  check (program_week_id is not null or month_framework_id is not null) not valid;

alter table lessons drop constraint if exists lessons_day_number_check;
alter table lessons add constraint lessons_day_number_check check (day_number between 1 and 31);

create table if not exists month_lessons (
  id uuid primary key,
  framework_id uuid not null references month_frameworks(id) on delete cascade,
  lesson_number integer not null check (lesson_number > 0),
  lesson_date date not null,
  lesson_id uuid references lessons(id) on delete set null,
  scope_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'generating', 'draft', 'approved', 'failed')),
  generation_error jsonb,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_id, lesson_number)
);

create table if not exists month_lesson_corrections (
  id uuid primary key,
  month_lesson_id uuid not null references month_lessons(id) on delete cascade,
  original_lesson_version_id uuid references lesson_versions(id),
  correction_lesson_version_id uuid references lesson_versions(id),
  requested_by uuid not null references users(id),
  authorized_by uuid references users(id),
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'authorized', 'published', 'rejected')),
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  published_at timestamptz
);

create index if not exists month_lessons_framework_lesson_index on month_lessons (framework_id, lesson_number);
create index if not exists month_lesson_corrections_lesson_index on month_lesson_corrections (month_lesson_id, created_at desc);
