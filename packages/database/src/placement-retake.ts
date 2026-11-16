import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AssessmentRetakeStatus, AssessmentSectionCode } from "@e4s/contracts";
import type { StoredAssessmentDefinition } from "./assessment-blueprints.js";

/**
 * One placement retake per learner (owner decision 11/2026).
 *
 * - The Operator grants it once (decision "Cho thi lại 1 lần", or from the learner's record after
 *   the learner asked, e.g. through an appeal). `assessment_retake_grants` (migration 0124) has a
 *   unique (learner_id, kind) constraint, so a second grant is refused by the database as well.
 * - The retake runs on a separate, AI-generated and Operator-published form whose definition key
 *   is `placement-retake` (kind `placement`), never on the canonical `placement-a` attempt.
 * - Starting the retake creates a NEW attempt and marks the grant used in the same transaction.
 * - The Operator's decision on the retake attempt is the final placement: it cannot be sent back.
 */
export const PLACEMENT_RETAKE_ASSESSMENT_KEY = "placement-retake";

/** Learner-facing and Operator-facing max: the number of retakes a learner may ever be granted. */
export const PLACEMENT_RETAKE_LIMIT = 1;

export type PlacementRetakeRefusal =
  | "PLACEMENT_RETAKE_ALREADY_GRANTED"
  | "PLACEMENT_RETAKE_NOT_AVAILABLE"
  | "PLACEMENT_RETAKE_FORM_NOT_PUBLISHED";

export class PlacementRetakeError extends Error {
  constructor(readonly code: PlacementRetakeRefusal | "PLACEMENT_RETAKE_FINAL") {
    super(code);
  }
}

export interface PlacementRetakeGrantRecord {
  id: string;
  organizationId: string;
  learnerId: string;
  sourceAttemptId: string | null;
  retakeAttemptId: string | null;
  reason: string;
  grantedBy: string | null;
  grantedAt: Date;
  usedAt: Date | null;
}

type Db = Pool | PoolClient;

export function placementRetakeStatus(grant: Pick<PlacementRetakeGrantRecord, "usedAt" | "retakeAttemptId"> | null | undefined): AssessmentRetakeStatus {
  if (!grant) return "not_granted";
  return grant.usedAt || grant.retakeAttemptId ? "used" : "granted";
}

/**
 * Pure grant rule. A retake can be granted only once, only after a placement result exists
 * (sent back for retry, or approved but disputed by the learner), and only when a published
 * retake form is ready for the learner to start.
 */
export function placementRetakeGrantRefusal(input: {
  grantCount: number;
  latestPlacementStatus: string | null;
  publishedRetakeForm: boolean;
}): PlacementRetakeRefusal | null {
  if (input.grantCount >= PLACEMENT_RETAKE_LIMIT) return "PLACEMENT_RETAKE_ALREADY_GRANTED";
  if (input.latestPlacementStatus !== "needs_retry" && input.latestPlacementStatus !== "approved") return "PLACEMENT_RETAKE_NOT_AVAILABLE";
  if (!input.publishedRetakeForm) return "PLACEMENT_RETAKE_FORM_NOT_PUBLISHED";
  return null;
}

interface GrantRow {
  id: string; organization_id: string; learner_id: string; source_attempt_id: string | null;
  retake_attempt_id: string | null; reason: string; granted_by: string | null; granted_at: Date; used_at: Date | null;
}

function grantRecord(row: GrantRow): PlacementRetakeGrantRecord {
  return {
    id: row.id, organizationId: row.organization_id, learnerId: row.learner_id,
    sourceAttemptId: row.source_attempt_id, retakeAttemptId: row.retake_attempt_id, reason: row.reason,
    grantedBy: row.granted_by, grantedAt: row.granted_at, usedAt: row.used_at
  };
}

export async function findPlacementRetakeGrant(db: Db, learnerId: string, options: { forUpdate?: boolean } = {}): Promise<PlacementRetakeGrantRecord | null> {
  const result = await db.query<GrantRow>(
    `select id, organization_id, learner_id, source_attempt_id, retake_attempt_id, reason, granted_by, granted_at, used_at
     from assessment_retake_grants where learner_id = $1 and kind = 'placement'${options.forUpdate ? " for update" : ""}`,
    [learnerId]
  );
  return result.rows[0] ? grantRecord(result.rows[0]) : null;
}

