import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
const transientAiFailures = new Map<string, number>();
const transientVocabularyMetadataGaps = new Map<string, number>();
const forcedDuplicateVocabularyDays = new Set<string>();
const runnerCalls: Array<{ taskKey: string; cefr?: string; dayNumber?: number }> = [];
let forceWholeGenerationFailure = false;
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
      { code: "vocabulary", title: "Từ vựng", content: { items: ["department", "role", "project"].map((word) => ({
        word,
        meaning: "từ công việc",
        collocations: [`my ${word}`, `new ${word}`, `work ${word}`],
        family: [{
          word: ({ department: "departmental", role: "role-playing", project: "projected" } as Record<string, string>)[word]!,
          type: "adjective",
          meaning: "từ cùng họ dùng trong ngữ cảnh công việc"
        }],
        umbrella: { word: "workplace terms", meaning: "từ ngữ nơi làm việc", siblings: [] },
        synonyms: [{ word: ({ department: "division", role: "position", project: "assignment" } as Record<string, string>)[word]!, level: "A2" }],
        antonyms: [],
        relationStatus: "provided"
      })) } },
      { code: "grammar", title: "Ngữ pháp", content: { formula: "I work in [team] as [role].", examples: ["I work in AI as an intern."] } },
      { code: "pronunciation", title: "Phát âm", content: { focus: "/w/", words: [{ word: "work", ipa: "/wɜːk/" }, { word: "week", ipa: "/wiːk/" }, { word: "well", ipa: "/wel/" }], instruction: "Round your lips." } },
      { code: "listening", title: "Nghe", content: { script: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
      { code: "reading", title: "Đọc", content: { text: "I work in AI as an intern.", prompt: "Where does she work?", options: ["AI", "HR", "Sales", "Finance"], answer: "AI" } },
      { code: "writing", title: "Viết", content: { type: "fill", prompt: "I work in ___.", answer: "AI" } },
      { code: "word_class", title: "Từ loại", content: { prompt: "What is role?", options: ["noun", "verb", "adjective", "adverb"], answer: "noun" } },
      { code: "word_use", title: "Dùng từ", content: { prompt: "Which sentence is correct?", options: ["I work in AI.", "I works AI.", "I working AI.", "I work AI yesterday."], answer: "I work in AI." } },
      { code: "speaking", title: "Nói", content: { prompt: "Introduce your role.", sample: "I work in AI as an intern." } }
    ]
  };
}

function b1Lesson(dayNumber: number) {
  const base = lesson(dayNumber);
  const englishTitles: Record<string, string> = {
    objective: "Objectives", instruction: "Instructions", vocabulary: "Vocabulary", grammar: "Grammar",
    pronunciation: "Pronunciation", listening: "Listening", reading: "Reading", writing: "Writing",
    word_class: "Word class", word_use: "Word use", speaking: "Speaking"
  };
  return {
    ...base,
    title: `Workplace introduction ${dayNumber}`,
    parts: base.parts.map((part) => ({
      ...part,
      title: englishTitles[part.code]!,
      content: part.code === "objective" ? { text: "Introduce your workplace role clearly." }
        : part.code === "instruction" ? { steps: ["Study the model.", "Complete the exercises."] }
        : part.code === "grammar" ? { formula: "I work in [team] as [role].", examples: ["I work in AI as an intern."], usage: "Use this pattern to introduce your role." }
        : part.code === "pronunciation" ? { focus: "/w/", words: [{ word: "work", ipa: "/wɜːk/" }, { word: "week", ipa: "/wiːk/" }, { word: "well", ipa: "/wel/" }], instruction: "Round your lips." }
        : part.code === "speaking" ? { prompt: "Introduce your role.", sample: "I work in AI as an intern." }
        : part.content
    }))
  };
}

