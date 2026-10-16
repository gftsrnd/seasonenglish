alter table assessment_attempts
  add column if not exists violation_count integer not null default 0,
  add column if not exists violation_limit integer not null default 3,
  add column if not exists submit_reason text,
  add column if not exists device_evidence jsonb not null default '{}'::jsonb,
  add column if not exists media_evidence jsonb not null default '{}'::jsonb;

do $$
begin
  alter table assessment_attempts
    add constraint assessment_attempts_violation_count_check check (violation_count >= 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table assessment_attempts
    add constraint assessment_attempts_violation_limit_check check (violation_limit between 1 and 100);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table assessment_attempts
    add constraint assessment_attempts_submit_reason_check check (submit_reason is null or submit_reason in ('manual', 'timeout', 'violations'));
exception when duplicate_object then null;
end $$;

create index if not exists assessment_attempts_runtime_idx
  on assessment_attempts (learner_id, status, updated_at desc);
