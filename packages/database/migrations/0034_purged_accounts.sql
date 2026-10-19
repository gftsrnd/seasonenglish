alter table users drop constraint if exists users_status_check;

alter table users
  add constraint users_status_check
  check (status in ('active', 'disabled', 'deleted', 'purged'));
