-- A Pass Course certificate and the old automatic lock shared a transaction timestamp.
-- Leave accounts with independent status changes alone.
update users u
set status = 'active', updated_at = now()
from pass_course_certificates c
where u.id = c.learner_id
  and u.organization_id = c.organization_id
  and u.role = 'learner'
  and u.status = 'disabled'
  and u.updated_at = c.issued_at;
