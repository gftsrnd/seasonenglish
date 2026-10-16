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
      "files", "identity", "jobs", "learning", "manager", "notifications"
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

  it("provides stable seeded read models and empty optional operational domains", async () => {
    await expect(repositories.assessments.listPending(DEMO_IDS.operator)).resolves.toEqual([]);
    await expect(repositories.coach.listForLearner(DEMO_IDS.learner)).resolves.toEqual([
      expect.objectContaining({ id: DEMO_IDS.coachSession, status: "active", scenario: { title: "Daily meeting" } })
    ]);
    await expect(repositories.engagement.getSummary(DEMO_IDS.learner)).resolves.toEqual({
      points: 20,
      badges: [{ key: "starter", label: "Khởi động" }]
    });
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

  it("releases an expired worker lease so another worker can retry the job", async () => {
    const id = randomUUID();
    await repositories.jobs.enqueue({
      id,
      kind: "storage.cleanup",
      payload: { bucket: "assessment-evidence" },
      idempotencyKey: `expired-lease:${id}`
    });

    const first = await repositories.jobs.leaseNext("worker-a", 30);
    expect(first).toMatchObject({ id, lockedBy: "worker-a", attempts: 1 });
    await pool.query("update jobs set lock_expires_at = now() - interval '1 second' where id = $1", [id]);

    const recovered = await repositories.jobs.leaseNext("worker-b", 30);

    expect(recovered).toMatchObject({ id, state: "running", lockedBy: "worker-b", attempts: 2 });
  });

  it("marks a job succeeded only for the worker that holds its lease", async () => {
    const id = randomUUID();
    await repositories.jobs.enqueue({ id, kind: "ai.coach-feedback", payload: { learnerId: DEMO_IDS.learner } });
    await expect(repositories.jobs.leaseNext("worker-a", 30)).resolves.toMatchObject({ id });

    const completed = await (repositories.jobs as typeof repositories.jobs & {
      markSucceeded(id: string, workerId: string): Promise<boolean>;
    }).markSucceeded(id, "worker-a");

    expect(completed).toBe(true);
    await expect(pool.query("select state, locked_by from jobs where id = $1", [id]))
      .resolves.toMatchObject({ rows: [{ state: "succeeded", locked_by: null }] });
  });

  it("dead-letters a failed job after its final allowed attempt", async () => {
    const id = randomUUID();
    await repositories.jobs.enqueue({ id, kind: "ai.coach-feedback", payload: { learnerId: DEMO_IDS.learner }, maxAttempts: 1 });
    await expect(repositories.jobs.leaseNext("worker-a", 30)).resolves.toMatchObject({ id, attempts: 1 });

    const state = await (repositories.jobs as typeof repositories.jobs & {
      markFailed(id: string, workerId: string, error: string): Promise<"queued" | "dead" | null>;
    }).markFailed(id, "worker-a", "provider unavailable");

    expect(state).toBe("dead");
    await expect(pool.query("select state, locked_by, last_error from jobs where id = $1", [id]))
      .resolves.toMatchObject({ rows: [{ state: "dead", locked_by: null, last_error: "provider unavailable" }] });
  });
});
