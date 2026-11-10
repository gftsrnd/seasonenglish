create function notify_level_cohort(org uuid, source_level text, event_key text, kind text, context text)
returns void language sql as $$
  insert into inbox_notifications (organization_id, recipient_id, recipient_role, event_key, kind, context)
  select distinct u.organization_id, u.id, 'learner', $3, $4, $5
  from users u
  join enrollments e on e.learner_id = u.id and e.cefr = $2 and e.cefr_approved
  join programs p on p.id = e.program_id and p.organization_id = u.organization_id and p.status = 'active'
  where u.organization_id = $1 and u.role = 'learner' and u.status = 'active'
  on conflict on constraint inbox_notifications_event_unique do nothing;
$$;

create function notify_account_audit() returns trigger language plpgsql as $$
declare
  current_role text;
  target text;
  previous text;
  ranks text[] := array['A1','A2','B1','B2','C1'];
  event_key text := 'audit:' || new.id;
begin
  if new.action = 'learner.deletion_requested' then
    if tg_op = 'INSERT' and new.payload->>'status' = 'pending' then
      perform notify_inbox(new.organization_id, 'manager', null, event_key || ':received', 'deletion_received', 'account');
    elsif tg_op = 'UPDATE' and old.payload->>'status' = 'pending' and new.payload->>'status' in ('approved','rejected') then
      perform notify_inbox(new.organization_id, 'operator', coalesce((new.payload->>'requestedBy')::uuid, new.actor_user_id),
        event_key || ':resolved', 'deletion_resolved', new.payload->>'status');
    end if;
  elsif tg_op = 'INSERT' then
    if new.action = 'assessment.learner.level_changed' and new.payload->>'mode' = 'direct' then
      target := new.payload->>'targetLevel';
      previous := new.payload->>'previousLevel';
      if target = any(ranks) and target is distinct from previous then
        perform notify_inbox(new.organization_id, 'learner', new.entity_id, event_key, 'level_changed',
          case when array_position(ranks, previous) > array_position(ranks, target) then 'lower:' else 'level:' end || target);
      end if;
    elsif new.action = 'account.credential.reset' or (new.action = 'account.status.changed'
        and new.payload->>'from' = 'disabled' and new.payload->>'to' = 'active') then
      select role into current_role from users where id = new.entity_id;
      perform notify_inbox(new.organization_id, current_role, new.entity_id, event_key,
        case when new.action = 'account.credential.reset' then 'credential_changed' else 'account_reopened' end, 'account');
    elsif new.action = 'monthly.framework_retired' or (new.action = 'monthly.framework_reopened'
        and coalesce((new.payload->>'approvedLessonCount')::integer, 0) > 0) then
      perform notify_level_cohort(new.organization_id, new.payload->>'cefr', event_key, 'lesson_availability_changed', new.payload->>'month');
    end if;
  end if;
  return new;
end;
$$;

create trigger inbox_account_audit after insert or update of payload on audit_events
for each row when (new.action in ('learner.deletion_requested','assessment.learner.level_changed',
  'account.credential.reset','account.status.changed','monthly.framework_retired','monthly.framework_reopened'))
execute function notify_account_audit();

create function notify_monthly_lesson_publication() returns trigger language plpgsql as $$
declare
  lesson_org uuid;
  lesson_level text;
  lesson_month text;
  framework uuid;
begin
  if tg_table_name = 'month_lessons' then
    if new.status <> 'approved' or old.status = 'approved' or new.lesson_id is null then return new; end if;
    framework := new.framework_id;
  else
    if new.status <> 'published' or old.status = 'published' then return new; end if;
    select framework_id into framework from month_lessons where id = new.month_lesson_id;
  end if;
  select pm.organization_id, mf.cefr, pm.month into lesson_org, lesson_level, lesson_month
  from month_frameworks mf join program_months pm on pm.id = mf.program_month_id
  where mf.id = framework;
  perform notify_level_cohort(lesson_org, lesson_level,
    'lesson-update:' || framework || ':' || organization_system_date(lesson_org), 'lesson_published', lesson_month);
  return new;
end;
$$;

create trigger inbox_monthly_lesson_publication after update of status on month_lessons
for each row execute function notify_monthly_lesson_publication();
create trigger inbox_monthly_lesson_correction after update of status on month_lesson_corrections
for each row execute function notify_monthly_lesson_publication();

create function notify_assessment_publication() returns trigger language plpgsql as $$
declare
  definition assessment_definitions%rowtype;
  exam_level text;
  exam_month text;
