import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import type { ContentMediaService } from "../src/modules/media/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("practice, games, arena, rewards and survey API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let aiTrace = 0;
  let weeklyPracticeOffTopic = false;
  const mediaService: ContentMediaService = {
    resolveForUser: vi.fn().mockResolvedValue({ status: "unavailable" }),
    diagnoseForUser: vi.fn().mockResolvedValue({ image: { status: "unavailable" }, provider: null, cached: false }),
    clearForUser: vi.fn().mockResolvedValue({ cleared: 0 })
  };
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: {
    runTask: async (taskId) => ({
      output: taskId === "weekly_practice_grading" ? {
        score: { total: 84, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } },
        offTopic: weeklyPracticeOffTopic,
        feedback: "Ý rõ và đúng bối cảnh công việc.", suggestions: [], correctedText: "I prepare reports."
      } : {
        topic: "Sprint planning",
        words: Array.from({ length: 12 }, (_, index) => ({ id: `sprint-${index + 1}`, english: `term ${index + 1}`,
          vietnamese: `từ ${index + 1}`, definition: `definition ${index + 1}`, partOfSpeech: "noun",
          ...(index === 0 ? { imageQuery: "sprint planning board" } : {}) })),
        distractors: Array.from({ length: 8 }, (_, index) => ({ id: `distractor-${index + 1}`, english: `unrelated ${index + 1}`,
          vietnamese: `nhiễu ${index + 1}`, definition: `unrelated definition ${index + 1}`, partOfSpeech: "noun" }))
      },
      metadata: { traceId: `trace-${taskId}-${++aiTrace}`, taskId, provider: "fixture", model: "fixture-model", attempts: 1,
        latencyMs: 5, inputHash: "a".repeat(64), schemaValid: true as const, usage: {} }
    })
  }, mediaService });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createPinHash("123456")]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  async function restoreWeeklyGameSet() {
    await pool.query(
      "delete from game_sets where program_week_id = $1 and learner_id = $2",
      [DEMO_IDS.week, DEMO_IDS.learner]
    );
    await pool.query(
      `insert into game_sets (id, program_week_id, game_key, status, payload)
       values ($1, $2, 'weekly_vocabulary', 'published', $3::jsonb)
       on conflict (id) do update set status = 'published', payload = excluded.payload`,
      [DEMO_IDS.gameSet, DEMO_IDS.week, JSON.stringify({
        topic: "Tuần 1: Introducing yourself & your job",
        words: Array.from({ length: 15 }, (_, index) => ({
          id: `weekly-${index + 1}`, english: `term${index + 1}`, vietnamese: `từ ${index + 1}`,
          definition: `definition ${index + 1}`, partOfSpeech: "noun"
        }))
      })]
    );
  }

  it("keeps weekly practice in one screen and awards the Friday badge once", async () => {
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `update progress_records set status = 'in_progress', completed_at = null
       where learner_id = $1 and lesson_id <> $2`,
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );
    await pool.query(
      `insert into game_sets (id, program_week_id, game_key, status, payload)
       values ($1, $2, 'weekly_vocabulary', 'published', $3::jsonb)
       on conflict (id) do update set payload = excluded.payload, status = 'published'`,
      [DEMO_IDS.gameSet, DEMO_IDS.week, JSON.stringify({
        topic: "Tuần 1: Introducing yourself & your job",
        words: Array.from({ length: 15 }, (_, index) => ({
          id: `weekly-${index + 1}`,
          english: ["introduce", "colleague", "weekly summary"][index] ?? `term${index + 1}`,
          vietnamese: `từ ${index + 1}`,
          definition: `definition ${index + 1}`,
          partOfSpeech: "noun"
        }))
      })]
    );
    const locked = await app.inject({ method: "GET", url: "/api/v1/engagement/practice", headers: { cookie } });
    expect(locked.statusCode, locked.body).toBe(200);
    expect(locked.json()).toMatchObject({ state: "locked", completedLessons: 1, totalLessons: 5 });

    await pool.query(
      `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
       select gen_random_uuid(), $1, l.id, 'completed', 80, '{}'::jsonb, now(), now()
       from lessons l where l.id <> $2
       on conflict (learner_id, lesson_id) do update set status = 'completed', completed_at = now()`,
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );
    const opened = await app.inject({ method: "GET", url: "/api/v1/engagement/practice", headers: { cookie } });
    expect(opened.json()).toMatchObject({ state: "open", completedLessons: 5, totalLessons: 5 });

    const invalid = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000099",
        text: "I prepare the weekly agenda. My colleague joins today."
      }
    });
    expect(invalid.statusCode, invalid.body).toBe(422);
    expect(invalid.json()).toMatchObject({
      code: "PRACTICE_FORMAT_INVALID",
      errors: expect.arrayContaining([
        "Bài A1–A2 cần từ 3 đến 5 câu.",
        "Hãy dùng ít nhất 3 từ hoặc cụm từ của tuần."
      ])
    });

    const weeklySet = await pool.query<{ payload: { words: Array<{ english: string }> } }>(
      `select payload from game_sets
       where program_week_id = $1 and game_key = 'weekly_vocabulary' and learner_id is null
       order by created_at desc limit 1`,
      [opened.json().weekId]
    );
    const weeklyWords = weeklySet.rows[0]!.payload.words.slice(0, 3).map((word) => word.english);
    const validText = `I use ${weeklyWords[0]} at work. My colleague discusses ${weeklyWords[1]}. We prepare ${weeklyWords[2]} every week.`;

    const requestId = "10000000-0000-4000-8000-000000000001";
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId, text: validText }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ state: "submitted", submission: { status: "submitted", score: { total: 74 } } });

    const snapshot = await pool.query<{
      prompt_snapshot: { task: string; guidance: string };
      cefr_snapshot: string;
      vocabulary_snapshot: string[];
    }>(
      `select prompt_snapshot, cefr_snapshot, vocabulary_snapshot
       from practice_submissions where learner_id = $1 and request_key = $2`,
      [DEMO_IDS.learner, requestId]
    );
    expect(snapshot.rows[0]).toMatchObject({
      prompt_snapshot: { task: opened.json().task, guidance: opened.json().guidance },
      cefr_snapshot: "A2",
      vocabulary_snapshot: expect.arrayContaining(["colleague", "role", "work with"])
    });

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId, text: validText }
    });
    expect(duplicate.statusCode).toBe(200);
    const rewards = await pool.query(
      "select count(*)::int as count from reward_events where learner_id = $1 and source_type = 'weekly_practice'",
      [DEMO_IDS.learner]
    );
    expect(rewards.rows[0].count).toBe(1);

    const historicalWeekId = "10000000-0000-4000-8000-000000000098";
    await pool.query(
      `insert into program_weeks (id, program_id, week_number, topic)
       values ($1, $2, 99, 'Historical topic')`,
      [historicalWeekId, DEMO_IDS.program]
    );
    await pool.query(
      `insert into practice_submissions
         (id, learner_id, program_week_id, status, content, score, prompt_snapshot, cefr_snapshot, vocabulary_snapshot, submitted_at)
       values ($1, $2, $3, 'reviewed', '{"text":"Historical response"}',
         '{"total":0,"rubric":{"meaning":0,"vocabulary":0,"grammar":0}}',
         '{"task":"Historical task","guidance":"Historical guidance"}', 'A1', '[]', now() - interval '7 days')`,
      ["10000000-0000-4000-8000-000000000097", DEMO_IDS.learner, historicalWeekId]
    );
    const resumed = await app.inject({ method: "GET", url: "/api/v1/engagement/practice", headers: { cookie } });
    expect(resumed.statusCode, resumed.body).toBe(200);
    expect(resumed.json().history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        weekNumber: 99,
        topic: "Historical topic",
        task: "Historical task",
        score: { total: 0, rubric: { meaning: 0, vocabulary: 0, grammar: 0 } }
      })
    ]));
  });

  it("derives weekly-practice requirements from published lesson vocabulary", async () => {
    await pool.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `update progress_records set status = 'completed', completed_at = now() where learner_id = $1`,
      [DEMO_IDS.learner]
    );
    await pool.query(
      `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
       values ($1, $2, $3, 'weekly_vocabulary', 'published', $4::jsonb)`,
      ["10000000-0000-4000-8000-000000000091", DEMO_IDS.week, DEMO_IDS.learner,
        JSON.stringify({ source: "ai", topic: "Private unrelated game", words: ["alpha", "beta", "gamma"].map((english) => ({ english })) })]
    );
    const contents = await pool.query<{ content: { parts: Array<{ code: string; content: { items?: Array<{ word: string }> } }> } }>(
      `select lv.content from lessons l
       join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id and lsv.status = 'published'
       join lateral (select content from lesson_versions where lesson_id = l.id and status = 'published' order by version desc limit 1) lv on true
       where lsv.lesson_set_id = $1 order by l.day_number`,
      [DEMO_IDS.lessonSet]
    );
    const words = contents.rows.flatMap(({ content }) => content.parts
      .filter((part) => part.code === "vocabulary")
      .flatMap((part) => part.content.items?.map((item) => item.word) ?? [])).slice(0, 3);
    expect(words).toHaveLength(3);
    const text = `I study ${words[0]}. I study ${words[1]}. I study ${words[2]}.`;
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000090", text }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json().submission.text).toBe(text);
    await pool.query("delete from game_sets where id = $1", ["10000000-0000-4000-8000-000000000091"]);
  });

  it("validates against the published weekly-practice vocabulary instead of stale game sets", async () => {
    await pool.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `update progress_records set status = 'completed', completed_at = now()
       where learner_id = $1`,
      [DEMO_IDS.learner]
    );
    await pool.query(
      `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
       values ($1, $2, $3, 'weekly_vocabulary', 'published', $4::jsonb)`,
      ["10000000-0000-4000-8000-000000000096", DEMO_IDS.week, DEMO_IDS.learner, JSON.stringify({
        topic: "Private unrelated game", words: ["alpha", "beta", "gamma"].map((english) => ({ english }))
      })]
    );
    await pool.query(
      `insert into lesson_set_versions
         (id, lesson_set_id, version, status, payload, created_by, approved_by, published_at)
       values ($1, $2, 2, 'published', $3::jsonb, $4, $5, now())`,
      ["10000000-0000-4000-8000-000000000092", DEMO_IDS.lessonSet, JSON.stringify({
        weeklyPractice: {
          inputMode: "write",
          task: "Write 3–5 sentences about giving feedback.",
          guidance: "Use the published weekly words.",
          requiredVocabulary: ["check", "good", "job"]
        }
      }), DEMO_IDS.operator, DEMO_IDS.checker]
    );

    const response = await app.inject({ method: "GET", url: "/api/v1/engagement/practice", headers: { cookie } });
    const text = "I check the slide. Good job on the report. Thank you for giving feedback today.";
    expect(text.replace(/[.!?]/g, "").trim().split(/\s+/)).toHaveLength(15);
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000095", text }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({
      state: "submitted",
      submission: {
        text,
        score: { total: 74, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } },
        feedback: "Ý rõ và đúng bối cảnh công việc.",
        correctedText: "I prepare reports."
      }
    });
    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000093",
        text: "I check my notes. Good job on the slides. Thank you for sharing useful feedback today."
      }
    });
    expect(duplicate.statusCode, duplicate.body).toBe(200);
    expect(duplicate.json().submission.text).toBe(text);
    const stored = await pool.query<{ count: number }>(
      "select count(*)::int as count from practice_submissions where learner_id = $1 and program_week_id = $2 and superseded_at is null",
      [DEMO_IDS.learner, DEMO_IDS.week]
    );
    expect(stored.rows[0]?.count).toBe(1);
  });

  it("caps an off-topic weekly-practice grade at 30 even when the rubric is high", async () => {
    await pool.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      "update progress_records set status = 'completed', completed_at = now() where learner_id = $1",
      [DEMO_IDS.learner]
    );
    const requirements = await app.inject({ method: "GET", url: "/api/v1/engagement/practice", headers: { cookie } });
    const words = (await pool.query<{ payload: { weeklyPractice?: { requiredVocabulary?: string[] } } }>(
      `select lsv.payload from lesson_sets ls
       join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
       where ls.program_week_id = $1 and ls.cefr = 'A2' order by lsv.version desc limit 1`,
      [requirements.json().weekId]
    )).rows[0]?.payload.weeklyPractice?.requiredVocabulary ?? ["colleague", "role", "work"];
    const text = `I use ${words[0]} at work. My team discusses ${words[1]}. We practise ${words[2]} every day.`;
    weeklyPracticeOffTopic = true;
    try {
      const submitted = await app.inject({
        method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
        payload: { requestId: "10000000-0000-4000-8000-000000000089", text }
      });
      expect(submitted.statusCode, submitted.body).toBe(200);
      expect(submitted.json().submission.score).toMatchObject({
        total: 30,
        rubric: { meaning: 4, vocabulary: 4, grammar: 3 }
      });
    } finally {
      weeklyPracticeOffTopic = false;
    }
  });

  it("allows one appeal for AI grading and rejects appeals after manual grading", async () => {
    await pool.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
    const submissionId = "10000000-0000-4000-8000-000000000094";
    await pool.query(
      `insert into practice_submissions
         (id, learner_id, program_week_id, status, content, score, feedback, prompt_snapshot, cefr_snapshot, vocabulary_snapshot, submitted_at)
       values ($1, $2, $3, 'submitted', '{"text":"A valid submitted weekly answer."}',
         '{"total":74,"rubric":{"meaning":4,"vocabulary":4,"grammar":3}}',
         '{"source":"ai","message":"AI feedback"}', '{}', 'A2', '[]', now())`,
      [submissionId, DEMO_IDS.learner, DEMO_IDS.week]
    );
    const tooShort = await app.inject({
      method: "POST", url: `/api/v1/engagement/practice/${submissionId}/appeals`, headers: { cookie },
      payload: { reason: "abcd" }
    });
    expect(tooShort.statusCode, tooShort.body).toBe(400);
    expect(tooShort.json()).toEqual({ code: "INVALID_PRACTICE_APPEAL" });
    const first = await app.inject({
      method: "POST", url: `/api/v1/engagement/practice/${submissionId}/appeals`, headers: { cookie },
      payload: { reason: "Please review this score." }
    });
    expect(first.statusCode, first.body).toBe(200);
    const second = await app.inject({
      method: "POST", url: `/api/v1/engagement/practice/${submissionId}/appeals`, headers: { cookie },
      payload: { reason: "Please review it again." }
    });
    expect(second.statusCode, second.body).toBe(409);

    await pool.query("delete from practice_appeals where submission_id = $1", [submissionId]);
    await pool.query(
      `update practice_submissions
       set status = 'reviewed', feedback = coalesce(feedback, '{}'::jsonb) || '{"source":"human"}'::jsonb
       where id = $1`,
      [submissionId]
    );
    const manual = await app.inject({
      method: "POST", url: `/api/v1/engagement/practice/${submissionId}/appeals`, headers: { cookie },
      payload: { reason: "Please review manual grading." }
    });
    expect(manual.statusCode, manual.body).toBe(409);
    expect(manual.json()).toMatchObject({ code: "PRACTICE_APPEAL_NOT_AVAILABLE" });
  });

  it("opens Mini game from a published lesson week without a game set", async () => {
    await pool.query("delete from game_sets where program_week_id = $1", [DEMO_IDS.week]);
    try {
      const emptyHub = await app.inject({ method: "GET", url: "/api/v1/engagement/games", headers: { cookie } });
      expect(emptyHub.statusCode, emptyHub.body).toBe(200);
      expect(emptyHub.json()).toMatchObject({ cefr: "A2", wordSet: null });
      expect(emptyHub.json().games).toHaveLength(6);
    } finally {
      await restoreWeeklyGameSet();
    }
  });

  it("builds the weekly game set from vocabulary in lessons the learner has started", async () => {
    await pool.query("delete from game_sets where program_week_id = $1", [DEMO_IDS.week]);
    await pool.query("delete from progress_records where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at)
       values (gen_random_uuid(), $1, $2, 'in_progress', 0, '{}'::jsonb, now())`,
      [DEMO_IDS.learner, DEMO_IDS.lessons[0]]
    );
    try {
      const selected = await app.inject({
        method: "POST", url: "/api/v1/engagement/games/word-set/weekly", headers: { cookie }, payload: {}
      });

      expect(selected.statusCode, selected.body).toBe(200);
      expect(selected.json()).toMatchObject({
        cefr: "A2",
        wordSet: {
          source: "weekly",
          words: expect.arrayContaining([
            expect.objectContaining({ english: "colleague", vietnamese: "đồng nghiệp", partOfSpeech: "noun" })
          ])
        }
      });
      expect(selected.json().wordSet.words).toHaveLength(3);
    } finally {
      await restoreWeeklyGameSet();
    }
  });

  it("returns an explicit empty state when the learner has not started any lesson vocabulary", async () => {
    await pool.query("delete from game_sets where program_week_id = $1", [DEMO_IDS.week]);
    await pool.query("delete from progress_records where learner_id = $1", [DEMO_IDS.learner]);
    try {
      const selected = await app.inject({
        method: "POST", url: "/api/v1/engagement/games/word-set/weekly", headers: { cookie }, payload: {}
      });

      expect(selected.statusCode, selected.body).toBe(409);
      expect(selected.json()).toEqual({ code: "LEARNED_VOCABULARY_NOT_FOUND" });
    } finally {
      await restoreWeeklyGameSet();
    }
  });

  it("bootstraps a safe natural topic without a pre-created game set", async () => {
    await pool.query("delete from game_sets where program_week_id = $1", [DEMO_IDS.week]);
    try {
      const generated = await app.inject({
        method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
        payload: { requestId: "10000000-0000-4000-8000-000000000090", topic: "Coffee shop conversations" }
      });
      expect(generated.statusCode, generated.body).toBe(200);
      expect(generated.json()).toMatchObject({
        cefr: "A2",
        wordSet: { topic: "Sprint planning", source: "custom" },
        topicModeration: { state: "success" }
      });
    } finally {
      await restoreWeeklyGameSet();
    }
  });

  it("returns the six prototype games and calculates scores from server data", async () => {
    const hub = await app.inject({ method: "GET", url: "/api/v1/engagement/games", headers: { cookie } });
    expect(hub.statusCode, hub.body).toBe(200);
    expect(hub.json().games.map((game: { key: string }) => game.key)).toEqual([
      "scramble", "crossword", "eggs", "mario", "sort", "typing"
    ]);
    expect(hub.json().wordSet.words).toHaveLength(15);

    const words = hub.json().wordSet.words as Array<{ id: string; english: string }>;
    const completed = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/scramble/results", headers: { cookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000002",
        claimedScore: 999,
        answers: [
          { wordId: words[0]!.id, answer: words[0]!.english, attempts: 1, usedHint: false },
          { wordId: words[1]!.id, answer: "wrong", attempts: 1, usedHint: false }
        ]
      }
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({ score: 2, maxScore: 16, correct: 1 });
    expect(completed.json().score).not.toBe(999);

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/scramble/results", headers: { cookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000002",
        claimedScore: 0,
        answers: [{ wordId: words[0]!.id, answer: "wrong" }]
      }
    });
    expect(duplicate.json()).toMatchObject({ score: 2, maxScore: 16 });

    const crossword = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/crossword/results", headers: { cookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000022", hintsUsed: 1,
        answers: words.slice(0, 3).map((word) => ({ wordId: word.id, answer: word.english }))
      }
    });
    expect(crossword.statusCode, crossword.body).toBe(200);
    expect(crossword.json()).toMatchObject({ score: 2, maxScore: 3, correct: 3 });
    const count = await pool.query("select count(*)::int as count from game_results where learner_id = $1", [DEMO_IDS.learner]);
    expect(count.rows[0].count).toBe(2);
  });

  it("resolves a game word through shared attributed media after ownership succeeds", async () => {
    const hub = await app.inject({ method: "GET", url: "/api/v1/engagement/games", headers: { cookie } });
    const setId = hub.json().wordSet.id as string;
    const word = hub.json().wordSet.words[0] as { id: string; english: string; partOfSpeech: string };
    vi.mocked(mediaService.resolveForUser).mockResolvedValueOnce({
      status: "available",
      imageUrl: "https://storage.test/game-word.png",
      alt: word.english,
      attribution: {
        creator: "Fixture creator",
        licence: "CC BY",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Game_word.png"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/engagement/game-sets/${setId}/words/${encodeURIComponent(word.id)}/image`,
      headers: { cookie }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: "available", imageUrl: "https://storage.test/game-word.png" });
    expect(mediaService.resolveForUser).toHaveBeenLastCalledWith(DEMO_IDS.learner, expect.objectContaining({
      term: word.english,
      partOfSpeech: word.partOfSpeech
    }));
  });

  it("returns unavailable and does not resolve a game word outside the learner set", async () => {
    vi.mocked(mediaService.resolveForUser).mockClear();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/engagement/game-sets/99999999-9999-4999-8999-999999999999/words/missing/image",
      headers: { cookie }
    });

    expect(response.statusCode).toBe(404);
    expect(mediaService.resolveForUser).not.toHaveBeenCalled();
  });

  it("shows a legacy Season catch record on the current ten-point scale", async () => {
    await pool.query("delete from game_results where learner_id = $1 and game_key = 'eggs'", [DEMO_IDS.learner]);
    await pool.query(
      `insert into game_results
         (id, game_set_id, learner_id, game_key, score, max_score, request_key, details)
       values (gen_random_uuid(), $1, $2, 'eggs', 1, 2, gen_random_uuid()::text,
               '{"correct":1,"total":2}'::jsonb)`,
      [DEMO_IDS.gameSet, DEMO_IDS.learner]
    );

    const hub = await app.inject({ method: "GET", url: "/api/v1/engagement/games", headers: { cookie } });
    expect(hub.statusCode, hub.body).toBe(200);
    expect(hub.json().games.find((game: { key: string }) => game.key === "eggs").best)
      .toEqual({ score: 5, maxScore: 10 });

    await pool.query("delete from game_results where learner_id = $1 and game_key = 'eggs'", [DEMO_IDS.learner]);
  });

  it("persists Season catch wrong-catch evidence separately from the server-scored answer", async () => {
    const hub = await app.inject({ method: "GET", url: "/api/v1/engagement/games", headers: { cookie } });
    const words = hub.json().wordSet.words as Array<{ id: string; english: string }>;
    const target = words[0]!;
    const firstWrong = words[1]!;
    const secondWrong = words[2]!;
    const requestId = "10000000-0000-4000-8000-000000000024";

    const completed = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/eggs/results", headers: { cookie },
      payload: {
        requestId,
        answers: [{ wordId: target.id, answer: target.english }],
        events: [
          { type: "wrong_catch", wordId: target.id, answer: firstWrong.english },
          { type: "wrong_catch", wordId: target.id, answer: secondWrong.english }
        ]
      }
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({ score: 1, correct: 1, total: 10 });

    const stored = await pool.query<{ details: { evidence: { events: Array<{ type: string; wordId: string; answer: string }> } } }>(
      "select details from game_results where learner_id = $1 and request_key = $2",
      [DEMO_IDS.learner, requestId]
    );
    expect(stored.rows[0]?.details.evidence.events).toEqual(expect.arrayContaining([
      { type: "wrong_catch", wordId: target.id, answer: firstWrong.english },
      { type: "wrong_catch", wordId: target.id, answer: secondWrong.english },
      expect.objectContaining({ type: "scored_answer", wordId: target.id, answer: target.english })
    ]));

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/eggs/results", headers: { cookie },
      payload: { requestId, answers: [{ wordId: target.id, answer: "wrong" }], events: [] }
    });
    expect(duplicate.json()).toMatchObject({ id: completed.json().id, score: 1, correct: 1 });
  });

  it("creates and removes a private AI vocabulary set without changing the weekly set", async () => {
    await restoreWeeklyGameSet();
    const generated = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000020", topic: "Sprint planning" }
    });
    expect(generated.statusCode, generated.body).toBe(200);
    expect(generated.json()).toMatchObject({ wordSet: { topic: "Sprint planning", words: expect.arrayContaining([expect.objectContaining({ english: "term 1" })]) } });
    expect(generated.json().wordSet.words).toHaveLength(12);
    expect(generated.json().wordSet.distractors).toHaveLength(8);

    vi.mocked(mediaService.resolveForUser).mockClear().mockResolvedValueOnce({ status: "unavailable" });
    const generatedSet = generated.json().wordSet as { id: string; words: Array<{ id: string }> };
    const image = await app.inject({
      method: "GET",
      url: `/api/v1/engagement/game-sets/${generatedSet.id}/words/${generatedSet.words[0]!.id}/image`,
      headers: { cookie }
    });
    expect(image.statusCode, image.body).toBe(200);
    expect(image.json()).toEqual({ status: "unavailable" });
    expect(mediaService.resolveForUser).toHaveBeenCalledWith(DEMO_IDS.learner, expect.objectContaining({
      term: "term 1",
      partOfSpeech: "noun",
      imageQuery: "sprint planning board"
    }));

    const removed = await app.inject({ method: "DELETE", url: "/api/v1/engagement/games/word-set", headers: { cookie } });
    expect(removed.statusCode, removed.body).toBe(200);
    expect(removed.json()).toMatchObject({ wordSet: { topic: "Tuần 1: Introducing yourself & your job" } });
  });

  it("enforces B1 eligibility and one score per learner in a Duel", async () => {
    const locked = await app.inject({ method: "GET", url: "/api/v1/engagement/arena", headers: { cookie } });
    expect(locked.json()).toMatchObject({ eligible: false, requiredLevel: "B1" });

    const opponent = "00000000-0000-4000-8000-000000000109";
    await pool.query("update enrollments set cefr = 'B1' where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query(
      `insert into lesson_sets (id, program_week_id, cefr)
       values ('10000000-0000-4000-8000-000000000081', $1, 'B1')`,
      [DEMO_IDS.week]
    );
    await pool.query(
      `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by, approved_by, published_at)
       values ('10000000-0000-4000-8000-000000000082', '10000000-0000-4000-8000-000000000081', 1,
         'published', '{"source":"arena-test"}'::jsonb, $1, $1, now())`,
      [DEMO_IDS.operator]
    );
    await pool.query(
      "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Đồng nghiệp B1', 'opponent@e4s.local')",
      [opponent, DEMO_IDS.organization]
    );
    await pool.query(
      "insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values (gen_random_uuid(), $1, $2, 'B1', true)",
      [DEMO_IDS.program, opponent]
    );
    const arena = await app.inject({ method: "GET", url: "/api/v1/engagement/arena", headers: { cookie } });
    expect(arena.json()).toMatchObject({ eligible: true, learnerId: DEMO_IDS.learner, wordSetTopic: expect.any(String), opponents: [{ id: opponent }] });

    const duel = await app.inject({
      method: "POST", url: "/api/v1/engagement/duels", headers: { cookie },
      payload: { opponentId: opponent, game: "scramble" }
    });
    expect(duel.statusCode, duel.body).toBe(201);
    const duelId = duel.json().id as string;
    const duelView = await app.inject({ method: "GET", url: `/api/v1/engagement/duels/${duelId}`, headers: { cookie } });
    const duelSet = await pool.query("select game_set_id from duels where id = $1", [duelId]);
    expect(duelSet.rows[0].game_set_id).not.toBe(DEMO_IDS.gameSet);
    expect(duelView.json().wordSet.id).toBe(duelSet.rows[0].game_set_id);
    expect(duelView.json().wordSet.source).toBe("custom");
    const word = duelView.json().wordSet.words[0] as { id: string; english: string };
    const first = await app.inject({
      method: "POST", url: `/api/v1/engagement/duels/${duelId}/result`, headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000003", answers: [{ wordId: word.id, answer: word.english }] }
    });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      outcome: "waiting",
      myScore: { score: 2, maxScore: expect.any(Number) },
      opponentScore: null
    });
    const retry = await app.inject({
      method: "POST", url: `/api/v1/engagement/duels/${duelId}/result`, headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000003", answers: [{ wordId: word.id, answer: "wrong" }] }
    });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json()).toMatchObject({
      id: first.json().id,
      result: { id: first.json().result.id, score: 2, maxScore: first.json().result.maxScore },
      myScore: { score: 2, maxScore: first.json().myScore.maxScore }
    });
    const second = await app.inject({
      method: "POST", url: `/api/v1/engagement/duels/${duelId}/result`, headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000004", answers: [{ wordId: word.id, answer: word.english }] }
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ code: "DUEL_ALREADY_PLAYED" });

    await pool.query(
      "update duels set state = 'completed', scores = $2::jsonb, completed_at = now() where id = $1",
      [duelId, JSON.stringify({
        [DEMO_IDS.learner]: { score: 2, maxScore: 2 },
        [opponent]: { score: 1, maxScore: 2 }
      })]
    );
    const ranked = await app.inject({ method: "GET", url: "/api/v1/engagement/arena", headers: { cookie } });
    const own = ranked.json().leaderboard.find((item: { learnerId: string }) => item.learnerId === DEMO_IDS.learner);
    expect(own).toMatchObject({ won: 1, lost: 0 });
    expect(own.points).toBeGreaterThanOrEqual(50);
    expect(ranked.json().duels[0]).toMatchObject({ challengedByMe: true, wordSetTopic: expect.any(String) });

    const concurrent = await Promise.all([1, 2].map(() => app.inject({
      method: "POST", url: "/api/v1/engagement/duels", headers: { cookie },
      payload: { opponentId: opponent, game: "typing" }
    })));
    expect(concurrent.map((response) => response.statusCode)).toEqual([201, 201]);
    expect(concurrent[0]!.json().id).toBe(concurrent[1]!.json().id);
    const openPair = await pool.query(
      "select count(*)::int as count from duels where state = 'open' and game_key = 'typing' and challenger_id = $1 and opponent_id = $2",
      [DEMO_IDS.learner, opponent]
    );
    expect(openPair.rows[0].count).toBe(1);
    const guard = await pool.query("select indexname from pg_indexes where schemaname = 'public' and indexname = 'duels_open_pair_game_unique'");
    expect(guard.rows).toHaveLength(1);
  });

  it("keeps reward and game data separate", async () => {
    const reward = await app.inject({ method: "GET", url: "/api/v1/engagement/rewards/preview", headers: { cookie } });
    expect(reward.statusCode, reward.body).toBe(200);
    expect(reward.json()).toMatchObject({ mode: "preview", requiredBadgeCount: 8, printable: false });
    expect(reward.json()).not.toHaveProperty("games");
  });

  it("submits the pilot survey once and resumes its success state", async () => {
    const pending = await app.inject({ method: "GET", url: "/api/v1/engagement/survey", headers: { cookie } });
    expect(pending.json()).toEqual({ state: "open", surveyKey: "pilot_end" });
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/survey", headers: { cookie },
      payload: { rating: 5, comment: "Bài học ngắn dễ theo dõi.", studyTime: "both" }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ state: "submitted", answers: { rating: 5, studyTime: "both" } });
    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/engagement/survey", headers: { cookie },
      payload: { rating: 1, comment: "overwrite", studyTime: "work" }
    });
    expect(duplicate.statusCode).toBe(409);
  });
});
