import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const levels = ["A1", "A2", "B1", "B2"] as const;

function option(index: number, requestedLevels: readonly string[] = levels) {
  return {
    topic: `Topic ${index}`,
    description: "Một tình huống giao tiếp trong công việc.",
    objectives: "Nêu mục tiêu và bước tiếp theo rõ ràng.",
    keyVocabHint: "meeting, deadline, update",
    plan: Object.fromEntries(requestedLevels.map((level) => [level, ["Khởi động", "Từ vựng", "Nghe", "Nói", "Ôn tập"]]))
  };
}

describe("week suggestion parity API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let trace = 0;
  const runTask = vi.fn(async (taskKey: string, _input?: unknown) => ({
    output: taskKey === "week_suggestions"
      ? { weeks: [{ weekNumber: 1, levels: [...levels], options: [option(1), option(2), option(3)] }] }
      : {},
    metadata: {
      traceId: `trace-week-${++trace}`, taskId: taskKey, provider: "fixture", model: "fixture-model",
      attempts: 1, latencyMs: 1, inputHash: "a".repeat(64), schemaValid: true as const, usage: {}
    }
  }));
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, aiRunner: { runTask } });
  let operatorCookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("thu.ha.tran@e4s.local", "operator-pass");
    managerCookie = await login("quoc.bao.le@e4s.local", "manager-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns three options with active CEFR five-day plans for Manager and Operator", async () => {
    const manager = await app.inject({
      method: "POST", url: "/api/v1/content/weeks/suggestions", headers: { cookie: managerCookie }, payload: { weekNumbers: [1] }
    });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json().weeks[0]).toMatchObject({ weekNumber: 1, levels, options: expect.any(Array) });

    const response = await app.inject({
      method: "POST", url: "/api/v1/content/weeks/suggestions", headers: { cookie: operatorCookie }, payload: { weekNumbers: [1] }
    });
    expect(response.statusCode, response.body).toBe(200);
    const week = response.json().weeks[0];
    expect(week).toMatchObject({ weekNumber: 1, levels: levels, options: expect.any(Array) });
    expect(week.options).toHaveLength(3);
    for (const suggestion of week.options) {
      expect(Object.keys(suggestion.plan).sort()).toEqual([...levels].sort());
      for (const level of levels) expect(suggestion.plan[level]).toHaveLength(5);
    }
  });

  it("passes an added C1 column to topic AI and requires its five-day plan", async () => {
    const c1Levels = [...levels, "C1"] as const;
    const added = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: operatorCookie },
      payload: { levels: c1Levels }
    });
    expect(added.statusCode, added.body).toBe(200);
    runTask.mockResolvedValueOnce({
      output: { weeks: [{ weekNumber: 1, levels: [...c1Levels], options: [option(4, c1Levels), option(5, c1Levels), option(6, c1Levels)] }] },
      metadata: {
        traceId: "trace-week-c1", taskId: "week_suggestions", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 1, inputHash: "d".repeat(64), schemaValid: true as const, usage: {}
      }
    } as any);
    const response = await app.inject({
      method: "POST", url: "/api/v1/content/weeks/suggestions", headers: { cookie: operatorCookie }, payload: { weekNumbers: [1] }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(runTask.mock.lastCall?.[1]).toMatchObject({ levels: c1Levels });
    expect(response.json().weeks[0]).toMatchObject({ levels: c1Levels });
    expect(Object.keys(response.json().weeks[0].options[0].plan).sort()).toEqual([...c1Levels].sort());
    await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-levels", headers: { cookie: operatorCookie },
      payload: { levels }
    });
  });

  it("removes a suggestion that repeats an existing week topic", async () => {
    runTask.mockResolvedValueOnce({
      output: { weeks: [{ weekNumber: 1, levels: [...levels], options: [{ ...option(1), topic: "Introducing yourself & your job" }, option(2), option(3)] }] },
      metadata: {
        traceId: "trace-week-duplicate", taskId: "week_suggestions", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 1, inputHash: "c".repeat(64), schemaValid: true as const, usage: {}
      }
    });

    const response = await app.inject({
      method: "POST", url: "/api/v1/content/weeks/suggestions", headers: { cookie: operatorCookie }, payload: { weekNumbers: [1] }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().weeks[0].options.map((item: { topic: string }) => item.topic)).toEqual(["Topic 2", "Topic 3"]);
  });

  it("rejects malformed AI output before persistence instead of rendering empty plans", async () => {
    runTask.mockResolvedValueOnce({
      output: { weeks: [{ weekNumber: 1, levels: ["A2"], options: [option(1), option(2)] }] },
      metadata: {
        traceId: "trace-week-invalid", taskId: "week_suggestions", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 1, inputHash: "b".repeat(64), schemaValid: true as const, usage: {}
      }
    });
    const response = await app.inject({
      method: "POST", url: "/api/v1/content/weeks/suggestions", headers: { cookie: operatorCookie }, payload: { weekNumbers: [1] }
    });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: "AI_OUTPUT_INVALID", issues: expect.any(Array) });
  });

  it("explains semantic validation failures instead of returning a generic invalid-output error", async () => {
    runTask.mockResolvedValueOnce({
      output: {
        weeks: [{
          weekNumber: 1,
          levels: ["A2"],
          options: [option(1, ["A2"]), option(2, ["A2"]), option(3, ["A2"])]
        }]
      },
      metadata: {
        traceId: "trace-week-semantic-invalid", taskId: "week_suggestions", provider: "fixture", model: "fixture-model",
        attempts: 1, latencyMs: 1, inputHash: "e".repeat(64), schemaValid: true as const, usage: {}
      }
    } as any);

    const response = await app.inject({
      method: "POST", url: "/api/v1/content/weeks/suggestions", headers: { cookie: operatorCookie }, payload: { weekNumbers: [1] }
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      code: "AI_OUTPUT_INVALID",
      issues: [{ path: "weeks.1.levels", message: expect.stringContaining("A1") }]
    });
  });
});
