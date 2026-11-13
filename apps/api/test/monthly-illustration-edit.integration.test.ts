import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCredentialHash } from "@e4s/domain";
import { createRepositories, DEMO_IDS, FROZEN_MONTHLY_ILLUSTRATIONS_SQL, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

/**
 * Manual picture editing of a DRAFT monthly resource pool: upload/replace and
 * remove are Operator-only; once the resources are approved, a word that has a
 * picture is locked while a word without one can still get one.
 * No image is generated here (no image provider is configured in tests).
 */
describe("monthly core-word picture editing before approval", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const storage = {
    async putObject() {}, async deleteObject() {}, async ready() {},
    async presignGetObject(input: { bucket: string; objectKey: string; expiresInSeconds: number }) {
      return { url: `https://storage.test/${encodeURIComponent(input.objectKey)}`, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000) };
    }
  };
  const app = buildApi({ pool, secureCookies: false, storage });
  const frameworkId = randomUUID();
  const url = `/api/v1/content/month-frameworks/${frameworkId}/illustrations`;
  let operatorCookie = "";
  let managerCookie = "";

  const ownedImage = async (name: string) => {
    const objectKey = `content-media/${DEMO_IDS.operator}/${name}-${randomUUID()}.png`;
    const saved = await createRepositories(pool).files.createForOwner({ id: randomUUID(), ownerUserId: DEMO_IDS.operator, purpose: "content_media", bucket: "e4s-evidence", objectKey, mimeType: "image/png", sizeBytes: 3, sha256: "0".repeat(64) });
    expect(saved).not.toBeNull();
    return objectKey;
  };
  const images = async (cookie = operatorCookie) => {
    const listed = await app.inject({ method: "GET", url, headers: { cookie } });
    expect(listed.statusCode, listed.body).toBe(200);
    return (listed.json() as { images: Array<{ word: string; status: string; url?: string; source?: string; locked: boolean }> }).images;
  };

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)", [
        DEMO_IDS.operator, await createCredentialHash("operator-pass"),
        DEMO_IDS.manager, await createCredentialHash("manager-pass")
      ]);
      const month = (await client.query<{ month: string }>("select to_char(organization_system_date($1), 'YYYY-MM') as month", [DEMO_IDS.organization])).rows[0]!.month;
      const existing = await client.query<{ id: string }>("select id from program_months where organization_id = $1 and month = $2", [DEMO_IDS.organization, month]);
      const monthId = existing.rows[0]?.id ?? randomUUID();
      if (!existing.rows[0]) await client.query("insert into program_months (id, organization_id, month, exam_date, lesson_count) values ($1, $2, $3, ($3 || '-28')::date, 20)", [monthId, DEMO_IDS.organization, month]);
      await client.query("delete from month_frameworks where program_month_id = $1 and cefr = 'C1'", [monthId]);
      // A draft reopened by a Manager still carries the URL frozen by the earlier approval on "budget".
      const contract = {
        month, cefr: "C1", version: 2, theme: { title: "Budget reviews", context: "Finance team" },
        coreTerms: [
          { id: "c1-core-1", word: "budget", meaning: "ngân sách", type: "noun", ipa: "/ˈbʌdʒɪt/", imageUrl: "/api/v1/files/content-media/read?artifactKey=content-media%2Fstale.png" },
          { id: "c1-core-2", word: "approve", meaning: "phê duyệt", type: "verb", ipa: "/əˈpruːv/" }
        ],
        supportTerms: [], grammarTopics: [], sounds: []
      };
      await client.query("insert into month_frameworks (id, program_month_id, cefr, status, version, curriculum_contract, scope_hash) values ($1, $2, 'C1', 'draft', 2, $3::jsonb, 'scope')", [frameworkId, monthId, JSON.stringify(contract)]);
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    operatorCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    const managerLogin = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" } });
    expect(managerLogin.statusCode, managerLogin.body).toBe(200);
    managerCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";
  }, 60_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("shows a draft's working pictures, not a URL frozen by an earlier approval", async () => {
    const listed = await images();
    expect(listed.map((image) => [image.word, image.status, image.url ?? null])).toEqual([["budget", "missing", null], ["approve", "missing", null]]);
    const key = await ownedImage("budget");
    const uploaded = await app.inject({ method: "PUT", url, headers: { cookie: operatorCookie }, payload: { word: "budget", artifactKey: key } });
    expect(uploaded.statusCode, uploaded.body).toBe(200);
    expect((await images())[0]).toMatchObject({ word: "budget", status: "ready", source: "upload", url: `/api/v1/files/content-media/read?artifactKey=${encodeURIComponent(key)}`, locked: false });
  });

  it("lets only the Operator remove a picture, validating the word", async () => {
    const managerRemove = await app.inject({ method: "DELETE", url, headers: { cookie: managerCookie }, payload: { word: "budget" } });
    expect(managerRemove.statusCode, managerRemove.body).toBe(403);
    const managerUpload = await app.inject({ method: "PUT", url, headers: { cookie: managerCookie }, payload: { word: "budget", artifactKey: "content-media/x.png" } });
    expect(managerUpload.statusCode, managerUpload.body).toBe(403);
    const anonymous = await app.inject({ method: "DELETE", url, payload: { word: "budget" } });
    expect([401, 403]).toContain(anonymous.statusCode);
    expect((await app.inject({ method: "DELETE", url, headers: { cookie: operatorCookie }, payload: {} })).statusCode).toBe(400);
    const unknown = await app.inject({ method: "DELETE", url, headers: { cookie: operatorCookie }, payload: { word: "invoice" } });
    expect(unknown.statusCode, unknown.body).toBe(404);
    expect(unknown.json()).toMatchObject({ code: "CORE_WORD_NOT_FOUND" });
    expect((await images())[0]!.status).toBe("ready");

    const removed = await app.inject({ method: "DELETE", url, headers: { cookie: operatorCookie }, payload: { word: " Budget " } });
    expect(removed.statusCode, removed.body).toBe(200);
    const after = (removed.json() as { images: Array<{ word: string; status: string; url?: string }> }).images[0]!;
    expect(after).toMatchObject({ word: "budget", status: "missing" });
    expect(after.url).toBeUndefined();
    expect((await pool.query("select 1 from month_framework_images where framework_id = $1 and word = 'budget'", [frameworkId])).rowCount).toBe(0);
  });

  it("blocks upload and removal once the resources are approved and keeps the frozen picture", async () => {
    const key = await ownedImage("budget-final");
    expect((await app.inject({ method: "PUT", url, headers: { cookie: operatorCookie }, payload: { word: "budget", artifactKey: key } })).statusCode).toBe(200);
    await pool.query("update month_frameworks set status = 'approved', approved_at = now() where id = $1", [frameworkId]);

    const removed = await app.inject({ method: "DELETE", url, headers: { cookie: operatorCookie }, payload: { word: "budget" } });
    expect(removed.statusCode, removed.body).toBe(409);
    expect(removed.json()).toMatchObject({ code: "MONTHLY_RESOURCES_LOCKED" });
    const replaced = await app.inject({ method: "PUT", url, headers: { cookie: operatorCookie }, payload: { word: "budget", artifactKey: await ownedImage("late") } });
    expect(replaced.statusCode, replaced.body).toBe(409);
    // Repository guard too: a direct removal of a non-draft framework changes nothing.
    expect(await createRepositories(pool).monthlyContent.removeFrameworkIllustration({ frameworkId, word: "budget" })).toBe(false);
    expect((await pool.query("select 1 from month_framework_images where framework_id = $1 and word = 'budget' and status = 'ready'", [frameworkId])).rowCount).toBe(1);
    const locked = await images();
    // Only the word with a picture is locked; "approve" had none at approval and stays fillable.
    expect(locked.map((image) => [image.word, image.locked])).toEqual([["budget", true], ["approve", false]]);
    // Approved contracts keep their frozen URL.
    expect(locked[0]!.url).toContain("stale.png");
  });

  it("still fills a word without a picture after approval, then locks it and shows it to lessons", async () => {
    const repository = createRepositories(pool).monthlyContent;
    // A job interrupted by the approval left the row pending; the job may still write it.
    expect(await repository.saveFrameworkIllustration({ frameworkId, word: "approve", status: "pending" })).toBe(true);
    const key = await ownedImage("approve");
    const uploaded = await app.inject({ method: "PUT", url, headers: { cookie: operatorCookie }, payload: { word: "approve", artifactKey: key } });
    expect(uploaded.statusCode, uploaded.body).toBe(200);
    expect((await images())[1]).toMatchObject({ word: "approve", status: "ready", source: "upload", locked: true });
    // Now it has a picture, it is locked like the others.
    expect(await repository.saveFrameworkIllustration({ frameworkId, word: "approve", status: "generating" })).toBe(false);
    const again = await app.inject({ method: "PUT", url, headers: { cookie: operatorCookie }, payload: { word: "approve", artifactKey: await ownedImage("approve-late") } });
    expect(again.statusCode, again.body).toBe(409);
    // The frozen word refuses even a status write.
    expect(await repository.saveFrameworkIllustration({ frameworkId, word: "budget", status: "pending" })).toBe(false);
    // Lessons read the picture added after approval through the frozen-illustration projection.
    const projected = await pool.query<{ frozen: Array<{ word: string; artifactKey: string }> }>(
      `select ${FROZEN_MONTHLY_ILLUSTRATIONS_SQL} as frozen from month_frameworks mf where mf.id = $1`, [frameworkId]
    );
    expect(projected.rows[0]!.frozen).toEqual(expect.arrayContaining([{ word: "approve", artifactKey: key }]));
  });
});
