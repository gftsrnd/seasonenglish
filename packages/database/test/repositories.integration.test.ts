import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { createRepositories } from "../src/repositories.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("E4S repositories", () => {
  const client = new Client({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const repositories = createRepositories(pool);

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
  }, 30_000);

  afterAll(async () => {
    await pool.end();
    await client.end();
  });

  it("exposes repositories for every planned domain", () => {
    expect(Object.keys(repositories).sort()).toEqual([
      "aiRuns", "assessments", "coach", "content", "engagement",
      "files", "identity", "jobs", "learning", "notifications"
    ]);
  });

  it("finds a seeded identity without exposing credentials", async () => {
    await expect(repositories.identity.findUserByEmail("learner@e4s.local"))
      .resolves.toEqual({
        id: DEMO_IDS.learner,
        displayName: "Học viên Demo",
        email: "learner@e4s.local",
        role: "learner",
        status: "active"
      });
  });

  it("returns the learner's active program and published lesson set", async () => {
    const context = await repositories.learning.getActiveContext(DEMO_IDS.learner);
    expect(context).toMatchObject({
      programId: DEMO_IDS.program,
      weekNumber: 1,
      cefr: "A2"
    });

    await expect(repositories.content.findPublishedLessonSet(DEMO_IDS.week, "A2"))
      .resolves.toMatchObject({
        id: DEMO_IDS.lessonSet,
        versionId: DEMO_IDS.publishedLessonSetVersion,
        status: "published"
      });
  });

  it("provides stable empty read models for domains without seed activity", async () => {
    await expect(repositories.assessments.listPending()).resolves.toEqual([]);
    await expect(repositories.coach.listForLearner(DEMO_IDS.learner)).resolves.toEqual([]);
    await expect(repositories.engagement.getSummary(DEMO_IDS.learner)).resolves.toEqual({ points: 0, badges: [] });
    await expect(repositories.notifications.listForLearner(DEMO_IDS.learner)).resolves.toEqual([]);
    await expect(repositories.files.listForOwner(DEMO_IDS.learner)).resolves.toEqual([]);
    await expect(repositories.aiRuns.listForUser(DEMO_IDS.learner)).resolves.toEqual([]);
  });

  it("leases a queued job once so concurrent workers cannot duplicate it", async () => {
    const id = randomUUID();
    await repositories.jobs.enqueue({
      id,
      kind: "ai.coach-feedback",
      payload: { learnerId: DEMO_IDS.learner },
      idempotencyKey: `test:${id}`
    });

    const first = await repositories.jobs.leaseNext("worker-a", 30);
    const second = await repositories.jobs.leaseNext("worker-b", 30);

    expect(first).toMatchObject({ id, state: "running", lockedBy: "worker-a", attempts: 1 });
    expect(second).toBeNull();
  });
});
