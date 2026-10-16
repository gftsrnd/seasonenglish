alter table organization_settings
  add column if not exists configuration jsonb not null default '{}'::jsonb;
