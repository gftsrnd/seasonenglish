-- One retake per learner and exam kind (owner decision, 11/2026).
--
-- A learner who is not happy with the placement result may retake the placement test once, on a
-- fresh AI-generated form (assessment_key 'placement-retake'). The Operator grants it (from the
-- placement decision "Cho thi lại 1 lần" or from the learner's record, e.g. after an appeal).
-- After the retake the Operator places the learner; that decision is final.
--
-- The unique (learner_id, kind) constraint is the durable "maximum one retake" rule. A row is
-- "granted" until the learner starts the retake (used_at + retake_attempt_id are set in the same
-- transaction that creates the new attempt). 'pass_course' is reserved for the exit-test retake,
-- which stays behind a disabled flag in the API (PASS_COURSE_RETAKE_ENABLED = false).
create table if not exists assessment_retake_grants (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('placement', 'pass_course')),
  source_attempt_id uuid references assessment_attempts(id) on delete set null,
  retake_attempt_id uuid unique references assessment_attempts(id) on delete set null,
  reason text not null,
  granted_by uuid references users(id) on delete set null,
  granted_at timestamptz not null default now(),
  used_at timestamptz,
  constraint assessment_retake_grants_once unique (learner_id, kind)
);

create index if not exists assessment_retake_grants_org_idx
  on assessment_retake_grants (organization_id, granted_at desc);

-- Bell: the learner is told about the granted retake ("Bạn được thi lại 1 lần…").
create or replace function notify_retake_grant() returns trigger language plpgsql as $$
begin
  perform notify_inbox(new.organization_id, 'learner', new.learner_id,
    'retake:' || new.id || ':granted', 'retake_granted', new.kind);
  return new;
end;
$$;

drop trigger if exists inbox_retake_grant on assessment_retake_grants;
create trigger inbox_retake_grant after insert on assessment_retake_grants
for each row execute function notify_retake_grant();
