alter table lesson_part_appeals add column exercise_version_id uuid references lesson_versions(id);
drop index lesson_part_appeals_pending_unique;
create unique index lesson_part_appeals_pending_unique
  on lesson_part_appeals (learner_id, lesson_id, part_code, exercise_version_id) nulls not distinct
  where status = 'pending';
