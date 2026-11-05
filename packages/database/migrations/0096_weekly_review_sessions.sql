-- Friday weekly review sessions (bài ôn thứ Sáu).
-- Review-until-correct state per learner and review lesson. The state stores
-- the per-section queue, correct item IDs and latest answers so a learner can
-- resume at the first unfinished section. It intentionally has no attempt
-- count or score column: reviews have no attempt limit and no penalty, and
-- review answers never reach lesson_part_attempts (Operator exercise alerts).
create table learner_review_sessions (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_review_sessions_learner_lesson_unique unique (learner_id, lesson_id)
);

create index learner_review_sessions_learner_idx on learner_review_sessions (learner_id, updated_at desc);
