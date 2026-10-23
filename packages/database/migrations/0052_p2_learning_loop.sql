alter table practice_submissions
  add column if not exists prompt_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists cefr_snapshot text check (cefr_snapshot is null or cefr_snapshot in ('A1', 'A2', 'B1', 'B2', 'C1')),
  add column if not exists vocabulary_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists superseded_at timestamptz;

with ranked as (
  select id,
         row_number() over (partition by learner_id, program_week_id order by submitted_at desc nulls last, updated_at desc, id desc) as position
  from practice_submissions
  where superseded_at is null
)
update practice_submissions ps
set superseded_at = now()
from ranked
where ps.id = ranked.id and ranked.position > 1;

create unique index if not exists practice_submissions_learner_week_canonical_unique
  on practice_submissions (learner_id, program_week_id)
  where superseded_at is null;

-- Points and badge awards may legitimately share the same source event.
-- Their separate idempotency keys are installed by 0058; the earlier combined
-- unique index would reject existing valid pairs before that migration runs.

create table if not exists level_up_retry_plans (
  id uuid primary key,
  assessment_attempt_id uuid not null unique references assessment_attempts(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  eligible_at timestamptz not null,
  weakest_skill text not null check (weakest_skill in ('listening', 'reading', 'writing', 'speaking')),
  readiness_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists level_up_retry_plans_learner_eligible_idx
  on level_up_retry_plans (learner_id, eligible_at desc);

create table if not exists scheduled_level_changes (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  assessment_attempt_id uuid not null unique references assessment_attempts(id) on delete cascade,
  from_cefr text not null check (from_cefr in ('A1', 'A2', 'B1', 'B2', 'C1')),
  to_cefr text not null check (to_cefr in ('A1', 'A2', 'B1', 'B2', 'C1')),
  effective_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'applied', 'cancelled')),
  approved_by uuid not null references users(id),
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_level_changes_due_idx
  on scheduled_level_changes (status, effective_at);

create table if not exists certificate_issuances (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  program_id uuid not null references programs(id) on delete cascade,
  certificate_code text not null unique,
  level text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1')),
  learner_name text not null,
  organization_name text not null,
  badges_snapshot jsonb not null default '[]'::jsonb,
  signatures_snapshot jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  unique (learner_id, program_id)
);

create or replace function prevent_certificate_issuance_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'certificate issuance is immutable';
end;
$$;

drop trigger if exists certificate_issuances_immutable on certificate_issuances;
create trigger certificate_issuances_immutable
before update or delete on certificate_issuances
for each row execute function prevent_certificate_issuance_mutation();
