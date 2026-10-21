import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const encryptionKey = Buffer.alloc(32, 7).toString("base64");

describe("Manager provider settings API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let managerCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
    process.env.E4S_SETTINGS_ENCRYPTION_KEY = encryptionKey;
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash, updated_at = now()`,
        [DEMO_IDS.manager, await createCredentialHash("manager-pass"), DEMO_IDS.operator, await createCredentialHash("operator-pass")]
      );
    } finally {
      client.release();
    }
    await app.ready();

    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    managerCookie = await login("manager@e4s.local", "manager-pass");
    operatorCookie = await login("operator@e4s.local", "operator-pass");
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
    delete process.env.E4S_SETTINGS_ENCRYPTION_KEY;
  });

  it("returns a safe unconfigured provider view to both Manager and Operator", async () => {
    const manager = await app.inject({ method: "GET", url: "/api/v1/manager/provider-settings", headers: { cookie: managerCookie } });
    const operator = await app.inject({ method: "GET", url: "/api/v1/manager/provider-settings", headers: { cookie: operatorCookie } });

    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toMatchObject({
      provider: "openai",
      configured: false,
      baseUrl: expect.any(String),
      model: expect.any(String),
      speechToTextModel: expect.any(String),
      capabilities: expect.objectContaining({ chat: true, structuredOutput: true }),
      lastTest: { status: "never", testedAt: null }
    });
    expect(JSON.stringify(manager.json())).not.toMatch(/credential|secret|api.?key|ciphertext/i);
    expect(operator.statusCode, operator.body).toBe(200);
    expect(JSON.stringify(operator.json())).not.toMatch(/credential|secret|api.?key|ciphertext/i);
  });

  it("encrypts a Manager secret, redacts it from responses, and retains it on blank replacement", async () => {
    const secret = "provider-secret-that-must-not-leak";
    const saved = await app.inject({
      method: "PUT",
      url: "/api/v1/manager/provider-settings",
      headers: { cookie: managerCookie },
      payload: {
        provider: "openai",
        baseUrl: "https://api.example.test/v1",
        model: "example-model",
        speechToTextModel: "example-transcribe",
        credential: secret
      }
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(JSON.stringify(saved.json())).not.toContain(secret);

    const stored = await pool.query<{ secret_ciphertext: string | null; secret_nonce: string | null; secret_auth_tag: string | null }>(
      "select secret_ciphertext, secret_nonce, secret_auth_tag from provider_configurations where organization_id = $1",
      [DEMO_IDS.organization]
    );
    expect(stored.rows[0]).toMatchObject({
      secret_ciphertext: expect.any(String),
      secret_nonce: expect.any(String),
      secret_auth_tag: expect.any(String)
    });
    expect(JSON.stringify(stored.rows[0])).not.toContain(secret);

    const reloaded = await app.inject({ method: "GET", url: "/api/v1/manager/provider-settings", headers: { cookie: managerCookie } });
    expect(reloaded.statusCode, reloaded.body).toBe(200);
    expect(reloaded.json()).toMatchObject({ configured: true, model: "example-model" });
    expect(JSON.stringify(reloaded.json())).not.toContain(secret);

    const retained = await app.inject({
      method: "PUT",
      url: "/api/v1/manager/provider-settings",
      headers: { cookie: managerCookie },
      payload: { provider: "openai", baseUrl: "https://api.example.test/v1", model: "example-model-v2", speechToTextModel: "example-transcribe" }
    });
    expect(retained.statusCode, retained.body).toBe(200);
    expect(retained.json()).toMatchObject({ configured: true, model: "example-model-v2" });
    expect(JSON.stringify(retained.json())).not.toContain(secret);
  });

  it("lets Operator save the shared organization credential without exposing it", async () => {
    const secret = "operator-provider-secret";
    const save = await app.inject({
      method: "PUT", url: "/api/v1/manager/provider-settings", headers: { cookie: operatorCookie },
      payload: { provider: "openai", baseUrl: "https://api.groq.com/openai/v1", model: "qwen/qwen3.8-27b", speechToTextModel: "whisper-large-v3-turbo", credential: secret }
    });
    expect(save.statusCode, save.body).toBe(200);
    expect(save.json()).toMatchObject({ configured: true, model: "qwen/qwen3.8-27b" });
    expect(save.body).not.toContain(secret);
  });

  it("tests the saved provider server-side and persists only a redacted result", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const success = await app.inject({ method: "POST", url: "/api/v1/manager/provider-settings/test", headers: { cookie: managerCookie }, payload: {} });
    expect(success.statusCode, success.body).toBe(200);
    expect(success.json()).toMatchObject({ status: "success", code: null, testedAt: expect.any(String) });
    expect(success.body).not.toContain("provider-secret-that-must-not-leak");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.test/v1/chat/completions",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: expect.stringContaining("Bearer ") }) })
    );

    fetchSpy.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    const timeout = await app.inject({ method: "POST", url: "/api/v1/manager/provider-settings/test", headers: { cookie: managerCookie }, payload: {} });
    expect(timeout.statusCode, timeout.body).toBe(200);
    expect(timeout.json()).toMatchObject({ status: "timeout", code: "PROVIDER_TIMEOUT" });
    fetchSpy.mockRestore();
  });
});
