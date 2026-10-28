alter table files
  add column if not exists source_flow text not null default 'placement',
  add column if not exists source_entity_id uuid,
  add column if not exists task_key text,
  add column if not exists question_key text,
  add column if not exists transcript text,
  add column if not exists completed_at timestamptz,
  add column if not exists graded_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references users(id);

alter table files
  drop constraint if exists files_source_flow_check;

alter table files
  add constraint files_source_flow_check
  check (source_flow in ('placement', 'daily_lesson', 'weekly_practice', 'season'));

create index if not exists files_audio_scope_idx
  on files (organization_id, purpose, source_flow, owner_user_id, created_at desc);

create table if not exists file_deletion_confirmations (
  id uuid primary key,
  file_id uuid not null references files(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  requester_user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists file_deletion_confirmations_active_idx
  on file_deletion_confirmations (file_id, requester_user_id, expires_at)
  where used_at is null;

do $$
declare
  role_name text;
begin
  revoke all on all tables in schema public from public;
  revoke all on all sequences in schema public from public;
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on all tables in schema public from %I', role_name);
      execute format('revoke all on all sequences in schema public from %I', role_name);
      execute format('revoke all on all functions in schema public from %I', role_name);
    end if;
  end loop;
end $$;

alter table files enable row level security;
alter table file_deletion_confirmations enable row level security;
alter table audit_events enable row level security;
alter table assessment_responses enable row level security;
alter table practice_submissions enable row level security;
alter table coach_turns enable row level security;
alter table user_credentials enable row level security;
alter table sessions enable row level security;
