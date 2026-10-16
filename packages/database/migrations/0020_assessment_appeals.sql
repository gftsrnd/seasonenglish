create unique index if not exists appeals_one_pending_per_attempt
  on appeals (attempt_id) where status = 'pending';
