update organization_settings
set configuration = coalesce(configuration, '{}'::jsonb) || '{"coachDailyLimit":30}'::jsonb;
