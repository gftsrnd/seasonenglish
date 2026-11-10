alter table learner_complaints
  add column request_scope text,
  add column screenshot bytea,
  add column screenshot_type text;

alter table appeals
  add column request_scope text,
  add column screenshot bytea,
  add column screenshot_type text;

alter table lesson_part_appeals
  add column request_scope text,
  add column screenshot bytea,
  add column screenshot_type text;

alter table practice_appeals
  add column request_scope text,
  add column screenshot bytea,
  add column screenshot_type text;
