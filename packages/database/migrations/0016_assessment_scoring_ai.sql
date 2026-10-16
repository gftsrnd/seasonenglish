insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values ('00000000-0000-4000-8000-000000001112', 'assessment_scoring',
  '{"type":"object","required":["kind","writing","speaking","writingMaxScore","speakingMaxScore"]}'::jsonb,
  '{"type":"object","required":["writingScore","speakingScore","suggestedLevel","rationale","monthlyGoal"]}'::jsonb,
  '{"allow":["kind","writing","speaking","writingMaxScore","speakingMaxScore"],"retention":"metadata_and_validated_output"}'::jsonb)
on conflict (task_key) do update set input_schema = excluded.input_schema, output_schema = excluded.output_schema, data_policy = excluded.data_policy;
