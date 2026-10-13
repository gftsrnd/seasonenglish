create unique index assessment_active_attempt_unique
  on assessment_attempts (learner_id, assessment_version_id)
  where status in ('in_progress', 'submitted', 'pending_review');

create unique index assessment_score_section_unique
  on assessment_scores (attempt_id, section);

create index assessment_responses_attempt_section_idx
  on assessment_responses (attempt_id, section, saved_at desc);
