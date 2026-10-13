alter table ai_runs add column if not exists request_key text;

create unique index if not exists ai_runs_user_task_request_unique
  on ai_runs (user_id, task_id, request_key)
  where request_key is not null;

insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values (
  '00000000-0000-4000-8000-000000001106',
  'coach_dialogue',
  '{"type":"object","required":["message","cefr","scenario","priorTurns"]}'::jsonb,
  '{"type":"object","required":["relevant","relevanceNote","reply","rubric","suggestions","correctedText","usedWords"]}'::jsonb,
  '{"allow":["message","cefr","scenario","priorTurns"],"retention":"metadata_and_validated_output"}'::jsonb
)
on conflict (task_key) do update
set input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    data_policy = excluded.data_policy;
