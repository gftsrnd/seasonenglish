import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placementDefinition, type StoredAssessmentDefinition } from "../src/assessment-blueprints.js";
import { InboxNotificationRepository } from "../src/inbox-notification-repository.js";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import {
  createPlacementRetakeRequest, findPlacementRetakeGrant, findPlacementRetakeRequestState, grantPlacementRetake,
  PlacementRetakeError, placementAttemptCount, startPlacementRetakeAttempt
} from "../src/placement-retake.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

/** The one retake form, in exactly placement-a's structure (the content is placement-a's here, for the test only). */
function retakeBlueprint(): StoredAssessmentDefinition {
  return { ...placementDefinition, key: "placement-retake", title: "Test đầu vào – đề thi lại" };
}

// Needs a disposable database (the suite resets the public schema); skipped without one.
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("placement retake persistence", () => {
  const client = new Client({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  let retakeVersionId = "";
  const bell = async (recipient: string | null, kind: string) => (await pool.query<{ kind: string; context: string }>(
    `select kind, context from inbox_notifications where kind = $2 and ($1::uuid is null or recipient_id = $1) order by created_at`, [recipient, kind]
  )).rows;

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
    const draft = await repositories.assessments.createLevelFormDraft(DEMO_IDS.operator, "placement-retake", retakeBlueprint());
    retakeVersionId = draft.versionId;
    await repositories.assessments.publishLevelForm(DEMO_IDS.operator, draft.versionId);
  }, 30_000);

  afterAll(async () => {
    await pool.end();
    await client.end();
  });

  it("keeps the canonical placement form as the default and refuses a retake form that leaves placement-a's structure", async () => {
    expect((await repositories.assessments.findPublished("placement"))?.assessmentKey).toBe("placement-a");
    expect((await repositories.assessments.listLevelForms(DEMO_IDS.operator)).find((form) => form.versionId === retakeVersionId)).toEqual(expect.objectContaining({
      targetLevel: "placement-retake", status: "published", listeningTaskCount: 15, readingTaskCount: 40, publicationBlockerCount: 0
    }));
    // A 20-question listening section (the level-up frame) is not a valid retake form.
    const listening = placementDefinition.sections[0]!;
    const wrong = { ...retakeBlueprint(), sections: [{ ...listening, groups: [...listening.groups, { ...listening.groups[0]!, key: "LD" }] }, ...placementDefinition.sections.slice(1)] };
    await expect(repositories.assessments.createLevelFormDraft(DEMO_IDS.operator, "placement-retake", wrong)).rejects.toThrow("ASSESSMENT_FORM_NOT_FOUND");
  });

  it("offers 'Xin thi lại' to an approved learner only within 72 hours of the decision, and never a free-text placement appeal", async () => {
    // Seeded decision: 4 days ago, so the window is closed.
    expect((await findPlacementRetakeRequestState(pool, DEMO_IDS.learner)).target).toBeNull();
    expect(await createPlacementRetakeRequest(pool, DEMO_IDS.learner)).toBeNull();
    await pool.query("update assessment_decisions set decided_at = now() - interval '1 hour' where attempt_id = $1", [DEMO_IDS.placementAttempt]);
    expect(await repositories.assessments.listAppealableResults(DEMO_IDS.learner, DEMO_IDS.placementAttempt)).toEqual([]);
    const open = await findPlacementRetakeRequestState(pool, DEMO_IDS.learner);
    expect(open.target?.attemptId).toBe(DEMO_IDS.placementAttempt);
    expect(open.target!.availableUntil!.getTime() - Date.now()).toBeGreaterThan(70 * 3_600_000);
    const request = await createPlacementRetakeRequest(pool, DEMO_IDS.learner);
    expect(request).not.toBeNull();
    expect(await createPlacementRetakeRequest(pool, DEMO_IDS.learner)).toBeNull();
    expect(await bell(DEMO_IDS.operator, "appeal_received")).toEqual([{ kind: "appeal_received", context: "retake" }]);
    // The Operator rejects: the learner sees the decision, and cannot ask again.
    await repositories.assessments.resolveAssessmentAppeal({ appealId: request!.id, reviewerId: DEMO_IDS.operator, status: "rejected", resolution: "Kết quả phản ánh đúng trình độ." });
    const rejected = await findPlacementRetakeRequestState(pool, DEMO_IDS.learner);
    expect(rejected).toEqual(expect.objectContaining({ target: null, retake: "not_granted", request: expect.objectContaining({ status: "rejected", resolution: "Kết quả phản ánh đúng trình độ." }) }));
    expect(await bell(DEMO_IDS.learner, "appeal_rejected")).toEqual([{ kind: "appeal_rejected", context: "retake" }]);
    expect(await findPlacementRetakeGrant(pool, DEMO_IDS.learner)).toBeNull();
  });

  it("grants the retake when the Operator approves a sent-back learner's request", async () => {
    const learnerId = randomUUID();
    const attemptId = randomUUID();
    await pool.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Retake Learner', $3)", [learnerId, DEMO_IDS.organization, `${learnerId}@e4s.local`]);
    await pool.query("insert into assessment_attempts (id, assessment_version_id, learner_id, status, started_at, updated_at, submitted_at) values ($1, $2, $3, 'needs_retry', now(), now(), now())", [attemptId, DEMO_IDS.placementVersion, learnerId]);
    // Sent back long ago: no 72 h limit for a learner without a placement level.
    await pool.query("insert into assessment_decisions (id, attempt_id, status, reason, decided_by, decided_at) values ($1, $2, 'retry', 'Chưa đủ để xếp mức', $3, now() - interval '10 days')", [randomUUID(), attemptId, DEMO_IDS.operator]);
    expect((await findPlacementRetakeRequestState(pool, learnerId)).target).toEqual({ attemptId, title: "Test đầu vào", availableUntil: null });
    const request = await createPlacementRetakeRequest(pool, learnerId, "  Tôi muốn thử lại.  ");
    expect((await pool.query("select reason from appeals where id = $1", [request!.id])).rows).toEqual([{ reason: "Tôi muốn thử lại." }]);
    const decision = { appealId: request!.id, reviewerId: DEMO_IDS.operator, status: "accepted" as const, resolution: "Cho thi lại một lần." };
    await pool.query("update assessment_versions set status = 'draft' where id = $1", [retakeVersionId]);
    await expect(repositories.assessments.resolveAssessmentAppeal(decision)).rejects.toEqual(new PlacementRetakeError("PLACEMENT_RETAKE_FORM_NOT_PUBLISHED"));
    expect(await findPlacementRetakeGrant(pool, learnerId)).toBeNull();
    expect((await findPlacementRetakeRequestState(pool, learnerId)).request?.status).toBe("pending");
    expect(await bell(learnerId, "retake_granted")).toEqual([]);
    await pool.query("update assessment_versions set status = 'published' where id = $1", [retakeVersionId]);
    await repositories.assessments.resolveAssessmentAppeal(decision);
    expect(await findPlacementRetakeGrant(pool, learnerId)).toEqual(expect.objectContaining({ sourceAttemptId: attemptId, reason: "Cho thi lại một lần." }));
    expect((await findPlacementRetakeRequestState(pool, learnerId))).toMatchObject({
      retake: "granted",
      request: { status: "accepted" },
      original: { attemptId, feedback: "Chưa đủ để xếp mức" }
    });
    expect(await bell(learnerId, "retake_granted")).toEqual([{ kind: "retake_granted", context: "placement" }]);
    expect(await bell(learnerId, "appeal_approved")).toEqual([]);
  });

  it("grants once directly, refuses a second grant and notifies the learner", async () => {
    const grant = await grantPlacementRetake(pool, { learnerId: DEMO_IDS.learner, reviewerId: DEMO_IDS.operator, reason: "Học viên chưa hài lòng với kết quả" });
    expect(grant.sourceAttemptId).toBe(DEMO_IDS.placementAttempt);
    await expect(grantPlacementRetake(pool, { learnerId: DEMO_IDS.learner, reviewerId: DEMO_IDS.operator, reason: "lần hai" }))
      .rejects.toEqual(new PlacementRetakeError("PLACEMENT_RETAKE_ALREADY_GRANTED"));
    expect(await bell(DEMO_IDS.learner, "retake_granted")).toEqual([{ kind: "retake_granted", context: "placement" }]);
  });

  it("creates a NEW attempt on the retake form once, and the operator's decision on it is final", async () => {
    const before = await placementAttemptCount(pool, DEMO_IDS.learner);
    const input = { learnerId: DEMO_IDS.learner, assessmentVersionId: retakeVersionId, firstSection: "listening" as const, durationMinutes: 15, violationLimit: 3, ownerSessionId: null };
    const attemptId = await startPlacementRetakeAttempt(pool, input);
    expect(attemptId).not.toBeNull();
    expect(attemptId).not.toBe(DEMO_IDS.placementAttempt);
    expect(await startPlacementRetakeAttempt(pool, input)).toBe(attemptId);
    expect(await placementAttemptCount(pool, DEMO_IDS.learner)).toBe(before + 1);
    expect((await findPlacementRetakeGrant(pool, DEMO_IDS.learner))?.retakeAttemptId).toBe(attemptId);
    await pool.query("update assessment_attempts set status = 'pending_review', submitted_at = now() where id = $1", [attemptId]);
    await expect(repositories.assessments.decide({ attemptId: attemptId!, reviewerId: DEMO_IDS.operator, status: "needs_retry", approvedLevel: null, reason: "x" }))
      .rejects.toEqual(new PlacementRetakeError("PLACEMENT_RETAKE_FINAL"));
    const placed = await repositories.assessments.decide({ attemptId: attemptId!, reviewerId: DEMO_IDS.operator, status: "approved", approvedLevel: "B1", reason: "Xếp lớp sau thi lại" });
    expect(placed?.approvedLevel).toBe("B1");
    const inbox = await new InboxNotificationRepository(pool).list(DEMO_IDS.learner, 20, false);
    expect(inbox.items).toContainEqual(expect.objectContaining({ relatedId: attemptId, kind: "assessment_result", context: "placement_retake" }));
  });
});
