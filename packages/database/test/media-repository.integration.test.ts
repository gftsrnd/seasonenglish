import { randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMediaRepository } from "../src/media-repository.js";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

const otherOrganizationId = "00000000-0000-0000-0000-000000000090";

describe("media repository", () => {
  const client = new Client({ connectionString: databaseUrl });
  const pool = new Pool({ connectionString: databaseUrl });
  const media = createMediaRepository(pool);

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
    await client.query(
      "insert into organizations (id, name, slug) values ($1, 'Other organization', 'other-organization')",
      [otherOrganizationId]
    );
  }, 30_000);

  afterAll(async () => {
    await pool.end();
    await client.end();
  });

  it("finds the organization that owns a user without exposing another user field", async () => {
    await expect(media.organizationIdForUser(DEMO_IDS.learner)).resolves.toBe(DEMO_IDS.organization);
    await expect(media.organizationIdForUser(randomUUID())).resolves.toBeNull();
  });

  it("isolates identical request fingerprints by organization", async () => {
    await media.saveAvailable({
      organizationId: DEMO_IDS.organization,
      requestFingerprint: "same-fingerprint",
      normalizedQuery: "notebook",
      provider: "wikipedia",
      providerAssetId: "Notebook",
      sourceUrl: "https://upload.wikimedia.org/notebook.jpg",
      sourcePageUrl: "https://en.wikipedia.org/wiki/Notebook",
      creator: "Example creator",
      licence: "CC BY-SA",
      licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      objectKey: `${DEMO_IDS.organization}/notebook.jpg`,
      mimeType: "image/jpeg",
      width: 640,
      height: 480,
      sha256: "a".repeat(64)
    });
    await media.saveAvailable({
      organizationId: otherOrganizationId,
      requestFingerprint: "same-fingerprint",
      normalizedQuery: "notebook",
      provider: "wikimedia",
      providerAssetId: "File:Notebook.jpg",
      sourceUrl: "https://upload.wikimedia.org/other-notebook.jpg",
      sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Notebook.jpg",
      creator: null,
      licence: "CC0",
      licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      objectKey: `${otherOrganizationId}/notebook.jpg`,
      mimeType: "image/jpeg",
      width: 800,
      height: 600,
      sha256: "b".repeat(64)
    });

    await expect(media.findByFingerprint(DEMO_IDS.organization, "same-fingerprint"))
      .resolves.toMatchObject({ organizationId: DEMO_IDS.organization, provider: "wikipedia" });
    await expect(media.findByFingerprint(otherOrganizationId, "same-fingerprint"))
      .resolves.toMatchObject({ organizationId: otherOrganizationId, provider: "wikimedia" });
  });

  it("expires unavailable results exactly 24 hours after they are cached", async () => {
    const now = new Date("2026-10-19T08:00:00.000Z");
    await media.saveUnavailable({
      organizationId: DEMO_IDS.organization,
      requestFingerprint: "missing-adjective",
      normalizedQuery: "helpful",
      provider: "wikipedia"
    }, now);

    await expect(media.findByFingerprint(
      DEMO_IDS.organization,
      "missing-adjective",
      new Date("2026-10-20T07:59:59.999Z")
    )).resolves.toMatchObject({ status: "unavailable", expiresAt: new Date("2026-10-20T08:00:00.000Z") });
    await expect(media.findByFingerprint(
      DEMO_IDS.organization,
      "missing-adjective",
      new Date("2026-10-20T08:00:00.000Z")
    )).resolves.toBeNull();
  });

  it("does not replace a healthy available asset with a transient unavailable result", async () => {
    await media.saveAvailable({
      organizationId: DEMO_IDS.organization,
      requestFingerprint: "healthy-asset",
      normalizedQuery: "calendar",
      provider: "wikipedia",
      providerAssetId: "Calendar",
      sourceUrl: "https://upload.wikimedia.org/calendar.png",
      sourcePageUrl: "https://en.wikipedia.org/wiki/Calendar",
      creator: null,
      licence: "PDM",
      licenceUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
      objectKey: `${DEMO_IDS.organization}/calendar.png`,
      mimeType: "image/png",
      width: 512,
      height: 512,
      sha256: "c".repeat(64)
    });

    const result = await media.saveUnavailable({
      organizationId: DEMO_IDS.organization,
      requestFingerprint: "healthy-asset",
      normalizedQuery: "calendar",
      provider: "wikipedia"
    }, new Date("2026-10-19T09:00:00.000Z"));

    expect(result).toMatchObject({ status: "available", objectKey: `${DEMO_IDS.organization}/calendar.png` });
  });

  it("lists and deletes only assets owned by the requested organization", async () => {
    const own = await media.saveUnavailable({
      organizationId: DEMO_IDS.organization,
      requestFingerprint: "own-delete",
      normalizedQuery: "own",
      provider: "wikimedia"
    }, new Date("2026-10-19T10:00:00.000Z"));
    const other = await media.saveUnavailable({
      organizationId: otherOrganizationId,
      requestFingerprint: "other-keep",
      normalizedQuery: "other",
      provider: "wikimedia"
    }, new Date("2026-10-19T10:00:00.000Z"));

    await expect(media.deleteByIds(DEMO_IDS.organization, [own.id, other.id])).resolves.toBe(1);
    expect((await media.listForOrganization(DEMO_IDS.organization)).some((item) => item.id === own.id)).toBe(false);
    expect((await media.listForOrganization(otherOrganizationId)).some((item) => item.id === other.id)).toBe(true);
  });
});
