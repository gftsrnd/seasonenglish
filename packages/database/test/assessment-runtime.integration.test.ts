import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("assessment runtime persistence", () => {
  const client = new Client({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);
  let learnerId = "";

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
    learnerId = randomUUID();
    await client.query(
      `insert into users (id, organization_id, role, display_name, email)
       values ($1, $2, 'learner', 'Runtime Learner', $3)`,
      [learnerId, DEMO_IDS.organization, `${learnerId}@e4s.local`]
    );
  }, 30_000);

  afterAll(async () => {
    await pool.end();
    await client.end();
  });

  it("keeps violations, remaining time and media evidence after reload", async () => {
    const prior = process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT;
    process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT = "true";
    try {
      const attempt = await repositories.assessments.startAttempt({
        learnerId,
        assessmentVersionId: DEMO_IDS.placementVersion,
        firstSection: "listening",
        durationMinutes: 5
      });
      await pool.query("update assessment_attempts set violation_limit = 1 where id = $1", [attempt.id]);

    const first = await repositories.assessments.recordAssessmentViolation({
      learnerId,
      attemptId: attempt.id,
      requestId: "runtime-event-1",
      reason: "visibility_hidden",
      occurredAt: new Date().toISOString()
    });
    expect(first).toMatchObject({ violationCount: 1, violationLimit: 1, submitReason: null });

    const duplicate = await repositories.assessments.recordAssessmentViolation({
      learnerId,
      attemptId: attempt.id,
      requestId: "runtime-event-1",
      reason: "visibility_hidden",
      occurredAt: new Date().toISOString()
    });
    expect(duplicate).toMatchObject({ violationCount: 1, submitReason: null });

    const automatic = await repositories.assessments.recordAssessmentViolation({
      learnerId,
      attemptId: attempt.id,
      requestId: "runtime-event-2",
      reason: "window_blur",
      occurredAt: new Date().toISOString()
    });
    expect(automatic).toMatchObject({ violationCount: 2, violationLimit: 1, submitReason: "violations", status: "pending_review", autoSubmitted: true });

      const reloaded = await repositories.assessments.getAssessmentRuntime(learnerId, attempt.id);
      expect(reloaded).toMatchObject({ violationCount: 2, submitReason: "violations", status: "pending_review" });
      expect(reloaded?.remainingSeconds).toBe(0);
    } finally {
      if (prior === undefined) delete process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT;
      else process.env.E4S_ENABLE_ASSESSMENT_VIOLATION_AUTO_SUBMIT = prior;
    }
  });

  it("returns the same submitted result for duplicate submission", async () => {
    const attempt = await repositories.assessments.startAttempt({
      learnerId,
      assessmentVersionId: DEMO_IDS.finalVersion,
      firstSection: "speaking",
      durationMinutes: 5
    });
    await pool.query("update assessment_attempts set current_section = 'speaking' where id = $1", [attempt.id]);

    const first = await repositories.assessments.submitAssessmentAttempt({ learnerId, attemptId: attempt.id, requestId: "submit-runtime-1" });
    const duplicate = await repositories.assessments.submitAssessmentAttempt({ learnerId, attemptId: attempt.id, requestId: "submit-runtime-2" });
    expect(first?.status).toBe("pending_review");
    expect(duplicate).toMatchObject({ id: attempt.id, status: "pending_review", submitReason: "manual" });
  });

  it("serializes concurrent duplicate violation requests before incrementing the counter", async () => {
    const attempt = await repositories.assessments.startAttempt({
      learnerId,
      assessmentVersionId: DEMO_IDS.levelUpVersion,
      firstSection: "listening",
      durationMinutes: 5
    });
    const send = () => repositories.assessments.recordAssessmentViolation({
      learnerId,
      attemptId: attempt.id,
      requestId: "runtime-concurrent-event",
      reason: "window_blur",
      occurredAt: new Date().toISOString()
    });
    const [first, duplicate] = await Promise.all([send(), send()]);
    expect(first).toMatchObject({ violationCount: 1 });
    expect(duplicate).toMatchObject({ violationCount: 1 });
    expect((await repositories.assessments.getAssessmentRuntime(learnerId, attempt.id))?.violationCount).toBe(1);
  });
});
