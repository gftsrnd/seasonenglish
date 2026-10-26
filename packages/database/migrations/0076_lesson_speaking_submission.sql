alter table lesson_part_attempts
  drop constraint if exists lesson_part_attempts_status_check;

alter table lesson_part_attempts
  add constraint lesson_part_attempts_status_check
  check (status in ('wrong_retry', 'wrong_exhausted', 'correct', 'submitted', 'translated'));
