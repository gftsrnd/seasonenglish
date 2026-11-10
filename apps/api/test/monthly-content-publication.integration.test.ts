import { randomUUID } from "node:crypto";
import { createRepositories, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";
import { compactExpiredMonthForTest, previewExpiredMonthCompaction } from "../../../packages/database/src/monthly-content-retention.js";

describe("monthly content publication", () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  const repositories = createRepositories(pool);
  const frameworkId = randomUUID();
  const monthId = randomUUID();
  const month = "2026-11";
  const days = [
    { lessonNumber: 1, date: "2026-11-02", kind: "new", lessonId: randomUUID() },
    { lessonNumber: 2, date: "2026-11-06", kind: "review", lessonId: randomUUID() }
  ];

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $3), ($2, $3)",
        [DEMO_IDS.manager, DEMO_IDS.operator, await createCredentialHash("test-password")]
      );
      await client.query(
        `insert into organization_settings (organization_id, configuration) values ($1, '{"simulatedSystemDate":"2026-11-10"}')
         on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
        [DEMO_IDS.organization]
      );
      await client.query("update enrollments set cefr = 'A1', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
      await client.query("update enrollments set cefr_started_on = '2026-11-01' where learner_id = $1", [DEMO_IDS.learner]);
      await client.query(
        "insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, '2026-11-30', 2, 'approved')",
        [monthId, DEMO_IDS.organization, month]
      );
      await client.query(
        "insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash) values ($1, $2, 'A1', 'approved', $3, 'scope')",
        [frameworkId, monthId, JSON.stringify({ month, daySpecs: days, coreTerms: [], supportTerms: [], grammarTopics: [], sounds: [] })]
      );
      const setId = randomUUID();
      await client.query("insert into lesson_sets (id, month_framework_id, cefr) values ($1, $2, 'A1')", [setId, frameworkId]);
      for (const day of days) {
        const versionId = randomUUID();
        await client.query("insert into lesson_set_versions (id, lesson_set_id, version, status) values ($1, $2, $3, 'published')", [versionId, setId, day.lessonNumber]);
        await client.query("insert into lessons (id, lesson_set_version_id, day_number, title) values ($1, $2, $3, 'Lesson')", [day.lessonId, versionId, day.lessonNumber]);
        await client.query("insert into lesson_versions (id, lesson_id, version, status, content) values ($1, $2, 1, 'published', $3)", [
          randomUUID(), day.lessonId, JSON.stringify({ title: "Lesson", parts: [{ code: "reading", content: { prompt: "Choose the greeting.", answer: "Hello" } }] })
        ]);
        await client.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, lesson_id, scope_hash, status) values ($1, $2, $3, $4, $5, 'scope', $6)", [
          randomUUID(), frameworkId, day.lessonNumber, day.date, day.lessonId, day.kind === "new" ? "approved" : "draft"
        ]);
      }
    } finally {
      client.release();
    }
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  async function staffCookie(id: string) {
    const email = (await pool.query<{ email: string }>("select email from users where id = $1", [id])).rows[0]?.email;
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password: "test-password" } });
    expect(login.statusCode, login.body).toBe(200);
    return String(login.headers["set-cookie"]).split(";")[0]!;
  }

  it("requires explicit publication after both daily and Friday content are approved", async () => {
    expect(await repositories.learning.findLesson(DEMO_IDS.learner, days[0]!.lessonId)).toBeNull();
    await expect(repositories.monthlyContent.publishMonth(DEMO_IDS.operator, frameworkId)).rejects.toMatchObject({ code: "MONTHLY_PUBLICATION_INCOMPLETE" });
    await pool.query("update month_lessons set status = 'approved' where framework_id = $1 and lesson_number = 2", [frameworkId]);
    expect(await repositories.learning.findLesson(DEMO_IDS.learner, days[0]!.lessonId)).toBeNull();
    expect(await repositories.monthlyContent.previewMonthPublication(DEMO_IDS.operator, frameworkId)).toMatchObject({
      affectedLearners: 1, waitingNextMonth: 1, nextMonth: "2026-12"
    });
    const publication = await repositories.monthlyContent.publishMonth(DEMO_IDS.operator, frameworkId);
    expect(publication.publishedOn).toBe("2026-11-10");
    expect(await repositories.learning.listMonthlyLessons(DEMO_IDS.learner, month)).toEqual([]);
    expect(await repositories.monthlyContent.publishMonth(DEMO_IDS.operator, frameworkId)).toEqual(publication);
    expect((await pool.query("select count(*)::int as count from audit_events where action = 'monthly.framework_published' and entity_id = $1", [frameworkId])).rows[0]?.count).toBe(1);
  });

  it("lists both incorrect answers for a daily exercise and excludes Friday review answers", async () => {
    for (const day of days) {
      for (const [index, answer] of ["Goodbye", "See you"].entries()) {
        await pool.query(
          "insert into lesson_part_attempts (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, answer) values ($1, $2, $3, 'reading', $4, $5, $6, $7)",
          [randomUUID(), DEMO_IDS.learner, day.lessonId, randomUUID(), index + 1, index === 0 ? "wrong_retry" : "wrong_exhausted", answer]
        );
      }
    }
    const overview = await repositories.content.reviewOverview(DEMO_IDS.operator);
    expect(overview?.exerciseWarnings).toEqual([expect.objectContaining({
      lessonId: days[0]!.lessonId, partCode: "reading", question: "Choose the greeting.", answers: ["Goodbye", "See you"]
    })]);
    const warningId = overview!.exerciseWarnings![0]!.id;
    expect(await repositories.content.dismissExerciseWarning(DEMO_IDS.manager, warningId)).toBe(false);
    expect(await repositories.content.dismissExerciseWarning(DEMO_IDS.operator, warningId)).toBe(true);
    expect((await repositories.content.reviewOverview(DEMO_IDS.operator))?.exerciseWarnings).toEqual([]);
    expect((await pool.query("select answer from lesson_part_attempts where id = $1", [warningId])).rows[0]?.answer).toBe("See you");
  });

  it("rejects content reads outside the three-month window", async () => {
    await expect(repositories.monthlyContent.getOverview(DEMO_IDS.manager, "2026-09")).rejects.toMatchObject({ code: "MONTHLY_CONTENT_OUTSIDE_WINDOW" });
  });

  it("lets Managers read operator content and rejects their publication write", async () => {
    const cookie = await staffCookie(DEMO_IDS.manager);
    const response = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-11", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().frameworks).toEqual([expect.objectContaining({ id: frameworkId })]);
    const write = await app.inject({
      method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/publication`, headers: { cookie }, payload: { confirmedOn: "2026-11-10" }
    });
    expect(write.statusCode, write.body).toBe(403);
  });

  it("opens the same manual authoring shape without creating an empty database draft", async () => {
    const cookie = await staffCookie(DEMO_IDS.operator);
    const response = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-11/resources/manual?cefr=A2", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    const pool = response.json();
    expect(pool.coreTerms).toHaveLength(48);
    expect(pool.coreTerms.every((term: { word: string }) => term.word === "")).toBe(true);
    expect(pool.sounds).toHaveLength(4);
    expect(pool.sounds.every((sound: { ipa: string }) => sound.ipa === "")).toBe(true);
    expect((await repositories.monthlyContent.getOverview(DEMO_IDS.operator, month)).frameworks.map(item => item.cefr)).toEqual(["A1"]);
  });

  it("corrects the exact exercise and regrades both the appellant and another learner", async () => {
    const lessonId = days[0]!.lessonId;
    await pool.query("update month_frameworks set published_on = '2026-11-01' where id = $1", [frameworkId]);
    const anotherLearner = randomUUID();
    await pool.query("insert into users (id, organization_id, role, display_name) values ($1, $2, 'learner', 'Second learner')", [anotherLearner, DEMO_IDS.organization]);
    for (const learner of [DEMO_IDS.learner, anotherLearner]) {
      if (learner === anotherLearner) {
        await pool.query(
          "insert into lesson_part_attempts (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, answer) values ($1, $2, $3, 'reading', $4, 1, 'wrong_retry', 'Goodbye')",
          [randomUUID(), learner, lessonId, randomUUID()]
        );
      }
      await pool.query(
        "insert into progress_records (id, learner_id, lesson_id, evidence) values ($1, $2, $3, '{\"completedPartCodes\":[],\"evidence\":{}}')",
        [randomUUID(), learner, lessonId]
      );
    }
    const exerciseVersionId = (await repositories.learning.findLesson(DEMO_IDS.learner, lessonId))?.exerciseVersionId;
    expect(exerciseVersionId).toBeTruthy();
    const appeal = await repositories.learning.appealLessonPart({
      learnerId: DEMO_IDS.learner, lessonId, partCode: "reading", reason: "The answer key is wrong", exerciseVersionId
    });
    expect(appeal?.status).toBe("pending");
    const review = (await repositories.content.reviewAppeals(DEMO_IDS.operator, { offset: 0 }))?.appeals.find(item => item.exerciseVersionId === exerciseVersionId);
    expect(review).toMatchObject({ question: "Choose the greeting.", answerKey: "Hello" });
    await expect(repositories.content.resolveAppeal(DEMO_IDS.operator, review!.id, "accepted", "Corrected", undefined)).rejects.toThrow("LESSON_EXERCISE_CORRECTION_REQUIRED");
    expect(await repositories.content.resolveAppeal(DEMO_IDS.operator, review!.id, "accepted", "Corrected", undefined, {
      prompt: "Choose the farewell.", correctAnswer: "Goodbye"
    })).toBe(true);
    const grades = await pool.query("select distinct score::int as score from lesson_part_attempts where lesson_id = $1 and part_code = 'reading' and answer = 'Goodbye'", [lessonId]);
    expect(grades.rows).toEqual([{ score: 100 }]);
    const scores = await pool.query("select evidence->'evidence'->'reading'->>'score' as score from progress_records where lesson_id = $1", [lessonId]);
    expect(scores.rows).toEqual([{ score: "100" }, { score: "100" }]);
    expect((await repositories.learning.findLesson(DEMO_IDS.learner, lessonId))?.exerciseVersionId).not.toBe(exerciseVersionId);
  });

  it("plans retention at the month boundary without altering content or pending evidence", async () => {
    const oldVersion = (await pool.query("select id from lesson_versions where lesson_id = $1 order by version limit 1", [days[0]!.lessonId])).rows[0]?.id;
    await pool.query(
      "insert into lesson_part_appeals (id, learner_id, lesson_id, part_code, reason, exercise_version_id) values ($1, $2, $3, 'reading', 'Pending old evidence', $4)",
      [randomUUID(), DEMO_IDS.learner, days[0]!.lessonId, oldVersion]
    );
    const setSystemDate = (date: string) => pool.query(
      "update organization_settings set configuration = configuration || jsonb_build_object('simulatedSystemDate', $2::text) where organization_id = $1",
      [DEMO_IDS.organization, date]
    );
    await setSystemDate("2026-12-01");
    expect(await repositories.learning.findLesson(DEMO_IDS.learner, days[0]!.lessonId)).toMatchObject({ id: days[0]!.lessonId });
    expect(await repositories.monthlyContent.planExpiredContentRetention(DEMO_IDS.manager)).toEqual({ months: [] });
    await setSystemDate("2027-01-01");
    expect(await repositories.monthlyContent.planExpiredContentRetention(DEMO_IDS.manager)).toMatchObject({
      months: [expect.objectContaining({ month, lessons: 2, pendingLessonAppeals: 1 })]
    });
    expect(await repositories.learning.findLesson(DEMO_IDS.learner, days[0]!.lessonId)).toBeNull();
    expect((await repositories.content.reviewAppeals(DEMO_IDS.operator, { offset: 0 }))?.appeals).toContainEqual(expect.objectContaining({
      exerciseVersionId: oldVersion, question: "Choose the greeting.", status: "pending"
    }));
  });

  it("compacts only the reviewed expired payloads and preserves reports and appeal evidence", async () => {
    const lessonId = days[0]!.lessonId;
    const { rows: [appeal] } = await pool.query<{ id: string; exercise_version_id: string }>(
      "select id, exercise_version_id from lesson_part_appeals where lesson_id = $1 and status = 'pending'", [lessonId]
    );
    expect(appeal).toBeDefined();
    await pool.query(
      `update lesson_versions set content = jsonb_set(content, '{parts}', content->'parts' ||
         '{"code":"writing","content":{"prompt":"Remove unrelated prompt"}}'::jsonb)
       where lesson_id = any($1::uuid[])`, [days.map(day => day.lessonId)]
    );
    await pool.query(
      "update progress_records set status = 'completed', score = 95, completed_at = now() where lesson_id = $1 and learner_id = $2",
      [lessonId, DEMO_IDS.learner]
    );
    await pool.query("update program_months set theme_brief = 'Expired teaching brief' where id = $1", [monthId]);
    await pool.query("update month_frameworks set curriculum_contract = curriculum_contract || '{\"coreTerms\":[{\"word\":\"remove-me\"}]}' where id = $1", [frameworkId]);
    const definitionId = randomUUID();
    const blueprint = {
      key: "monthly-final-2026-11-a1", title: "November final", kind: "final", version: 1,
      totalScore: 100, totalMinutes: 90,
      sections: [{ code: "reading", label: "Đọc", durationMinutes: 20, maxScore: 25, groups: [
        { key: "R", title: "Reading", instruction: "Read the text", tasks: [{ key: "R1", prompt: "Private exam question", correctAnswer: "A" }] }
      ] }]
    };
    await pool.query("insert into assessment_definitions (id, organization_id, assessment_key, kind, title) values ($1, $2, $3, 'final', $4)", [definitionId, DEMO_IDS.organization, blueprint.key, blueprint.title]);
    const retainedExam = randomUUID();
    const compactedExam = randomUUID();
    await pool.query("insert into assessment_versions (id, definition_id, version, status, blueprint) values ($1, $2, 1, 'retired', $4), ($3, $2, 2, 'published', $4)", [retainedExam, definitionId, compactedExam, JSON.stringify(blueprint)]);
    const retainedAttempt = randomUUID();
    const completedAttempt = randomUUID();
    await pool.query(
      `insert into assessment_attempts (id, assessment_version_id, learner_id, status, started_at)
       values ($1, $2, $5, 'approved', now() - interval '2 seconds'), ($3, $4, $5, 'approved', now() - interval '1 second')`,
      [retainedAttempt, retainedExam, completedAttempt, compactedExam, DEMO_IDS.learner]
    );
    await pool.query(
      "insert into assessment_decisions (id, attempt_id, status, decided_at) values ($1, $2, 'approved', now() - interval '10 days'), ($3, $4, 'approved', now() - interval '10 days')",
      [randomUUID(), retainedAttempt, randomUUID(), completedAttempt]
    );
    await pool.query("insert into appeals (id, attempt_id, learner_id, reason) values ($1, $2, $3, 'Pending exam evidence')", [randomUUID(), retainedAttempt, DEMO_IDS.learner]);
    await pool.query("insert into assessment_responses (id, attempt_id, section, task_key, response) values ($1, $2, 'reading', 'R1', '{\"value\":\"A\",\"evidenceType\":\"text\"}')", [randomUUID(), retainedAttempt]);
    await pool.query("insert into assessment_scores (id, attempt_id, section, score, source) values ($1, $2, 'reading', 21, 'human')", [randomUUID(), completedAttempt]);
    const beforeReport = await repositories.manager.monthlyOverview(DEMO_IDS.manager, { month, cefr: "A1" });
    expect(beforeReport?.learners.find(learner => learner.learnerId === DEMO_IDS.learner)).toMatchObject({
      lessons: { scheduled: 1, completed: 1 }, reviews: { scheduled: 1, completed: 0 },
      exam: { status: "approved", scores: { reading: 21 } }
    });
    const beforeAppeals = await repositories.content.reviewAppeals(DEMO_IDS.operator, { offset: 0 });

    const client = await pool.connect();
    const scope = { actorId: DEMO_IDS.manager, organizationId: DEMO_IDS.organization, month };
    try {
      const plan = await previewExpiredMonthCompaction(client, scope);
      expect(plan.held).toContainEqual(expect.objectContaining({ id: retainedExam, reason: "exam evidence" }));
      expect(plan.changes).toContainEqual(expect.objectContaining({ id: compactedExam, kind: "exam" }));
      await expect(compactExpiredMonthForTest(client, scope, plan.digest)).rejects.toThrow("RETENTION_TEST_ONLY");
      await client.query("set e4s.retention_disposable = 'on'");
      await client.query("update program_months set theme_brief = 'Changed after preview' where id = $1", [monthId]);
      await expect(compactExpiredMonthForTest(client, scope, plan.digest)).rejects.toThrow("RETENTION_PLAN_CHANGED");
      expect((await client.query("select theme_brief from program_months where id = $1", [monthId])).rows[0]?.theme_brief).toBe("Changed after preview");
      await client.query("update program_months set theme_brief = 'Expired teaching brief' where id = $1", [monthId]);
      expect(await compactExpiredMonthForTest(client, scope, plan.digest)).toBe(plan.changes.length);
      const after = await previewExpiredMonthCompaction(client, scope);
      expect(after.changes).toEqual([]);
      expect(await compactExpiredMonthForTest(client, scope, after.digest)).toBe(0);
    } finally {
      await client.query("reset e4s.retention_disposable");
      client.release();
    }
    const lessonContent = await pool.query("select content from lesson_versions where lesson_id = $1 order by version", [lessonId]);
    expect(lessonContent.rows.map(row => row.content.parts.map((part: { code: string }) => part.code))).toEqual([["reading"], ["reading"]]);
    expect((await pool.query("select content->'parts' as parts from lesson_versions where lesson_id = $1", [days[1]!.lessonId])).rows).toEqual([{ parts: [] }]);
    expect((await pool.query("select blueprint from assessment_versions where id = $1", [retainedExam])).rows[0]?.blueprint).toEqual(blueprint);
    expect((await pool.query("select blueprint->'sections'->0 as section from assessment_versions where id = $1", [compactedExam])).rows[0]?.section)
      .toMatchObject({ groups: [], maxScore: 25 });
    expect((await pool.query("select response from assessment_responses where attempt_id = $1 and task_key = 'R1'", [retainedAttempt])).rows[0]?.response)
      .toEqual({ value: "A", evidenceType: "text" });
    const afterReport = await repositories.manager.monthlyOverview(DEMO_IDS.manager, { month, cefr: "A1" });
    expect({ ...afterReport, generatedAt: beforeReport?.generatedAt }).toEqual(beforeReport);
    expect((await repositories.content.reviewAppeals(DEMO_IDS.operator, { offset: 0 }))?.appeals.find(item => item.id === appeal?.id))
      .toEqual(beforeAppeals?.appeals.find(item => item.id === appeal?.id));
    expect((await pool.query("select count(*)::int as count from audit_events where action = 'monthly.retention_compacted' and entity_id = $1", [monthId])).rows[0]?.count).toBe(1);
  });
});
