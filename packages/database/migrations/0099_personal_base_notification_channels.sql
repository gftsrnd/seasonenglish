create table learner_base_notification_channels (
  learner_id uuid primary key references users(id) on delete cascade,
  secret_ciphertext text not null,
  secret_nonce text not null,
  secret_auth_tag text not null,
  webhook_template text not null default '{"base_content":"{message}"}',
  destination_label text not null,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Freeze the destination chosen by the manager; editing a channel cannot redirect a queued send.
create table reminder_base_destinations (
  reminder_id uuid primary key references reminders(id) on delete cascade,
  secret_ciphertext text not null,
  secret_nonce text not null,
  secret_auth_tag text not null,
  webhook_template text not null,
  destination_label text not null
);

-- Retain historical/global settings at rest, but never infer personal recipients from them.
-- Old unsent deliveries have no recipient-specific authorization and must be re-created explicitly.
with blocked as (
  update notification_deliveries
  set status = 'failed', response = '{"code":"BASE_RECIPIENT_CONFIGURATION_REQUIRED"}'::jsonb
  where provider = 'base_webhook' and status = 'queued'
  returning reminder_id
)
update reminders set status = 'failed'
where status = 'queued' and id in (select reminder_id from blocked);
