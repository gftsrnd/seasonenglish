-- Assessment-owned lifecycle additions. Keeps legacy placement and level-up
-- definitions intact while adding the persisted Pass Course Form A domain.
alter table assessment_definitions drop constraint if exists assessment_definitions_kind_check;
alter table assessment_definitions add constraint assessment_definitions_kind_check
  check (kind in ('placement', 'final', 'level_up', 'pass_course'));

create table if not exists pass_course_certificates (
  id uuid primary key,
  attempt_id uuid not null unique references assessment_attempts(id),
  learner_id uuid not null references users(id),
  organization_id uuid not null references organizations(id),
  certificate_number text not null unique,
  issued_by uuid not null references users(id),
  issued_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists pass_course_readiness (
  learner_id uuid primary key references users(id),
  organization_id uuid not null references organizations(id),
  cefr_ready boolean not null default false,
  reset_at timestamptz,
  reset_reason text,
  updated_at timestamptz not null default now()
);

alter table appeals add column if not exists expires_at timestamptz;
create index if not exists assessment_definitions_pass_course_idx
  on assessment_definitions (organization_id, kind) where kind = 'pass_course';
create index if not exists pass_course_certificates_learner_idx
  on pass_course_certificates (learner_id, issued_at desc);
