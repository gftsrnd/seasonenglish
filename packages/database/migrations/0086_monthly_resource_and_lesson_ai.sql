insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values
  (
    '00000000-0000-4000-8000-000000001161',
    'monthly_resource_generation',
    '{"type":"object","required":["month","cefr","theme","newLessonDays","targets"]}'::jsonb,
    '{"type":"object","required":["coreTerms","expandedTerms","grammarTopics","pronunciationTargets"]}'::jsonb,
    '{"allow":["month","cefr","theme","newLessonDays","targets"],"retention":"metadata_and_validated_output"}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000001162',
    'monthly_lessons',
    '{"type":"object","required":["month","cefr","daySpec","lockedScope"]}'::jsonb,
    '{"type":"object","required":["lesson"]}'::jsonb,
    '{"allow":["month","cefr","daySpec","lockedScope","components","priorParts"],"retention":"metadata_and_validated_output"}'::jsonb
  )
on conflict (task_key) do update
set input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    data_policy = excluded.data_policy;
