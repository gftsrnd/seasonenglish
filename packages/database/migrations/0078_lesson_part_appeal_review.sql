alter table lesson_part_appeals
  add column if not exists resolution text,
  add column if not exists resolved_by uuid references users(id);
