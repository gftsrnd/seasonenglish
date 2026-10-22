import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const outsideOrganizationId = "00000000-0000-4000-8000-000000000203";
const outsideLearnerId = "00000000-0000-4000-8000-000000000204";

describe("organisation experience API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let learnerCookie = "";
  let operatorCookie = "";
  let managerCookie = "";
  let outsideLearnerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into organizations (id, name, slug) values ($1, 'Outside', 'outside-experience')", [outsideOrganizationId]);
      await client.query(
        "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Outside Learner', 'outside-experience@e4s.local')",
        [outsideLearnerId, outsideOrganizationId]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6), ($7, $8)",
        [
          DEMO_IDS.learner, await createCredentialHash("learner-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          outsideLearnerId, await createCredentialHash("outside-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (url: string, email: string, password: string) => {
      const response = await app.inject({ method: "POST", url, payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    learnerCookie = await login("/api/auth/learner/login", "learner@e4s.local", "learner-pass");
    operatorCookie = await login("/api/auth/staff/login", "operator@e4s.local", "operator-pass");
    managerCookie = await login("/api/auth/staff/login", "manager@e4s.local", "manager-pass");
    outsideLearnerCookie = await login("/api/auth/learner/login", "outside-experience@e4s.local", "outside-pass");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("lets every signed-in role read only its organisation experience", async () => {
    const input = {
      theme: "autumn",
      backgroundMusic: { enabled: true, playlistId: "autumn-afternoon", customUrl: "", volume: 34 }
    } as const;
    const saved = await app.inject({ method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: operatorCookie }, payload: input });
    const [learner, operator, manager, outside] = await Promise.all([
      app.inject({ method: "GET", url: "/api/v1/organisation-experience", headers: { cookie: learnerCookie } }),
      app.inject({ method: "GET", url: "/api/v1/organisation-experience", headers: { cookie: operatorCookie } }),
      app.inject({ method: "GET", url: "/api/v1/organisation-experience", headers: { cookie: managerCookie } }),
      app.inject({ method: "GET", url: "/api/v1/organisation-experience", headers: { cookie: outsideLearnerCookie } })
    ]);

    expect(saved.statusCode, saved.body).toBe(200);
    expect(learner.json()).toEqual(input);
    expect(operator.json()).toEqual(input);
    expect(manager.json()).toEqual(input);
    expect(outside.json()).toEqual({
      theme: "auto",
      backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 }
    });
  });

  it("allows Manager and Operator writes but rejects Learner writes", async () => {
    const input = { theme: "winter", backgroundMusic: { enabled: false, playlistId: "winter-evening", customUrl: "", volume: 20 } };
    const manager = await app.inject({ method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: managerCookie }, payload: input });
    const operator = await app.inject({ method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: operatorCookie }, payload: input });
    const learner = await app.inject({ method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: learnerCookie }, payload: input });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(operator.statusCode, operator.body).toBe(200);
    expect(learner.statusCode).toBe(403);
  });

  it.each(["auto", "spring", "summer", "autumn", "winter", "tet", "midautumn", "christmas"])("accepts the exact theme %s", async (theme) => {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: managerCookie },
      payload: { theme, backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().theme).toBe(theme);
  });

  it.each([0, 100])("accepts the boundary volume %s", async (volume) => {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: operatorCookie },
      payload: { theme: "spring", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume } }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().backgroundMusic.volume).toBe(volume);
  });

  it.each(["", "https://www.youtube.com/watch?v=abc123", "https://youtu.be/abc123", "https://www.youtube.com/playlist?list=PL123"])("accepts the supported custom URL %s", async (customUrl) => {
    const response = await app.inject({
      method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: operatorCookie },
      payload: { theme: "summer", backgroundMusic: { enabled: true, playlistId: "auto", customUrl, volume: 25 } }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().backgroundMusic.customUrl).toBe(customUrl);
  });

  it.each([
    { theme: "monsoon", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 } },
    { theme: "autumn", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: -1 } },
    { theme: "autumn", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 101 } },
    { theme: "autumn", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "https://example.com/audio.mp3", volume: 22 } },
    { theme: "autumn", backgroundMusic: { enabled: true, playlistId: "auto", customUrl: "", volume: 22 }, courseTheme: "must not be accepted" }
  ])("rejects invalid input atomically", async (payload) => {
    const before = await app.inject({ method: "GET", url: "/api/v1/organisation-experience", headers: { cookie: managerCookie } });
    const rejected = await app.inject({ method: "PUT", url: "/api/v1/organisation-experience", headers: { cookie: managerCookie }, payload });
    const after = await app.inject({ method: "GET", url: "/api/v1/organisation-experience", headers: { cookie: managerCookie } });
    expect(rejected.statusCode).toBe(400);
    expect(after.json()).toEqual(before.json());
  });
});
