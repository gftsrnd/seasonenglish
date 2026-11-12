-- PIN and password activity of users reaches Managers through the notification bell instead of a
-- separate card in Settings. Every manager_pin_reports row (open help requests and completed
-- self-service PIN changes alike) becomes a 'security_report' notification whose event key points
-- at the report. A repeat of the same activity for the same user folds into the Manager's unread
-- notification: the notification moves to the newest report and its context counts the repeats.
create or replace function notify_security_report() returns trigger language plpgsql as $$
begin
  with grouped as (
    update inbox_notifications n
    set event_key = 'security:' || new.id,
        created_at = new.created_at,
        context = ((case when n.context ~ '^[0-9]+$' then n.context::int else 1 end) + 1)::text
    from manager_pin_reports previous
    where n.organization_id = new.organization_id and n.recipient_role = 'manager'
      and n.kind = 'security_report' and n.read_at is null
      and n.event_key = 'security:' || previous.id
      and previous.id <> new.id
      and previous.subject_user_id = new.subject_user_id and previous.note = new.note
    returning n.recipient_id
  )
  insert into inbox_notifications (organization_id, recipient_id, recipient_role, event_key, kind, context, created_at)
  select u.organization_id, u.id, 'manager', 'security:' || new.id, 'security_report', '1', new.created_at
  from users u
  where u.organization_id = new.organization_id and u.role = 'manager' and u.status = 'active'
    and not exists (select 1 from grouped where grouped.recipient_id = u.id)
  on conflict on constraint inbox_notifications_event_unique do nothing;
  return new;
end;
$$;

-- Reports of the last 30 days that never reached the bell (self-service PIN changes were only
-- shown in the Settings card) are backfilled unread, one notification per user and activity.
with pending as (
  select r.*,
         count(*) over (partition by r.organization_id, r.subject_user_id, r.note) as repeats,
         row_number() over (partition by r.organization_id, r.subject_user_id, r.note order by r.created_at desc, r.id desc) as position
  from manager_pin_reports r
  where r.created_at > now() - interval '30 days'
    and not exists (
      select 1 from inbox_notifications n
      where n.organization_id = r.organization_id and n.kind = 'security_report' and n.event_key = 'security:' || r.id
    )
)
insert into inbox_notifications (organization_id, recipient_id, recipient_role, event_key, kind, context, created_at)
select p.organization_id, manager.id, 'manager', 'security:' || p.id, 'security_report', p.repeats::text, p.created_at
from pending p
join users manager on manager.organization_id = p.organization_id and manager.role = 'manager' and manager.status = 'active'
where p.position = 1
on conflict on constraint inbox_notifications_event_unique do nothing;
