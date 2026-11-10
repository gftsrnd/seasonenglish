alter table assessment_attempts
  add column owner_session_id uuid references sessions(id) on delete set null;
