-- Monthly final exam v2.0: AI generation task. The prompt content itself is
-- synced per organization from prototypeTaskPromptDefaults on first use.
insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values (
  '00000000-0000-4000-8000-000000001171',
  'monthly_final_generation',
  '{"type":"object","required":["month","cefr","formCode","frameworkVersion","theme","levelProfile","allocation","targets","grammar","pronunciation"]}'::jsonb,
  '{"type":"object","required":["listening","reading","grammarComponents","writing","speakingA","speakingB"]}'::jsonb,
  '{"allow":["month","cefr","formCode","frameworkVersion","theme","levelProfile","allocation","targets","grammar","pronunciation","backgroundWords"],"retention":"metadata_and_validated_output"}'::jsonb
)
on conflict (task_key) do update
set input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    data_policy = excluded.data_policy;
