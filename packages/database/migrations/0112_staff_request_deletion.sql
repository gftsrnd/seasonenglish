alter table learner_complaints
  add column staff_deleted_at timestamptz check (staff_deleted_at is null or status in ('approved', 'rejected', 'auto_approved'));

alter table month_lesson_corrections
  add column staff_deleted_at timestamptz check (staff_deleted_at is null or status in ('authorized', 'published', 'rejected'));

alter table month_framework_reopen_requests
  add column staff_deleted_at timestamptz check (staff_deleted_at is null or status in ('authorized', 'rejected'));

alter table appeals
  add column staff_deleted_at timestamptz check (staff_deleted_at is null or status in ('accepted', 'rejected'));

alter table practice_appeals
  add column staff_deleted_at timestamptz check (staff_deleted_at is null or status in ('accepted', 'rejected'));

alter table lesson_part_appeals
  add column staff_deleted_at timestamptz check (staff_deleted_at is null or status in ('accepted', 'rejected'));
