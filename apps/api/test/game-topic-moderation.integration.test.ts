import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("game topic moderation API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let aiCalls = 0;
  let lastSystemPrompt = "";
  let nextOutput: unknown = { topic: "Sprint planning", words: [] };
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: {
    runTask: async (_taskId, _input, options) => {
      aiCalls += 1;
      lastSystemPrompt = options?.systemPrompt ?? "";
      return {
        output: nextOutput,
        metadata: { traceId: `trace-topic-${aiCalls}`, taskId: "vocabulary_generation", provider: "fixture", model: "fixture-model", attempts: 1, latencyMs: 1, inputHash: "a".repeat(64), schemaValid: true as const, usage: {} }
      };
    }
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

  beforeEach(async () => {
    aiCalls = 0;
    lastSystemPrompt = "";
    await pool.query("delete from topic_reports where learner_id = $1", [DEMO_IDS.learner]);
    await pool.query("delete from topic_strikes where learner_id = $1", [DEMO_IDS.learner]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns unsafe strike states and creates one report on the third strike", async () => {
    for (const [index, requestId] of [1, 2, 3].map((value) => [value, `40000000-0000-4000-8000-00000000000${value}`] as const)) {
      const response = await app.inject({
        method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
        payload: { requestId, topic: "porn" }
      });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json().moderation).toMatchObject({
        state: index === 3 ? "reported" : "unsafe", strike: index
      });
    }
    const report = await pool.query(
      "select count(*)::int as count from topic_reports where learner_id = $1 and status = 'open'",
      [DEMO_IDS.learner]
    );
    expect(report.rows[0]?.count).toBe(1);
  });

  it("returns an explicit invalid topic state without pretending a word set was generated", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: "40000000-0000-4000-8000-000000000010", topic: "!!!" }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: "VOCABULARY_TOPIC_REJECTED", moderation: { state: "invalid" } });
    expect(response.json().wordSet).toBeUndefined();
    const strikes = await pool.query(
      "select count(*)::int as count from topic_strikes where learner_id = $1",
      [DEMO_IDS.learner]
    );
    expect(strikes.rows[0]?.count).toBe(0);
  });

  it.each([
    ["a topic that contains more than seven separate words today", "too many words"],
    ["a".repeat(71), "too many characters"],
    ["người đồng tính", "a protected group"]
  ])("soft-rejects %s without adding a strike (%s)", async (topic) => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: crypto.randomUUID(), topic }
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({
      code: "VOCABULARY_TOPIC_REJECTED",
      strikes: 0,
      moderation: { state: "invalid" }
    });
    const strikes = await pool.query(
      "select count(*)::int as count from topic_strikes where learner_id = $1",
      [DEMO_IDS.learner]
    );
    expect(strikes.rows[0]?.count).toBe(0);
  });

  it.each(["n1gger", "N I G G E R", "f*ck meeting", "ma túy", "khiêu dâm", "coffee $hit", "self-harm"])(
    "refuses the unsafe topic %s with GAME_TOPIC_NOT_ALLOWED before any AI call", async (topic) => {
      const response = await app.inject({
        method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
        payload: { requestId: crypto.randomUUID(), topic }
      });
      expect(response.statusCode, response.body).toBe(422);
      expect(response.json()).toMatchObject({
        code: "GAME_TOPIC_NOT_ALLOWED",
        message: "Chủ đề này không phù hợp. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting.",
        strikes: 1,
        moderation: { state: "unsafe", strike: 1, message: "Chủ đề này không phù hợp. Hãy chọn một chủ đề công việc hoặc đời sống, ví dụ: coffee shop, meeting." }
      });
      expect(response.json().wordSet).toBeUndefined();
      expect(aiCalls).toBe(0);
    }
  );

  it("drops sensitive generated words and tells the AI to stay workplace-appropriate", async () => {
    const word = (id: string, english: string, vietnamese = `nghĩa ${id}`) => ({ id, english, vietnamese, definition: `simple meaning of ${english}`, partOfSpeech: "noun" });
    nextOutput = {
      topic: "Coffee shop",
      words: [...Array.from({ length: 11 }, (_, index) => word(`cafe-${index + 1}`, `coffee item ${index + 1}`)), word("cafe-bad", "cocaine")],
      distractors: [...Array.from({ length: 7 }, (_, index) => word(`other-${index + 1}`, `office thing ${index + 1}`)), word("other-bad", "stapler", "ma túy")]
    };
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: crypto.randomUUID(), topic: "coffee shop" }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(aiCalls).toBe(1);
    expect(lastSystemPrompt).toContain("appropriate for a workplace or everyday-life English class");
    const set = response.json().wordSet as { words: Array<{ english: string }>; distractors: Array<{ english: string }> };
    expect(set.words.map((item) => item.english)).not.toContain("cocaine");
    expect(set.words).toHaveLength(11);
    expect(set.distractors.map((item) => item.english)).not.toContain("stapler");
  });

  it("rejects a generated set that is mostly sensitive instead of saving it", async () => {
    const word = (id: string, english: string) => ({ id, english, vietnamese: `nghĩa ${id}`, definition: `meaning ${id}`, partOfSpeech: "noun" });
    nextOutput = {
      topic: "Night life",
      words: Array.from({ length: 12 }, (_, index) => word(`w-${index}`, index < 4 ? ["porn", "sex", "heroin", "kill"][index]! : `safe word ${index}`)),
      distractors: Array.from({ length: 8 }, (_, index) => word(`d-${index}`, `other word ${index}`))
    };
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: crypto.randomUUID(), topic: "night life" }
    });
    expect(response.statusCode, response.body).toBe(502);
    expect(response.json()).toMatchObject({ code: "AI_OUTPUT_INVALID", moderation: { state: "ai_rejected" } });
  });

  it("refuses an offensive learner display name at registration", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/auth/learner/register",
      payload: { displayName: "Nguyễn Fucker", email: "unsafe-name@e4s.local", pin: "123456" }
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({ code: "DISPLAY_NAME_NOT_ALLOWED" });
    const created = await pool.query("select count(*)::int as count from users where email = $1", ["unsafe-name@e4s.local"]);
    expect(created.rows[0]?.count).toBe(0);
  });

  it("adds a strike for nonsense instead of treating it as a format mistake", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: "40000000-0000-4000-8000-000000000011", topic: "asdfgh" }
    });

    expect(response.statusCode, response.body).toBe(422);
    expect(response.json()).toMatchObject({ code: "VOCABULARY_TOPIC_REJECTED", strikes: 1 });
    const strikes = await pool.query(
      "select count(*)::int as count from topic_strikes where learner_id = $1",
      [DEMO_IDS.learner]
    );
    expect(strikes.rows[0]?.count).toBe(1);
  });
});
