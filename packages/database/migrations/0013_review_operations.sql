alter table practice_submissions add column if not exists operator_checked boolean not null default false;
alter table practice_submissions add column if not exists checked_by uuid references users(id);
