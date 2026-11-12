-- Daily-lesson Speaking (speech-to-text + grading) and self-written Writing are
-- graded by AI in the background. `grading` keeps the AI state (pending /
-- graded / operator fallback), the transcript, the three-level result and the
-- failed positions that M1 error review and the Friday review read later.
alter table lesson_part_attempts add column if not exists grading jsonb;

-- 'retake': the recording was empty, unclear or too short. The learner records
-- again and the attempt does not count toward the two-attempt limit.
alter table lesson_part_attempts
  drop constraint if exists lesson_part_attempts_status_check;
alter table lesson_part_attempts
  add constraint lesson_part_attempts_status_check
  check (status in ('wrong_retry', 'wrong_exhausted', 'correct', 'submitted', 'translated', 'retake'));

create index if not exists lesson_part_attempts_failed_positions_idx
  on lesson_part_attempts (learner_id, created_at desc)
  where grading ? 'failedPositions';

insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values (
  '00000000-0000-4000-8000-000000001181',
  'lesson_productive_grading',
  '{"type":"object","required":["mode","cefr","feedbackLanguage","task","response"]}'::jsonb,
  '{"type":"object","required":["audioClear","level","feedback","failedPositions","usedRequiredWords"]}'::jsonb,
  '{"allow":["mode","cefr","feedbackLanguage","task","pronunciation","response"],"retention":"metadata_and_validated_output"}'::jsonb
)
on conflict (task_key) do update
set input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    data_policy = excluded.data_policy;
