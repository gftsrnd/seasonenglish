import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import type { AiTaskRunner } from "@e4s/ai";
import type { ContentMediaService } from "../src/modules/media/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const checkerId = "00000000-0000-4000-8000-000000000104";
const mediaRequests: Array<{ userId: string; term: string }> = [];
const forcedAiFailures = new Set<string>();
const mediaService: ContentMediaService = {
  async resolveForUser(userId, request) {
    mediaRequests.push({ userId, term: request.term });
    return { status: "available", imageUrl: "https://upload.wikimedia.org/example.jpg", alt: request.term, attribution: { creator: "Example", licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Example.jpg" } };
  },
  async diagnoseForUser() { return { image: { status: "unavailable" }, provider: null, cached: false }; },
  async clearForUser() { return { cleared: 0 }; }
};

function lesson(dayNumber: number) {
  return {
    dayNumber,
    title: `Bài mới T${dayNumber + 1}`,
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu", content: { text: "Tự giới thiệu công việc." } },
      { code: "instruction", title: "Hướng dẫn", content: { steps: ["Học nội dung", "Làm bài tập"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"].map((word) => ({ word, meaning: "từ công việc", collocations: [`my ${word}`, `new ${word}`, `work ${word}`] })) } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [team] as [role].", examples: ["I work in AI as an intern."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/w/", words: ["work", "week", "well"], instruction: "Round your lips." } },
      { code: "listening", title: "Nghe", content: { script: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
      { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
      { code: "writing", title: "Viết", content: { type: "fill", prompt: "I work in ___.", answer: "AI" } },
      { code: "word_class", title: "Từ loại", content: { prompt: "What is role?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
      { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence is correct?", options: ["I work in AI.", "I works AI.", "I working AI.", "I work AI yesterday."], answer: "I work in AI." } },
      { code: "speaking", title: "Nói", content: { prompt: "Introduce your role.", sample: "I work in AI as an intern." } }
    ]
  };
}

const repairRunner: AiTaskRunner = {
  async runTask(taskKey, rawInput) {
    const dayNumber = Number((rawInput as { dayNumber?: number }).dayNumber ?? 1);
    if (forcedAiFailures.has(`${taskKey}:${dayNumber}`)) {
      throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
        code: "AI_OUTPUT_INVALID",
        details: { issues: [{ path: "output", message: "forced component failure" }] }
      });
    }
    const lessonFocus = String((rawInput as { lessonFocus?: string }).lessonFocus ?? "talk about work");
    const dayWords = [
      ["coordinator", "briefing", "workflow"],
      ["supervisor", "prototype", "checklist"],
      ["agenda", "summary", "inbox"],
      ["calendar", "milestone", "assignment"],
      ["suggestion", "revision", "proposal"]
    ][dayNumber - 1] ?? ["office", "team", "work"];
    const vocabularyItem = (word: string) => ({
      word, partOfSpeech: "noun", pronunciation: "/word/", stress: "first syllable", ttsText: word, ssml: `<speak>${word}</speak>`, meaning: "Từ vựng công việc", imageQuery: `${word} office`,
      collocation1: `a ${word}`, collocation2: `new ${word}`, collocation3: `work ${word}`,
      family1: { word: `${word}s`, type: "noun", meaning: "dạng số nhiều" }, family2: null,
      umbrellaWord: "work", umbrellaMeaning: "công việc", sibling1: null, sibling2: null, sibling3: null,
      synonym1: { word: `workplace ${word}`, level: "A1", note: "từ gần nghĩa", partOfSpeech: "noun", sense: "workplace sense", example: `Use workplace ${word} here.` }, synonym2: null, antonym1: null
    });
    const output = taskKey === "weekly_lesson_grammar_classifier" ? {
      status: "classified", contentType: "sentence_pattern", targetName: "S + V + O", scope: lessonFocus,
      support: "explicit", confidence: "high", evidence: [{ sourceRef: "lessonFocus", quote: lessonFocus }], rejectedCandidates: []
    } : taskKey === "weekly_lesson_foundation" ? {
      title: "I work in + department", durationMinutes: 10,
      objective: { title: "Mục tiêu bài học", explanationLanguage: "vi", lesson_goal: "Giới thiệu nơi làm việc bằng mẫu câu mục tiêu.", assessment_gap: null, items: [
        { id: "C1", type: "content", text: "Sau bài học, bạn có thể chọn hai chi tiết công việc đúng sau khi nghe.", action_verb: "chọn", target_language: null, condition: "sau khi nghe", criterion: "đúng 2 chi tiết", assessed_by: "listening", success_evidence: "Chọn đúng hai chi tiết", assessmentCode: "listening" },
        { id: "L1", type: "language", text: "Sau bài học, bạn có thể nói một câu có cụm 'I work in' khi giới thiệu công việc.", action_verb: "nói", target_language: ["I work in"], condition: "khi giới thiệu công việc", criterion: "1 câu hoàn chỉnh", assessed_by: "speaking", success_evidence: "Transcript có cụm từ mục tiêu", assessmentCode: "speaking" }
      ] },
      instruction: { title: "Hướng dẫn làm bài", step1: "Đọc từ vựng.", step2: "Xem công thức.", step3: "Làm bài tập." },
      grammar: { title: "Ngữ pháp", contentType: "sentence_pattern", targetName: "S + V + O", scope: lessonFocus, formula: "S + V + O", usage: "Dùng để nói ngắn về công việc.", example1: "I do my work.", example2: "She checks the file." },
      pronunciation: { title: "Phát âm", focus: "/w/", tip: "Mở môi tròn khi phát âm.", word1: { word: "work", ipa: "/wɜːk/" }, word2: { word: "week", ipa: "/wiːk/" }, word3: { word: "well", ipa: "/wel/" } }
    } : taskKey === "weekly_lesson_vocabulary" ? {
      title: "Từ vựng", word1: vocabularyItem(dayWords[0]!), word2: vocabularyItem(dayWords[1]!), word3: vocabularyItem(dayWords[2]!)
    } : taskKey === "weekly_lesson_skills_reviewer" ? {
      status: "approved", findings: [],
      solvedAnswers: { listening: "AI", reading: "A report", writing: "AI", wordClass: "noun", wordUse: "I work at GFT." }
    } : {
      listening: { title: "Nghe", body: "I work in AI with my small team every weekday.", prompt: "Where does the speaker work?", option1: "AI", option2: "HR", option3: "Sales", option4: "Finance", answer: "AI", hint: "Listen for the department.", questionTranslation: "Người nói làm ở đâu?", answerTranslation: "AI" },
      reading: { title: "Đọc", body: "Lan works in AI with a small team. She checks one report every morning and sends it to her manager.", prompt: "What does Lan check?", option1: "A report", option2: "An email", option3: "A meeting", option4: "A customer", answer: "A report", hint: "Read what she checks each morning.", questionTranslation: "Lan kiểm tra gì?", answerTranslation: "Một báo cáo" },
      writing: { title: "Viết", type: "fill", prompt: "I work in ___.", option1: null, option2: null, option3: null, option4: null, answer: "AI", hint: "Use the department name.", questionTranslation: "Tôi làm việc trong bộ phận ___.", answerTranslation: "AI" },
      wordClass: { title: "Từ loại", body: undefined, prompt: "What part of speech is work?", option1: "noun", option2: "verb", option3: "adjective", option4: "adverb", answer: "noun", hint: "It names an activity here.", questionTranslation: "Work là từ loại gì?", answerTranslation: "danh từ" },
      wordUse: { title: "Dùng từ", body: undefined, prompt: "Which sentence uses work correctly?", option1: "I have work.", option2: "I work at GFT.", option3: "Work is blue.", option4: "I workly today.", answer: "I work at GFT.", hint: "Choose a natural workplace sentence.", questionTranslation: "Câu nào dùng work đúng?", answerTranslation: "Tôi làm việc tại GFT." },
      speaking: { title: "Nói", prompt: "Nói nơi bạn làm việc.", answer: "I work in AI.", hint: "Bắt đầu bằng I work.", questionTranslation: "Nói nơi bạn làm việc.", answerTranslation: "Tôi làm việc trong bộ phận AI." }
    };
    return {
      output,
      metadata: {
        traceId: "test-trace", taskId: "weekly_lessons", provider: "test", model: "test-model",
        attempts: 1, latencyMs: 1, inputHash: "test-hash", schemaValid: true,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      }
    };
  }
};

describe("content operations API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: repairRunner, mediaService });
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
         values ($1, $2, 'operator', 'Phạm Gia Huy', 'gia.huy.pham@e4s.local')
         on conflict (id) do update set role = excluded.role, display_name = excluded.display_name, email = excluded.email`,
        [checkerId, DEMO_IDS.organization]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)",
        [
          DEMO_IDS.learner, await createPinHash("123456"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          checkerId, await createCredentialHash("checker-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();

    const login = async (url: string, email: string, secret: string) => {
      const response = await app.inject({ method: "POST", url, payload: url.includes("learner") ? { email, pin: secret } : { email, password: secret } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    learnerCookie = await login("/api/auth/learner/login", "minh.anh.nguyen@e4s.local", "123456");
    makerCookie = await login("/api/auth/staff/login", "thu.ha.tran@e4s.local", "operator-pass");
    checkerCookie = await login("/api/auth/staff/login", "gia.huy.pham@e4s.local", "checker-pass");
    managerCookie = await login("/api/auth/staff/login", "quoc.bao.le@e4s.local", "manager-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("resolves a real vocabulary image for the operator preview without asking AI for an image", async () => {
    mediaRequests.length = 0;
    const setResponse = await app.inject({ method: "GET", url: "/api/v1/content/lesson-sets/1/A2", headers: { cookie: makerCookie } });
    expect(setResponse.statusCode).toBe(200);
    const set = setResponse.json() as { lessons: Array<{ id: string; parts: Array<{ code: string; content: { items?: Array<{ word?: string }> } }> }> };
    const lesson = set.lessons.find((candidate) => candidate.parts.some((part) => part.code === "vocabulary" && part.content.items?.length));
    expect(lesson).toBeDefined();

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/content/lesson-sets/1/A2/lessons/${lesson!.id}/vocabulary/0/image`,
      headers: { cookie: makerCookie }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "available", imageUrl: "https://upload.wikimedia.org/example.jpg" });
    expect(mediaRequests).toHaveLength(1);
    expect(mediaRequests[0]?.term).toBeTruthy();
  });

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
    expect(metadataOnlyWrite.json()).toMatchObject({ weeks: expect.arrayContaining([expect.objectContaining({ weekNumber: 1, topic: "Changed again", plan: replacementPlan })]) });

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

  it("allows an operator to publish their own lesson set and hides drafts from learners", async () => {
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
    expect(selfApproval.statusCode, selfApproval.body).toBe(200);
    expect(selfApproval.json()).toMatchObject({ versionId, status: "published", approvedBy: DEMO_IDS.operator });

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

  it("keeps an incomplete manual lesson as draft but blocks review with repairable Vietnamese issues", async () => {
    const incomplete = lesson(1);
    const listening = incomplete.parts.find((part) => part.code === "listening")!;
    listening.content = { prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" };
    const speaking = incomplete.parts.find((part) => part.code === "speaking")!;
    speaking.content = { prompt: "Introduce your role." } as typeof speaking.content;

    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map((dayNumber) => dayNumber === 1 ? incomplete : lesson(dayNumber)) }
    });
    expect(created.statusCode, created.body).toBe(201);
    const versionId = (created.json() as { versionId: string }).versionId;

    const submitted = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${versionId}/review`, headers: { cookie: makerCookie }, payload: {}
    });
    expect(submitted.statusCode, submitted.body).toBe(409);
    expect(submitted.json()).toMatchObject({
      code: "CONTENT_VALIDATION_FAILED",
      issues: expect.arrayContaining([
        expect.objectContaining({ dayNumber: 1, code: "listening", message: expect.stringContaining("nguồn âm thanh") }),
        expect.objectContaining({ dayNumber: 1, code: "speaking", message: expect.stringContaining("câu mẫu") })
      ])
    });
    const persisted = await pool.query<{ status: string }>("select status from lesson_set_versions where id = $1", [versionId]);
    expect(persisted.rows[0]?.status).toBe("draft");
  });

  it("saves a versioned weekly-practice draft without losing the five lessons", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(lesson) }
    });
    expect(created.statusCode, created.body).toBe(201);
    const base = created.json() as { version: number; lessons: Array<{ dayNumber: number; title: string }> };

    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft/weekly-practice", headers: { cookie: makerCookie },
      payload: {
        expectedVersion: base.version,
        task: "  Write four sentences about a meeting.  ", guidance: " Use the weekly vocabulary. ",
        requiredVocabulary: ["meeting", " agenda ", "meeting", "confirm"]
      }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json()).toMatchObject({
      status: "draft", version: base.version + 1,
      weeklyPractice: {
        task: "Write four sentences about a meeting.", guidance: "Use the weekly vocabulary.",
        requiredVocabulary: ["meeting", "agenda", "confirm"]
      }
    });
    expect(saved.json().lessons.map((item: { dayNumber: number; title: string }) => [item.dayNumber, item.title]))
      .toEqual(base.lessons.map(item => [item.dayNumber, item.title]));

    const managerWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft/weekly-practice", headers: { cookie: managerCookie },
      payload: { expectedVersion: base.version + 1, task: "Manager edit", guidance: "Not allowed", requiredVocabulary: [] }
    });
    expect(managerWrite.statusCode, managerWrite.body).toBe(403);

    const missingVersion = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft/weekly-practice", headers: { cookie: makerCookie },
      payload: { task: "Missing version", guidance: "Reject this request", requiredVocabulary: [] }
    });
    expect(missingVersion.statusCode, missingVersion.body).toBe(400);

    const excessiveVocabulary = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft/weekly-practice", headers: { cookie: makerCookie },
      payload: {
        expectedVersion: base.version + 1, task: "Too many words", guidance: "Reject instead of truncating",
        requiredVocabulary: Array.from({ length: 13 }, (_, index) => `word-${index + 1}`)
      }
    });
    expect(excessiveVocabulary.statusCode, excessiveVocabulary.body).toBe(400);

    const stale = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft/weekly-practice", headers: { cookie: makerCookie },
      payload: { expectedVersion: base.version, task: "Stale", guidance: "Stale", requiredVocabulary: [] }
    });
    expect(stale.statusCode, stale.body).toBe(409);

    const review = await app.inject({ method: "GET", url: "/api/v1/content/review", headers: { cookie: makerCookie } });
    expect(review.statusCode, review.body).toBe(200);
    expect(review.json().weeklyPractices).toEqual(expect.arrayContaining([
      expect.objectContaining({ weekNumber: 2, cefr: "A2", version: base.version + 1, task: "Write four sentences about a meeting." })
    ]));
  });

  it("returns the lesson matrix, seven review tabs and seven prompt groups without adding screens", async () => {
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
      "submissions", "coach", "weekly_practices", "micro", "appeals", "attempts", "assessments"
    ]);

    const operatorPrompts = await app.inject({ method: "GET", url: "/api/v1/content/prompts", headers: { cookie: makerCookie } });
    const prompts = await app.inject({ method: "GET", url: "/api/v1/content/prompts", headers: { cookie: managerCookie } });
    expect(operatorPrompts.statusCode).toBe(403);
    expect(prompts.statusCode, prompts.body).toBe(200);
    expect(prompts.json().groups).toHaveLength(7);
    expect(prompts.json().groups.map((group: { key: string }) => group.key)).toEqual([
      "system_rules", "assessment_scoring", "weekly_lessons", "week_suggestions",
      "micro_grading", "coach_dialogue", "weekly_practice_grading"
    ]);
  });

  it("persists the active lesson levels so C1 can be added or hidden without deleting content", async () => {
    const added = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2", "C1"] }
    });
    expect(added.statusCode, added.body).toBe(200);
    expect(added.json().levels.map((level: { cefr: string }) => level.cefr)).toEqual(["A1", "A2", "B1", "B2", "C1"]);

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/content/lesson-matrix", headers: { cookie: makerCookie } });
    expect(reloaded.json().levels.map((level: { cefr: string }) => level.cefr)).toEqual(["A1", "A2", "B1", "B2", "C1"]);

    const hidden = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2"] }
    });
    expect(hidden.statusCode, hidden.body).toBe(200);
    expect(hidden.json().levels.map((level: { cefr: string }) => level.cefr)).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("does not generate a hidden CEFR level through a direct cell request", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/C1/generate", headers: { cookie: makerCookie }, payload: {}
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toEqual({ code: "CONTENT_LEVEL_NOT_ACTIVE" });
  });

  it("lets Manager update prompts while preserving version history", async () => {
    const managerWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/prompts", headers: { cookie: managerCookie },
      payload: { groups: [{ key: "system_rules", content: "Manager-approved system rule." }] }
    });
    expect(managerWrite.statusCode, managerWrite.body).toBe(200);
    expect(managerWrite.json()).toMatchObject({ groups: [expect.objectContaining({ key: "system_rules", content: "Manager-approved system rule." })] });

    const operatorWrite = await app.inject({
      method: "PUT", url: "/api/v1/content/prompts", headers: { cookie: makerCookie },
      payload: { groups: [{ key: "system_rules", content: "Use concise CEFR-aligned feedback." }] }
    });
    expect(operatorWrite.statusCode).toBe(403);

    const active = await pool.query<{ id: string }>(
      "select id from prompt_versions where task_key = 'system_rules' and status = 'active'"
    );
    await expect(pool.query("update prompt_versions set content = 'changed' where id = $1", [active.rows[0]?.id]))
      .rejects.toThrow(/immutable/i);
  });

  it("keeps saved prompts as drafts until Manager explicitly publishes the version", async () => {
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/prompts", headers: { cookie: managerCookie },
      payload: { groups: [{ key: "week_suggestions", content: "Published week prompt vNext." }] }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    const draft = saved.json().groups[0] as { key: string; version: number; status: string };
    expect(draft.status).toBe("draft");

    const before = await pool.query<{ content: string }>(
      "select content from prompt_versions where task_key = 'week_suggestions' and status = 'active'"
    );
    expect(before.rows[0]?.content).not.toBe("Published week prompt vNext.");

    const published = await app.inject({
      method: "POST",
      url: `/api/v1/content/prompts/week_suggestions/${draft.version}/publication`,
      headers: { cookie: managerCookie }, payload: {}
    });
    expect(published.statusCode, published.body).toBe(200);
    expect(published.json()).toMatchObject({ key: "week_suggestions", version: draft.version, status: "active" });

    const active = await pool.query<{ content: string; count: string }>(
      `select max(content) as content, count(*)::text as count
       from prompt_versions where task_key = 'week_suggestions' and status = 'active'`
    );
    expect(active.rows[0]).toEqual({ content: "Published week prompt vNext.", count: "1" });
  });

  it("repairs an existing lesson set through the validated weekly lesson contract", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A1/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(lesson) }
    });
    expect(created.statusCode, created.body).toBe(201);

    const repaired = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A1/draft/enrich", headers: { cookie: makerCookie }, payload: {}
    });
    expect(repaired.statusCode, repaired.body).toBe(201);
    const repairedBody = repaired.json() as { status: string; lessons: Array<{ title: string }> };
    expect(repairedBody.status).toBe("draft");
    expect(repairedBody.lessons).toHaveLength(5);
    expect(repairedBody.lessons.every((item) => item.title.trim() && item.title !== "S + V + O")).toBe(true);
  });

  it("regenerates exactly one deleted lesson day without changing the other four days", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A1/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(lesson) }
    });
    expect(created.statusCode, created.body).toBe(201);
    const original = created.json() as { version: number; lessons: Array<{ dayNumber: number; title: string; parts: unknown[] }> };

    const deleted = await app.inject({
      method: "DELETE", url: "/api/v1/content/lesson-sets/1/A1/draft/lessons/3", headers: { cookie: makerCookie },
      payload: { expectedVersion: original.version }
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    const afterDelete = deleted.json() as { version: number; lessons: Array<{ dayNumber: number; title: string; parts: unknown[] }> };
    expect(afterDelete.lessons.map(item => item.dayNumber)).toEqual([1, 2, 4, 5]);

    const regenerated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A1/draft/enrich", headers: { cookie: makerCookie },
      payload: { expectedVersion: afterDelete.version, dayNumber: 3 }
    });
    expect(regenerated.statusCode, regenerated.body).toBe(201);
    const result = regenerated.json() as { lessons: Array<{ dayNumber: number; title: string; parts: unknown[] }> };
    expect(result.lessons.map(item => item.dayNumber)).toEqual([1, 2, 3, 4, 5]);
    for (const dayNumber of [1, 2, 4, 5]) {
      const before = afterDelete.lessons.find(item => item.dayNumber === dayNumber)!;
      const after = result.lessons.find(item => item.dayNumber === dayNumber)!;
      expect({ dayNumber: after.dayNumber, title: after.title, parts: after.parts }).toEqual({
        dayNumber: before.dayNumber, title: before.title, parts: before.parts
      });
    }
  });

  it("persists useful components from a partial first run and supplements only the missing component", async () => {
    forcedAiFailures.add("weekly_lesson_vocabulary:1");
    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A1/generate", headers: { cookie: makerCookie }, payload: {}
    });
    forcedAiFailures.clear();

    expect(generated.statusCode, generated.body).toBe(201);
    const partial = generated.json() as { lessons: Array<{ dayNumber: number; parts: Array<{ code: string; content: Record<string, unknown> }> }> };
    const partialDay = partial.lessons.find((item) => item.dayNumber === 1)!;
    expect(partialDay.parts.find((part) => part.code === "objective")).toBeDefined();
    expect(partialDay.parts.find((part) => part.code === "vocabulary")).toBeUndefined();

    const supplemented = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A1/draft/enrich", headers: { cookie: makerCookie }, payload: { dayNumber: 1 }
    });
    expect(supplemented.statusCode, supplemented.body).toBe(201);
    const completed = supplemented.json() as { lessons: Array<{ dayNumber: number; parts: Array<{ code: string; content: Record<string, unknown> }> }> };
    const completedDay = completed.lessons.find((item) => item.dayNumber === 1)!;
    expect(completedDay.parts.find((part) => part.code === "vocabulary")).toBeDefined();
    expect(completedDay.parts.find((part) => part.code === "objective")?.content).toEqual(
      partialDay.parts.find((part) => part.code === "objective")?.content
    );
  });
});
