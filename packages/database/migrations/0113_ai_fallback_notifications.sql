create function notify_assessment_grading_interrupted() returns trigger language plpgsql as $$
declare
  attempt_id uuid;
  exam_kind text;
  exam_org uuid;
  learner uuid;
  event_key text;
begin
  if coalesce(new.payload->>'attemptId', '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    return new;
  end if;
  attempt_id := (new.payload->>'attemptId')::uuid;

  select d.kind, d.organization_id, a.learner_id into exam_kind, exam_org, learner
    from assessment_attempts a
    join assessment_versions v on v.id = a.assessment_version_id
    join assessment_definitions d on d.id = v.definition_id
    where a.id = attempt_id
      and a.learner_id::text = new.payload->>'learnerId'
      and a.status = 'pending_review'
      and (select count(distinct s.section) from assessment_scores s
        where s.attempt_id = a.id and s.section in ('writing', 'speaking')) < 2;
  if not found then return new; end if;

  event_key := 'assessment:' || attempt_id;
  insert into inbox_notifications (organization_id, recipient_id, recipient_role, event_key, kind, context)
    select organization_id, id, role, event_key || ':submitted', 'assessment_manual_review', exam_kind
    from users where organization_id = exam_org and role = 'operator' and status = 'active'
    on conflict on constraint inbox_notifications_event_unique do update
      set kind = excluded.kind, read_at = null, created_at = excluded.created_at
      where inbox_notifications.recipient_role = 'operator' and inbox_notifications.kind = 'assessment_received';

  perform notify_inbox(exam_org, 'learner', learner, event_key || ':saved', 'assessment_submission_saved', exam_kind);
  perform notify_inbox(exam_org, 'manager', null,
    'assessment-grading:' || exam_kind || ':' || organization_system_date(exam_org), 'assessment_grading_interrupted', exam_kind);
  return new;
end;
$$;

create trigger inbox_assessment_grading_interrupted after update of state on jobs
for each row
when (new.kind = 'assessment.ai-score-auto' and new.state in ('failed', 'dead') and new.state is distinct from old.state)
execute function notify_assessment_grading_interrupted();

create function notify_season_feedback_interrupted() returns trigger language plpgsql as $$
declare
  event_key text := 'season-feedback:' || (new.payload->>'practiceDate');
begin
  perform notify_inbox(new.organization_id, 'learner', new.actor_user_id, event_key, 'season_turn_credited', 'season');
  perform notify_inbox(new.organization_id, 'operator', null, event_key, 'season_feedback_interrupted', 'season');
  perform notify_inbox(new.organization_id, 'manager', null, event_key, 'season_service_interrupted', 'season');
  return new;
end;
$$;

create trigger inbox_season_feedback_interrupted after insert on audit_events
for each row
when (new.action = 'coach.practice_turn_credited_during_outage' and new.actor_user_id is not null and new.payload->>'practiceDate' is not null)
execute function notify_season_feedback_interrupted();
