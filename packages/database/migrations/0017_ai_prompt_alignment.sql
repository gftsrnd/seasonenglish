insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
select gen_random_uuid(), o.id, 'weekly_lessons',
       coalesce((select max(pv.version) from prompt_versions pv where pv.organization_id = o.id and pv.task_key = 'weekly_lessons'), 0) + 1,
       'Return valid JSON only. Create exactly five CEFR-aligned workplace-English lessons for the supplied week and level. Each lesson must use dayNumber 1-5 and contain exactly these nine parts once: objective, instruction, vocabulary, grammar, pronunciation, listening, reading, writing, speaking. Every content object must include the concrete learner-facing material required by that part; do not return placeholder text.',
       'active',
       (select u.id from users u where u.organization_id = o.id and u.role in ('operator', 'manager') order by case u.role when 'operator' then 0 else 1 end, u.created_at limit 1)
from organizations o
where exists (select 1 from users u where u.organization_id = o.id and u.role in ('operator', 'manager'));
