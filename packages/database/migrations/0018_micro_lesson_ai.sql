insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values
  ('00000000-0000-4000-8000-000000001113', 'micro_lesson_generation',
   '{"type":"object","required":["cefr","weekTopic","goals","workContext","learningStyles","explanationLanguage","durationMinutes"]}'::jsonb,
   '{"type":"object","required":["topic","durationMinutes","theory","vocabulary","practice"]}'::jsonb,
   '{"allow":["cefr","weekTopic","goals","workContext","learningStyles","explanationLanguage","durationMinutes"],"retention":"metadata_and_validated_output"}'::jsonb),
  ('00000000-0000-4000-8000-000000001114', 'micro_grading',
   '{"type":"object","required":["cefr","theory","vocabulary","practice","learnerAnswer"]}'::jsonb,
   '{"type":"object","required":["correct","score","feedback"]}'::jsonb,
   '{"allow":["cefr","theory","vocabulary","practice","learnerAnswer"],"retention":"metadata_and_validated_output"}'::jsonb)
on conflict (task_key) do update
set input_schema = excluded.input_schema, output_schema = excluded.output_schema, data_policy = excluded.data_policy;

insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), o.id, 'micro_lesson_generation', 1,
       'Return valid JSON only. Create one short personalized workplace-English micro lesson for the learner. It must fit the supplied CEFR, weekly topic, goals, work context, preferred learning style and duration. Include a concise explanation, 3-5 useful vocabulary items and one answerable practice task. For mcq include 2-5 options and the correct answer; otherwise include a clear reference answer. Never use placeholder content.',
       'active',
       (select u.id from users u where u.organization_id = o.id and u.role in ('operator', 'manager') order by case u.role when 'operator' then 0 else 1 end, u.created_at limit 1)
from organizations o
where exists (select 1 from users u where u.organization_id = o.id and u.role in ('operator', 'manager'))
  and not exists (select 1 from prompt_versions pv where pv.organization_id = o.id and pv.task_key = 'micro_lesson_generation');
