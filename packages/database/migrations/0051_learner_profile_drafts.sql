alter table learner_profiles
  add column if not exists draft_profile jsonb,
  add column if not exists draft_updated_at timestamptz;
