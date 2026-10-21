import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const checkerId = "00000000-0000-4000-8000-000000000104";

function lesson(dayNumber: number) {
  return {
    dayNumber,
    title: `Bài mới T${dayNumber + 1}`,
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Tự giới thiệu công việc." } },
      { code: "instruction", title: "Hướng dẫn", content: { text: "Dùng I work in… as…" } },
      { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"] } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [team] as [role]." } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/w/" } },
      { code: "listening", title: "Nghe", content: { prompt: "Where does she work?" } },
      { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern." } },
      { code: "writing", title: "Viết", content: { prompt: "Write one sentence." } },
      { code: "speaking", title: "Nói", content: { prompt: "Introduce your role." } }
    ]
  };
}

describe("content operations API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let learnerCookie = "";
  let makerCookie = "";
  let checkerCookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, 'operator', 'Minh Checker', 'checker@e4s.local')
         on conflict (id) do update set role = excluded.role, display_name = excluded.display_name, email = excluded.email`,
        [checkerId, DEMO_IDS.organization]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)",
        [
          DEMO_IDS.learner, await createCredentialHash("learner-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          checkerId, await createCredentialHash("checker-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();

    const login = async (url: string, email: string, password: string) => {
      const response = await app.inject({ method: "POST", url, payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    learnerCookie = await login("/api/auth/learner/login", "learner@e4s.local", "learner-pass");
    makerCookie = await login("/api/auth/staff/login", "operator@e4s.local", "operator-pass");
    checkerCookie = await login("/api/auth/staff/login", "checker@e4s.local", "checker-pass");
    managerCookie = await login("/api/auth/staff/login", "manager@e4s.local", "manager-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("lets the Manager administer the two-week topic frame", async () => {
    const read = await app.inject({ method: "GET", url: "/api/v1/content/weeks", headers: { cookie: managerCookie } });
    expect(read.statusCode, read.body).toBe(200);
    expect(read.json()).toMatchObject({
      pilot: { weekCount: 2 },
      weeks: [
        { weekNumber: 1, topic: "Introducing yourself & your job" },
        { weekNumber: 2, topic: "Emails & rescheduling meetings" }
      ]
    });

    const managerWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/weeks", headers: { cookie: managerCookie },
      payload: { weeks: [{ weekNumber: 1, topic: "Changed", description: "", objectives: "", keyVocabHint: "" }] }
    });
    expect(managerWrite.statusCode, managerWrite.body).toBe(200);
    expect(managerWrite.json()).toMatchObject({ weeks: expect.arrayContaining([expect.objectContaining({ weekNumber: 1, topic: "Changed" })]) });

    const plan = { A2: ["T2", "T3", "T4", "T5", "T6"] };
    const planWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/weeks", headers: { cookie: managerCookie },
      payload: { weeks: [{ weekNumber: 1, topic: "Changed", description: "", objectives: "", keyVocabHint: "", plan }] }
    });
    expect(planWrite.statusCode, planWrite.body).toBe(200);
    expect(planWrite.json()).toMatchObject({ weeks: expect.arrayContaining([expect.objectContaining({ weekNumber: 1, plan })]) });

    const replacementPlan = { A2: ["Mới 1", "Mới 2", "Mới 3", "Mới 4", "Mới 5"] };
    const replacementWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/weeks", headers: { cookie: managerCookie },
      payload: { weeks: [{ weekNumber: 1, topic: "Changed", description: "", objectives: "", keyVocabHint: "", plan: replacementPlan }] }
    });
    expect(replacementWrite.statusCode, replacementWrite.body).toBe(200);
    expect(replacementWrite.json()).toMatchObject({ weeks: expect.arrayContaining([expect.objectContaining({ weekNumber: 1, plan: replacementPlan })]) });

    const metadataOnlyWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/weeks", headers: { cookie: managerCookie },
      payload: { weeks: [{ weekNumber: 1, topic: "Changed again", description: "", objectives: "", keyVocabHint: "" }] }
    });
    expect(metadataOnlyWrite.statusCode, metadataOnlyWrite.body).toBe(200);
    expect(metadataOnlyWrite.json()).toMatchObject({ weeks: expect.arrayContaining([expect.objectContaining({ weekNumber: 1, topic: "Changed again", plan })]) });

    const operatorWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/weeks", headers: { cookie: makerCookie },
      payload: { weeks: [{
        weekNumber: 2,
        topic: "Emails & rescheduling meetings",
        description: "Viết email ngắn xin dời lịch và xác nhận lịch mới.",
        objectives: "Viết email 60–100 từ xin dời lịch.",
        keyVocabHint: "reschedule, postpone, available, confirm"
      }] }
    });
    expect(operatorWrite.statusCode, operatorWrite.body).toBe(200);
  });

  it("enforces draft → review → checker publication and hides drafts from learners", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A2/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(lesson) }
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ status: "draft", version: 2, createdBy: DEMO_IDS.operator });
    const { versionId, lessons } = created.json() as { versionId: string; lessons: Array<{ id: string }> };

    const hiddenDraft = await app.inject({
      method: "GET", url: `/api/v1/lessons/${lessons[0]?.id}`, headers: { cookie: learnerCookie }
    });
    expect(hiddenDraft.statusCode).toBe(404);

    const submitted = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${versionId}/review`,
      headers: { cookie: makerCookie }, payload: {}
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ versionId, status: "review" });

    const selfApproval = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${versionId}/publication`,
      headers: { cookie: makerCookie }, payload: {}
    });
    expect(selfApproval.statusCode).toBe(409);
    expect(selfApproval.json()).toMatchObject({ code: "CONTENT_MAKER_CANNOT_APPROVE" });

    const managerApproval = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${versionId}/publication`,
      headers: { cookie: managerCookie }, payload: {}
    });
    expect(managerApproval.statusCode, managerApproval.body).toBe(200);
    expect(managerApproval.json()).toMatchObject({ versionId, status: "published", approvedBy: DEMO_IDS.manager });

    const visibleLesson = await app.inject({
      method: "GET", url: `/api/v1/lessons/${lessons[0]?.id}`, headers: { cookie: learnerCookie }
    });
    expect(visibleLesson.statusCode, visibleLesson.body).toBe(200);
    expect(visibleLesson.json()).toMatchObject({ id: lessons[0]?.id, title: "Bài mới T2" });

    await expect(pool.query(
      "update lesson_set_versions set payload = $2::jsonb where id = $1",
      [versionId, JSON.stringify({ changed: randomUUID() })]
    )).rejects.toThrow(/immutable/i);

    const managerRetirement = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${versionId}/retirement`,
      headers: { cookie: managerCookie }, payload: {}
    });
    expect(managerRetirement.statusCode, managerRetirement.body).toBe(200);
    const retired = managerRetirement;
    expect(retired.statusCode, retired.body).toBe(200);
    expect(retired.json()).toMatchObject({ versionId, status: "retired" });

    const hiddenAfterRetirement = await app.inject({
      method: "GET", url: `/api/v1/lessons/${lessons[0]?.id}`, headers: { cookie: learnerCookie }
    });
    expect(hiddenAfterRetirement.statusCode).toBe(404);
  });

  it("returns the lesson matrix, six review tabs and seven prompt groups without adding screens", async () => {
    const matrix = await app.inject({ method: "GET", url: "/api/v1/content/lesson-matrix", headers: { cookie: makerCookie } });
    expect(matrix.statusCode, matrix.body).toBe(200);
    expect(matrix.json().levels.map((level: { cefr: string }) => level.cefr)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(matrix.json()).toMatchObject({
      levels: [
        { cefr: "A1", learnerCount: 0 }, { cefr: "A2", learnerCount: 1 },
        { cefr: "B1", learnerCount: 0 }, { cefr: "B2", learnerCount: 0 }
      ],
      weeks: [
        expect.objectContaining({ weekNumber: 1, cells: expect.any(Array) }),
        expect.objectContaining({ weekNumber: 2, cells: expect.any(Array) })
      ]
    });

    const review = await app.inject({ method: "GET", url: "/api/v1/content/review", headers: { cookie: managerCookie } });
    expect(review.statusCode, review.body).toBe(200);
    expect(review.json().tabs.map((tab: { key: string }) => tab.key)).toEqual([
      "submissions", "coach", "micro", "appeals", "attempts", "assessments"
    ]);

    const prompts = await app.inject({ method: "GET", url: "/api/v1/content/prompts", headers: { cookie: makerCookie } });
    expect(prompts.statusCode, prompts.body).toBe(200);
    expect(prompts.json().groups).toHaveLength(7);
    expect(prompts.json().groups.map((group: { key: string }) => group.key)).toEqual([
      "system_rules", "assessment_scoring", "weekly_lessons", "week_suggestions",
      "micro_grading", "coach_dialogue", "weekly_practice_grading"
    ]);
  });

  it("lets Manager update prompts while preserving version history", async () => {
    const managerWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/prompts", headers: { cookie: managerCookie },
      payload: { groups: [{ key: "system_rules", content: "Manager-approved system rule." }] }
    });
    expect(managerWrite.statusCode, managerWrite.body).toBe(200);
    expect(managerWrite.json()).toMatchObject({ groups: [expect.objectContaining({ key: "system_rules", content: "Manager-approved system rule." })] });

    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/prompts", headers: { cookie: makerCookie },
      payload: { groups: [{ key: "system_rules", content: "Use concise CEFR-aligned feedback." }] }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      groups: [expect.objectContaining({ key: "system_rules", status: "draft", content: "Use concise CEFR-aligned feedback." })]
    });

    const active = await pool.query<{ id: string }>(
      "select id from prompt_versions where task_key = 'system_rules' and status = 'active'"
    );
    await expect(pool.query("update prompt_versions set content = 'changed' where id = $1", [active.rows[0]?.id]))
      .rejects.toThrow(/immutable/i);
  });
});
