import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("practice, games, arena, rewards and survey API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: {
    runTask: async (taskId) => ({
      output: taskId === "weekly_practice_grading" ? {
        score: { total: 84, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } },
        feedback: "Ý rõ và đúng bối cảnh công việc.", suggestions: [], correctedText: "I prepare reports."
      } : {
        topic: "Sprint planning",
        words: Array.from({ length: 15 }, (_, index) => ({ id: `sprint-${index + 1}`, english: `term ${index + 1}`,
          vietnamese: `từ ${index + 1}`, definition: `definition ${index + 1}`, partOfSpeech: "noun" }))
      },
      metadata: { traceId: `trace-${taskId}`, taskId, provider: "fixture", model: "fixture-model", attempts: 1,
        latencyMs: 5, inputHash: "a".repeat(64), schemaValid: true as const, usage: {} }
    })
  } });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createCredentialHash("learner-pass")]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("keeps weekly practice in one screen and awards the Friday badge once", async () => {
    await pool.query("delete from practice_submissions where learner_id = $1", [DEMO_IDS.learner]);
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

    const requestId = "10000000-0000-4000-8000-000000000001";
    const submitted = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId, text: "I introduce my role and explain the weekly work I prepare for my team." }
    });
    expect(submitted.statusCode, submitted.body).toBe(200);
    expect(submitted.json()).toMatchObject({ state: "submitted", submission: { status: "submitted", score: { total: 84 } } });

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie },
      payload: { requestId, text: "I introduce my role and explain the weekly work I prepare for my team." }
    });
    expect(duplicate.statusCode).toBe(200);
    const rewards = await pool.query(
      "select count(*)::int as count from reward_events where learner_id = $1 and source_type = 'weekly_practice'",
      [DEMO_IDS.learner]
    );
    expect(rewards.rows[0].count).toBe(1);
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

  it("creates and removes a private AI vocabulary set without changing the weekly set", async () => {
    const generated = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: "10000000-0000-4000-8000-000000000020", topic: "Sprint planning" }
    });
    expect(generated.statusCode, generated.body).toBe(200);
    expect(generated.json()).toMatchObject({ wordSet: { topic: "Sprint planning", words: expect.arrayContaining([expect.objectContaining({ english: "term 1" })]) } });

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
