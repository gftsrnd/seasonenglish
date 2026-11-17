import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AssessmentRetakeStatus, AssessmentSectionCode } from "@e4s/contracts";
import { placementDefinition, type StoredAssessmentDefinition } from "./assessment-blueprints.js";

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

/**
 * The retake form must have exactly placement-a's structure (owner decision): the same sections,
 * durations and points, the same groups with the same item counts and item scores (Listening
 * 4 × 1 + 6 × 1 + 5 × 2 = 20, Reading 4 × 10 × 1 = 40, Writing 7 + 13, Speaking 4 × 5), the same
 * response types and the same writing word limits. Derived from the canonical blueprint so the
 * two can never drift apart.
 */
export interface PlacementStructure {
  totalMinutes: number;
  totalScore: number;
  sections: Array<{
    code: AssessmentSectionCode;
    durationMinutes: number;
    maxScore: number;
    groups: Array<Array<{ responseType: string; maxScore: number; minWords?: number; maxWords?: number }>>;
  }>;
}

export function placementStructureOf(definition: StoredAssessmentDefinition): PlacementStructure {
  return {
    totalMinutes: definition.totalMinutes,
    totalScore: definition.totalScore,
    sections: definition.sections.map((section) => ({
      code: section.code,
      durationMinutes: section.durationMinutes,
      maxScore: section.maxScore,
      groups: section.groups.map((group) => group.tasks.map((task) => ({
        responseType: task.responseType,
        maxScore: task.maxScore,
        ...(task.minWords === undefined ? {} : { minWords: task.minWords }),
        ...(task.maxWords === undefined ? {} : { maxWords: task.maxWords })
      })))
    }))
  };
}

export const PLACEMENT_RETAKE_STRUCTURE: PlacementStructure = placementStructureOf(placementDefinition);

const SECTION_NAMES: Record<AssessmentSectionCode, string> = { listening: "Nghe", reading: "Đọc", writing: "Viết", speaking: "Nói" };

/** Deterministic structure check of a retake form against placement-a. Empty = identical structure. */
export function placementRetakeStructureIssues(blueprint: StoredAssessmentDefinition, expected: PlacementStructure = PLACEMENT_RETAKE_STRUCTURE): string[] {
  const issues: string[] = [];
  const actual = placementStructureOf(blueprint);
  if (actual.totalMinutes !== expected.totalMinutes || actual.totalScore !== expected.totalScore) {
    issues.push(`Tổng phải là ${expected.totalMinutes} phút / ${expected.totalScore} điểm như đề đầu vào gốc.`);
  }
  if (actual.sections.map((section) => section.code).join() !== expected.sections.map((section) => section.code).join()) {
    issues.push("Đề thi lại phải có đúng bốn phần Nghe, Đọc, Viết, Nói theo thứ tự của đề đầu vào gốc.");
    return issues;
  }
  expected.sections.forEach((want, index) => {
    const have = actual.sections[index]!;
    const name = SECTION_NAMES[want.code];
    if (have.durationMinutes !== want.durationMinutes || have.maxScore !== want.maxScore) {
      issues.push(`Phần ${name} phải là ${want.durationMinutes} phút / ${want.maxScore} điểm.`);
    }
    const counts = (groups: PlacementStructure["sections"][number]["groups"]) => groups.map((group) => group.length);
    if (counts(have.groups).join() !== counts(want.groups).join()) {
      issues.push(`Phần ${name} phải có ${want.groups.length} nhóm với ${counts(want.groups).join(" + ")} câu (hiện có ${counts(have.groups).join(" + ") || "0"}).`);
      return;
    }
    want.groups.forEach((group, groupIndex) => group.forEach((task, taskIndex) => {
      const got = have.groups[groupIndex]![taskIndex]!;
      if (got.maxScore !== task.maxScore || got.responseType !== task.responseType || got.minWords !== task.minWords || got.maxWords !== task.maxWords) {
        issues.push(`Phần ${name}, nhóm ${groupIndex + 1}, câu ${taskIndex + 1}: phải là ${task.maxScore} điểm${task.minWords ? `, ${task.minWords}–${task.maxWords} từ` : ""} như đề đầu vào gốc.`);
      }
    }));
  });
  return issues;
}

export function hasPlacementRetakeStructure(blueprint: StoredAssessmentDefinition): boolean {
  return placementRetakeStructureIssues(blueprint).length === 0;
}

/** Hours after the placement decision in which an approved learner may ask for the retake (= appeal window). */
export const PLACEMENT_RETAKE_REQUEST_WINDOW_HOURS = 72;

/**
 * Pure request window. A learner sent back (needs_retry) may ask while no retake was granted;
 * an approved-but-unhappy learner only within 72 hours of the placement decision.
 */
