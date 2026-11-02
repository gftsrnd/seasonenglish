alter table month_lessons add column if not exists quality_report jsonb not null default '{"severe":[],"light":[],"contractVersion":1}'::jsonb;
alter table month_lessons add column if not exists quality_acknowledgement jsonb;

create index if not exists month_lessons_status_index on month_lessons (framework_id, status, lesson_number);
