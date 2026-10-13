create table organizations (
  id uuid primary key,
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  role text not null check (role in ('learner', 'operator', 'manager')),
  display_name text not null,
  email text,
  status text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table user_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  credential_hash text not null,
  algorithm text not null default 'scrypt',
  updated_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table learner_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table programs (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  name text not null,
  start_date date not null,
  week_count integer not null check (week_count > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now()
);

create table enrollments (
  id uuid primary key,
  program_id uuid not null references programs(id),
  learner_id uuid not null references users(id),
  cefr text,
  cefr_approved boolean not null default false,
  enrolled_at timestamptz not null default now(),
  unique (program_id, learner_id)
);

create table program_weeks (
  id uuid primary key,
  program_id uuid not null references programs(id) on delete cascade,
  week_number integer not null check (week_number > 0),
  topic text not null,
  description text not null default '',
  objectives jsonb not null default '[]'::jsonb,
  unique (program_id, week_number)
);

create table prompt_versions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  task_key text not null,
  version integer not null check (version > 0),
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, task_key, version)
);

create table rubric_versions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  rubric_key text not null,
  version integer not null check (version > 0),
  criteria jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, rubric_key, version)
);

create table lesson_sets (
  id uuid primary key,
  program_week_id uuid not null references program_weeks(id),
  cefr text not null check (cefr in ('A1', 'A2', 'B1', 'B2', 'C1')),
  created_at timestamptz not null default now(),
  unique (program_week_id, cefr)
);

create table lesson_set_versions (
  id uuid primary key,
  lesson_set_id uuid not null references lesson_sets(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'retired')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  approved_by uuid references users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (lesson_set_id, version)
);

create or replace function prevent_published_lesson_set_version_change()
returns trigger language plpgsql as $$
begin
  if old.status = 'published' then
    raise exception 'published lesson set version is immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger lesson_set_versions_immutable
before update or delete on lesson_set_versions
for each row execute function prevent_published_lesson_set_version_change();