export interface PublishedPlacementRetakeForm {
  definitionId: string;
  versionId: string;
  assessmentKey: string;
  kind: "placement";
  title: string;
  version: number;
  blueprint: StoredAssessmentDefinition;
}

/** The learner's organisation's currently published placement-retake form. */
export async function findPublishedPlacementRetakeForm(db: Db, learnerId: string): Promise<PublishedPlacementRetakeForm | null> {
  const result = await db.query<{
    definition_id: string; version_id: string; assessment_key: string; title: string; version: number; blueprint: StoredAssessmentDefinition;
  }>(
    `select ad.id as definition_id, av.id as version_id, ad.assessment_key, ad.title, av.version, av.blueprint
     from users learner
     join assessment_definitions ad on ad.organization_id = learner.organization_id
       and ad.kind = 'placement' and ad.assessment_key = $2
     join assessment_versions av on av.definition_id = ad.id and av.status = 'published'
     where learner.id = $1
     order by av.published_at desc nulls last, av.version desc limit 1`,
    [learnerId, PLACEMENT_RETAKE_ASSESSMENT_KEY]
  );
  const row = result.rows[0];
  return row ? {
    definitionId: row.definition_id, versionId: row.version_id, assessmentKey: row.assessment_key,
    kind: "placement", title: row.title, version: row.version, blueprint: row.blueprint
  } : null;
}

/**
 * Grant the one retake inside the caller's transaction (the decision route uses it together with
 * the needs_retry decision). Throws PlacementRetakeError when the rule refuses it.
 */
export async function grantPlacementRetakeInTransaction(client: PoolClient, input: {
  learnerId: string;
  reviewerId: string;
  reason: string;
}): Promise<PlacementRetakeGrantRecord> {
  const learner = await client.query<{ organization_id: string }>(
    `select learner.organization_id from users learner
     join users reviewer on reviewer.id = $2 and reviewer.organization_id = learner.organization_id and reviewer.role = 'operator'
     where learner.id = $1 and learner.role = 'learner'
     for update of learner`,
    [input.learnerId, input.reviewerId]
  );
  const organizationId = learner.rows[0]?.organization_id;
  if (!organizationId) throw new PlacementRetakeError("PLACEMENT_RETAKE_NOT_AVAILABLE");
  // Sequential on purpose: one client, one transaction.
  const grants = await client.query<{ count: string }>(
    "select count(*)::text as count from assessment_retake_grants where learner_id = $1 and kind = 'placement'", [input.learnerId]
  );
  const latest = await client.query<{ id: string; status: string }>(
    `select aa.id, aa.status from assessment_attempts aa
     join assessment_versions av on av.id = aa.assessment_version_id
     join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
     where aa.learner_id = $1
     order by aa.started_at desc limit 1`,
    [input.learnerId]
  );
  const form = await findPublishedPlacementRetakeForm(client, input.learnerId);
  const refusal = placementRetakeGrantRefusal({
    grantCount: Number(grants.rows[0]?.count ?? 0),
    latestPlacementStatus: latest.rows[0]?.status ?? null,
    publishedRetakeForm: Boolean(form)
  });
  if (refusal) throw new PlacementRetakeError(refusal);
  const id = randomUUID();
  try {
    await client.query("savepoint placement_retake_grant");
    await client.query(
      `insert into assessment_retake_grants (id, organization_id, learner_id, kind, source_attempt_id, reason, granted_by)
       values ($1, $2, $3, 'placement', $4, $5, $6)`,
      [id, organizationId, input.learnerId, latest.rows[0]?.id ?? null, input.reason, input.reviewerId]
    );
    await client.query("release savepoint placement_retake_grant");
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    await client.query("rollback to savepoint placement_retake_grant");
    throw new PlacementRetakeError("PLACEMENT_RETAKE_ALREADY_GRANTED");
  }
  await client.query(
    `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
     values ($1, $2, $3, 'assessment.placement-retake.granted', 'user', $4, $5::jsonb, $6)`,
    [randomUUID(), organizationId, input.reviewerId, input.learnerId,
      JSON.stringify({ grantId: id, sourceAttemptId: latest.rows[0]?.id ?? null, reason: input.reason }), randomUUID()]
  );
  return (await findPlacementRetakeGrant(client, input.learnerId))!;
}

