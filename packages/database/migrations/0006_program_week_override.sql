alter table programs
  add column if not exists current_week_override integer;

alter table programs
  drop constraint if exists programs_current_week_override_range;

alter table programs
  add constraint programs_current_week_override_range
  check (
    current_week_override is null
    or (current_week_override >= 1 and current_week_override <= week_count)
  );
