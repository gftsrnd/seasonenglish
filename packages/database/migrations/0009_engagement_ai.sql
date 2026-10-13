create unique index if not exists game_results_duel_learner_unique
  on game_results (duel_id, learner_id) where duel_id is not null;

alter table game_sets add column if not exists learner_id uuid references users(id);
create unique index if not exists game_sets_active_learner_unique
  on game_sets (program_week_id, learner_id, game_key)
  where learner_id is not null and status = 'published';

insert into ai_tasks (id, task_key, input_schema, output_schema, data_policy)
values
  ('00000000-0000-4000-8000-000000001107', 'weekly_practice_grading',
   '{"type":"object","required":["text","cefr","topic","rubric"]}'::jsonb,
   '{"type":"object","required":["score","feedback","suggestions","correctedText"]}'::jsonb,
   '{"allow":["text","cefr","topic","rubric"],"retention":"metadata_and_validated_output"}'::jsonb),
  ('00000000-0000-4000-8000-000000001108', 'vocabulary_generation',
   '{"type":"object","required":["topic","cefr","count"]}'::jsonb,
   '{"type":"object","required":["topic","words"]}'::jsonb,
   '{"allow":["topic","cefr","count"],"retention":"metadata_and_validated_output"}'::jsonb)
on conflict (task_key) do update
set input_schema = excluded.input_schema,
    output_schema = excluded.output_schema,
    data_policy = excluded.data_policy;