create table lessons (
  id uuid primary key,
  lesson_set_version_id uuid not null references lesson_set_versions(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  title text not null,
  unique (lesson_set_version_id, day_number)
);

create table lesson_versions (
  id uuid primary key,
  lesson_id uuid not null references lessons(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  content jsonb not null,
  prompt_version_id uuid references prompt_versions(id),
  created_at timestamptz not null default now(),
  unique (lesson_id, version)
);

create table progress_records (
  id uuid primary key,
  learner_id uuid not null references users(id),
  lesson_id uuid not null references lessons(id),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  score numeric(6,2),
  evidence jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (learner_id, lesson_id)
);

create table activities (
  id uuid primary key,
  learner_id uuid not null references users(id),
  activity_type text not null,
  reference_type text not null,
  reference_id uuid,
  minutes integer not null default 0 check (minutes >= 0),
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table assessment_definitions (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  assessment_key text not null,
  kind text not null check (kind in ('placement', 'final', 'level_up')),
  title text not null,
  unique (organization_id, assessment_key)
);

create table assessment_versions (
  id uuid primary key,
  definition_id uuid not null references assessment_definitions(id),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  blueprint jsonb not null,
  rubric_version_id uuid references rubric_versions(id),
  published_at timestamptz,
  unique (definition_id, version)
);

create table assessment_attempts (
  id uuid primary key,
  assessment_version_id uuid not null references assessment_versions(id),
  learner_id uuid not null references users(id),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'pending_review', 'approved', 'needs_retry')),
  current_section text,
  timing_state jsonb not null default '{}'::jsonb,
  integrity_events jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table assessment_responses (
  id uuid primary key,
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  section text not null,
  task_key text not null,
  response jsonb not null,
  saved_at timestamptz not null default now(),
  unique (attempt_id, section, task_key)
);

create table assessment_scores (
  id uuid primary key,
  attempt_id uuid not null references assessment_attempts(id) on delete cascade,
  section text not null,
  score numeric(6,2) not null,
  criteria jsonb not null default '{}'::jsonb,
  source text not null check (source in ('deterministic', 'ai', 'human')),
  rubric_version_id uuid references rubric_versions(id),
  created_at timestamptz not null default now()
);

create table assessment_decisions (
  id uuid primary key,
  attempt_id uuid not null unique references assessment_attempts(id),
  suggested_level text,
  approved_level text,
  status text not null check (status in ('suggested', 'approved', 'rejected', 'retry')),
  reason text not null default '',
  decided_by uuid references users(id),
  decided_at timestamptz
);

create table appeals (
  id uuid primary key,
  attempt_id uuid not null references assessment_attempts(id),
  learner_id uuid not null references users(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  resolved_by uuid references users(id),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table ai_tasks (
  id uuid primary key,
  task_key text not null unique,
  input_schema jsonb not null,
  output_schema jsonb not null,
  data_policy jsonb not null default '{}'::jsonb
);

create table ai_runs (
  id uuid primary key,
  task_id uuid not null references ai_tasks(id),
  user_id uuid references users(id),
  prompt_version_id uuid references prompt_versions(id),
  provider text not null,
  model text not null,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'invalid_output')),
  input_hash text not null,
  output jsonb,
  usage jsonb not null default '{}'::jsonb,
  latency_ms integer,
  trace_id text not null unique,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table coach_sessions (
  id uuid primary key,
  learner_id uuid not null references users(id),
  scenario jsonb not null,
  rubric_version_id uuid references rubric_versions(id),
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table coach_turns (
  id uuid primary key,
  session_id uuid not null references coach_sessions(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  speaker text not null check (speaker in ('learner', 'ai')),
  content jsonb not null,
  feedback jsonb,
  ai_run_id uuid references ai_runs(id),
  created_at timestamptz not null default now(),
  unique (session_id, turn_number)
);

create table practice_submissions (
  id uuid primary key,
  learner_id uuid not null references users(id),
  program_week_id uuid not null references program_weeks(id),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  content jsonb not null default '{}'::jsonb,
  score jsonb,
  feedback jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table files (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  owner_user_id uuid references users(id),
  purpose text not null,
  bucket text not null,
  object_key text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null,
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  unique (bucket, object_key)
);

create table jobs (
  id uuid primary key,
  kind text not null,
  payload jsonb not null,
  state text not null default 'queued' check (state in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  run_at timestamptz not null default now(),
  locked_by text,
  lock_expires_at timestamptz,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reminders (
  id uuid primary key,
  learner_id uuid not null references users(id),
  reason text not null,
  message text not null,
  status text not null default 'draft' check (status in ('draft', 'queued', 'sent', 'failed', 'cancelled')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table notification_deliveries (
  id uuid primary key,
  reminder_id uuid not null references reminders(id),
  provider text not null,
  status text not null check (status in ('queued', 'sent', 'failed')),
  external_id text,
  response jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now()
);

create table badges (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  badge_key text not null,
  label text not null,
  rule jsonb not null,
  unique (organization_id, badge_key)
);

create table reward_events (
  id uuid primary key,
  learner_id uuid not null references users(id),
  badge_id uuid references badges(id),
  points integer not null default 0,
  source_type text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (learner_id, source_type, source_id, badge_id)
);

create table game_sets (
  id uuid primary key,
  program_week_id uuid references program_weeks(id),
  game_key text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table game_results (
  id uuid primary key,
  game_set_id uuid not null references game_sets(id),
  learner_id uuid not null references users(id),
  score integer not null,
  details jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create table duels (
  id uuid primary key,
  game_set_id uuid not null references game_sets(id),
  challenger_id uuid not null references users(id),
  opponent_id uuid not null references users(id),
  state text not null default 'open' check (state in ('open', 'completed', 'expired', 'cancelled')),
  scores jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (challenger_id <> opponent_id)
);

create table surveys (
  id uuid primary key,
  learner_id uuid not null references users(id),
  survey_key text not null,
  answers jsonb not null,
  submitted_at timestamptz not null default now(),
  unique (learner_id, survey_key)
);

create table audit_events (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  trace_id text not null,
  created_at timestamptz not null default now()
);

create table idempotency_keys (
  id bigserial primary key,
  scope text not null,
  key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (scope, key)
);

create index sessions_user_active_idx on sessions(user_id, expires_at) where revoked_at is null;
create index assessment_attempts_learner_idx on assessment_attempts(learner_id, started_at desc);
create index activities_learner_time_idx on activities(learner_id, occurred_at desc);
create index jobs_claim_idx on jobs(state, run_at, lock_expires_at);
create index ai_runs_trace_idx on ai_runs(trace_id);
create index audit_events_entity_idx on audit_events(entity_type, entity_id, created_at desc);

