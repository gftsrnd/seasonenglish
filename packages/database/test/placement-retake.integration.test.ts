import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placementDefinition, type StoredAssessmentDefinition } from "../src/assessment-blueprints.js";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import {
  findPlacementRetakeGrant, grantPlacementRetake, PlacementRetakeError, placementAttemptCount, startPlacementRetakeAttempt
} from "../src/placement-retake.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

/** A complete 20/40/2/4 retake form (the generator's structure), built from placement-a's other sections. */
function retakeBlueprint(): StoredAssessmentDefinition {
  const options = ["A", "B", "C", "D"].map((value) => ({ value, label: `Option ${value}` }));
  const listening = placementDefinition.sections.find((section) => section.code === "listening")!;
  return {
    ...placementDefinition, key: "placement-retake", title: "Test đầu vào – đề thi lại",
    sections: placementDefinition.sections.map((section) => section !== listening ? section : {
      ...listening,
      groups: [{ key: "L1", title: "Part A", instruction: "Nghe.", maxPlays: 2,
        stimulus: { type: "audio_script" as const, audioSrc: "/media/audio/retake-L1.wav", lines: [{ speaker: "Narrator", text: "A new retake script." }] },
        tasks: Array.from({ length: 20 }, (_, index) => ({ key: `L1_${index + 1}`, prompt: `Retake question ${index + 1}?`, responseType: "single_choice" as const, maxScore: 1, options, correctAnswer: "B" })) }]
    })
  };
}

// Needs a disposable database (the suite resets the public schema); skipped without one.
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("placement retake persistence", () => {
  const client = new Client({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  let retakeVersionId = "";

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

  it("keeps the canonical placement form as the default placement", async () => {
    expect((await repositories.assessments.findPublished("placement"))?.assessmentKey).toBe("placement-a");
    expect((await repositories.assessments.listLevelForms(DEMO_IDS.operator)).find((form) => form.versionId === retakeVersionId)?.targetLevel).toBe("placement-retake");
  });

  it("grants once, refuses a second grant and notifies the learner", async () => {
    const grant = await grantPlacementRetake(pool, { learnerId: DEMO_IDS.learner, reviewerId: DEMO_IDS.operator, reason: "Học viên chưa hài lòng với kết quả" });
    expect(grant.sourceAttemptId).toBe(DEMO_IDS.placementAttempt);
    await expect(grantPlacementRetake(pool, { learnerId: DEMO_IDS.learner, reviewerId: DEMO_IDS.operator, reason: "lần hai" }))
      .rejects.toEqual(new PlacementRetakeError("PLACEMENT_RETAKE_ALREADY_GRANTED"));
    const bell = await pool.query("select kind, context from inbox_notifications where recipient_id = $1 and kind = 'retake_granted'", [DEMO_IDS.learner]);
    expect(bell.rows).toEqual([{ kind: "retake_granted", context: "placement" }]);
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
  });
});
