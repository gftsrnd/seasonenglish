import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("local service health", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const storage = {
    putObject: vi.fn(),
    deleteObject: vi.fn(),
    ready: vi.fn().mockResolvedValue(undefined)
  };
  const app = buildApi({
    pool,
    storage,
    secureCookies: false,
    aiRunner: { runTask: vi.fn() },
    imageProviders: { pexels: true, pixabay: false }
  });
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2) on conflict (user_id) do update set credential_hash = excluded.credential_hash, updated_at = now()",
        [DEMO_IDS.manager, await createCredentialHash("manager-pass")]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    expect(login.statusCode, login.body).toBe(200);
    managerCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("keeps liveness separate from readiness and verifies the evidence bucket", async () => {
    const health = await app.inject({ method: "GET", url: "/api/health" });
    const readiness = await app.inject({ method: "GET", url: "/api/readiness" });

    expect(health.statusCode, health.body).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });
    expect(readiness.statusCode, readiness.body).toBe(200);
    expect(readiness.json()).toEqual({ status: "ready" });
    expect(storage.ready).toHaveBeenCalledWith("e4s-evidence");
  });

  it("reports live PostgreSQL, MinIO, and Groq capabilities without secrets", async () => {
    const capabilities = await app.inject({
      method: "GET",
      url: "/api/v1/system/capabilities",
      headers: { cookie: managerCookie }
    });

    expect(capabilities.statusCode, capabilities.body).toBe(200);
    expect(capabilities.json()).toMatchObject({
      api: true,
      database: true,
      ai: true,
      aiConfigured: false,
      aiProvider: null,
      aiModel: null,
      aiLastTest: null,
      objectStorage: true,
      maintenance: false,
      imageProviders: { pexels: true, pixabay: false }
    });
    expect(capabilities.body).not.toContain("manager-pass");
    expect(capabilities.body).not.toContain("e4s_test_password");
    expect(capabilities.body).not.toContain("PEXELS_API_KEY");
  });

  it("marks MinIO unavailable when its evidence bucket probe fails", async () => {
    storage.ready.mockRejectedValueOnce(new Error("minio-internal-secret"));

    const capabilities = await app.inject({
      method: "GET",
      url: "/api/v1/system/capabilities",
      headers: { cookie: managerCookie }
    });

    expect(capabilities.statusCode, capabilities.body).toBe(200);
    expect(capabilities.json()).toMatchObject({ database: true, ai: true, objectStorage: false });
    expect(capabilities.body).not.toContain("minio-internal-secret");
  });

  it("keeps capabilities protected by the existing staff role flow", async () => {
    const capabilities = await app.inject({ method: "GET", url: "/api/v1/system/capabilities" });

    expect(capabilities.statusCode, capabilities.body).toBe(401);
    expect(capabilities.json()).toEqual({ code: "UNAUTHENTICATED" });
  });
});
