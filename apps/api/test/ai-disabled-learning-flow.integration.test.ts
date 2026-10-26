import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiTaskRunner } from "@e4s/ai";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import { createOrganizationAiRunnerFactory } from "../src/modules/ai/runtime.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

function manualLesson(dayNumber: number) {
  return {
    dayNumber,
    title: `Bài soạn tay T${dayNumber + 1}`,
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Giới thiệu công việc bằng một câu hoàn chỉnh." } },
      { code: "instruction", title: "Hướng dẫn", content: { steps: ["Học nội dung", "Làm đủ bài tập", "Gửi file nói"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"].map((word) => ({ word, meaning: "từ công việc", imageUrl: `https://cdn.example.test/${word}.jpg`, collocations: [`my ${word}`, `new ${word}`, `work ${word}`] })) } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [department] as [role].", usage: "Dùng để giới thiệu công việc.", examples: ["I work in AI as an intern."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/w/", instruction: "Round your lips.", words: ["work", "week", "well"], audioUrl: "https://cdn.example.test/pronunciation-w.mp3" } },
      { code: "listening", title: "Nghe", content: { script: "I work in AI as an intern.", audioUrl: "https://cdn.example.test/listening.mp3", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
      { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
      { code: "writing", title: "Viết", content: { type: "fill", prompt: "I work in ___.", answer: "AI" } },
      { code: "word_class", title: "Từ loại", content: { prompt: "What is role?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
      { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence is correct?", options: ["I work in AI.", "I works AI.", "I working AI.", "I work AI yesterday."], answer: "I work in AI." } },
      { code: "speaking", title: "Nói", content: { prompt: "Introduce your role.", answer: "I work in AI as an intern.", modelAnswer: "I work in AI as an intern.", audioUrl: "https://cdn.example.test/speaking-sample.mp3" } }
    ]
  };
}

describe("Manager AI-off mode keeps the learning flow usable", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const runTask = vi.fn(async () => {
    throw new Error("AI must not run while Manager AI-off mode is enabled");
  });
  const fallbackRunner = { runTask } as unknown as AiTaskRunner;
  const app = buildApi({
    pool,
    secureCookies: false,
    aiRunner: fallbackRunner,
    aiRunnerFactory: createOrganizationAiRunnerFactory(pool, fallbackRunner, { preferFallback: true })
  });
  let managerCookie = "";
  let operatorCookie = "";
  let learnerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash, updated_at = now()`,
        [
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.learner, await createPinHash("123456")
        ]
      );
      await client.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    } finally {
      client.release();
    }
    await app.ready();
    const managerLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    const learnerLogin = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    const operatorLogin = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" }
    });
    managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    operatorCookie = String(operatorLogin.headers["set-cookie"]).split(";")[0] ?? "";
    learnerCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const current = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    const { organizationName: _organizationName, ...settings } = current.json();
    const disabled = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...settings, aiTestDisabled: true }
    });
    expect(disabled.statusCode, disabled.body).toBe(200);
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("disables every learning AI entry point but preserves deterministic study and weekly submission", async () => {
    await pool.query("update programs set start_date = current_date - 6 where organization_id = $1", [DEMO_IDS.organization]);
    const capabilities = await app.inject({ method: "GET", url: "/api/v1/system/capabilities", headers: { cookie: managerCookie } });
    expect(capabilities.statusCode, capabilities.body).toBe(200);
    expect(capabilities.json()).toMatchObject({ ai: false, aiTestDisabled: true });

    const home = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie: learnerCookie } });
    expect(home.statusCode, home.body).toBe(200);
    expect(home.json()).toMatchObject({ microGenerationAvailable: false });

    const generation = await app.inject({
      method: "POST", url: "/api/v1/micro-lessons", headers: { cookie: learnerCookie },
      payload: { requestId: randomUUID() }
    });
    expect(generation.statusCode, generation.body).toBe(503);
    expect(generation.json()).toEqual({ code: "AI_UNAVAILABLE" });

    const aiAuthoring = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A2/generate", headers: { cookie: operatorCookie }, payload: {}
    });
    expect(aiAuthoring.statusCode, aiAuthoring.body).toBe(503);
    expect(aiAuthoring.json()).toEqual({ code: "AI_UNAVAILABLE" });

    const draft = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A2/draft", headers: { cookie: operatorCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(manualLesson) }
    });
    expect(draft.statusCode, draft.body).toBe(201);
    expect(draft.json().lessons).toHaveLength(5);
    expect(draft.json().lessons[0]).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({ code: "vocabulary", content: expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ imageUrl: expect.stringContaining(".jpg") })]) }) }),
        expect.objectContaining({ code: "pronunciation", content: expect.objectContaining({ audioUrl: expect.stringContaining(".mp3") }) }),
        expect.objectContaining({ code: "listening", content: expect.objectContaining({ audioUrl: expect.stringContaining(".mp3"), answer: "AI" }) }),
        expect.objectContaining({ code: "writing", content: expect.objectContaining({ type: "fill", answer: "AI" }) }),
        expect.objectContaining({ code: "speaking", content: expect.objectContaining({ audioUrl: expect.stringContaining(".mp3") }) })
      ])
    });
    const weekly = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A2/draft/weekly-practice", headers: { cookie: operatorCookie },
      payload: {
        expectedVersion: draft.json().version,
        task: "Write three sentences about your work.",
        guidance: "Use department, role and project.",
        requiredVocabulary: ["department", "role", "project"]
      }
    });
    expect(weekly.statusCode, weekly.body).toBe(200);
    const review = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${weekly.json().versionId}/review`,
      headers: { cookie: operatorCookie }, payload: {}
    });
    expect(review.statusCode, review.body).toBe(200);
    const published = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${weekly.json().versionId}/publication`,
      headers: { cookie: operatorCookie }, payload: {}
    });
    expect(published.statusCode, published.body).toBe(200);

    const publishedLessonIds = (published.json().lessons as Array<{ id: string }>).map((item) => item.id);
    for (const lessonId of publishedLessonIds) {
      const study = await app.inject({ method: "POST", url: `/api/v1/lessons/${lessonId}/study-completion`, headers: { cookie: learnerCookie }, payload: {} });
      expect(study.statusCode, study.body).toBe(200);
      const lesson = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie: learnerCookie } });
      const required = new Set(["listening", "reading", "writing", "word_class", "word_use", "speaking"]);
      for (const part of lesson.json().content.parts as Array<{ code: string; content: Record<string, unknown> }>) {
        if (!required.has(part.code)) continue;
        const payload = part.code === "speaking"
          ? { requestId: randomUUID(), artifactKey: `no-ai-${lessonId}.webm` }
          : { requestId: randomUUID(), answer: String(part.content.answer ?? "fixture") };
        const attempted = await app.inject({
          method: "POST", url: `/api/v1/lessons/${lessonId}/parts/${part.code}/attempts`,
          headers: { cookie: learnerCookie }, payload
        });
        expect(attempted.statusCode, `${part.code}: ${attempted.body}`).toBe(200);
        expect(attempted.json().evidence.status, `${part.code}: ${attempted.body}`).toBe(part.code === "speaking" ? "submitted" : "correct");
      }
      const afterAttempts = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie: learnerCookie } });
      const completed = await app.inject({
        method: "PUT", url: `/api/v1/lessons/${lessonId}/progress`, headers: { cookie: learnerCookie },
        payload: { completedPartCodes: afterAttempts.json().progress.completedPartCodes, evidence: afterAttempts.json().progress.evidence, markComplete: true }
      });
      expect(completed.statusCode, completed.body).toBe(200);
      expect(completed.json().status).toBe("completed");
    }

    const practiceText = "My department works on a project. My role helps the team. I discuss the project every day.";
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie: learnerCookie },
      payload: { requestId: randomUUID(), text: practiceText }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ state: "submitted", reviewState: "ungraded", submission: { status: "submitted", score: null } });
    expect(runTask).not.toHaveBeenCalled();
  });
});