export function placementRetakeRequestWindow(input: { status: string; decidedAt: Date | null; now: Date }): { open: boolean; availableUntil: Date | null } {
  if (input.status === "needs_retry") return { open: true, availableUntil: null };
  if (input.status !== "approved" || !input.decidedAt) return { open: false, availableUntil: null };
  const availableUntil = new Date(input.decidedAt.getTime() + PLACEMENT_RETAKE_REQUEST_WINDOW_HOURS * 3_600_000);
  return { open: input.now.getTime() <= availableUntil.getTime(), availableUntil };
}

export const PLACEMENT_RETAKE_REQUEST_REASON = "Xin thi lại bài đầu vào";

export interface PlacementRetakeRequestState {
  /** The placement result the learner may ask a retake for, while the window is open. */
  target: { attemptId: string; title: string; availableUntil: Date | null } | null;
  /** The learner's retake request (appeals row with request_kind 'retake'), if any. */
  request: { id: string; reason: string; status: "pending" | "accepted" | "rejected"; resolution: string | null; createdAt: Date; resolvedAt: Date | null } | null;
  retake: AssessmentRetakeStatus;
  original: { attemptId: string; feedback: string | null } | null;
}

export async function findPlacementRetakeRequestState(db: Db, learnerId: string, now: Date = new Date()): Promise<PlacementRetakeRequestState> {
  const grant = await findPlacementRetakeGrant(db, learnerId);
  const requestRow = await db.query<{ id: string; reason: string; status: "pending" | "accepted" | "rejected"; resolution: string | null; created_at: Date; resolved_at: Date | null }>(
    `select id, reason, status, resolution, created_at, resolved_at from appeals
     where learner_id = $1 and request_kind = 'retake' order by created_at desc limit 1`,
    [learnerId]
  );
  const request = requestRow.rows[0] ? {
    id: requestRow.rows[0].id, reason: requestRow.rows[0].reason, status: requestRow.rows[0].status, resolution: requestRow.rows[0].resolution,
    createdAt: requestRow.rows[0].created_at, resolvedAt: requestRow.rows[0].resolved_at
  } : null;
  let target: PlacementRetakeRequestState["target"] = null;
  const latest = await db.query<{ id: string; status: string; submitted_at: Date | null; decided_at: Date | null; feedback: string | null; has_appeal: boolean }>(
    `select aa.id, aa.status, aa.submitted_at, decision.decided_at,
            case when decision.decided_by is not null then decision.reason end as feedback,
            exists(select 1 from appeals a where a.attempt_id = aa.id) as has_appeal
     from assessment_attempts aa
     join assessment_versions av on av.id = aa.assessment_version_id
     join assessment_definitions ad on ad.id = av.definition_id and ad.kind = 'placement'
     left join assessment_decisions decision on decision.attempt_id = aa.id
     where aa.learner_id = $1 and ad.assessment_key <> $2
     order by aa.started_at desc limit 1`,
    [learnerId, PLACEMENT_RETAKE_ASSESSMENT_KEY]
  );
  const row = latest.rows[0];
  if (row && !grant && !request && !row.has_appeal) {
    const window = placementRetakeRequestWindow({ status: row.status, decidedAt: row.decided_at, now });
    if (window.open) target = { attemptId: row.id, title: "Test đầu vào", availableUntil: window.availableUntil };
  }
  const original = row && row.status !== "in_progress" && (row.submitted_at || row.decided_at)
    ? { attemptId: row.id, feedback: row.feedback }
    : null;
  return { target, request, retake: placementRetakeStatus(grant), original };
}

/**
 * "Xin thi lại": the learner's retake request, stored on the existing appeal plumbing (appeals row,
 * request_kind 'retake') so the Operator's appeal queue, bell items and decision endpoint apply.
 * Accepting it grants the retake (see applyAcceptedAppealLevel). Null when the window is closed.
 */
export async function createPlacementRetakeRequest(pool: Pool, learnerId: string, reason?: string, now: Date = new Date()): Promise<{ id: string; createdAt: Date } | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select id from users where id = $1 for update", [learnerId]);
    const state = await findPlacementRetakeRequestState(client, learnerId, now);
    if (!state.target) { await client.query("rollback"); return null; }
    const id = randomUUID();
    const expiresAt = state.target.availableUntil ?? new Date(now.getTime() + PLACEMENT_RETAKE_REQUEST_WINDOW_HOURS * 3_600_000);
    const inserted = await client.query<{ created_at: Date }>(
      `insert into appeals (id, attempt_id, learner_id, reason, expires_at, request_kind)
       values ($1, $2, $3, $4, $5, 'retake')
       on conflict (attempt_id) where status = 'pending' do nothing
       returning created_at`,
      [id, state.target.attemptId, learnerId, reason?.trim() || PLACEMENT_RETAKE_REQUEST_REASON, expiresAt]
    );
    await client.query("commit");
    return inserted.rows[0] ? { id, createdAt: inserted.rows[0].created_at } : null;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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
