insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values ('00000000-0000-4000-8000-000000001110', 'level_form_generation',
  '{"type":"object","required":["targetLevel","context","listeningQuestions","readingQuestions"]}'::jsonb,
  '{"type":"object","required":["title","listening","reading","writingPrompt","speakingPrompt"]}'::jsonb,
  '{"allow":["targetLevel","context","listeningQuestions","readingQuestions"],"retention":"metadata_and_validated_output"}'::jsonb)
on conflict (task_key) do update set input_schema = excluded.input_schema, output_schema = excluded.output_schema, data_policy = excluded.data_policy;

insert into prompt_versions (id, organization_id, task_key, version, content, status)
select gen_random_uuid(), o.id, 'level_form_generation', 1,
  'Return valid JSON only. Create one workplace-English level-up assessment at the requested CEFR target. Include a realistic listening script with exactly 5 four-option questions, a workplace reading passage with exactly 5 four-option questions, one 80–120 word writing prompt, and one speaking role-play prompt. Use unambiguous answer keys and do not test knowledge above the target level.',
  'active'
from organizations o
where not exists (select 1 from prompt_versions pv where pv.organization_id = o.id and pv.task_key = 'level_form_generation');
