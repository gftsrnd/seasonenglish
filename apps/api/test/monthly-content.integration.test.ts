import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMonthlyCalendar, buildMonthlyCurriculum, createCredentialHash, createPinHash } from "@e4s/domain";
import type { CefrLevel } from "@e4s/contracts";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("monthly content API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const storedObjects = new Map<string, Uint8Array>();
  const storage = {
    async putObject(input: { bucket: string; objectKey: string; body: Uint8Array; mimeType: string }) {
      storedObjects.set(`${input.bucket}/${input.objectKey}`, input.body);
    },
    async deleteObject(bucket: string, objectKey: string) {
      storedObjects.delete(`${bucket}/${objectKey}`);
    },
    async ready() {},
    async presignGetObject(input: { bucket: string; objectKey: string; expiresInSeconds: number }) {
      return {
        url: `https://storage.test/${encodeURIComponent(input.bucket)}/${encodeURIComponent(input.objectKey)}`,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000)
      };
    }
  };
  const app = buildApi({ pool, secureCookies: false, storage });
  let cookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)", [
        DEMO_IDS.operator, await createCredentialHash("operator-pass"),
        DEMO_IDS.manager, await createCredentialHash("manager-pass")
      ]);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.learner, await createPinHash("123456")]);
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const managerLogin = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" } });
    expect(managerLogin.statusCode, managerLogin.body).toBe(200);
    managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("keeps monthly authoring with the operator", async () => {
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/months/2026-12/brief", headers: { cookie },
      payload: { title: "Customer handover", brief: "Prepare a customer handover.", context: "Customer success", communicationGoal: "Explain handover risks." }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const approved = await app.inject({ method: "POST", url: "/api/v1/content/months/2026-12/brief/approve", headers: { cookie } });
    expect(approved.statusCode, approved.body).toBe(204);
    const managerWrite = await app.inject({ method: "PUT", url: "/api/v1/content/months/2026-12/brief", headers: { cookie: managerCookie }, payload: { title: "Blocked", brief: "Managers review, they do not author monthly content.", context: "Review", communicationGoal: "Review results." } });
    expect(managerWrite.statusCode, managerWrite.body).toBe(403);
  });

  it("exposes the Manager-controlled system date and its three-month window to the Operator overview", async () => {
    const settings = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    expect(settings.statusCode, settings.body).toBe(200);
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...(settings.json() as Record<string, unknown>), simulatedSystemDate: "2026-11-14" }
    });
    expect(saved.statusCode, saved.body).toBe(200);

    const overview = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-11", headers: { cookie } });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({
      systemDate: "2026-11-14",
      monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: true }
    });

    const previous = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-10", headers: { cookie } });
    expect(previous.statusCode, previous.body).toBe(200);
    expect(previous.json()).toMatchObject({
      systemDate: "2026-11-14",
      monthWindow: { previous: "2026-10", current: "2026-11", next: "2026-12", writable: false }
    });
  });

  it("keeps one shared brief and locks a submitted framework through the Operator API", async () => {
    const curriculum = contract();
    const brief = await app.inject({
      method: "PUT", url: "/api/v1/content/months/2026-11/brief", headers: { cookie },
      payload: { title: "Quarterly budget review", brief: "Prepare a quarterly budget review.", context: "Finance meeting", communicationGoal: "Explain a cost." }
    });
    expect(brief.statusCode, brief.body).toBe(200);
    const lockedBrief = await app.inject({ method: "POST", url: "/api/v1/content/months/2026-11/brief/approve", headers: { cookie } });
    expect(lockedBrief.statusCode, lockedBrief.body).toBe(204);
    const saved = await app.inject({
      method: "POST", url: "/api/v1/content/months/2026-11/frameworks/generate", headers: { cookie }, payload: { contract: curriculum }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const frameworkId = saved.json<{ id: string }>().id;
    const approved = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/approve`, headers: { cookie } });
    expect(approved.statusCode, approved.body).toBe(204);
    const calendar = buildMonthlyCalendar("2026-11");
    const managerSettings = await app.inject({ method: "GET", url: "/api/v1/manager/settings", headers: { cookie: managerCookie } });
    expect(managerSettings.statusCode, managerSettings.body).toBe(200);
    const setExamDay = await app.inject({
      method: "PUT", url: "/api/v1/manager/settings", headers: { cookie: managerCookie },
      payload: { ...(managerSettings.json() as Record<string, unknown>), simulatedSystemDate: calendar.examDate }
    });
    expect(setExamDay.statusCode, setExamDay.body).toBe(200);
    const finalDraft = await app.inject({ method: "POST", url: `/api/v1/month-frameworks/${frameworkId}/monthly-final`, headers: { cookie } });
    expect(finalDraft.statusCode, finalDraft.body).toBe(201);
    const final = finalDraft.json() as {
      versionId: string;
      blueprint: {
        title: string;
        sections: Array<{
          code: string;
          groups: Array<{ stimulus?: { type: string; lines?: unknown[]; audioSrc?: string } }>;
        }>;
      };
    };
    const boundary = "E4S-monthly-final-audio";
    const uploadedAudio = await app.inject({
      method: "POST",
      url: "/api/v1/files/content-media/audio",
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from([
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="monthly-final.mp3"',
        "Content-Type: audio/mpeg",
        "",
        "monthly final audio fixture",
        `--${boundary}--`,
        ""
      ].join("\r\n"))
    });
    expect(uploadedAudio.statusCode, uploadedAudio.body).toBe(201);
    const audioUrl = uploadedAudio.json<{ url: string; artifactKey: string }>();
    expect(audioUrl.url).toContain("/api/v1/files/content-media/read?artifactKey=");
    expect(storedObjects.has(`e4s-evidence/${audioUrl.artifactKey}`)).toBe(true);
    const finalWithAudio = {
      title: final.blueprint.title,
      sections: final.blueprint.sections.map((section) => section.code === "listening"
        ? { ...section, groups: section.groups.map((group) => ({ ...group, stimulus: group.stimulus?.type === "audio_script" ? { ...group.stimulus, audioSrc: audioUrl.url } : group.stimulus })) }
        : section)
    };
    const savedFinal = await app.inject({ method: "PUT", url: `/api/v1/monthly-final-forms/${final.versionId}`, headers: { cookie }, payload: finalWithAudio });
    expect(savedFinal.statusCode, savedFinal.body).toBe(200);
    const publishedFinal = await app.inject({ method: "POST", url: `/api/v1/monthly-final-forms/${final.versionId}/publication`, headers: { cookie } });
    expect(publishedFinal.statusCode, publishedFinal.body).toBe(200);
    const regeneratedAfterPublication = await app.inject({ method: "POST", url: `/api/v1/month-frameworks/${frameworkId}/monthly-final`, headers: { cookie } });
    expect(regeneratedAfterPublication.statusCode, regeneratedAfterPublication.body).toBe(409);
    expect(regeneratedAfterPublication.json()).toMatchObject({ code: "MONTHLY_FINAL_ALREADY_PUBLISHED" });
    const examScope = await app.inject({ method: "GET", url: `/api/v1/content/month-frameworks/${frameworkId}/exam-scope`, headers: { cookie } });
    expect(examScope.statusCode, examScope.body).toBe(200);
    expect(examScope.json()).toMatchObject({ month: "2026-11", cefr: "A1", coreTermIds: curriculum.coreTerms.map((term) => term.id) });
    const draft = await app.inject({
      method: "PUT", url: `/api/v1/content/month-frameworks/${frameworkId}/days/1`, headers: { cookie }, payload: lessonFor(curriculum, 1)
    });
    expect(draft.statusCode, draft.body).toBe(200);
    expect(draft.json()).toMatchObject({ severe: [], light: [] });
    const approvedDay = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/days/1/approve`, headers: { cookie } });
    expect(approvedDay.statusCode, approvedDay.body).toBe(204);
    const correction = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${frameworkId}/days/1/corrections`, headers: { cookie }, payload: { reason: "Fix the approved example" } });
    expect(correction.statusCode, correction.body).toBe(200);
    const correctionId = correction.json<{ id: string }>().id;
    expect(correction.json()).toMatchObject({ status: "requested" });
    const prematureEdit = await app.inject({ method: "PUT", url: `/api/v1/content/month-frameworks/${frameworkId}/days/1/corrections/${correctionId}`, headers: { cookie }, payload: lessonFor(curriculum, 1) });
    expect(prematureEdit.statusCode).toBe(500);
    const reopenQueue = await app.inject({ method: "GET", url: "/api/v1/manager/reopen-requests", headers: { cookie: managerCookie } });
    expect(reopenQueue.statusCode, reopenQueue.body).toBe(200);
    expect(reopenQueue.json()).toMatchObject({ requests: [{ id: correctionId, target: "daily_lesson", status: "pending" }] });
    const managerApproval = await app.inject({ method: "POST", url: `/api/v1/manager/reopen-requests/${correctionId}/approve`, headers: { cookie: managerCookie }, payload: { reason: "Cần cập nhật ví dụ đã phát hành." } });
    expect(managerApproval.statusCode, managerApproval.body).toBe(200);
    expect(managerApproval.json()).toMatchObject({ id: correctionId, status: "approved", decisionReason: "Cần cập nhật ví dụ đã phát hành." });
    const correctionDraft = await app.inject({ method: "PUT", url: `/api/v1/content/month-frameworks/${frameworkId}/days/1/corrections/${correctionId}`, headers: { cookie }, payload: lessonFor(curriculum, 1) });
    expect(correctionDraft.statusCode, correctionDraft.body).toBe(200);
    expect(correctionDraft.json()).toMatchObject({ severe: [], light: [] });
    const correctionApproved = await app.inject({ method: "POST", url: `/api/v1/content/monthly-corrections/${correctionId}/approve`, headers: { cookie } });
    expect(correctionApproved.statusCode, correctionApproved.body).toBe(204);
    const overview = await app.inject({ method: "GET", url: "/api/v1/content/months/2026-11", headers: { cookie } });
    expect(overview.statusCode, overview.body).toBe(200);
    expect(overview.json()).toMatchObject({ brief: { title: "Quarterly budget review", status: "approved" }, frameworks: [{ id: frameworkId, status: "approved" }] });
    expect(overview.json<{ frameworks: Array<{ lessons: Array<{ status: string; correctionCount: number }> }> }>().frameworks[0]?.lessons[0]).toMatchObject({ status: "approved", correctionCount: 1 });
    await pool.query("update enrollments set cefr = 'A1' where learner_id = $1", [DEMO_IDS.learner]);
    const learnerLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    const learnerCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const learnerMonth = await app.inject({ method: "GET", url: "/api/v1/learner/months/2026-11", headers: { cookie: learnerCookie } });
    expect(learnerMonth.statusCode, learnerMonth.body).toBe(200);
    expect(learnerMonth.json()).toMatchObject({ month: "2026-11", lessons: [{ dayNumber: 1, title: "The budget list" }] });
    const lessonId = learnerMonth.json<{ lessons: Array<{ id: string }> }>().lessons[0]!.id;
    const learnerLesson = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie: learnerCookie } });
    expect(learnerLesson.statusCode, learnerLesson.body).toBe(200);
    expect(learnerLesson.json()).toMatchObject({ id: lessonId, title: "The budget list" });
    const study = await app.inject({ method: "POST", url: `/api/v1/lessons/${lessonId}/study-completion`, headers: { cookie: learnerCookie } });
    expect(study.statusCode, study.body).toBe(200);
    const assignedPronunciationWords = learnerLesson.json<{ content: { parts: Array<{ code: string; content: { words?: Array<{ word: string }> } }> } }>()
      .content.parts.find((part) => part.code === "pronunciation")?.content.words?.slice(0, 3).map((item) => item.word) ?? [];
    expect(assignedPronunciationWords).toHaveLength(3);
    for (const word of assignedPronunciationWords) {
      const listened = await app.inject({
        method: "POST", url: `/api/v1/lessons/${lessonId}/pronunciation/listens`, headers: { cookie: learnerCookie }, payload: { word }
      });
      expect(listened.statusCode, listened.body).toBe(200);
    }
    for (const [code, evidence] of [
      ["listening", { answer: "The budget list" }],
      ["reading", { answer: "The budget list" }],
      ["writing", { answer: "The budget list is ready." }],
      ["word_class", { answer: "The budget list" }],
      ["word_use", { answer: "The budget list" }],
      ["speaking", { artifactKey: "monthly-e2e/speaking.webm" }]
    ] as const) {
      const attempt = await app.inject({
        method: "POST", url: `/api/v1/lessons/${lessonId}/parts/${code}/attempts`, headers: { cookie: learnerCookie },
        payload: { requestId: crypto.randomUUID(), evidence }
      });
      expect(attempt.statusCode, attempt.body).toBe(200);
    }
    const completed = await app.inject({ method: "PUT", url: `/api/v1/lessons/${lessonId}/progress`, headers: { cookie: learnerCookie }, payload: { markComplete: true } });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({ status: "completed" });
    const monthlyExam = await app.inject({ method: "GET", url: "/api/v1/learner/months/2026-11/exam", headers: { cookie: learnerCookie } });
    expect(monthlyExam.statusCode, monthlyExam.body).toBe(200);
    expect(monthlyExam.json()).toMatchObject({ month: "2026-11", status: "ready", completedLessons: 1, totalLessons: 1, remainingLessons: 0 });
    const learnerHome = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie: learnerCookie } });
    expect(learnerHome.statusCode, learnerHome.body).toBe(200);
    expect(learnerHome.json()).toMatchObject({ month: { month: "2026-11", themeTitle: "Quarterly budget review" } });

    const startedFinal = await app.inject({ method: "POST", url: "/api/v1/assessments/monthly/start", headers: { cookie: learnerCookie }, payload: {} });
    expect(startedFinal.statusCode, startedFinal.body).toBe(201);
    const finalAttemptId = startedFinal.json<{ attempt: { id: string } }>().attempt.id;
    for (const section of ["listening", "reading", "writing"] as const) {
      const completedSection = await app.inject({
        method: "POST", url: `/api/v1/assessment-attempts/${finalAttemptId}/sections/${section}/complete`, headers: { cookie: learnerCookie }, payload: {}
      });
      expect(completedSection.statusCode, completedSection.body).toBe(200);
    }
    const submittedFinal = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${finalAttemptId}/submit`, headers: { cookie: learnerCookie }, payload: {} });
    expect(submittedFinal.statusCode, submittedFinal.body).toBe(200);
    expect(submittedFinal.json()).toMatchObject({ screenState: "pending", attempt: { id: finalAttemptId, status: "pending_review" } });
    const appeal = await app.inject({
      method: "POST", url: `/api/v1/assessment-attempts/${finalAttemptId}/appeals`, headers: { cookie: learnerCookie },
      payload: { reason: "Xin xem lại phần viết của bài thi tháng." }
    });
    expect(appeal.statusCode, appeal.body).toBe(201);
    const managerDecision = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/${finalAttemptId}/decision`, headers: { cookie: managerCookie },
      payload: { status: "approved", reason: "Đã đối chiếu bài làm và chấp nhận kết quả bài thi tháng." }
    });
    expect(managerDecision.statusCode, managerDecision.body).toBe(403);
    const operatorDecision = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/${finalAttemptId}/decision`, headers: { cookie },
      payload: { status: "approved", reason: "Đã đối chiếu bài làm và chấp nhận kết quả bài thi tháng." }
    });
    expect(operatorDecision.statusCode, operatorDecision.body).toBe(200);
    expect(operatorDecision.json()).toMatchObject({ attemptId: finalAttemptId, status: "approved", approvedLevel: null, decidedBy: DEMO_IDS.operator });
    const approvedFinal = await app.inject({ method: "GET", url: "/api/v1/assessments/monthly", headers: { cookie: learnerCookie } });
    expect(approvedFinal.statusCode, approvedFinal.body).toBe(200);
    expect(approvedFinal.json()).toMatchObject({
      screenState: "pending", attempt: { id: finalAttemptId, status: "approved" },
      appeal: { status: "accepted", resolution: "Đã đối chiếu bài làm và chấp nhận kết quả bài thi tháng." }
    });

    const c1Curriculum = contract("C1");
    const c1Framework = await app.inject({
      method: "POST", url: "/api/v1/content/months/2026-11/frameworks/generate", headers: { cookie }, payload: { contract: c1Curriculum }
    });
    expect(c1Framework.statusCode, c1Framework.body).toBe(200);
    const c1FrameworkId = c1Framework.json<{ id: string }>().id;
    const c1FrameworkApproval = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${c1FrameworkId}/approve`, headers: { cookie } });
    expect(c1FrameworkApproval.statusCode, c1FrameworkApproval.body).toBe(204);
    const c1FinalDraft = await app.inject({ method: "POST", url: `/api/v1/month-frameworks/${c1FrameworkId}/monthly-final`, headers: { cookie } });
    expect(c1FinalDraft.statusCode, c1FinalDraft.body).toBe(201);
    const c1FinalForm = c1FinalDraft.json() as typeof final;
    const c1FinalWithAudio = {
      title: c1FinalForm.blueprint.title,
      sections: c1FinalForm.blueprint.sections.map((section) => section.code === "listening"
        ? { ...section, groups: section.groups.map((group) => ({ ...group, stimulus: group.stimulus?.type === "audio_script" ? { ...group.stimulus, audioSrc: audioUrl.url } : group.stimulus })) }
        : section)
    };
    const c1SavedFinal = await app.inject({ method: "PUT", url: `/api/v1/monthly-final-forms/${c1FinalForm.versionId}`, headers: { cookie }, payload: c1FinalWithAudio });
    expect(c1SavedFinal.statusCode, c1SavedFinal.body).toBe(200);
    const c1PublishedFinal = await app.inject({ method: "POST", url: `/api/v1/monthly-final-forms/${c1FinalForm.versionId}/publication`, headers: { cookie } });
    expect(c1PublishedFinal.statusCode, c1PublishedFinal.body).toBe(200);
    const c1Day = await app.inject({ method: "PUT", url: `/api/v1/content/month-frameworks/${c1FrameworkId}/days/1`, headers: { cookie }, payload: lessonFor(c1Curriculum, 1) });
    expect(c1Day.statusCode, c1Day.body).toBe(200);
    const c1DayApproval = await app.inject({ method: "POST", url: `/api/v1/content/month-frameworks/${c1FrameworkId}/days/1/approve`, headers: { cookie } });
    expect(c1DayApproval.statusCode, c1DayApproval.body).toBe(204);
    await pool.query("update enrollments set cefr = 'C1' where learner_id = $1", [DEMO_IDS.learner]);
    const c1Month = await app.inject({ method: "GET", url: "/api/v1/learner/months/2026-11", headers: { cookie: learnerCookie } });
    expect(c1Month.statusCode, c1Month.body).toBe(200);
    const c1LessonId = c1Month.json<{ lessons: Array<{ id: string }> }>().lessons[0]!.id;
    await app.inject({ method: "POST", url: `/api/v1/lessons/${c1LessonId}/study-completion`, headers: { cookie: learnerCookie } });
    const c1Lesson = await app.inject({ method: "GET", url: `/api/v1/lessons/${c1LessonId}`, headers: { cookie: learnerCookie } });
    expect(c1Lesson.statusCode, c1Lesson.body).toBe(200);
    const c1PronunciationWords = c1Lesson.json<{ content: { parts: Array<{ code: string; content: { words?: Array<{ word: string }> } }> } }>()
      .content.parts.find((part) => part.code === "pronunciation")?.content.words?.slice(0, 3).map((item) => item.word) ?? [];
    expect(c1PronunciationWords).toHaveLength(3);
    for (const word of c1PronunciationWords) {
      const listened = await app.inject({
        method: "POST", url: `/api/v1/lessons/${c1LessonId}/pronunciation/listens`, headers: { cookie: learnerCookie }, payload: { word }
      });
      expect(listened.statusCode, listened.body).toBe(200);
    }
    for (const [code, evidence] of [
      ["listening", { answer: "The budget list" }], ["reading", { answer: "The budget list" }], ["writing", { answer: "The budget list is ready." }],
      ["word_class", { answer: "The budget list" }], ["word_use", { answer: "The budget list" }], ["speaking", { artifactKey: "monthly-e2e/c1-speaking.webm" }]
    ] as const) {
      const attempt = await app.inject({ method: "POST", url: `/api/v1/lessons/${c1LessonId}/parts/${code}/attempts`, headers: { cookie: learnerCookie }, payload: { requestId: crypto.randomUUID(), evidence } });
      expect(attempt.statusCode, attempt.body).toBe(200);
    }
    const c1Completed = await app.inject({ method: "PUT", url: `/api/v1/lessons/${c1LessonId}/progress`, headers: { cookie: learnerCookie }, payload: { markComplete: true } });
    expect(c1Completed.statusCode, c1Completed.body).toBe(200);
    const c1Final = await app.inject({ method: "POST", url: "/api/v1/assessments/monthly/start", headers: { cookie: learnerCookie }, payload: {} });
    expect(c1Final.statusCode, c1Final.body).toBe(201);
    const c1FinalAttemptId = c1Final.json<{ attempt: { id: string } }>().attempt.id;
    for (const section of ["listening", "reading", "writing"] as const) {
      const completedSection = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${c1FinalAttemptId}/sections/${section}/complete`, headers: { cookie: learnerCookie }, payload: {} });
      expect(completedSection.statusCode, completedSection.body).toBe(200);
    }
    const c1Submitted = await app.inject({ method: "POST", url: `/api/v1/assessment-attempts/${c1FinalAttemptId}/submit`, headers: { cookie: learnerCookie }, payload: {} });
    expect(c1Submitted.statusCode, c1Submitted.body).toBe(200);
    const c1Decision = await app.inject({ method: "POST", url: `/api/v1/assessment-reviews/${c1FinalAttemptId}/decision`, headers: { cookie }, payload: { status: "approved", reason: "Đã đạt yêu cầu C1 của bài thi tháng." } });
    expect(c1Decision.statusCode, c1Decision.body).toBe(200);
    const certificate = await app.inject({ method: "GET", url: "/api/v1/engagement/rewards/done", headers: { cookie: learnerCookie } });
    expect(certificate.statusCode, certificate.body).toBe(200);
    expect(certificate.json()).toMatchObject({ printable: true });
    expect(certificate.json<{ certificateNumber: string | null }>().certificateNumber).toBeTruthy();
  });
});

