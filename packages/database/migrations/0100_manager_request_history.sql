alter table month_lesson_corrections
  add column archived_at timestamptz check (archived_at is null or status in ('authorized', 'published', 'rejected'));

alter table month_framework_reopen_requests
  add column archived_at timestamptz check (archived_at is null or status in ('authorized', 'rejected'));

alter table learner_complaints
  add column archived_at timestamptz check (archived_at is null or status in ('approved', 'rejected', 'auto_approved'));
