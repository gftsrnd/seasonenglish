create table if not exists monthly_resource_generation_checkpoints (
  id uuid primary key,
  program_month_id uuid not null references program_months(id) on delete cascade,
  cefr text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1')),
  brief_version integer not null,
  generation_id uuid not null,
  version integer not null default 1,
  categories jsonb not null default '{}'::jsonb,
  source_lineage jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_month_id, cefr)
);

create index if not exists monthly_resource_checkpoints_updated_idx
  on monthly_resource_generation_checkpoints (updated_at desc);
