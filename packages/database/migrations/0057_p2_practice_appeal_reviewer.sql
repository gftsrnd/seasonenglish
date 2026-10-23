alter table practice_appeals
  add column if not exists resolved_by uuid references users(id);
