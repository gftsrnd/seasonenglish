import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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
    await expect(repositories.identity.findUserByEmail("minh.anh.nguyen@e4s.local"))
      .resolves.toEqual({
        id: DEMO_IDS.learner,
        displayName: "Nguyễn Minh Anh",
        email: "minh.anh.nguyen@e4s.local",
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

  it("publishes a canonical weekly lesson prompt after local seed refresh", async () => {
    await pool.query(
      `insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
       values ($1, $2, 'weekly_lessons', 99, 'legacy nine-part prompt', 'active', $3)`,
      [randomUUID(), DEMO_IDS.organization, DEMO_IDS.operator]
    );

    await seedDemo(client, { mode: "local" });

    const active = await pool.query<{ id: string; version: number; content: string }>(
      `select id, version, content
       from prompt_versions
       where organization_id = $1 and task_key = 'weekly_lessons' and status = 'active'
       order by version desc`,
      [DEMO_IDS.organization]
    );

    expect(active.rows[0]?.version).toBe(100);
    expect(active.rows[0]?.content).toContain("Mỗi lesson phải có đúng một lần 11 part code");
    expect(active.rows[0]?.content).not.toContain("Mỗi lesson phải có đúng một lần 9 part code");
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

  it("starts the demo learner without a fake weekly submission or active game set", async () => {
    const result = await pool.query<{ practice_count: string; game_count: string }>(
      `select
         (select count(*) from practice_submissions where id = $1)::text as practice_count,
         (select count(*) from game_sets where id = $2)::text as game_count`,
      [DEMO_IDS.practiceSubmission, DEMO_IDS.gameSet]
    );

    expect(result.rows[0]).toEqual({ practice_count: "0", game_count: "0" });
  });

  it("keeps the demo learner's full week completed so weekly practice is available", async () => {
    const result = await pool.query<{ completed_count: string }>(
      `select count(*)::text as completed_count
       from progress_records
       where learner_id = $1
         and lesson_id = any($2::uuid[])
         and status = 'completed'`,
      [DEMO_IDS.learner, DEMO_IDS.lessons]
    );

    expect(result.rows[0]?.completed_count).toBe("5");
  });

  it("removes only the fixed demo activity IDs during migration cleanup", async () => {
    const realPracticeId = randomUUID();
    const realGameSetId = randomUUID();
    await pool.query(
      `insert into practice_submissions (id, learner_id, program_week_id, status, content)
       values ($1, $2, $3, 'submitted', '{"text":"Real learner work"}'::jsonb)`,
      [realPracticeId, DEMO_IDS.learner, DEMO_IDS.week2]
    );
    await pool.query(
      `insert into game_sets (id, program_week_id, game_key, status, payload)
       values ($1, $2, 'weekly_vocabulary', 'published', '{"topic":"Real set","words":[]}'::jsonb)`,
      [realGameSetId, DEMO_IDS.week2]
    );

    const cleanup = await readFile(resolve("packages/database/migrations/0048_remove_demo_learner_activity.sql"), "utf8");
    await pool.query(cleanup);

    const remaining = await pool.query<{ practice: string; game_set: string }>(
      `select
         (select count(*) from practice_submissions where id = $1)::text as practice,
         (select count(*) from game_sets where id = $2)::text as game_set`,
      [realPracticeId, realGameSetId]
    );
    expect(remaining.rows[0]).toEqual({ practice: "1", game_set: "1" });
  });

  it("persists explicit Coach translations while keeping legacy turns readable", async () => {
    const prompt = await pool.query<{ id: string; task_id: string }>(
      `select pv.id, task.id as task_id from prompt_versions pv
       join ai_tasks task on task.task_key = pv.task_key
       where pv.organization_id = $1 and pv.task_key = 'coach_dialogue' and pv.status = 'active'
       order by pv.version desc limit 1`,
      [DEMO_IDS.organization]
    );
    const requestId = randomUUID();
    const saved = await repositories.coach.saveAiTurn({
      learnerId: DEMO_IDS.learner,
      sessionId: DEMO_IDS.coachSession,
      requestId,
      message: "I work at product.",
      taskId: prompt.rows[0]!.task_id,
      promptVersionId: prompt.rows[0]!.id,
      output: {
        evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Trả lời đúng trọng tâm." },
        seasonReply: "Thanks for sharing.",
        seasonReplyTranslation: "Cảm ơn bạn đã chia sẻ.",
        nextQuestion: "What are you working on this week?",
        nextQuestionTranslation: "Tuần này bạn đang làm việc gì?",
        rubric: {
          meaning: { score: 4, evidence: "The role is clear.", improvement: "Add one detail." },
          vocabulary: { score: 4, evidence: "Product is relevant.", improvement: "Use department." },
          grammar: { score: 3, evidence: "The sentence is understandable.", improvement: "Use in before a department." }
        },
        corrections: [{
          original: "at product",
          corrected: "in product",
          translation: "trong bộ phận sản phẩm",
          reason: "Use in before a department."
        }],
        correctedText: "I work in product.",
        suggestedAnswer: {
          text: "I work in the product department.",
          translation: "Tôi làm việc trong bộ phận sản phẩm."
        },
        usedWords: ["product"]
      },
      metadata: {
        traceId: randomUUID(), provider: "fixture", model: "fixture-model", inputHash: "a".repeat(64),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, latencyMs: 12
      }
    });
    expect(saved).toBe(true);

    await pool.query(
      `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback)
       values ($1, $2, 999, 'learner', $3::jsonb, $4::jsonb)`,
      [randomUUID(), DEMO_IDS.coachSession, JSON.stringify({ text: "Legacy answer." }), JSON.stringify({
        coachText: "Legacy reply.", relevant: true, relevanceNote: "",
        rubric: { meaning: 3, vocabulary: 3, grammar: 3 },
        suggestions: [{ original: "old", corrected: "older", explanation: "Legacy reason." }],
        correctedText: "Legacy answer."
      })]
    );

    const view = await repositories.coach.currentForLearner(DEMO_IDS.learner, true);
    const translated = view?.messages.find((message) => message.text === "Thanks for sharing. What are you working on this week?");
    expect(translated?.feedback).toMatchObject({
      seasonReplyTranslation: "Cảm ơn bạn đã chia sẻ.",
      nextQuestionTranslation: "Tuần này bạn đang làm việc gì?",
      corrections: [expect.objectContaining({ translation: "trong bộ phận sản phẩm" })]
    });
    const legacy = view?.messages.find((message) => message.text === "Legacy reply.");
    expect(legacy?.feedback).toMatchObject({
      corrections: [expect.objectContaining({ original: "old", corrected: "older", reason: "Legacy reason." })]
    });
    expect(legacy?.feedback?.seasonReplyTranslation).toBe("");
    expect(legacy?.feedback?.corrections[0]?.translation).toBe("");
    expect(legacy?.feedback?.suggestedAnswer).toEqual({ text: "", translation: "" });
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

  it("keeps existing lesson content visible after the week topic changes", async () => {
    await pool.query("update program_weeks set topic = $1 where id = $2", ["Scheduling Internal Meetings", DEMO_IDS.week]);

    const matrix = await repositories.content.lessonMatrix(DEMO_IDS.operator);
    const a2 = matrix?.weeks.find((week) => week.weekNumber === 1)?.cells.find((cell) => cell.cefr === "A2");

    expect(a2).toMatchObject({ status: "published", versionId: DEMO_IDS.publishedLessonSetVersion });
    expect(a2?.lessons).toHaveLength(5);
  });

  it("uses all saved lesson titles from the latest draft or published matrix version", async () => {
    const draftVersionId = randomUUID();
    const reviewVersionId = randomUUID();
    const draftTitles = [
      "Draft Monday",
      "Draft Tuesday",
      "Draft Wednesday",
      "Draft Thursday",
      "Draft Friday"
    ];

    try {
      await pool.query(
        `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by)
         values ($1, $2, 2, 'draft', '{}'::jsonb, $3),
                ($4, $2, 3, 'review', '{}'::jsonb, $3)`,
        [draftVersionId, DEMO_IDS.lessonSet, DEMO_IDS.operator, reviewVersionId]
      );
      for (const [index, title] of draftTitles.entries()) {
        await pool.query(
          `insert into lessons (id, lesson_set_version_id, day_number, title)
           values ($1, $2, $3, $4)`,
          [randomUUID(), draftVersionId, index + 1, title]
        );
      }
      await pool.query(
        `insert into lessons (id, lesson_set_version_id, day_number, title)
         values ($1, $2, 1, 'Review Monday')`,
        [randomUUID(), reviewVersionId]
      );

      const matrix = await repositories.content.lessonMatrix(DEMO_IDS.operator);
      const a2 = matrix?.weeks.find((week) => week.weekNumber === 1)?.cells.find((cell) => cell.cefr === "A2");

      expect(a2).toMatchObject({ status: "review", versionId: reviewVersionId, version: 3 });
      expect(a2?.lessons).toEqual([{ dayNumber: 1, title: "Review Monday" }]);
    } finally {
      await pool.query("delete from lesson_set_versions where id = any($1::uuid[])", [[draftVersionId, reviewVersionId]]);
    }
  });

  it("does not reset a saved week topic during local seed refresh", async () => {
    await pool.query("update program_weeks set topic = $1 where id = $2", ["Saved operator topic", DEMO_IDS.week2]);

    await seedDemo(client, { mode: "local" });

    await expect(pool.query<{ topic: string }>("select topic from program_weeks where id = $1", [DEMO_IDS.week2]))
      .resolves.toMatchObject({ rows: [{ topic: "Saved operator topic" }] });
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
