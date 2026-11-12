import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

type SetView = { id: string; examplesPending?: boolean; words: Array<{ id: string; english: string; example?: string }> };

describe("Word sort context sentences API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const calls: Array<{ taskId: string; input: unknown; systemPrompt: string }> = [];
  let generation: unknown = null;
  let backfill: (input: { words: Array<{ id: string; english: string }> }) => unknown = () => ({ examples: [] });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: {
    runTask: async (taskId, input, options) => {
      calls.push({ taskId, input, systemPrompt: options?.systemPrompt ?? "" });
      const output = taskId === "vocabulary_examples" ? backfill(input as { words: Array<{ id: string; english: string }> }) : generation;
      return {
        output,
        metadata: { traceId: `trace-examples-${crypto.randomUUID()}`, taskId, provider: "fixture", model: "fixture-model", attempts: 1, latencyMs: 1, inputHash: "a".repeat(64), schemaValid: true as const, usage: {} }
      };
    }
  } });
  let cookie = "";
  const word = (id: string, english: string, example?: string) => ({
    id, english, vietnamese: `nghĩa ${id}`, definition: `meaning of ${english}`, partOfSpeech: "noun", ...(example ? { example } : {})
  });
  const distractors = Array.from({ length: 8 }, (_, index) => word(`desk-${index + 1}`, `desk thing ${index + 1}`));
  const generate = async (words: ReturnType<typeof word>[]) => {
    generation = { topic: "Office change", words, distractors };
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/games/word-set", headers: { cookie },
      payload: { requestId: crypto.randomUUID(), topic: "office change" }
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().wordSet as SetView;
  };
  const prepare = async (setId: string) => {
    const response = await app.inject({ method: "POST", url: `/api/v1/engagement/game-sets/${setId}/examples`, headers: { cookie }, payload: {} });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as SetView;
  };

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.learner, await createPinHash("123456")]);
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  beforeEach(() => { calls.length = 0; });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("stores the generated example per target word only when it contains the word", async () => {
    const set = await generate([
      word("w-change", "change", "We need a change in the plan."),
      word("w-wrong", "budget", "We need a new plan."),
      word("w-unsafe", "party", "The party had cocaine."),
      ...Array.from({ length: 9 }, (_, index) => word(`w-${index}`, `item ${index}`, `The item ${index} is on the desk.`))
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.systemPrompt).toContain("Word sort context");
    const byId = new Map(set.words.map((item) => [item.id, item]));
    expect(byId.get("w-change")?.example).toBe("We need a change in the plan.");
    expect(byId.get("w-wrong")?.example).toBeUndefined();
    expect(byId.get("w-unsafe")?.example).toBeUndefined();
    expect(set.examplesPending).toBe(true);

    backfill = (input) => ({ examples: input.words.map((item) => ({ id: item.id, example: item.english === "budget" ? "The budget is small." : "We plan a nice day." })) });
    const filled = await prepare(set.id);
    expect(calls.map((call) => call.taskId)).toEqual(["vocabulary_generation", "vocabulary_examples"]);
    expect((calls[1]!.input as { words: Array<{ id: string }> }).words.map((item) => item.id).sort()).toEqual(["w-unsafe", "w-wrong"]);
    const filledById = new Map(filled.words.map((item) => [item.id, item]));
    expect(filledById.get("w-wrong")?.example).toBe("The budget is small.");
    // A backfilled sentence without the word is dropped; the word stays playable without one.
    expect(filledById.get("w-unsafe")?.example).toBeUndefined();
    expect(filled.words).toHaveLength(12);
    expect(filled.examplesPending).toBeUndefined();

    await prepare(set.id);
    expect(calls).toHaveLength(2);
  });

  it("marks a failed backfill so the AI call never repeats, keeping every word playable", async () => {
    const set = await generate(Array.from({ length: 12 }, (_, index) => word(`old-${index}`, `old item ${index}`)));
    expect(set.examplesPending).toBe(true);
    backfill = () => { throw new Error("provider down"); };
    const first = await prepare(set.id);
    expect(first.words).toHaveLength(12);
    expect(first.words.every((item) => !item.example)).toBe(true);
    expect(first.examplesPending).toBeUndefined();
    await prepare(set.id);
    expect(calls.filter((call) => call.taskId === "vocabulary_examples")).toHaveLength(1);
  });
});