export async function grantPlacementRetake(pool: Pool, input: { learnerId: string; reviewerId: string; reason: string }): Promise<PlacementRetakeGrantRecord> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const grant = await grantPlacementRetakeInTransaction(client, input);
    await client.query("commit");
    return grant;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** True when this attempt is a learner's one placement retake (its decision is final). */
export async function isPlacementRetakeAttempt(db: Db, attemptId: string): Promise<boolean> {
  const result = await db.query<{ retake: boolean }>(
    "select exists(select 1 from assessment_retake_grants where retake_attempt_id = $1 and kind = 'placement') as retake",
    [attemptId]
  );
  return Boolean(result.rows[0]?.retake);
}

/**
 * Use the granted retake: create a NEW in-progress attempt on the published retake form and mark
 * the grant used, atomically. Returns the existing retake attempt id when it was already started
 * (double click / second device), or null when there is no unused grant.
 */
export async function startPlacementRetakeAttempt(pool: Pool, input: {
  learnerId: string;
  assessmentVersionId: string;
  firstSection: AssessmentSectionCode;
  durationMinutes: number;
  violationLimit: number;
  ownerSessionId: string | null;
}): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const grant = await findPlacementRetakeGrant(client, input.learnerId, { forUpdate: true });
    if (!grant) { await client.query("rollback"); return null; }
    if (grant.retakeAttemptId) { await client.query("commit"); return grant.retakeAttemptId; }
    if (grant.usedAt) { await client.query("rollback"); return null; }
    const id = randomUUID();
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + input.durationMinutes * 60_000);
    const timingState = { sections: { [input.firstSection]: { startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() } } };
    await client.query(
      `insert into assessment_attempts
         (id, assessment_version_id, learner_id, status, current_section, timing_state, violation_limit, started_at, updated_at, owner_session_id)
       values ($1, $2, $3, 'in_progress', $4, $5::jsonb, $6, $7, $7, $8)`,
      [id, input.assessmentVersionId, input.learnerId, input.firstSection, JSON.stringify(timingState), input.violationLimit, startedAt, input.ownerSessionId]
    );
    await client.query(
      "update assessment_retake_grants set retake_attempt_id = $2, used_at = $3 where id = $1",
      [grant.id, id, startedAt]
    );
    await client.query("commit");
    return id;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Retake state of every learner in the reviewer's organisation that has a grant (absent = not granted). */
export async function listPlacementRetakeStates(db: Db, reviewerId: string): Promise<Map<string, { status: AssessmentRetakeStatus; retakeAttemptId: string | null }>> {
  const result = await db.query<{ learner_id: string; retake_attempt_id: string | null; used_at: Date | null }>(
    `select g.learner_id, g.retake_attempt_id, g.used_at
     from assessment_retake_grants g
     join users reviewer on reviewer.id = $1 and reviewer.organization_id = g.organization_id
     where g.kind = 'placement'`,
    [reviewerId]
  );
  return new Map(result.rows.map((row) => [row.learner_id, {
    status: placementRetakeStatus({ usedAt: row.used_at, retakeAttemptId: row.retake_attempt_id }),
    retakeAttemptId: row.retake_attempt_id
  }]));
}

/** Number of placement attempts a learner has made (canonical + retake). */
export async function placementAttemptCount(db: Db, learnerId: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `select count(*)::text as count from assessment_attempts aa
     join assessment_versions av on av.id = aa.assessment_version_id
     join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
     where aa.learner_id = $1`,
    [learnerId]
  );
  return Number(result.rows[0]?.count ?? 0);
}