const repairRunner: AiTaskRunner = {
  async runTask(taskKey, rawInput) {
    const cefr = String((rawInput as { cefr?: string }).cefr ?? "A1");
    const isVi = cefr === "A1" || cefr === "A2";
    const dayNumber = Number((rawInput as { dayNumber?: number }).dayNumber ?? 1);
    var dayFrame = ["I work in + department", "Every morning I + verb", "I am responsible for + noun", "Could you update + noun", "This week we completed + noun"][dayNumber - 1] ?? "I work in + department";
    runnerCalls.push({ taskKey, cefr, dayNumber });
    if (forceWholeGenerationFailure && taskKey !== "weekly_lesson_plan_blueprint") {
      throw Object.assign(new Error("AI unavailable for this deterministic test"), { code: "AI_UNAVAILABLE" });
    }
    var dayFrame = ["I work in + department", "Every morning I + verb", "I am responsible for + noun", "Could you update + noun", "This week we completed + noun"][dayNumber - 1] ?? "I work in + department";
    const transientFailureKey = `${taskKey}:${cefr}:${dayNumber}`;
    const remainingTransientFailures = transientAiFailures.get(transientFailureKey) ?? 0;
    if (remainingTransientFailures > 0) {
      transientAiFailures.set(transientFailureKey, remainingTransientFailures - 1);
      throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
        code: "AI_OUTPUT_INVALID",
        details: { issues: [{ path: "output", message: "transient forced component failure" }] }
      });
    }
    if (forcedAiFailures.has(`${taskKey}:${dayNumber}`) || forcedAiFailures.has(transientFailureKey)) {
      throw Object.assign(new Error("AI_OUTPUT_INVALID"), {
        code: "AI_OUTPUT_INVALID",
        details: { issues: [{ path: "output", message: "forced component failure" }] }
      });
    }
    const lessonFocus = String((rawInput as { lessonFocus?: string }).lessonFocus ?? "talk about work");
    let dayWords = [
      ["coordinator", "briefing", "workflow"],
      ["supervisor", "prototype", "checklist"],
      ["agenda", "summary", "inbox"],
      ["calendar", "milestone", "assignment"],
      ["suggestion", "revision", "proposal"]
    ][dayNumber - 1] ?? ["office", "team", "work"];
    if (taskKey === "weekly_lesson_vocabulary" && forcedDuplicateVocabularyDays.has(`${cefr}:${dayNumber}`)) {
      dayWords = ["coordinator", "briefing", "workflow"];
    }
    const vocabularyMetadataKey = `${cefr}:${dayNumber}`;
    const remainingVocabularyMetadataGaps = transientVocabularyMetadataGaps.get(vocabularyMetadataKey) ?? 0;
    if (remainingVocabularyMetadataGaps > 0) transientVocabularyMetadataGaps.set(vocabularyMetadataKey, remainingVocabularyMetadataGaps - 1);
    const vocabularyItem = (word: string) => ({
      word, partOfSpeech: "noun", pronunciation: "/word/", stress: "first syllable", ttsText: word, ssml: `<speak>${word}</speak>`, meaning: "Từ vựng công việc", imageQuery: `${word} office`,
      collocation1: `a ${word}`, collocation2: `new ${word}`, collocation3: `work ${word}`,
      family1: remainingVocabularyMetadataGaps > 0 ? null : { word: `${word}s`, type: "noun", meaning: "dạng số nhiều" }, family2: null,
      umbrellaWord: "work", umbrellaMeaning: "công việc", sibling1: null, sibling2: null, sibling3: null,
      synonym1: { word: `workplace ${word}`, level: cefr, note: isVi ? "từ gần nghĩa" : "close workplace synonym", partOfSpeech: "noun", sense: "workplace sense", example: `Use workplace ${word} here.` }, synonym2: null, antonym1: null, relationStatus: "provided"
    });
    const output = taskKey === "weekly_lesson_plan_blueprint" ? {
      plan: Object.fromEntries((["A1", "A2", "B1", "B2", "C1"] as const).map((level) => [
        level,
        [
          "Outcome: Introduce your workplace role and department | Vocabulary: coordinator, briefing, workflow | Frame: I work in + department | Skill emphasis: speaking",
          "Outcome: Describe your daily routine at work | Vocabulary: supervisor, prototype, checklist | Frame: Every morning I + verb | Skill emphasis: listening",
          "Outcome: Name a key responsibility in your team | Vocabulary: agenda, summary, inbox | Frame: I am responsible for + noun | Skill emphasis: reading",
          "Outcome: Ask a colleague about a task update | Vocabulary: calendar, milestone, assignment | Frame: Could you update + noun | Skill emphasis: writing",
          "Outcome: Summarise your weekly work progress | Vocabulary: suggestion, revision, proposal | Frame: This week we completed + noun | Skill emphasis: speaking"
        ]
      ]))
    } : taskKey === "weekly_lesson_grammar_classifier" ? {
      status: "classified", contentType: "sentence_pattern", targetName: dayFrame, scope: lessonFocus,
      support: "explicit", confidence: "high", evidence: [{ sourceRef: "lessonFocus", quote: lessonFocus }], rejectedCandidates: []
    } : taskKey === "weekly_lesson_objectives" ? {
      objective: isVi ? { title: "Mục tiêu bài học", explanationLanguage: "vi", lesson_goal: "Giới thiệu nơi làm việc bằng mẫu câu mục tiêu.", assessment_gap: null, items: [
        { id: "C1", type: "content", text: "Sau bài học, bạn có thể chọn hai chi tiết công việc đúng sau khi nghe.", action_verb: "chọn", target_language: null, condition: "sau khi nghe", criterion: "đúng 2 chi tiết", assessed_by: "listening", success_evidence: "Chọn đúng hai chi tiết", assessmentCode: "listening" },
        { id: "L1", type: "language", text: "Sau bài học, bạn có thể nói một câu có cụm 'I work in' khi giới thiệu công việc.", action_verb: "nói", target_language: ["I work in"], condition: "khi giới thiệu công việc", criterion: "1 câu hoàn chỉnh", assessed_by: "speaking", success_evidence: "Transcript có cụm từ mục tiêu", assessmentCode: "speaking" }
      ] } : { title: "Learning objectives", explanationLanguage: "en", lesson_goal: "Introduce your workplace role using the target frame.", assessment_gap: null, items: [
        { id: "C1", type: "content", text: "By the end of this lesson, you will be able to identify two workplace details after listening.", action_verb: "explain", target_language: null, condition: "after listening", criterion: "two details", assessed_by: "listening", success_evidence: "Selects the correct option", assessmentCode: "listening" },
        { id: "L1", type: "language", text: "By the end of this lesson, you will be able to explain your workplace role using I work in.", action_verb: "explain", target_language: ["I work in"], condition: "when introducing work", criterion: "one sentence", assessed_by: "speaking", success_evidence: "Uses the target phrase", assessmentCode: "speaking" }
      ] }
    } : taskKey === "weekly_lesson_foundation" ? {
      title: dayFrame, durationMinutes: 10,
      objective: isVi ? { title: "Mục tiêu bài học", explanationLanguage: "vi", lesson_goal: "Giới thiệu nơi làm việc bằng mẫu câu mục tiêu.", assessment_gap: null, items: [
        { id: "C1", type: "content", text: "Sau bài học, bạn có thể chọn hai chi tiết công việc đúng sau khi nghe.", action_verb: "chọn", target_language: null, condition: "sau khi nghe", criterion: "đúng 2 chi tiết", assessed_by: "listening", success_evidence: "Chọn đúng hai chi tiết", assessmentCode: "listening" },
        { id: "L1", type: "language", text: "Sau bài học, bạn có thể nói một câu có cụm 'I work in' khi giới thiệu công việc.", action_verb: "nói", target_language: ["I work in"], condition: "khi giới thiệu công việc", criterion: "1 câu hoàn chỉnh", assessed_by: "speaking", success_evidence: "Transcript có cụm từ mục tiêu", assessmentCode: "speaking" }
      ] } : { title: "Learning objectives", explanationLanguage: "en", lesson_goal: "Introduce your workplace role using the target frame.", assessment_gap: null, items: [
        { id: "C1", type: "content", text: "By the end of this lesson, you will be able to identify two workplace details after listening.", action_verb: "explain", target_language: null, condition: "after listening", criterion: "two details", assessed_by: "listening", success_evidence: "Selects the correct option", assessmentCode: "listening" },
        { id: "L1", type: "language", text: "By the end of this lesson, you will be able to explain your workplace role using I work in.", action_verb: "explain", target_language: ["I work in"], condition: "when introducing work", criterion: "one sentence", assessed_by: "speaking", success_evidence: "Uses the target phrase", assessmentCode: "speaking" }
      ] },
      instruction: { title: "Hướng dẫn làm bài", step1: "Đọc từ vựng.", step2: "Xem công thức.", step3: "Làm bài tập." },
      grammar: { title: isVi ? "Ngữ pháp" : "Grammar", contentType: "sentence_pattern", targetName: dayFrame, scope: lessonFocus, formula: dayFrame, usage: isVi ? "Dùng để nói ngắn về công việc." : "Use this pattern to talk about your workplace.", example1: "I work in the AI department.", example2: "She checks the file today." },
      pronunciation: { title: isVi ? "Phát âm" : "Pronunciation", focus: "/w/", tip: isVi ? "Mở môi tròn khi phát âm." : "Round your lips when saying this sound.", word1: { word: "work", ipa: "/wɜːk/" }, word2: { word: "week", ipa: "/wiːk/" }, word3: { word: "well", ipa: "/wel/" } }
    } : taskKey === "weekly_lesson_vocabulary" ? {
      title: isVi ? "Từ vựng" : "Vocabulary", word1: vocabularyItem(dayWords[0]!), word2: vocabularyItem(dayWords[1]!), word3: vocabularyItem(dayWords[2]!)
    } : taskKey === "weekly_lesson_length_repair" ? {
      listeningBody: "I work in AI with my small project team every weekday and meet my manager on Friday.".split(" "),
      readingBody: null,
      speakingAnswer: null
    } : taskKey === "weekly_lesson_skills_reviewer" ? {
      status: "approved", findings: [],
      solvedAnswers: { listening: "AI", reading: "A report", writing: "I work in AI.", wordClass: "noun", wordUse: "I work at GFT." }
    } : taskKey === "weekly_lesson_comprehension" ? {
      listening: { title: isVi ? "Nghe" : "Listening", body: cefr === "C1" ? "I work in AI with my small team every weekday and we coordinate cross-functional deliverables across four regional offices while reviewing technical milestones, risk logs, and stakeholder updates before our Friday executive briefing with the department director and project leads." : cefr === "B2" ? "I work in AI with my small team every weekday and we coordinate project deliverables across regional offices while reviewing weekly milestones and stakeholder updates before our Friday briefing." : cefr === "B1" ? "I work in AI with my small team every weekday and we check our project schedule together before meeting our manager on Friday afternoon." : "I work in AI with my small project team every weekday and meet my manager on Friday.", prompt: "Where does the speaker work?", option1: "AI", option2: "HR", option3: "Sales", option4: "Finance", answer: "AI", hint: "Listen for the department.", questionTranslation: isVi ? "Người nói làm ở đâu?" : "Where does the speaker work?", answerTranslation: "AI" },
      reading: { title: isVi ? "Đọc" : "Reading", body: cefr === "C1" ? "Lan works in AI with a small specialist team that manages enterprise automation systems across three regional offices. Every morning she checks one detailed technical report, compares the performance metrics against quarterly targets, documents potential delivery risks for the steering committee, and sends a concise summary to her manager so the department can align priorities before the client review meeting on Friday afternoon. Her systematic workflow ensures that cross-functional dependencies are resolved early and every stakeholder receives accurate status updates throughout the project lifecycle." : cefr === "B2" ? "Lan works in AI with a small specialist team that manages automation projects across regional offices. Every morning she checks one detailed report, compares the team metrics against weekly targets, documents delivery risks, and sends a clear summary to her manager so the department can align priorities before the Friday review meeting with stakeholders." : cefr === "B1" ? "Lan works in AI with a small project team in the main office. Every morning she checks one report, updates the shared task board for her colleagues, and sends the summary to her manager before the daily team briefing starts at nine." : "Lan works in AI with a small project team in the main office. She checks one report every morning and sends it to her manager before the meeting.", prompt: "What does Lan check?", option1: "A report", option2: "An email", option3: "A meeting", option4: "A customer", answer: "A report", hint: "Read what she checks each morning.", questionTranslation: isVi ? "Lan kiểm tra gì?" : "What does Lan check?", answerTranslation: isVi ? "Một báo cáo" : "A report" }
    } : taskKey === "weekly_lesson_language_practice" ? {
      writing: isVi ? { title: "Viết", type: "mcq", prompt: "Which sentence names the department?", option1: "I work in AI.", option2: "I works AI.", option3: "I am work AI.", option4: "I working in AI.", answer: "I work in AI.", hint: "Use I work in + department.", questionTranslation: "Câu nào nêu tên bộ phận?", answerTranslation: "Tôi làm việc trong bộ phận AI." } : { title: "Writing", type: "write", prompt: "Write one sentence about your department using I work in.", option1: null, option2: null, option3: null, option4: null, answer: "I work in AI.", hint: "Use I work in + department.", questionTranslation: "Write one sentence about your department using I work in.", answerTranslation: "I work in AI." },
      wordClass: { title: isVi ? "Từ loại" : "Word class", body: undefined, prompt: "What part of speech is work?", option1: "noun", option2: "verb", option3: "adjective", option4: "adverb", answer: "noun", hint: "It names an activity here.", questionTranslation: isVi ? "Work là từ loại gì?" : "What part of speech is work?", answerTranslation: isVi ? "danh từ" : "noun" },
      wordUse: { title: isVi ? "Dùng từ" : "Word use", body: undefined, prompt: "Which sentence uses work correctly?", option1: "I have work.", option2: "I work at GFT.", option3: "Work is blue.", option4: "I workly today.", answer: "I work at GFT.", hint: "Choose a natural workplace sentence.", questionTranslation: isVi ? "Câu nào dùng work đúng?" : "Which sentence uses work correctly?", answerTranslation: isVi ? "Tôi làm việc tại GFT." : "I work at GFT." }
    } : {
      speaking: { title: isVi ? "Nói" : "Speaking", prompt: isVi ? "Nói nơi bạn làm việc." : "Explain where you work using I work in.", answer: "I work in AI.", hint: isVi ? "Bắt đầu bằng I work." : "Start with I work.", questionTranslation: isVi ? "Nói nơi bạn làm việc." : "Explain where you work using I work in.", answerTranslation: isVi ? "Tôi làm việc trong bộ phận AI." : "I work in AI." }
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

  beforeEach(async () => {
    transientAiFailures.clear();
    transientVocabularyMetadataGaps.clear();
    forcedDuplicateVocabularyDays.clear();
    const plans = {
      1: {
        A1: ["introduce your role", "describe a routine", "name a responsibility", "ask about a colleague", "summarise your work"],
        A2: ["introduce your role", "describe responsibilities", "explain a routine", "ask a follow-up", "summarise your week"]
      },
      2: {
        A2: ["request a new time", "give a reason", "offer alternatives", "confirm availability", "write the final email"],
        B1: ["request a reschedule", "explain constraints", "compare alternatives", "negotiate a time", "confirm the agreement"]
      }
    };
    for (const [weekNumber, plan] of Object.entries(plans)) {
      await pool.query(
        "update program_weeks set ai_plan = $3::jsonb where program_id = $1 and week_number = $2",
        [DEMO_IDS.program, Number(weekNumber), JSON.stringify(plan)]
      );
    }
  });

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
    const lessons = [1, 2, 3, 4, 5].map(lesson).map((item) => item.dayNumber > 3 ? item : ({
      ...item,
      parts: item.parts.map((part) => part.code !== "vocabulary" ? part : ({
        ...part,
        content: {
          ...part.content,
          items: (part.content.items as Array<Record<string, unknown>>).map((word, index) => index !== 0 ? word : ({
            ...word,
            synonyms: [],
            antonyms: [],
            relationStatus: "generation_missed"
          }))
        }
      }))
    }));
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A1/draft", headers: { cookie: makerCookie },
      payload: { lessons }
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

  it("keeps the remaining days when a regenerated deleted day has a blocking AI error", async () => {
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
    expect(regenerated.statusCode, regenerated.body).toBe(422);
    const current = await app.inject({
      method: "GET", url: "/api/v1/content/lesson-sets/1/A1", headers: { cookie: makerCookie }
    });
    expect(current.statusCode, current.body).toBe(200);
    const result = current.json() as { lessons: Array<{ dayNumber: number; title: string; parts: unknown[] }> };
    expect(result.lessons.map(item => item.dayNumber)).toEqual([1, 2, 4, 5]);
    for (const dayNumber of [1, 2, 4, 5]) {
      const before = afterDelete.lessons.find(item => item.dayNumber === dayNumber)!;
      const after = result.lessons.find(item => item.dayNumber === dayNumber)!;
      expect({ dayNumber: after.dayNumber, title: after.title, parts: after.parts }).toEqual({
        dayNumber: before.dayNumber, title: before.title, parts: before.parts
      });
    }
  });

  it("reports a partial generation as failed instead of recording false success", async () => {
    forcedAiFailures.add("weekly_lesson_vocabulary:1");
    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A1/generate", headers: { cookie: makerCookie }, payload: {}
    });
    forcedAiFailures.clear();

    expect(generated.statusCode, generated.body).toBe(502);
    expect(generated.json()).toMatchObject({ code: "AI_LESSON_GENERATION_FAILED" });
  });

  it("repairs only the exhausted component and returns a complete single-level draft", async () => {
    runnerCalls.length = 0;
    transientAiFailures.set("weekly_lesson_vocabulary:A2:2", 3);

    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A2/generate", headers: { cookie: makerCookie }, payload: {}
    });

    expect(generated.statusCode, generated.body).toBe(201);
    expect(generated.json()).toMatchObject({ status: "draft" });
    expect(generated.json().lessons).toHaveLength(5);
    const repairCalls = runnerCalls.filter((call) => call.taskKey !== "weekly_lesson_plan_blueprint");
    expect(repairCalls.some((call) => call.cefr === "A2" && call.dayNumber === 2 && call.taskKey === "weekly_lesson_vocabulary")).toBe(true);
    expect(repairCalls.filter((call) => call.cefr === "A2" && call.dayNumber === 2 && call.taskKey === "weekly_lesson_foundation")).toHaveLength(1);
  });

  it("does not call AI again when a level has only two permitted light lexical gaps", async () => {
    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/A2/generate", headers: { cookie: makerCookie }, payload: {}
    });
    expect(generated.statusCode, generated.body).toBe(201);
    const draft = generated.json() as { lessons: Array<{ dayNumber: number; parts: Array<{ code: string; content: Record<string, unknown> }> }> };
    const withTwoLightGaps = draft.lessons.map((lesson) => lesson.dayNumber > 2 ? lesson : ({
      ...lesson,
      parts: lesson.parts.map((part) => part.code !== "vocabulary" ? part : ({
        ...part,
        content: {
          ...part.content,
          items: (part.content.items as Array<Record<string, unknown>>).map((item, index) => index > 0 ? item : ({ ...item, synonyms: [], antonyms: [] }))
        }
      }))
    }));
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft", headers: { cookie: makerCookie }, payload: { lessons: withTwoLightGaps }
    });
    expect(saved.statusCode, saved.body).toBe(201);

    runnerCalls.length = 0;
    const enriched = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/A2/draft/enrich", headers: { cookie: makerCookie }, payload: {}
    });

    expect(enriched.statusCode, enriched.body).toBe(200);
    expect(runnerCalls).toEqual([]);
  });

  it("rejects review when a five-day level has more than two genuine light vocabulary gaps", async () => {
    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/A2/generate", headers: { cookie: makerCookie }, payload: {}
    });
    expect(generated.statusCode, generated.body).toBe(201);
    const draft = generated.json() as { lessons: Array<{ dayNumber: number; parts: Array<{ code: string; content: Record<string, unknown> }> }> };
    const withThreeLightGaps = draft.lessons.map((lesson) => lesson.dayNumber > 3 ? lesson : ({
      ...lesson,
      parts: lesson.parts.map((part) => part.code !== "vocabulary" ? part : ({
        ...part,
        content: {
          ...part.content,
          items: (part.content.items as Array<Record<string, unknown>>).map((item, index) => index > 0 ? item : ({
            ...item, synonym1: null, synonym2: null, antonym1: null, synonyms: [], antonyms: [], relationStatus: "generation_missed"
          }))
        }
      }))
    }));
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft", headers: { cookie: makerCookie }, payload: { lessons: withThreeLightGaps }
    });
    expect(saved.statusCode, saved.body).toBe(201);
    const review = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${(saved.json() as { versionId: string }).versionId}/review`, headers: { cookie: makerCookie }
    });

    expect(review.statusCode, review.body).toBe(409);
    expect(review.json()).toMatchObject({ code: "CONTENT_VALIDATION_FAILED" });
  });

  it("does not overwrite a draft when targeted vocabulary repair still duplicates another day", async () => {
    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A2/generate", headers: { cookie: makerCookie }, payload: {}
    });
    expect(generated.statusCode, generated.body).toBe(201);
    const original = generated.json() as {
      version: number;
      lessons: Array<{ dayNumber: number; parts: Array<{ code: string; content: Record<string, unknown> }> }>;
    };
    const withThreeRelationGaps = original.lessons.map((lesson) => lesson.dayNumber > 3 ? lesson : ({
      ...lesson,
      parts: lesson.parts.map((part) => part.code !== "vocabulary" ? part : ({
        ...part,
        content: {
          ...part.content,
          items: (part.content.items as Array<Record<string, unknown>>).map((item, index) => index > 0 ? item : ({
            ...item, synonym1: null, antonym1: null, synonyms: [], antonyms: [], relationStatus: "generation_missed"
          }))
        }
      }))
    }));
    const saved = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/1/A2/draft", headers: { cookie: makerCookie },
      payload: { lessons: withThreeRelationGaps }
    });
    expect(saved.statusCode, saved.body).toBe(201);
    const beforeRepair = saved.json() as { version: number };
    forcedDuplicateVocabularyDays.add("A2:3");

    const repaired = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/A2/draft/enrich", headers: { cookie: makerCookie }, payload: {}
    });

    expect(repaired.statusCode, repaired.body).toBe(422);
    const rejectedRuns = await pool.query<{ error_code: string; request_key: string }>(
      "select error_code, request_key from ai_runs where error_code = 'CONTENT_GENERATION_QUALITY_FAILED' and request_key like 'weekly-lessons-repair:1:A2:%' order by created_at desc"
    );
    expect(rejectedRuns.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ error_code: "CONTENT_GENERATION_QUALITY_FAILED" })
    ]));
    const afterRepair = await app.inject({
      method: "GET", url: "/api/v1/content/lesson-sets/1/A2", headers: { cookie: makerCookie }
    });
    expect(afterRepair.statusCode, afterRepair.body).toBe(200);
    expect(afterRepair.json()).toMatchObject({ version: beforeRepair.version });
  });

  it("keeps an immutable generation record on the recoverable draft without replacing the approved lesson", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/A2/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(lesson) }
    });
    expect(created.statusCode, created.body).toBe(201);
    const base = created.json() as { versionId: string };
    const review = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${base.versionId}/review`, headers: { cookie: makerCookie }, payload: {}
    });
    expect(review.statusCode, review.body).toBe(200);
    const publication = await app.inject({
      method: "POST", url: `/api/v1/content/lesson-set-versions/${base.versionId}/publication`, headers: { cookie: makerCookie }, payload: {}
    });
    expect(publication.statusCode, publication.body).toBe(200);

    const before = await pool.query<{ id: string; status: string }>(
      `select lsv.id, lsv.status
       from lesson_sets ls
       join program_weeks pw on pw.id = ls.program_week_id
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where pw.week_number = 2 and ls.cefr = 'A2' and lsv.status = 'published'`
    );
    expect(before.rows).toHaveLength(1);

    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/A2/generate", headers: { cookie: makerCookie }, payload: {}
    });
    expect(generated.statusCode, generated.body).toBe(201);
    const draft = generated.json() as { versionId: string; status: string };
    expect(draft.status).toBe("draft");

    const stored = await pool.query<{ payload: Record<string, unknown> }>(
      "select payload from lesson_set_versions where id = $1",
      [draft.versionId]
    );
    expect(stored.rows[0]?.payload).toMatchObject({
      source: "ai",
      generation: expect.objectContaining({
        prompt: expect.objectContaining({ versionId: expect.any(String), content: expect.any(String) }),
        input: expect.objectContaining({ weekNumber: 2, cefr: "A2" }),
        output: expect.any(Object),
        validation: expect.objectContaining({ valid: expect.any(Boolean), issues: expect.any(Array) }),
        generatedAt: expect.any(String)
      })
    });

    const after = await pool.query<{ id: string; status: string }>(
      `select lsv.id, lsv.status
       from lesson_sets ls
       join program_weeks pw on pw.id = ls.program_week_id
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where pw.week_number = 2 and ls.cefr = 'A2' and lsv.status = 'published'`
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("records a failed AI generation diagnostic and keeps the approved lesson version available", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft", headers: { cookie: makerCookie },
      payload: { lessons: [1, 2, 3, 4, 5].map(b1Lesson) }
    });
    expect(created.statusCode, created.body).toBe(201);
    const draft = created.json() as { versionId: string; version: number };
    const weeklyPractice = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft/weekly-practice", headers: { cookie: makerCookie },
      payload: {
        expectedVersion: draft.version,
        task: "Write a short workplace introduction.",
        guidance: "Write in English and include three words from this week's lessons.",
        requiredVocabulary: ["department", "role", "project"]
      }
    });
    expect(weeklyPractice.statusCode, weeklyPractice.body).toBe(200);
    const updatedDraft = weeklyPractice.json() as { versionId: string };
    const reviewResponse = await app.inject({ method: "POST", url: `/api/v1/content/lesson-set-versions/${updatedDraft.versionId}/review`, headers: { cookie: makerCookie }, payload: {} });
    expect(reviewResponse.statusCode, reviewResponse.body).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/content/lesson-set-versions/${updatedDraft.versionId}/publication`, headers: { cookie: makerCookie }, payload: {} })).statusCode).toBe(200);

    forceWholeGenerationFailure = true;
    const failed = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/B1/generate", headers: { cookie: makerCookie }, payload: {}
    });
    forceWholeGenerationFailure = false;

    expect(failed.statusCode, failed.body).toBe(502);
    expect(failed.json()).toMatchObject({ code: "AI_LESSON_GENERATION_FAILED" });
    const failedRun = await pool.query(
      `select ar.status, ar.error_code, ar.output
       from ai_runs ar join ai_tasks at on at.id = ar.task_id
       where ar.user_id = $1 and at.task_key = 'weekly_lessons'
       order by ar.created_at desc limit 1`,
      [DEMO_IDS.operator]
    );
    expect(failedRun).toMatchObject({ rows: [expect.objectContaining({
      status: "failed", error_code: "AI_UNAVAILABLE", output: expect.objectContaining({ diagnostic: expect.objectContaining({
        issues: expect.arrayContaining([expect.objectContaining({
          code: "AI_UNAVAILABLE", component: "grammarClassification", dayNumber: 1
        })])
      }) })
    })] });
    const diagnostic = failedRun.rows[0]?.output?.diagnostic as Record<string, unknown>;
    expect(diagnostic).toMatchObject({
      status: "generation_failed",
      code: "AI_UNAVAILABLE",
      prompt: { versionId: expect.any(String), content: expect.any(String) },
      input: expect.objectContaining({ cefr: "B1", weekNumber: 2 }),
      issues: expect.arrayContaining([expect.objectContaining({
        code: "AI_UNAVAILABLE", component: "grammarClassification", dayNumber: 1
      })])
    });
    await expect(pool.query(
      `select lsv.id, lsv.status from lesson_sets ls
       join program_weeks pw on pw.id = ls.program_week_id
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
       where pw.week_number = 2 and ls.cefr = 'B1' and lsv.status = 'published'`
    )).resolves.toMatchObject({ rows: [expect.objectContaining({ id: updatedDraft.versionId, status: "published" })] });
  });

  it("persists canonical week blueprint once with lock + CAS and resumes from checkpoints without re-running completed components", async () => {
    await pool.query("delete from ai_runs");
    runnerCalls.length = 0;
    forcedAiFailures.add("weekly_lesson_vocabulary:A1:2");

    const [firstAttempt, concurrentAttempt] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/v1/content/lesson-sets/1/A1/generate",
        headers: { cookie: makerCookie },
        payload: {}
      }),
      app.inject({
        method: "POST",
        url: "/api/v1/content/lesson-sets/1/A2/generate",
        headers: { cookie: makerCookie },
        payload: {}
      })
    ]);
    forcedAiFailures.clear();

    expect(firstAttempt.statusCode, firstAttempt.body).toBe(502);
    expect(concurrentAttempt.statusCode, concurrentAttempt.body).toBe(201);
    const blueprintCallsFirstWave = runnerCalls.filter((call) => call.taskKey === "weekly_lesson_plan_blueprint");
    expect(blueprintCallsFirstWave).toHaveLength(1);

    const savedPlan = await pool.query<{ ai_plan: Record<string, string[]> }>(
      "select ai_plan from program_weeks where program_id = $1 and week_number = 1",
      [DEMO_IDS.program]
    );
    expect(savedPlan.rows[0]?.ai_plan?.A1?.[0]).toContain("Outcome:");

    runnerCalls.length = 0;
    const resumed = await app.inject({
      method: "POST",
      url: "/api/v1/content/lesson-sets/1/A1/generate",
      headers: { cookie: makerCookie },
      payload: {}
    });
    expect(resumed.statusCode, resumed.body).toBe(201);
    expect(runnerCalls.filter((call) => call.taskKey === "weekly_lesson_plan_blueprint")).toHaveLength(0);
    expect(runnerCalls.filter((call) => call.cefr === "A1" && call.dayNumber === 1)).toHaveLength(0);
    expect(runnerCalls.filter((call) => call.cefr === "A1" && call.dayNumber === 2 && call.taskKey === "weekly_lesson_vocabulary").length).toBeGreaterThanOrEqual(1);
  });

  it("runs the 5-level batch endpoint once per week and isolates level failures without erasing completed levels", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/v1/content/lesson-levels",
      headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2", "C1"] }
    });
    await pool.query("delete from ai_runs");
    runnerCalls.length = 0;
    for (const dayNumber of [1, 2, 3, 4, 5]) {
      forcedAiFailures.add(`weekly_lesson_objectives:B2:${dayNumber}`);
    }

    const batchResponse = await app.inject({
      method: "POST",
      url: "/api/v1/content/lesson-sets/1/generate",
      headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2", "C1"] }
    });
    forcedAiFailures.clear();

    expect(batchResponse.statusCode, batchResponse.body).toBe(201);
    const body = batchResponse.json() as {
      weekNumber: number;
      levels: Array<{ cefr: string; status: string; version?: { lessons: unknown[] }; error?: { code: string } }>;
    };
    expect(body.weekNumber).toBe(1);
    expect(body.levels.map((item) => [item.cefr, item.status])).toEqual([
      ["A1", "completed"],
      ["A2", "completed"],
      ["B1", "completed"],
      ["B2", "failed"],
      ["C1", "completed"]
    ]);
    expect(runnerCalls.filter((call) => call.taskKey === "weekly_lesson_plan_blueprint")).toHaveLength(1);
    for (const level of ["A1", "A2", "B1", "C1"]) {
      const entry = body.levels.find((item) => item.cefr === level);
      expect(entry?.version?.lessons).toHaveLength(5);
    }
    await app.inject({
      method: "PUT",
      url: "/api/v1/content/lesson-levels",
      headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2"] }
    });
  });

  it("saves the healthy levels, reports a partial level, and resumes only the failed component on the next batch", async () => {
    await app.inject({ method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie }, payload: { levels: ["A1", "A2", "B1", "B2", "C1"] } });
    await pool.query("delete from ai_runs");
    runnerCalls.length = 0;
    forcedAiFailures.add("weekly_lesson_vocabulary:A2:2");
    const first = await app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/generate", headers: { cookie: makerCookie }, payload: {} });
    forcedAiFailures.clear();
    expect(first.statusCode, first.body).toBe(201);
    const firstBody = first.json() as { levels: Array<{ cefr: string; status: string; completedDays: number[]; version?: { lessons: unknown[] }; partialDraft?: { lessons: unknown[] } }> };
    expect(firstBody.levels.map((item) => [item.cefr, item.status])).toEqual([
      ["A1", "completed"], ["A2", "partial"], ["B1", "completed"], ["B2", "completed"], ["C1", "completed"]
    ]);
    const a2 = firstBody.levels.find((item) => item.cefr === "A2")!;
    expect(a2.completedDays).toEqual([1, 3, 4, 5]);
    expect(a2.partialDraft?.lessons.length).toBeGreaterThanOrEqual(4);
    for (const level of ["A1", "B1", "B2", "C1"]) {
      expect(firstBody.levels.find((item) => item.cefr === level)?.version?.lessons).toHaveLength(5);
    }

    runnerCalls.length = 0;
    const second = await app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/generate", headers: { cookie: makerCookie }, payload: {} });
    expect(second.statusCode, second.body).toBe(201);
    const secondBody = second.json() as { levels: Array<{ cefr: string; status: string; resumedDays: number[] }> };
    expect(secondBody.levels.map((item) => [item.cefr, item.status])).toEqual([
      ["A1", "resumed"], ["A2", "resumed"], ["B1", "resumed"], ["B2", "resumed"], ["C1", "resumed"]
    ]);
    const providerCalls = runnerCalls.filter((call) => call.taskKey !== "weekly_lesson_plan_blueprint");
    expect(providerCalls.length).toBeGreaterThan(0);
    expect(providerCalls.every((call) => call.cefr === "A2" && call.dayNumber === 2)).toBe(true);
    expect(providerCalls.some((call) => call.taskKey === "weekly_lesson_grammar_classifier" || call.taskKey === "weekly_lesson_objectives" || call.taskKey === "weekly_lesson_foundation")).toBe(false);
    await app.inject({ method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie }, payload: { levels: ["A1", "A2", "B1", "B2"] } });
  });

  it("repairs an exhausted component within the same batch instead of returning a partial level", async () => {
    await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2", "C1"] }
    });
    await pool.query("delete from ai_runs");
    await pool.query(
      `delete from lesson_sets
       where program_week_id = (select id from program_weeks where program_id = $1 and week_number = 1)
         and cefr = 'A2'`,
      [DEMO_IDS.program]
    );
    runnerCalls.length = 0;
    transientAiFailures.set("weekly_lesson_vocabulary:A2:2", 3);

    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/generate", headers: { cookie: makerCookie }, payload: { levels: ["A2"] }
    });

    expect(generated.statusCode, generated.body).toBe(201);
    const level = (generated.json() as { levels: Array<{ cefr: string; status: string; version?: { lessons: unknown[] } }> }).levels[0];
    expect(level).toMatchObject({ cefr: "A2", status: "completed" });
    expect(level?.version?.lessons).toHaveLength(5);
    expect(runnerCalls.filter((call) => call.cefr === "A2" && call.dayNumber === 2 && call.taskKey === "weekly_lesson_foundation")).toHaveLength(1);
  });

  it("repairs excessive light vocabulary metadata gaps before saving a batch level", async () => {
    await pool.query("delete from ai_runs");
    await pool.query(
      `delete from lesson_sets
       where program_week_id = (select id from program_weeks where program_id = $1 and week_number = 1)
         and cefr = 'A2'`,
      [DEMO_IDS.program]
    );
    for (const dayNumber of [1, 2, 3, 4, 5]) transientVocabularyMetadataGaps.set(`A2:${dayNumber}`, 1);

    const generated = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/1/generate", headers: { cookie: makerCookie }, payload: { levels: ["A2"] }
    });

    expect(generated.statusCode, generated.body).toBe(201);
    const level = (generated.json() as { levels: Array<{ cefr: string; status: string; version?: { lessons: unknown[] } }> }).levels[0];
    expect(level).toMatchObject({ cefr: "A2", status: "completed" });
    expect(level?.version?.lessons).toHaveLength(5);
  });

  it("generates one level independently without starting the other levels", async () => {
    await pool.query("delete from ai_runs");
    runnerCalls.length = 0;
    const response = await app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/B1/generate", headers: { cookie: makerCookie }, payload: {} });
    expect(response.statusCode, response.body).toBe(201);
    const levelCalls = runnerCalls.filter((call) => call.taskKey !== "weekly_lesson_plan_blueprint");
    expect(levelCalls.length).toBeGreaterThan(0);
    expect(levelCalls.every((call) => call.cefr === "B1")).toBe(true);
  });

  it("creates and persists the canonical five-level plan before generating a newly added level", async () => {
    await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2", "C1"] }
    });
    await pool.query("update program_weeks set ai_plan = '{}'::jsonb where program_id = $1 and week_number = 2", [DEMO_IDS.program]);
    runnerCalls.length = 0;

    const response = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/C1/generate", headers: { cookie: makerCookie }, payload: {}
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(runnerCalls.filter((call) => call.taskKey === "weekly_lesson_plan_blueprint")).toHaveLength(1);
    const persisted = await pool.query<{ ai_plan: Record<string, string[]> }>(
      "select ai_plan from program_weeks where program_id = $1 and week_number = 2", [DEMO_IDS.program]
    );
    expect(persisted.rows[0]?.ai_plan.C1).toHaveLength(5);
    await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: makerCookie },
      payload: { levels: ["A1", "A2", "B1", "B2"] }
    });
  });

  it("normalizes the canonical plan once when two operators of the same organization generate concurrently", async () => {
    await pool.query("delete from ai_runs");
    runnerCalls.length = 0;
    const [makerRun, checkerRun] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/A1/generate", headers: { cookie: makerCookie }, payload: {} }),
      app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/A2/generate", headers: { cookie: checkerCookie }, payload: {} })
    ]);
    expect(makerRun.statusCode, makerRun.body).toBe(201);
    expect(checkerRun.statusCode, checkerRun.body).toBe(201);
    expect(runnerCalls.filter((call) => call.taskKey === "weekly_lesson_plan_blueprint")).toHaveLength(1);
  });

  it("lets another operator in the same organization resume the checkpoint and skip completed components", async () => {
    await pool.query("delete from ai_runs");
    runnerCalls.length = 0;
    forcedAiFailures.add("weekly_lesson_vocabulary:A1:2");
    const makerRun = await app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/A1/generate", headers: { cookie: makerCookie }, payload: {} });
    forcedAiFailures.clear();
    expect(makerRun.statusCode, makerRun.body).toBe(502);

    runnerCalls.length = 0;
    const checkerRun = await app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/A1/generate", headers: { cookie: checkerCookie }, payload: {} });
    expect(checkerRun.statusCode, checkerRun.body).toBe(201);
    expect(runnerCalls.filter((call) => call.cefr === "A1" && call.dayNumber === 1)).toHaveLength(0);
    expect(runnerCalls.filter((call) => call.cefr === "A1" && call.dayNumber === 2 && call.taskKey === "weekly_lesson_grammar_classifier")).toHaveLength(0);
    expect(runnerCalls.filter((call) => call.cefr === "A1" && call.dayNumber === 2 && call.taskKey === "weekly_lesson_vocabulary").length).toBeGreaterThanOrEqual(1);
  });

  it("never exposes a checkpoint to an operator from another organization", async () => {
    await pool.query("delete from ai_runs");
    const run = await app.inject({ method: "POST", url: "/api/v1/content/lesson-sets/1/A1/generate", headers: { cookie: makerCookie }, payload: {} });
    expect(run.statusCode, run.body).toBe(201);
    const checkpoint = await pool.query<{ request_key: string }>(
      "select request_key from ai_runs where request_key like 'weekly-lessons-checkpoint:%' limit 1"
    );
    const requestKey = checkpoint.rows[0]?.request_key;
    expect(requestKey).toBeTruthy();

    const otherOrganizationId = randomUUID();
    const otherOperatorId = randomUUID();
    await pool.query("insert into organizations (id, name, slug) values ($1, 'Other org', $2)", [otherOrganizationId, `other-${otherOrganizationId}`]);
    await pool.query(
      "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'operator', 'Other operator', $3)",
      [otherOperatorId, otherOrganizationId, `other-${otherOperatorId}@example.test`]
    );
    const { createRepositories } = await import("@e4s/database");
    const repositories = createRepositories(pool);
    await expect(repositories.aiRuns.findSucceededOutputForOrganization(checkerId, requestKey!, "weekly_lessons")).resolves.not.toBeNull();
    await expect(repositories.aiRuns.findSucceededOutputForOrganization(otherOperatorId, requestKey!, "weekly_lessons")).resolves.toBeNull();
  });

  it("creates a new checkpoint fingerprint when topic, plan or prompt version changes", async () => {
    const { weeklyLessonCheckpointFingerprint } = await import("../src/modules/content/routes.js");
    const week = { weekNumber: 1, topic: "Topic", description: "", objectives: "", keyVocabHint: "", plan: { A1: ["a", "b", "c", "d", "e"] } };
    const base = weeklyLessonCheckpointFingerprint({ week, cefr: "A1", promptVersionId: "p1", qualityProfile: "strict" });
    expect(weeklyLessonCheckpointFingerprint({ week, cefr: "A1", promptVersionId: "p1", qualityProfile: "strict" })).toBe(base);
    expect(weeklyLessonCheckpointFingerprint({ week: { ...week, topic: "Other" }, cefr: "A1", promptVersionId: "p1", qualityProfile: "strict" })).not.toBe(base);
    expect(weeklyLessonCheckpointFingerprint({ week: { ...week, plan: { A1: ["x", "b", "c", "d", "e"] } }, cefr: "A1", promptVersionId: "p1", qualityProfile: "strict" })).not.toBe(base);
    expect(weeklyLessonCheckpointFingerprint({ week, cefr: "A1", promptVersionId: "p2", qualityProfile: "strict" })).not.toBe(base);
    expect(weeklyLessonCheckpointFingerprint({ week, cefr: "A2", promptVersionId: "p1", qualityProfile: "strict" })).not.toBe(base);
  });
});
