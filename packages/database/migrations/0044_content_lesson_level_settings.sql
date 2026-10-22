create table if not exists content_lesson_level_settings (
  program_id uuid primary key references programs(id) on delete cascade,
  levels text[] not null default array['A1', 'A2', 'B1', 'B2']::text[],
  updated_at timestamptz not null default now(),
  constraint content_lesson_level_settings_levels_not_empty check (cardinality(levels) between 1 and 5),
  constraint content_lesson_level_settings_levels_supported check (levels <@ array['A1', 'A2', 'B1', 'B2', 'C1']::text[])
);
