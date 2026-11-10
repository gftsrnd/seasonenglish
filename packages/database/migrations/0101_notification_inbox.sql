create table inbox_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  recipient_id uuid not null references users(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('learner', 'operator', 'manager')),
  event_key text not null,
  kind text not null,
  context text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint inbox_notifications_event_unique unique (organization_id, recipient_id, event_key)
);

create index inbox_notifications_page_idx
  on inbox_notifications (recipient_id, organization_id, recipient_role, created_at desc, id desc);
create index inbox_notifications_unread_idx
  on inbox_notifications (recipient_id, organization_id, recipient_role) where read_at is null;

create function notify_inbox(org uuid, target_role text, target_user uuid, event_key text, kind text, context text)
returns void language sql as $$
  insert into inbox_notifications (organization_id, recipient_id, recipient_role, event_key, kind, context)
  select organization_id, id, role, $4, $5, $6
  from users
  where organization_id = $1 and role = $2 and status = 'active' and ($3 is null or id = $3)
  on conflict on constraint inbox_notifications_event_unique do nothing;
$$;

create function notify_complaint_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform notify_inbox(new.organization_id, 'manager', null, 'complaint:' || new.id || ':received', 'complaint_received', new.kind);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected', 'auto_approved') then
    perform notify_inbox(new.organization_id, 'learner', new.learner_id, 'complaint:' || new.id || ':resolved',
      case when new.status = 'rejected' then 'complaint_rejected' else 'complaint_approved' end, new.kind);
  end if;
  return new;
end;
$$;

create trigger inbox_complaint_change after insert or update of status on learner_complaints
for each row execute function notify_complaint_change();

create function notify_reopen_change() returns trigger language plpgsql as $$
declare
  requester_org uuid;
  context text := case when tg_table_name = 'month_framework_reopen_requests' then 'resources' else 'lesson' end;
  event_key text := 'reopen:' || context || ':' || new.id;
begin
  select organization_id into requester_org from users where id = new.requested_by;
  if tg_op = 'INSERT' and new.status = 'requested' then
    perform notify_inbox(requester_org, 'manager', null, event_key || ':received', 'reopen_received', context);
  elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status in ('authorized', 'rejected') then
    perform notify_inbox(requester_org, 'operator', new.requested_by, event_key || ':resolved',
      case when new.status = 'authorized' then 'reopen_approved' else 'reopen_rejected' end, context);
  end if;
  return new;
end;
$$;

create trigger inbox_resources_reopen after insert or update of status on month_framework_reopen_requests
for each row execute function notify_reopen_change();
create trigger inbox_lesson_reopen after insert or update of status on month_lesson_corrections
for each row execute function notify_reopen_change();

create function notify_assessment_change() returns trigger language plpgsql as $$
declare
  exam_kind text;
  exam_org uuid;
begin
  if new.status = old.status then return new; end if;
  select d.kind, d.organization_id into exam_kind, exam_org
    from assessment_versions v join assessment_definitions d on d.id = v.definition_id
    where v.id = new.assessment_version_id;
  if new.status = 'pending_review' and old.status in ('in_progress', 'submitted') then
    perform notify_inbox(exam_org, 'operator', null, 'assessment:' || new.id || ':submitted', 'assessment_received', exam_kind);
  elsif new.status in ('approved', 'needs_retry') then
    perform notify_inbox(exam_org, 'learner', new.learner_id, 'assessment:' || new.id || ':' || new.status,
      case when new.status = 'approved' then 'assessment_result' else 'assessment_retry' end, exam_kind);
  end if;
  return new;
end;
$$;

create trigger inbox_assessment_change after update of status on assessment_attempts
for each row execute function notify_assessment_change();

create function notify_security_report() returns trigger language plpgsql as $$
begin
  if new.status = 'open' then
    perform notify_inbox(new.organization_id, 'manager', null, 'security:' || new.id, 'security_report', 'account');
  end if;
  return new;
end;
$$;

create trigger inbox_security_report after insert on manager_pin_reports
for each row execute function notify_security_report();

insert into inbox_notifications (organization_id, recipient_id, recipient_role, event_key, kind, context, created_at)
select c.organization_id, manager.id, 'manager', 'complaint:' || c.id || ':received', 'complaint_received', c.kind, c.submitted_at
from learner_complaints c
join users manager on manager.organization_id = c.organization_id and manager.role = 'manager' and manager.status = 'active'
where c.status = 'pending'
on conflict do nothing;


create function notify_appeal_change() returns trigger language plpgsql as $$
declare
  learner_org uuid;
  context text := case tg_table_name when 'appeals' then 'assessment' when 'practice_appeals' then 'practice' else 'lesson' end;
  event_key text := 'appeal:' || context || ':' || new.id;
begin
  select organization_id into learner_org from users where id = new.learner_id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform notify_inbox(learner_org, 'operator', null, event_key || ':received', 'appeal_received', context);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'rejected') then
    perform notify_inbox(learner_org, 'learner', new.learner_id, event_key || ':resolved',
      case when new.status = 'accepted' then 'appeal_approved' else 'appeal_rejected' end, context);
  end if;
  return new;
end;
$$;

create trigger inbox_assessment_appeal after insert or update of status on appeals
for each row execute function notify_appeal_change();
create trigger inbox_practice_appeal after insert or update of status on practice_appeals
for each row execute function notify_appeal_change();
create trigger inbox_lesson_appeal after insert or update of status on lesson_part_appeals
for each row execute function notify_appeal_change();

create function notify_sent_reminder() returns trigger language plpgsql as $$
declare
  learner_org uuid;
begin
  if new.status = 'sent' and new.reason = 'inactive_learning' then
    select organization_id into learner_org from users where id = new.learner_id;
    perform notify_inbox(learner_org, 'learner', new.learner_id,
      'reminder:' || new.learner_id || ':' || organization_system_date(learner_org), 'learning_reminder', 'learning');
  end if;
  return new;
end;
$$;

create trigger inbox_sent_reminder after update of status on reminders
for each row execute function notify_sent_reminder();

select notify_inbox(d.organization_id, 'operator', null, 'assessment:' || attempt.id || ':submitted', 'assessment_received', d.kind)
from assessment_attempts attempt
join assessment_versions version on version.id = attempt.assessment_version_id
join assessment_definitions d on d.id = version.definition_id
where attempt.status = 'pending_review';

select notify_inbox(u.organization_id, 'manager', null, 'reopen:resources:' || request.id || ':received', 'reopen_received', 'resources')
from month_framework_reopen_requests request join users u on u.id = request.requested_by
where request.status = 'requested';

select notify_inbox(u.organization_id, 'manager', null, 'reopen:lesson:' || request.id || ':received', 'reopen_received', 'lesson')
from month_lesson_corrections request join users u on u.id = request.requested_by
where request.status = 'requested';

select notify_inbox(report.organization_id, 'manager', null, 'security:' || report.id, 'security_report', 'account')
from manager_pin_reports report where report.status = 'open';
