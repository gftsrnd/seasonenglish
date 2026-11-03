-- Retiring a released monthly resource set preserves every immutable lesson
-- version and audit record.  It only removes that set from future discovery
-- and allows a fresh replacement framework to be authored for the same month
-- and CEFR after a Manager has recorded why the old set was invalid.
alter table month_frameworks drop constraint if exists month_frameworks_status_check;
alter table month_frameworks add constraint month_frameworks_status_check
  check (status in ('draft', 'generating', 'approved', 'failed', 'retired'));

alter table month_frameworks drop constraint if exists month_frameworks_program_month_id_cefr_key;
drop index if exists month_frameworks_program_month_cefr_unique;
create unique index if not exists month_frameworks_active_program_month_cefr_unique
  on month_frameworks (program_month_id, cefr)
  where status <> 'retired';
