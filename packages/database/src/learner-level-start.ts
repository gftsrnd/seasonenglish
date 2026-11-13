/**
 * SQL for the local date a learner started their current level: the recorded `cefr_started_on`, or for
 * enrolments from before that column the latest of enrolment, applied level change, direct staff change
 * and approved placement. `enrollment` is the alias of the `enrollments` row, `learnerId` the SQL
 * expression of the learner id. Shared by learner monthly access and the month republication.
 */
export function learnerLevelStartedOnSql(enrollment: string, learnerId: string): string {
  return `coalesce(${enrollment}.cefr_started_on, greatest(
           (${enrollment}.enrolled_at at time zone 'Asia/Ho_Chi_Minh')::date,
           (select max((change.effective_at at time zone 'Asia/Ho_Chi_Minh')::date)
              from scheduled_level_changes change where change.learner_id = ${learnerId}
                and change.to_cefr = ${enrollment}.cefr and change.status = 'applied'),
           (select max((event.created_at at time zone 'Asia/Ho_Chi_Minh')::date) from audit_events event
              where event.entity_id = ${learnerId} and event.action = 'assessment.learner.level_changed'
                and event.payload->>'mode' = 'direct' and event.payload->>'targetLevel' = ${enrollment}.cefr
                and event.payload->>'previousLevel' is distinct from ${enrollment}.cefr),
           (select max((decision.decided_at at time zone 'Asia/Ho_Chi_Minh')::date)
              from assessment_decisions decision join assessment_attempts attempt on attempt.id = decision.attempt_id
              join assessment_versions version on version.id = attempt.assessment_version_id
              join assessment_definitions definition on definition.id = version.definition_id
              where attempt.learner_id = ${learnerId} and definition.kind = 'placement'
                and decision.status = 'approved' and decision.approved_level = ${enrollment}.cefr)
         ))`;
}
