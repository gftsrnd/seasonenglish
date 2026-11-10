-- A learner's current monthly vocabulary set is independent of pilot weeks.
-- A personal keyword set also works before the organization creates the month.
create unique index game_sets_current_personal_month_unique
  on game_sets (learner_id, (payload->>'month'))
  where game_key = 'monthly_vocabulary' and status = 'published' and learner_id is not null;
