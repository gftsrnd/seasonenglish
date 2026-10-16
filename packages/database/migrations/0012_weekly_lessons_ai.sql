insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values (
  '00000000-0000-4000-8000-000000001109',
  'weekly_lessons',
  '{"type":"object","required":["weekNumber","topic","description","objectives","keyVocabHint","cefr","lessonCount"]}'::jsonb,
  '{"type":"object","required":["lessons"]}'::jsonb,
  '{"allow":["weekNumber","topic","description","objectives","keyVocabHint","cefr","lessonCount"],"retention":"metadata_and_validated_output"}'::jsonb
)
on conflict (task_key) do update
set input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    data_policy = excluded.data_policy;
