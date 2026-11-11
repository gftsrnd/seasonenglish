-- Learner-scoped lookups used by the Operator dashboard (/op) overview:
-- level-up challenge sessions (listReviewFlow, progress dashboards) and
-- approved enrollments by learner. Neither had a learner-leading index.
create index if not exists coach_sessions_learner_started_idx on coach_sessions (learner_id, started_at desc);
create index if not exists enrollments_learner_idx on enrollments (learner_id);
