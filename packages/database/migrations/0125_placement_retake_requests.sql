-- Learner retake request ("Xin thi lại") on the existing appeal plumbing (owner decision 11/2026).
--
-- For the placement test the support page shows only a "Xin thi lại" button (no free-text appeal).
-- It creates an appeals row with request_kind 'retake'; the Operator accepts (= grants the one
-- retake, assessment_retake_grants) or rejects it through the usual appeal decision. An approved
-- learner may ask only within 72 hours of the placement decision, like the appeal window.
alter table appeals add column if not exists request_kind text not null default 'appeal';
alter table appeals drop constraint if exists appeals_request_kind_check;
alter table appeals add constraint appeals_request_kind_check check (request_kind in ('appeal', 'retake'));

-- Bell: the Operator gets "Yêu cầu thi lại" (appeal_received, context 'retake'); the learner gets
-- the rejection (appeal_rejected, context 'retake'). An accepted request is announced by the
-- grant itself ('retake_granted', migration 0124), so it is not notified twice.
create or replace function notify_appeal_change() returns trigger language plpgsql as $$
declare
  learner_org uuid;
  context text := case tg_table_name when 'appeals' then 'assessment' when 'practice_appeals' then 'practice' else 'lesson' end;
  event_key text;
begin
  -- Nested on purpose: only the appeals table has request_kind.
  if tg_table_name = 'appeals' then
    if new.request_kind = 'retake' then context := 'retake'; end if;
  end if;
  event_key := 'appeal:' || context || ':' || new.id;
  select organization_id into learner_org from users where id = new.learner_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform notify_inbox(learner_org, 'operator', null, event_key || ':received', 'appeal_received', context);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'rejected') then
    if context = 'retake' and new.status = 'accepted' then return new; end if;
    perform notify_inbox(learner_org, 'learner', new.learner_id, event_key || ':resolved',
      case when new.status = 'accepted' then 'appeal_approved' else 'appeal_rejected' end, context);
  end if;
  return new;
end;
$$;
