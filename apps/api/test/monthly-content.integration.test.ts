import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMonthlyCalendar, buildMonthlyCurriculum, createCredentialHash, createPinHash } from "@e4s/domain";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("monthly content API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, secureCookies: false });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.operator, await createCredentialHash("operator-pass")]);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.learner, await createPinHash("123456")]);
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

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
    const monthlyExam = await app.inject({ method: "GET", url: "/api/v1/learner/months/2026-11/exam", headers: { cookie: learnerCookie } });
    expect(monthlyExam.statusCode, monthlyExam.body).toBe(200);
    expect(monthlyExam.json()).toMatchObject({ month: "2026-11", status: "locked", completedLessons: 0, totalLessons: 1, remainingLessons: 1 });
    const learnerHome = await app.inject({ method: "GET", url: "/api/v1/learner/home", headers: { cookie: learnerCookie } });
    expect(learnerHome.statusCode, learnerHome.body).toBe(200);
    expect(learnerHome.json()).toMatchObject({ month: { month: "2026-11", themeTitle: "Quarterly budget review" } });
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

function contract() {
  const month = "2026-11";
  const calendar = buildMonthlyCalendar(month);
  const count = calendar.effectiveDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 5).length * 3;
  return buildMonthlyCurriculum({
    month, cefr: "A1", theme: { version: 1, title: "Quarterly budget review", brief: "Prepare a quarterly budget review.", context: "Finance meeting", communicationGoal: "Explain a cost." },
    coreTerms: Array.from({ length: count }, (_, index) => ({ id: `term-${index}`, word: `term-${index}`, meaning: "nghĩa", type: "noun", ipa: "/tɜːm/" })),
    supportTerms: [], grammarTopics: Array.from({ length: 4 }, (_, index) => ({ id: `g-${index}`, title: `Grammar ${index}`, steps: [{ id: `g-${index}-s`, focus: "focus", formula: "S + V", usage: "usage", examples: ["Example."] }] })),
    sounds: Array.from({ length: 4 }, (_, index) => ({ id: `s-${index}`, ipa: "/t/", label: "T", examples: Array.from({ length: Math.ceil(calendar.lessonCount / 4) * 3 }, (_, example) => ({ id: `s-${index}-${example}`, word: `sound-${index}-${example}`, ipa: "/t/" })) }))
  });
}

