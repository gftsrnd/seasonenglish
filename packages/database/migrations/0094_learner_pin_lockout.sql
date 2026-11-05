alter table user_credentials
  add column failed_pin_attempts integer not null default 0,
  add column pin_locked_until timestamptz;

alter table user_credentials
  add constraint user_credentials_failed_pin_attempts_nonnegative
  check (failed_pin_attempts >= 0);
