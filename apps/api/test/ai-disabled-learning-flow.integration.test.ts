import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AI_TASKS, createAiService, type AiProviderRequest, type AiTaskRunner } from "@e4s/ai";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import { createOrganizationAiRunnerFactory } from "../src/modules/ai/runtime.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const manualVocabulary = [
  [["department", "division", "organizational unit", "departmental"], ["role", "function", "responsibility", "role-based"], ["project", "undertaking", "piece of work", "project-based"]],
  [["client", "customer", "business contact", "clientele"], ["feedback", "comments", "response", "feed back"], ["meeting", "session", "event", "meet"]],
  [["budget", "spending plan", "financial plan", "budgeting"], ["plan", "strategy", "proposal", "planner"], ["team", "crew", "group", "teammate"]],
  [["delay", "postponement", "disruption", "delayed"], ["schedule", "timetable", "document", "scheduling"], ["report", "write-up", "publication", "reporter"]],
  [["file", "record", "resource", "filing"], ["time", "moment", "measurement", "timing"], ["room", "chamber", "space", "roomy"]]
] as const;

function manualLesson(dayNumber: number) {
  return {
    dayNumber,
    title: `Bài soạn tay T${dayNumber + 1}`,
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Giới thiệu công việc bằng một câu hoàn chỉnh." } },
      { code: "instruction", title: "Hướng dẫn", content: { steps: ["Học nội dung", "Làm đủ bài tập", "Gửi file nói"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: manualVocabulary[dayNumber - 1]!.map(([word, synonym, umbrella, family]) => ({ word, meaning: "từ công việc", imageUrl: `https://cdn.example.test/${word}.jpg`, collocations: [`my ${word}`, `new ${word}`, `work ${word}`], synonyms: [synonym], umbrella, family: [family] })) } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [department] as [role].", usage: "Dùng để giới thiệu công việc.", examples: ["I work in AI as an intern."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/w/", instruction: "Round your lips.", words: [{ word: "work", ipa: "/wɜːk/" }, { word: "week", ipa: "/wiːk/" }, { word: "well", ipa: "/wel/" }], audioUrl: "https://cdn.example.test/pronunciation-w.mp3" } },
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
          DEMO_IDS.manager, await createCredentialHash("test-manager-pw"),
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
      payload: { email: "quoc.bao.le@e4s.local", password: "test-manager-pw" }
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

  it("honors the AI-off switch for monthly authoring even with an environment runner", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/content/months/2026-11/brief/suggest",
      headers: { cookie: operatorCookie }, payload: {}
    });

    expect(response.statusCode, response.body).toBe(503);
    expect(response.json()).toEqual({ code: "AI_UNAVAILABLE" });
    expect(runTask).not.toHaveBeenCalled();
  });

  it("keeps learner home and assessment submission usable if the AI credential cannot be decrypted", async () => {
    const api = buildApi({
      pool,
      secureCookies: false,
      aiRunnerFactory: createOrganizationAiRunnerFactory(pool),
      storage: { putObject: vi.fn(), deleteObject: vi.fn(), ready: vi.fn().mockResolvedValue(undefined) }
    });
    const savedKey = process.env.E4S_SETTINGS_ENCRYPTION_KEY;
    process.env.E4S_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");
    try {
      await pool.query(
        "update organization_settings set configuration = jsonb_set(configuration, '{aiTestDisabled}', 'false'::jsonb) where organization_id = $1",
        [DEMO_IDS.organization]
      );
      await pool.query(
        `insert into provider_configurations (organization_id, provider, base_url, model, secret_ciphertext, secret_nonce, secret_auth_tag)
         values ($1, 'openai', 'https://unused.invalid/v1', 'probe', $2, $3, $4)`,
        [
          DEMO_IDS.organization,
          Buffer.alloc(15, 9).toString("base64"),
          Buffer.alloc(12, 9).toString("base64"),
          Buffer.alloc(16, 9).toString("base64")
        ]
      );

      const capabilities = await api.inject({
        method: "GET", url: "/api/v1/system/capabilities", headers: { cookie: managerCookie }
      });
      expect(capabilities.statusCode, capabilities.body).toBe(200);
      expect(capabilities.json()).toMatchObject({ ai: false, aiConfigured: true });

      delete process.env.E4S_SETTINGS_ENCRYPTION_KEY;
      const readiness = await api.inject({ method: "GET", url: "/api/readiness" });
      expect(readiness.statusCode, readiness.body).toBe(200);
      process.env.E4S_SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString("base64");

      const home = await api.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie: learnerCookie } });
      expect(home.statusCode, home.body).toBe(200);
      expect(home.json()).toMatchObject({ microGenerationAvailable: false });

      const learnerId = randomUUID();
      await pool.query(
        "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'C1 AI-off', 'c1-ai-off@e4s.local')",
        [learnerId, DEMO_IDS.organization]
      );
      await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [learnerId, await createPinHash("654321")]);
      await pool.query(
        "insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ($1, $2, $3, 'C1', true)",
        [randomUUID(), DEMO_IDS.program, learnerId]
      );
      await pool.query(
        "insert into pass_course_readiness (learner_id, organization_id, cefr_ready) values ($1, $2, true)",
        [learnerId, DEMO_IDS.organization]
      );

      const login = await api.inject({
        method: "POST", url: "/api/auth/learner/login", payload: { email: "c1-ai-off@e4s.local", pin: "654321" }
      });
      expect(login.statusCode, login.body).toBe(200);
      const headers = { cookie: String(login.headers["set-cookie"]).split(";")[0] ?? "" };
      const started = await api.inject({ method: "POST", url: "/api/v1/assessments/pass-course/start", headers, payload: {} });
      expect(started.statusCode, started.body).toBe(201);
      const attemptId = started.json().attempt.id as string;
      for (const section of ["listening", "reading", "writing"]) {
        const finished = await api.inject({
          method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/sections/${section}/complete`, headers
        });
        expect(finished.statusCode, finished.body).toBe(200);
      }
      const submitted = await api.inject({
        method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/submit`, headers
      });
      expect(submitted.statusCode, submitted.body).toBe(200);
      expect(submitted.json()).toMatchObject({ attempt: { id: attemptId, status: "pending_review" } });
    } finally {
      await api.close();
      await pool.query("delete from provider_configurations where organization_id = $1", [DEMO_IDS.organization]);
      await pool.query(
        "update organization_settings set configuration = jsonb_set(configuration, '{aiTestDisabled}', 'true'::jsonb) where organization_id = $1",
        [DEMO_IDS.organization]
      );
      if (savedKey === undefined) delete process.env.E4S_SETTINGS_ENCRYPTION_KEY;
      else process.env.E4S_SETTINGS_ENCRYPTION_KEY = savedKey;
    }
  });
  it("still saves a placement submission when the configured AI provider times out", async () => {
    const complete = vi.fn((_request: AiProviderRequest) => new Promise<never>(() => {}));
    const runner = createAiService({
      registry: AI_TASKS,
      provider: { name: "timeout-test", model: "timeout-test", complete },
      loadPrompt: async () => "Controlled timeout test",
      timeoutMs: 15,
      maxAttempts: 1
    });
    const api = buildApi({ pool, secureCookies: false, aiRunner: runner });
    try {
      const learnerId = randomUUID();
      const email = "placement-timeout@e4s.local";
      await pool.query(
        "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Placement timeout', $3)",
        [learnerId, DEMO_IDS.organization, email]
      );
      await pool.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [learnerId, await createPinHash("654321")]);
      await pool.query(
        "insert into learner_profiles (user_id, profile, completed_at) select $1, profile, completed_at from learner_profiles where user_id = $2",
        [learnerId, DEMO_IDS.learner]
      );
      const login = await api.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email, pin: "654321" } });
      expect(login.statusCode, login.body).toBe(200);
      const headers = { cookie: String(login.headers["set-cookie"]).split(";")[0] ?? "" };
      const start = await api.inject({ method: "POST", url: "/api/v1/assessments/placement/start", headers, payload: {} });
      expect(start.statusCode, start.body).toBe(201);
      const attemptId = start.json().attempt.id as string;
      for (const section of ["listening", "reading", "writing"]) {
        const response = await api.inject({ method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/sections/${section}/complete`, headers });
        expect(response.statusCode, response.body).toBe(200);
      }
      const submitted = await api.inject({ method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/submit`, headers });
      expect(submitted.statusCode, submitted.body).toBe(200);
      expect(submitted.json()).toMatchObject({ attempt: { id: attemptId, status: "pending_review" } });
      await vi.waitFor(async () => {
        expect(complete).toHaveBeenCalledTimes(1);
        expect(complete.mock.calls[0]?.[0].signal.aborted).toBe(true);
        const jobs = await pool.query("select state, last_error from jobs where kind = 'assessment.ai-score-auto' and payload->>'attemptId' = $1", [attemptId]);
        expect(jobs.rows).toEqual([{ state: "failed", last_error: "AI_TIMEOUT" }]);
      }, { timeout: 4_000 });
      const repeated = await api.inject({ method: "POST", url: `/api/v1/assessment-attempts/${attemptId}/submit`, headers });
      expect(repeated.statusCode, repeated.body).toBe(200);
      const [operatorInbox, managerInbox, learnerInbox, otherLearnerInbox] = await Promise.all(
        [operatorCookie, managerCookie, headers.cookie, learnerCookie].map(cookie =>
          api.inject({ method: "GET", url: "/api/v1/me/notifications?limit=50", headers: { cookie } })
        )
      );
      const operatorItems = operatorInbox!.json().items.filter((item: { relatedId: string }) => item.relatedId === attemptId);
      expect(operatorItems).toEqual([expect.objectContaining({ kind: "assessment_manual_review", context: "placement", readAt: null })]);
      expect(managerInbox!.json().items).toContainEqual(expect.objectContaining({ kind: "assessment_grading_interrupted", context: "placement", relatedId: null }));
      expect(learnerInbox!.json().items).toContainEqual(expect.objectContaining({ kind: "assessment_submission_saved", context: "placement", relatedId: attemptId }));
      expect(otherLearnerInbox!.json().items).not.toContainEqual(expect.objectContaining({ relatedId: attemptId }));
      expect([operatorInbox!.body, managerInbox!.body, learnerInbox!.body].join()).not.toContain("AI_TIMEOUT");
    } finally {
      await api.close();
    }
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
      payload: { requestId: randomUUID(), regenerate: true }
    });
    expect(generation.statusCode, generation.body).toBe(503);
    expect(generation.json()).toEqual({ code: "AI_UNAVAILABLE" });

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
      for (const word of ["work", "week", "well"]) {
        const listened = await app.inject({
          method: "POST", url: `/api/v1/lessons/${lessonId}/pronunciation/listens`,
          headers: { cookie: learnerCookie }, payload: { word }
        });
        expect(listened.statusCode, listened.body).toBe(200);
      }
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

  it("keeps today's saved micro lesson and preserves open answers when a provider returns an invalid grade", async () => {
    const microId = randomUUID();
    await pool.query(
      `insert into micro_lessons (id, learner_id, program_week_id, cefr, topic, content, source)
       values ($1, $2, $3, 'A2', 'Confirm a meeting', $4, 'seed')`,
      [microId, DEMO_IDS.learner, DEMO_IDS.week, {
        durationMinutes: 5, theory: "Confirm the time.", vocabulary: ["confirm", "meeting", "time"],
        practice: { prompt: "Confirm the meeting.", type: "write", answer: "I confirm the meeting." }
      }]
    );
    const existing = await app.inject({ method: "POST", url: "/api/v1/micro-lessons", headers: { cookie: learnerCookie }, payload: { requestId: randomUUID() } });
    expect(existing.statusCode, existing.body).toBe(200);
    expect(existing.json()).toMatchObject({ id: microId, regenerateAvailable: false });
    const malformed = { runTask: vi.fn().mockResolvedValue({ output: {} }) } as unknown as AiTaskRunner;
    const api = buildApi({ pool, secureCookies: false, aiRunner: malformed });
    try {
      const answer = "The meeting is confirmed for tomorrow.";
      const response = await api.inject({ method: "POST", url: `/api/v1/micro-lessons/${microId}/attempts`, headers: { cookie: learnerCookie }, payload: { answer } });
      expect(response.statusCode, response.body).toBe(200);
      const saved = await pool.query<{ progress: Record<string, unknown> }>("select progress from micro_lessons where id = $1", [microId]);
      expect(saved.rows[0]?.progress).toMatchObject({ attempt: { answer, correct: null } });
      expect(malformed.runTask).toHaveBeenCalledOnce();
    } finally {
      await api.close();
    }
  });
});
