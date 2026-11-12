-- Operator/Manager exception: allow one learner to take the level-up test now, without the
-- months of readiness history. The grant targets the next level from `from_cefr` and is honoured
-- by level readiness only while it is open, the learner is still at `from_cefr`, and no level-up
-- attempt started after the grant has been decided (approved or sent back for retry). Revoking or
-- re-granting closes the open row; history is kept for audit.
create table if not exists level_up_overrides (
  id uuid primary key,
  organization_id uuid not null references organizations(id),
  learner_id uuid not null references users(id) on delete cascade,
  from_cefr text not null check (from_cefr in ('A1', 'A2', 'B1', 'B2')),
  target_cefr text not null check (target_cefr in ('A2', 'B1', 'B2', 'C1')),
  reason text not null,
  granted_by uuid references users(id) on delete set null,
  granted_at timestamptz not null default now(),
  ended_by uuid references users(id) on delete set null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('revoked', 'superseded')),
  end_note text
);

create unique index if not exists level_up_overrides_open_learner_idx
  on level_up_overrides (learner_id) where ended_at is null;
create index if not exists level_up_overrides_org_idx
  on level_up_overrides (organization_id, granted_at desc);
