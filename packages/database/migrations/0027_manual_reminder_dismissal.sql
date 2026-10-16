alter table reminders drop constraint if exists reminders_status_check;

alter table reminders
  add constraint reminders_status_check
  check (status in ('draft', 'queued', 'sent', 'failed', 'cancelled', 'dismissed'));
