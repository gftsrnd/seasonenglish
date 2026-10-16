alter table users
  add column avatar jsonb not null default '{}'::jsonb;
