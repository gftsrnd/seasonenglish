-- Managers can remove a row from the "Lịch sử nhắc" log. The reminder, its
-- deliveries and audit events are kept (reports, eligibility and delivery jobs
-- still read them); the history view only hides rows marked here.
alter table reminders add column if not exists staff_deleted_at timestamptz;
alter table reminders add column if not exists staff_deleted_by uuid references users(id) on delete set null;
