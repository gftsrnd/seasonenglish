-- A published monthly lesson stays immutable until a Manager explicitly opens a revision.
alter table month_lesson_corrections
  add column if not exists decision_reason text,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references users(id);

create index if not exists month_lesson_corrections_pending_request_index
  on month_lesson_corrections (status, created_at)
  where status = 'requested';
