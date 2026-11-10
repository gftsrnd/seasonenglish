create table monthly_survey_forms (
  organization_id uuid not null references organizations(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and left(month, 4) <> '0000'),
  revision integer not null check (revision > 0),
  version integer not null default 1 check (version > 0),
  title text not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  published_at timestamptz,
  primary key (organization_id, month, revision)
);

create unique index monthly_survey_one_draft
  on monthly_survey_forms (organization_id, month) where published_at is null;

create function prevent_monthly_survey_published_edit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Published monthly survey revisions are immutable';
end
$$;

create trigger monthly_survey_published_immutable
  before update on monthly_survey_forms
  for each row when (old.published_at is not null)
  execute function prevent_monthly_survey_published_edit();

create table monthly_survey_submissions (
  organization_id uuid not null,
  month text not null,
  learner_id uuid not null references users(id) on delete cascade,
  revision integer not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  submitted_at timestamptz not null default now(),
  primary key (organization_id, month, learner_id),
  foreign key (organization_id, month, revision)
    references monthly_survey_forms (organization_id, month, revision) on delete cascade
);

create index monthly_survey_submissions_learner on monthly_survey_submissions (learner_id);
