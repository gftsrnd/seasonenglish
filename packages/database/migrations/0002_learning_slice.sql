create table micro_lessons (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  program_week_id uuid not null references program_weeks(id),
  cefr text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1')),
  topic text not null,
  content jsonb not null,
  source text not null default 'ai' check (source in ('ai', 'seed', 'operator')),
  ai_run_id uuid references ai_runs(id),
  progress jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index micro_lessons_learner_date_idx
  on micro_lessons (learner_id, generated_at desc);