function lessonFor(curriculum: ReturnType<typeof contract>, dayNumber: number) {
  const spec = curriculum.daySpecs.find((day) => day.lessonNumber === dayNumber)!;
  const terms = spec.coreTermIds.map((id) => curriculum.coreTerms.find((term) => term.id === id)!);
  const sound = curriculum.sounds.find((item) => item.id === spec.soundId)!;
  const pronunciation = spec.pronunciationExampleIds.map((id) => sound.examples.find((item) => item.id === id)!);
  const grammar = curriculum.grammarTopics.flatMap((topic) => topic.steps).find((step) => step.id === spec.grammarStepId)!;
  const choice = { prompt: "Which words are on the budget list?", options: ["The budget list", "A travel plan", "A lunch menu", "A sports team"], answer: "The budget list" };
  return { title: "The budget list", parts: [
    { code: "objective", content: { text: "Use the words in a short workplace exchange." } },
    { code: "instruction", content: { steps: ["Read the examples.", "Choose an answer."] } },
    { code: "vocabulary", content: { items: terms.map((term) => ({ word: term.word, meaning: term.meaning, synonyms: ["plan"], antonyms: ["opposite"] })) } },
    { code: "grammar", content: { formula: grammar.formula, text: grammar.usage } },
    { code: "pronunciation", content: { focus: sound.ipa, words: pronunciation } },
    { code: "listening", content: { script: "The budget list is ready.", ...choice } },
    { code: "reading", content: { text: "The budget list is ready.", ...choice } },
    { code: "writing", content: { prompt: "Write one sentence about the budget list.", answer: "The budget list is ready." } },
    { code: "word_class", content: choice },
    { code: "word_use", content: choice },
    { code: "speaking", content: { prompt: "Say one sentence about the budget list.", sample: "The budget list is ready." } }
  ] };
}

function contract(cefr: CefrLevel = "A1") {
  const month = "2026-11";
  const calendar = buildMonthlyCalendar(month);
  const count = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 5).length * 3;
  return buildMonthlyCurriculum({
    month, cefr, theme: { version: 1, title: "Quarterly budget review", brief: "Prepare a quarterly budget review.", context: "Finance meeting", communicationGoal: "Explain a cost." },
    coreTerms: Array.from({ length: count }, (_, index) => ({ id: `term-${index}`, word: `term-${index}`, meaning: "nghĩa", type: "noun", ipa: "/tɜːm/" })),
    supportTerms: [], grammarTopics: Array.from({ length: 2 }, (_, index) => ({ id: `g-${index}`, title: `Grammar ${index}`, steps: [{ id: `g-${index}-s`, focus: "focus", formula: "S + V", usage: "usage", examples: ["Example."] }] })),
    sounds: Array.from({ length: 4 }, (_, index) => ({ id: `s-${index}`, ipa: "/t/", label: "T", examples: Array.from({ length: Math.ceil(calendar.lessonCount / 4) * 3 }, (_, example) => ({ id: `s-${index}-${example}`, word: `sound-${index}-${example}`, ipa: "/t/" })) }))
  });
}
