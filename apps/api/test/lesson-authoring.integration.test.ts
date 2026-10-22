import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

function lesson(dayNumber: number) {
  return {
    dayNumber, title: `Bài soạn T${dayNumber + 1}`, durationMinutes: 10,
    parts: [
      "objective", "instruction", "vocabulary", "grammar", "pronunciation",
      "listening", "reading", "writing", "speaking"
    ].map(code => ({ code, title: code, content: { text: `Nội dung ${code}` } }))
  };
}

describe("granular lesson-set authoring", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
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
        [DEMO_IDS.operator, await createCredentialHash("operator-pass"), DEMO_IDS.manager, await createCredentialHash("manager-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("operator@e4s.local", "operator-pass");
    managerCookie = await login("manager@e4s.local", "manager-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("creates, updates and deletes one day with optimistic concurrency", async () => {
    const created = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft/lessons/1",
      headers: { cookie: operatorCookie }, payload: { expectedVersion: 0, ...lesson(1) }
    });
    expect(created.statusCode, created.body).toBe(200);
    const first = created.json() as { version: number; lessons: Array<{ dayNumber: number; title: string }> };
    expect(first).toMatchObject({ version: expect.any(Number), lessons: [{ dayNumber: 1, title: "Bài soạn T2" }] });

    const stale = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft/lessons/1",
      headers: { cookie: operatorCookie }, payload: { expectedVersion: first.version - 1, ...lesson(1), title: "Stale" }
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: "CONTENT_VERSION_CONFLICT" });

    const updated = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft/lessons/1",
      headers: { cookie: operatorCookie }, payload: { expectedVersion: first.version, ...lesson(1), title: "Bài đã sửa" }
    });
    expect(updated.statusCode, updated.body).toBe(200);
    const second = updated.json() as { version: number; lessons: Array<{ id: string; title: string }> };
    expect(second.version).toBeGreaterThan(first.version);
    expect(second.lessons[0]?.title).toBe("Bài đã sửa");

    const deleted = await app.inject({
      method: "DELETE", url: "/api/v1/content/lesson-sets/2/B1/draft/lessons/1",
      headers: { cookie: operatorCookie }, payload: { expectedVersion: second.version }
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json()).toMatchObject({ version: second.version + 1, lessons: [] });

    const deletedSet = await app.inject({
      method: "DELETE", url: "/api/v1/content/lesson-sets/2/B1/draft",
      headers: { cookie: operatorCookie }, payload: {}
    });
    expect(deletedSet.statusCode, deletedSet.body).toBe(200);
    expect(deletedSet.json()).toEqual({ deleted: true });

    const inUse = await app.inject({
      method: "DELETE", url: "/api/v1/content/lesson-sets/1/A2/draft",
      headers: { cookie: operatorCookie }, payload: {}
    });
    expect(inUse.statusCode).toBe(409);
    expect(inUse.json()).toMatchObject({ code: "CONTENT_DRAFT_IN_USE" });
  });

  it("allows Manager mutations on shared lesson-authoring routes", async () => {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/content/lesson-sets/2/B1/draft/lessons/1",
      headers: { cookie: managerCookie }, payload: { expectedVersion: 0, ...lesson(1) }
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it("keeps AI authoring actions available to staff and honest when no runner is configured", async () => {
    const operator = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/B1/draft/enrich",
      headers: { cookie: operatorCookie }, payload: { expectedVersion: 0 }
    });
    expect(operator.statusCode).toBe(503);
    expect(operator.json()).toMatchObject({ code: "AI_UNAVAILABLE" });

    const manager = await app.inject({
      method: "POST", url: "/api/v1/content/lesson-sets/2/B1/draft/fill-phrases",
      headers: { cookie: managerCookie }, payload: { expectedVersion: 0 }
    });
    expect(manager.statusCode).toBe(503);
    expect(manager.json()).toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