begin
  if new.status <> 'published' or old.status = 'published' then return new; end if;
  select * into definition from assessment_definitions where id = new.definition_id;
  if definition.kind = 'final' and definition.assessment_key ~ '^monthly-final-[0-9]{4}-[0-9]{2}-(a1|a2|b1|b2|c1)$' then
    exam_level := upper(right(definition.assessment_key, 2));
    exam_month := substring(definition.assessment_key from 15 for 7);
    perform notify_level_cohort(definition.organization_id, exam_level, 'exam-publication:' || new.id, 'monthly_exam_published', exam_month);
  elsif definition.kind = 'level_up' then
    exam_level := case new.blueprint->>'targetLevel' when 'A2' then 'A1' when 'B1' then 'A2' when 'B2' then 'B1' when 'C1' then 'B2' end;
    perform notify_level_cohort(definition.organization_id, exam_level, 'exam-publication:' || new.id, 'level_exam_published', new.blueprint->>'targetLevel');
  end if;
  return new;
end;
$$;

create trigger inbox_assessment_publication after update of status on assessment_versions
for each row execute function notify_assessment_publication();

create function notify_game_change() returns trigger language plpgsql as $$
declare
  org uuid;
begin
  if tg_table_name = 'topic_reports' then
    select organization_id into org from users where id = new.learner_id;
    if tg_op = 'INSERT' and new.status = 'open' then
      perform notify_inbox(org, 'operator', null, 'topic:' || new.id || ':open', 'topic_report_received', 'games');
    elsif tg_op = 'UPDATE' and old.status = 'open' and new.status = 'resolved' then
      perform notify_inbox(org, 'learner', new.learner_id, 'topic:' || new.id || ':resolved', 'topic_report_resolved', 'games');
    end if;
  else
    select organization_id into org from users where id = new.challenger_id;
    if tg_op = 'INSERT' and new.state = 'open' then
      perform notify_inbox(org, 'learner', new.opponent_id, 'duel:' || new.id || ':invited', 'duel_invited', 'games');
    elsif tg_op = 'UPDATE' and old.state = 'open' and new.state = 'completed' then
      perform notify_inbox(org, 'learner', new.challenger_id, 'duel:' || new.id || ':completed', 'duel_completed', 'games');
      perform notify_inbox(org, 'learner', new.opponent_id, 'duel:' || new.id || ':completed', 'duel_completed', 'games');
    end if;
  end if;
  return new;
end;
$$;

create trigger inbox_topic_report after insert or update of status on topic_reports
for each row execute function notify_game_change();
create trigger inbox_duel_change after insert or update of state on duels
for each row execute function notify_game_change();

create function notify_progression_change() returns trigger language plpgsql as $$
declare
  org uuid;
begin
  if tg_table_name = 'pass_course_readiness' then
    if new.cefr_ready and (tg_op = 'INSERT' or not old.cefr_ready) then
      perform notify_inbox(new.organization_id, 'learner', new.learner_id,
        'course-ready:' || new.learner_id || ':' || new.updated_at, 'course_ready', 'pass_course');
    end if;
  elsif tg_table_name = 'pass_course_certificates' then
    perform notify_inbox(new.organization_id, 'operator', new.issued_by, 'certificate:' || new.id, 'certificate_issued', 'pass_course');
  elsif tg_table_name = 'level_up_challenge_results' then
    select organization_id into org from users where id = new.learner_id;
    if new.passed then
      perform notify_inbox(org, 'operator', null, 'level-challenge:' || new.id || ':passed', 'challenge_received', 'level_up');
    end if;
    perform notify_inbox(org, 'learner', new.learner_id, 'level-challenge:' || new.id || ':finished',
      case when new.passed then 'challenge_passed' else 'challenge_retry' end, 'level_up');
  else
    select organization_id into org from users where id = new.learner_id;
    if new.to_cefr <> 'C1' and ((tg_op = 'INSERT' and new.status = 'applied') or (tg_op = 'UPDATE' and old.status <> 'applied' and new.status = 'applied')) then
      perform notify_inbox(org, 'learner', new.learner_id, 'level-effective:' || new.id, 'level_changed', 'level:' || new.to_cefr);
    end if;
  end if;
  return new;
end;
$$;

create trigger inbox_course_readiness after insert or update of cefr_ready on pass_course_readiness
for each row execute function notify_progression_change();
create trigger inbox_course_certificate after insert on pass_course_certificates
for each row execute function notify_progression_change();
create trigger inbox_level_challenge after insert on level_up_challenge_results
for each row execute function notify_progression_change();
create trigger inbox_level_effective after insert or update of status on scheduled_level_changes
for each row execute function notify_progression_change();

select notify_inbox(a.organization_id, 'manager', null, 'audit:' || a.id || ':received', 'deletion_received', 'account')
from audit_events a where a.action = 'learner.deletion_requested' and a.payload->>'status' = 'pending';

create function notify_self_pin_reset() returns trigger language plpgsql as $$
begin
  perform notify_inbox(new.organization_id, 'learner', new.subject_user_id, 'pin-reset:' || new.id, 'credential_changed', 'account');
  return new;
end;
$$;

create trigger inbox_self_pin_reset after insert on manager_pin_reports
for each row when (new.status = 'done' and new.created_by = new.subject_user_id)
execute function notify_self_pin_reset();
