import { Pool } from "pg";
import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";
import type { ContentMediaService } from "../src/modules/media/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("Manager settings operational actions", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const mediaService: ContentMediaService = {
    resolveForUser: vi.fn().mockResolvedValue({ status: "unavailable" }),
    diagnoseForUser: vi.fn().mockResolvedValue({ image: { status: "unavailable" }, provider: null, cached: false }),
    clearForUser: vi.fn().mockResolvedValue({ cleared: 0 })
  };
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, maintenanceEnabled: true, mediaService });
  let managerCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
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
    } finally { client.release(); }
    await app.ready();

    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    managerCookie = await login("manager@e4s.local", "manager-pass");
    operatorCookie = await login("operator@e4s.local", "operator-pass");
  }, 30_000);

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await app.close(); await pool.end(); });

  it("tests and clears vocabulary images only for a Manager", async () => {
    vi.mocked(mediaService.diagnoseForUser).mockResolvedValueOnce({
      image: {
        status: "available",
        imageUrl: "https://storage.test/notebook.jpg",
        alt: "notebook",
        attribution: {
          creator: "Fixture creator",
          licence: "CC BY",
          licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Notebook.jpg"
        }
      },
      provider: "wikimedia",
      cached: true
    });
    vi.mocked(mediaService.clearForUser).mockResolvedValueOnce({ cleared: 3 });
    const manager = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/image-test", headers: { cookie: managerCookie },
      payload: { source: "wikimedia", word: "notebook" }
    });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toMatchObject({
      status: "available",
      source: "wikimedia",
      provider: "wikimedia",
      cached: true,
      imageUrl: "https://storage.test/notebook.jpg",
      attribution: { creator: "Fixture creator", licence: "CC BY" }
    });
    expect(mediaService.diagnoseForUser).toHaveBeenCalledWith(DEMO_IDS.manager, { term: "notebook", partOfSpeech: "noun", allowProviderFallback: true });

    const cleared = await app.inject({ method: "POST", url: "/api/v1/manager/settings/image-cache", headers: { cookie: managerCookie }, payload: {} });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect(cleared.json()).toEqual({ cleared: 3 });
    expect(mediaService.clearForUser).toHaveBeenCalledWith(DEMO_IDS.manager);

    const operator = await app.inject({ method: "POST", url: "/api/v1/manager/settings/image-test", headers: { cookie: operatorCookie }, payload: { source: "wikimedia", word: "notebook" } });
    expect(operator.statusCode).toBe(403);
  });

  it("validates and resets the season music configuration", async () => {
    const valid = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/music-test", headers: { cookie: managerCookie },
      payload: { enabled: true, url: "https://www.youtube.com/watch?v=abc", volume: 22 }
    });
    expect(valid.statusCode, valid.body).toBe(200);
    expect(valid.json()).toMatchObject({ status: "valid" });
    const invalid = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/music-test", headers: { cookie: managerCookie },
      payload: { enabled: true, url: "https://example.com/audio.mp3", volume: 22 }
    });
    expect(invalid.statusCode, invalid.body).toBe(200);
    expect(invalid.json()).toMatchObject({ status: "invalid" });

    const reset = await app.inject({ method: "POST", url: "/api/v1/manager/settings/music-reset", headers: { cookie: managerCookie }, payload: {} });
    expect(reset.statusCode, reset.body).toBe(200);
    expect(reset.json()).toMatchObject({ enabled: true, url: "", volume: 22 });
  });

  it("tests webhook delivery without returning the URL or payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const manager = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: managerCookie },
      payload: { url: "https://hooks.example.test/e4s", template: "{\"base_content\":\"{message}\"}" }
    });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toMatchObject({ status: "success", statusCode: 204, code: null });
    expect(manager.body).not.toContain("hooks.example.test");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const operator = await app.inject({ method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: operatorCookie }, payload: { url: "https://hooks.example.test/e4s", template: "{}" } });
    expect(operator.statusCode).toBe(403);
  });

  it("returns redacted webhook diagnostics for validation and delivery failures", async () => {
    const invalidUrl = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: managerCookie },
      payload: { url: "http://hooks.example.test/e4s", template: "{}" }
    });
    expect(invalidUrl.json()).toMatchObject({ status: "error", statusCode: null, code: "WEBHOOK_URL_HTTPS_REQUIRED" });

    const invalidJson = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: managerCookie },
      payload: { url: "https://hooks.example.test/e4s", template: "not-json" }
    });
    expect(invalidJson.json()).toMatchObject({ status: "error", statusCode: null, code: "WEBHOOK_TEMPLATE_INVALID" });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const rejected = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: managerCookie },
      payload: { url: "https://hooks.example.test/e4s", template: "{}" }
    });
    expect(rejected.json()).toMatchObject({ status: "error", statusCode: 401, code: "WEBHOOK_HTTP_401" });

    fetchMock.mockRejectedValueOnce(new TypeError("network details must stay private"));
    const network = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: managerCookie },
      payload: { url: "https://hooks.example.test/e4s", template: "{}" }
    });
    expect(network.json()).toMatchObject({ status: "error", statusCode: null, code: "WEBHOOK_NETWORK_ERROR" });
    expect(network.body).not.toContain("network details");

    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    const timeout = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/webhook-test", headers: { cookie: managerCookie },
      payload: { url: "https://hooks.example.test/e4s", template: "{}" }
    });
    expect(timeout.json()).toMatchObject({ status: "timeout", statusCode: null, code: "WEBHOOK_TIMEOUT" });
    fetchMock.mockRestore();
  });

  it("exports a safe organization snapshot and rejects malformed imports", async () => {
    const exported = await app.inject({ method: "GET", url: "/api/v1/manager/settings/export", headers: { cookie: managerCookie } });
    expect(exported.statusCode, exported.body).toBe(200);
    expect(exported.json()).toMatchObject({ version: 1, organization: { id: DEMO_IDS.organization }, settings: expect.any(Object), accounts: expect.any(Array) });
    expect(exported.body).not.toContain("secret_ciphertext");

    const imported = await app.inject({ method: "POST", url: "/api/v1/manager/settings/import", headers: { cookie: managerCookie }, payload: { snapshot: exported.json() } });
    expect(imported.statusCode, imported.body).toBe(200);
    expect(imported.json()).toEqual({ imported: true });
    const invalid = await app.inject({ method: "POST", url: "/api/v1/manager/settings/import", headers: { cookie: managerCookie }, payload: { snapshot: { version: 99 } } });
    expect(invalid.statusCode).toBe(400);
    const invalidSettings = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/import", headers: { cookie: managerCookie },
      payload: { snapshot: { version: 1, settings: { ...exported.json().settings, reminderInactiveDays: 0 } } }
    });
    expect(invalidSettings.statusCode).toBe(400);
  });

  it("keeps every operational settings action Manager-only", async () => {
    const requests = [
      { method: "POST", url: "/api/v1/manager/settings/image-cache", payload: {} },
      { method: "POST", url: "/api/v1/manager/settings/music-test", payload: { enabled: false, url: "", volume: 22 } },
      { method: "POST", url: "/api/v1/manager/settings/music-reset", payload: {} },
      { method: "POST", url: "/api/v1/manager/settings/webhook-test", payload: { url: "", template: "{}" } },
      { method: "GET", url: "/api/v1/manager/settings/export" },
      { method: "POST", url: "/api/v1/manager/settings/import", payload: { snapshot: { version: 1, settings: { reminderInactiveDays: 3, weeklyReportEnabled: true, pilotStartDate: "2026-10-12", pilotWeeks: 2, weekOverride: 0, minMinutesPerDay: 15, courseTheme: "demo", coachDailyLimit: 20, testTimed: true, testTimes: { listening: 15, reading: 20, writing: 20, speaking: 15 }, testWarnLimit: 3, levelUp: { days: 14, lessons: 90, firstTry: 75, submission: 80, coach: 4, coachTurns: 6, wrong: 30, minParts: 4 }, backgroundMusic: { enabled: true, url: "", volume: 22 }, baseWebhookUrl: "", baseWebhookTemplate: "{}" } } } }
    ] as const;
    for (const request of requests) {
      const response = await app.inject({ ...request, headers: { cookie: operatorCookie } });
      expect(response.statusCode, `${request.method} ${request.url}: ${response.body}`).toBe(403);
    }
  });

  it("keeps organization product preferences Manager-only", async () => {
    const manager = await app.inject({
      method: "PUT", url: "/api/v1/product-preferences", headers: { cookie: managerCookie },
      payload: { theme: "winter", vocabImageSource: "wikimedia" }
    });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toEqual({ theme: "winter", vocabImageSource: "wikimedia" });

    const operator = await app.inject({
      method: "PUT", url: "/api/v1/product-preferences", headers: { cookie: operatorCookie },
      payload: { theme: "summer", vocabImageSource: "openverse" }
    });
    expect(operator.statusCode, operator.body).toBe(403);
    expect(operator.json()).toEqual({ code: "FORBIDDEN" });
  });

  it("requires local maintenance confirmation and an export backup before seed or wipe", async () => {
    const capabilities = await app.inject({ method: "GET", url: "/api/v1/system/capabilities", headers: { cookie: managerCookie } });
    expect(capabilities.statusCode, capabilities.body).toBe(200);
    expect(capabilities.json()).toMatchObject({ maintenance: true });
    const disabledApp = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
    await disabledApp.ready();
    const disabled = await disabledApp.inject({ method: "POST", url: "/api/v1/manager/settings/seed-confirmation", headers: { cookie: managerCookie }, payload: {} });
    await disabledApp.close();
    expect(disabled.statusCode).toBe(404);

    const seedConfirmation = await app.inject({ method: "POST", url: "/api/v1/manager/settings/seed-confirmation", headers: { cookie: managerCookie }, payload: {} });
    expect(seedConfirmation.statusCode, seedConfirmation.body).toBe(200);
    expect(seedConfirmation.json()).toMatchObject({
      action: "seed_demo", token: expect.any(String), confirmationPhrase: "GHI DE TOAN BO", countdownSeconds: 5,
      backupId: expect.any(String), expiresAt: expect.any(String)
    });

    const missingSeedConfirmation = await app.inject({ method: "POST", url: "/api/v1/manager/settings/seed", headers: { cookie: managerCookie }, payload: {} });
    expect(missingSeedConfirmation.statusCode).toBe(400);
    const invalidSeedConfirmation = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/seed", headers: { cookie: managerCookie },
      payload: { confirmationToken: "invalid-maintenance-token", confirmationPhrase: "GHI DE TOAN BO" }
    });
    expect(invalidSeedConfirmation.statusCode).toBe(409);
    const operator = await app.inject({ method: "POST", url: "/api/v1/manager/settings/wipe-confirmation", headers: { cookie: operatorCookie }, payload: {} });
    expect(operator.statusCode).toBe(403);
    const seeded = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/seed", headers: { cookie: managerCookie },
      payload: { confirmationToken: seedConfirmation.json().token, confirmationPhrase: seedConfirmation.json().confirmationPhrase }
    });
    expect(seeded.statusCode, seeded.body).toBe(200);
    expect(seeded.json()).toMatchObject({ action: "seed_demo", completed: true, backupId: seedConfirmation.json().backupId });
    await expect(pool.query("select email from users where organization_id = $1 order by email", [DEMO_IDS.organization]))
      .resolves.toMatchObject({ rows: [
        { email: "learner@e4s.local" },
        { email: "manager@e4s.local" },
        { email: "operator@e4s.local" }
      ] });

    const wipeConfirmation = await app.inject({ method: "POST", url: "/api/v1/manager/settings/wipe-confirmation", headers: { cookie: managerCookie }, payload: {} });
    expect(wipeConfirmation.statusCode, wipeConfirmation.body).toBe(200);
    expect(wipeConfirmation.json()).toMatchObject({
      action: "wipe_data", token: expect.any(String), confirmationPhrase: "XOA TOAN BO", countdownSeconds: 5,
      backupId: expect.any(String), expiresAt: expect.any(String)
    });
    const wiped = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/wipe", headers: { cookie: managerCookie },
      payload: { confirmationToken: wipeConfirmation.json().token, confirmationPhrase: wipeConfirmation.json().confirmationPhrase }
    });
    expect(wiped.statusCode, wiped.body).toBe(200);
    expect(wiped.json()).toMatchObject({ action: "wipe_data", completed: true, backupId: wipeConfirmation.json().backupId });
    await expect(pool.query("select id from users where id = $1 and status = 'active'", [DEMO_IDS.manager])).resolves.toMatchObject({ rows: [{ id: DEMO_IDS.manager }] });
    await expect(pool.query("select count(*)::int as count from users where role = 'learner'", [])).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(pool.query("select consumed_at from manager_maintenance_backups where id = $1", [wipeConfirmation.json().backupId])).resolves.toMatchObject({ rows: [expect.objectContaining({ consumed_at: expect.anything() })] });
    await expect(pool.query("select action from audit_events where organization_id = $1 and action in ('manager.maintenance.confirmation_issued', 'manager.maintenance.wipe_data')", [DEMO_IDS.organization])).resolves.toMatchObject({ rows: expect.arrayContaining([{ action: "manager.maintenance.confirmation_issued" }, { action: "manager.maintenance.wipe_data" }]) });

    const replay = await app.inject({
      method: "POST", url: "/api/v1/manager/settings/wipe", headers: { cookie: managerCookie },
      payload: { confirmationToken: wipeConfirmation.json().token, confirmationPhrase: wipeConfirmation.json().confirmationPhrase }
    });
    expect(replay.statusCode).toBe(409);
  });
});
