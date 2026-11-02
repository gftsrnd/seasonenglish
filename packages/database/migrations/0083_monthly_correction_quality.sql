alter table month_lesson_corrections add column if not exists quality_report jsonb not null default '{"severe":[],"light":[],"contractVersion":1}'::jsonb;
alter table month_lesson_corrections add column if not exists quality_acknowledgement jsonb;
