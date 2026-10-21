alter table program_weeks
  add column if not exists ai_plan jsonb not null default '{}'::jsonb;
