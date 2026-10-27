import type { MediaAssetRecord, MediaRepository, SaveAvailableMediaAssetInput, SaveUnavailableMediaAssetInput } from "@e4s/database";
import type { ObjectStorage } from "@e4s/storage";
import { describe, expect, it, vi } from "vitest";
import type { OpenMediaProviders, ProviderCandidate } from "./types.js";
import { createContentMediaService } from "./service.js";

const NOW = new Date("2026-10-19T12:00:00.000Z");

describe("ContentMediaService resolution", () => {
  it("prefers Pixabay photography for a curated image query", async () => {
    const fixture = createFixture();
    fixture.providers.searchPixabay.mockResolvedValue(candidate("pixabay"));

    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "meeting",
      imageQuery: "office team meeting"
    });

    expect(fixture.providers.searchPixabay).toHaveBeenCalledWith("office team meeting");
    expect(fixture.providers.searchOpenverse).not.toHaveBeenCalled();
    expect(result.provider).toBe("pixabay");
  });

  it("continues to another real-image provider when Pixabay is rate limited", async () => {
    const fixture = createFixture();
    fixture.providers.searchPixabay.mockRejectedValue(new Error("rate limited"));
    fixture.providers.searchOpenverse.mockResolvedValue(candidate("openverse"));

    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "meeting",
      imageQuery: "office team meeting"
    });

    expect(fixture.providers.searchOpenverse).toHaveBeenCalledWith("office team meeting");
    expect(result.provider).toBe("openverse");
    expect(result.image.status).toBe("available");
  });

  it("rejects a provider result whose metadata is unrelated to the requested vocabulary", async () => {
    const fixture = createFixture();
    fixture.providers.searchPixabay.mockResolvedValue({
      ...candidate("pixabay"),
      providerAssetId: "brown-bear-cartoon",
      sourcePageUrl: "https://pixabay.com/photos/brown-bear-cartoon-123/",
      semanticText: "brown bear animal cartoon"
    });

    const result = await fixture.service.resolveForUser("user-a", {
      term: "role",
      partOfSpeech: "noun",
      imageQuery: "employee job role name badge workplace photo"
    });

    expect(result).toEqual({ status: "unavailable" });
    expect(fixture.download).not.toHaveBeenCalled();
  });

  it("returns a fully attributed explicit HTTPS image without downloading it", async () => {
    const fixture = createFixture();
    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "notebook",
      explicitImageUrl: "https://images.example.org/notebook.jpg",
      explicitAttribution: {
        creator: "Example Author",
        licence: "CC BY",
        licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
        sourceUrl: "https://example.org/notebook"
      }
    });

    expect(result).toEqual({
      image: {
        status: "available",
        imageUrl: "https://images.example.org/notebook.jpg",
        alt: "notebook",
        attribution: {
          creator: "Example Author",
          licence: "CC BY",
          licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
          sourceUrl: "https://example.org/notebook"
        }
      },
      provider: "explicit",
      cached: false
    });
    expect(fixture.download).not.toHaveBeenCalled();
    expect(fixture.providers.searchCommons).not.toHaveBeenCalled();
  });

  it("prefers Openverse photography before Commons for a curated image query", async () => {
    const fixture = createFixture();
    fixture.providers.searchOpenverse.mockResolvedValue(candidate("openverse"));

    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "deadline",
      imageQuery: "office wall calendar deadline"
    });

    expect(fixture.providers.searchOpenverse).toHaveBeenCalledWith("office wall calendar deadline");
    expect(fixture.providers.searchCommons).not.toHaveBeenCalled();
    expect(result.provider).toBe("openverse");
    expect(result.image.status).toBe("available");
    expect(fixture.savedAvailable[0]?.objectKey).toMatch(/^e4s-media\/org-a\/[a-f0-9]{64}\.png$/);
  });

  it("hides the image when specific providers cannot find a relevant visual", async () => {
    const fixture = createFixture();

    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "tentative",
      imageQuery: "A colleague giving tentative feedback beside a report"
    });

    expect(fixture.providers.searchCommons).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ provider: null, cached: false, image: { status: "unavailable" } });
  });

  it("does not search an abstract adjective by itself after its photo query misses", async () => {
    const fixture = createFixture();
    fixture.providers.searchPixabay.mockImplementation(async (query) =>
      query.includes("office") ? candidate("pixabay") : null
    );

    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "fine",
      partOfSpeech: "adjective",
      imageQuery: "a presentation slide on a laptop screen showing a simple bar chart with clean layout",
      allowProviderFallback: true
    });

    expect(fixture.providers.searchCommons).not.toHaveBeenCalledWith("fine");
    expect(result.provider).toBe("pixabay");
  });

  it("uses distinct concrete Pixabay searches for common abstract adjectives", async () => {
    const fixture = createFixture();
    fixture.providers.searchPixabay.mockImplementation(async (query) =>
      query === "broken coffee mug" ? candidate("pixabay") : null
    );

    const result = await fixture.service.diagnoseForUser("user-a", {
      term: "bad",
      partOfSpeech: "adjective",
      imageQuery: "manager reading a bad report",
      allowProviderFallback: true
    });

    expect(fixture.providers.searchPixabay).toHaveBeenCalledWith("broken coffee mug");
    expect(fixture.providers.searchOpenverse).not.toHaveBeenCalled();
    expect(result.provider).toBe("pixabay");
  });

  it("uses open providers when an uncurated noun has no exact Wikipedia image", async () => {
    const fixture = createFixture();
    fixture.providers.exactWikipedia.mockResolvedValue(null);
    fixture.providers.searchCommons.mockResolvedValue(null);
    fixture.providers.searchOpenverse.mockResolvedValue(candidate("openverse"));

    const result = await fixture.service.resolveForUser("user-a", { term: "notebook", partOfSpeech: "noun", allowProviderFallback: true });

    expect(fixture.providers.exactWikipedia).toHaveBeenCalledOnce();
    expect(fixture.providers.exactWikipedia).toHaveBeenCalledWith("notebook");
    expect(fixture.providers.searchCommons).toHaveBeenCalledWith("notebook");
    expect(fixture.providers.searchOpenverse).toHaveBeenCalledWith("notebook");
    expect(result).toMatchObject({ status: "available", imageUrl: expect.any(String) });
  });

  it("falls back through open providers for adjective and preposition vocabulary", async () => {
    const fixture = createFixture();
    fixture.providers.searchCommons
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(candidate("wikimedia"));
    fixture.providers.searchOpenverse.mockResolvedValueOnce(candidate("openverse"));

    const adjective = await fixture.service.resolveForUser("user-a", { term: "reliable", partOfSpeech: "adjective", allowProviderFallback: true });
    const preposition = await fixture.service.resolveForUser("user-a", { term: "from", partOfSpeech: "preposition", allowProviderFallback: true });

    expect(fixture.providers.searchCommons).toHaveBeenNthCalledWith(1, "reliable");
    expect(fixture.providers.searchOpenverse).toHaveBeenCalledWith("reliable");
    expect(fixture.providers.searchCommons).toHaveBeenNthCalledWith(2, "from");
    expect(adjective).toMatchObject({ status: "available", imageUrl: expect.any(String) });
    expect(preposition).toMatchObject({ status: "available", imageUrl: expect.any(String) });
  });

  it("serves a positive cache through a short-lived presigned URL", async () => {
    const cached = record({ objectKey: "e4s-media/org-a/hash.png" });
    const fixture = createFixture({ initialRecords: [cached] });

    const result = await fixture.service.diagnoseForUser("user-a", { term: "notebook", partOfSpeech: "noun" });

    expect(result.cached).toBe(true);
    expect(result.image).toMatchObject({ status: "available", imageUrl: "https://storage.test/signed" });
    expect(fixture.storage.presignGetObject).toHaveBeenCalledWith({
      bucket: "e4s-media",
      objectKey: "e4s-media/org-a/hash.png",
      expiresInSeconds: 300
    });
    expect(fixture.providers.exactWikipedia).not.toHaveBeenCalled();
  });

  it("returns a live negative cache without calling a provider", async () => {
    const fixture = createFixture({ initialRecords: [record({ status: "unavailable", objectKey: null })] });

    const result = await fixture.service.diagnoseForUser("user-a", { term: "reliable", partOfSpeech: "adjective" });

    expect(result).toEqual({ image: { status: "unavailable" }, provider: null, cached: true });
    expect(fixture.providers.exactWikipedia).not.toHaveBeenCalled();
  });

  it("refreshes an available cache row when its object is missing", async () => {
    const cached = record({ objectKey: "e4s-media/org-a/missing.png" });
    const fixture = createFixture({ initialRecords: [cached], objectExists: false });
    fixture.providers.exactWikipedia.mockResolvedValue(candidate("wikipedia"));

    const result = await fixture.service.diagnoseForUser("user-a", { term: "notebook", partOfSpeech: "noun" });

    expect(result.cached).toBe(false);
    expect(fixture.providers.exactWikipedia).toHaveBeenCalledOnce();
    expect(fixture.savedAvailable).toHaveLength(1);
  });

  it("returns unavailable instead of a transient provider image when persistence fails", async () => {
    const fixture = createFixture({ putError: new Error("storage unavailable") });
    fixture.providers.exactWikipedia.mockResolvedValue(candidate("wikipedia"));

    await expect(fixture.service.resolveForUser("user-a", { term: "notebook", partOfSpeech: "noun" }))
      .resolves.toEqual({ status: "unavailable" });
    expect(fixture.savedAvailable).toHaveLength(0);
    expect(fixture.savedUnavailable).toHaveLength(1);
  });

  it("collapses concurrent identical requests within one organization", async () => {
    const fixture = createFixture();
    let release!: (value: ProviderCandidate | null) => void;
    fixture.providers.exactWikipedia.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const first = fixture.service.resolveForUser("user-a", { term: "notebook", partOfSpeech: "noun" });
    const second = fixture.service.resolveForUser("user-a", { term: "notebook", partOfSpeech: "noun" });
    await vi.waitFor(() => expect(fixture.providers.exactWikipedia).toHaveBeenCalledOnce());
    release(candidate("wikipedia"));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fixture.storage.putObject).toHaveBeenCalledOnce();
  });

  it("keeps identical requests isolated by organization", async () => {
    const fixture = createFixture({ organizations: { "user-a": "org-a", "user-b": "org-b" } });
    fixture.providers.exactWikipedia.mockResolvedValue(candidate("wikipedia"));

    await Promise.all([
      fixture.service.resolveForUser("user-a", { term: "notebook", partOfSpeech: "noun" }),
      fixture.service.resolveForUser("user-b", { term: "notebook", partOfSpeech: "noun" })
    ]);

    expect(fixture.providers.exactWikipedia).toHaveBeenCalledTimes(2);
    expect(fixture.savedAvailable.map((item) => item.organizationId).sort()).toEqual(["org-a", "org-b"]);
  });

  it("returns unavailable for a user without an organization", async () => {
    const fixture = createFixture({ organizations: {} });

    await expect(fixture.service.resolveForUser("unknown", { term: "notebook", partOfSpeech: "noun" }))
      .resolves.toEqual({ status: "unavailable" });
    expect(fixture.providers.exactWikipedia).not.toHaveBeenCalled();
  });
});

describe("ContentMediaService cache clearing", () => {
  it("deletes stored objects before deleting their rows", async () => {
    const fixture = createFixture({ initialRecords: [
      record({ id: "row-1", objectKey: "e4s-media/org-a/one.png" }),
      record({ id: "row-2", objectKey: null, status: "unavailable" })
    ] });

    await expect(fixture.service.clearForUser("user-a")).resolves.toEqual({ cleared: 2 });
    expect(fixture.storage.deleteObject).toHaveBeenCalledWith("e4s-media", "e4s-media/org-a/one.png");
    expect(fixture.deletedIds).toEqual(["row-1", "row-2"]);
  });

  it("leaves a row retryable when deleting its object fails", async () => {
    const fixture = createFixture({
      initialRecords: [
        record({ id: "row-ok", objectKey: "e4s-media/org-a/ok.png" }),
        record({ id: "row-failed", objectKey: "e4s-media/org-a/failed.png" })
      ],
      deleteFailureKey: "e4s-media/org-a/failed.png"
    });

    await expect(fixture.service.clearForUser("user-a")).resolves.toEqual({ cleared: 1 });
    expect(fixture.deletedIds).toEqual(["row-ok"]);
  });
});

function createFixture(options: {
  initialRecords?: MediaAssetRecord[];
  organizations?: Record<string, string>;
  objectExists?: boolean;
  putError?: Error;
  deleteFailureKey?: string;
} = {}) {
  const records = [...(options.initialRecords ?? [])];
  const savedAvailable: SaveAvailableMediaAssetInput[] = [];
  const savedUnavailable: SaveUnavailableMediaAssetInput[] = [];
  const deletedIds: string[] = [];
  const organizations = options.organizations ?? { "user-a": "org-a" };
  const repository: MediaRepository = {
    async organizationIdForUser(userId) { return organizations[userId] ?? null; },
    async findByFingerprint(organizationId) { return records.find((item) => item.organizationId === organizationId) ?? null; },
    async saveAvailable(input) { savedAvailable.push(input); return record({ ...input, id: `saved-${savedAvailable.length}` }); },
    async saveUnavailable(input) { savedUnavailable.push(input); return record({ ...input, id: `missing-${savedUnavailable.length}`, status: "unavailable", objectKey: null }); },
    async listForOrganization(organizationId) { return records.filter((item) => item.organizationId === organizationId); },
    async deleteByIds(_organizationId, ids) { deletedIds.push(...ids); return ids.length; }
  };
  const storage: ObjectStorage = {
    putObject: vi.fn(async () => { if (options.putError) throw options.putError; }),
    deleteObject: vi.fn(async (_bucket, key) => { if (key === options.deleteFailureKey) throw new Error("delete failed"); }),
    objectExists: vi.fn(async () => options.objectExists ?? true),
    ready: vi.fn(),
    presignGetObject: vi.fn(async () => ({ url: "https://storage.test/signed", expiresAt: new Date(NOW.getTime() + 300_000) }))
  };
  const providers = {
    exactWikipedia: vi.fn<OpenMediaProviders["exactWikipedia"]>().mockResolvedValue(null),
    searchCommons: vi.fn<OpenMediaProviders["searchCommons"]>().mockResolvedValue(null),
    searchPixabay: vi.fn<OpenMediaProviders["searchPixabay"]>().mockResolvedValue(null),
    searchOpenverse: vi.fn<OpenMediaProviders["searchOpenverse"]>().mockResolvedValue(null)
  };
  const download = vi.fn(async () => ({
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/png" as const,
    width: 640,
    height: 480,
    sourceUrl: "https://upload.wikimedia.org/media.png"
  }));
  return {
    service: createContentMediaService({ repository, storage, providers, now: () => NOW, download }),
    storage: storage as ObjectStorage & { [K in "putObject" | "deleteObject" | "objectExists" | "presignGetObject"]: ReturnType<typeof vi.fn> },
    providers,
    download,
    savedAvailable,
    savedUnavailable,
    deletedIds
  };
}

function candidate(provider: ProviderCandidate["provider"]): ProviderCandidate {
  return {
    provider,
    providerAssetId: `${provider}-asset`,
    downloadUrl: "https://upload.wikimedia.org/media.png",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Media.png",
    creator: "Fixture creator",
    licence: "CC BY",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/"
  };
}

function record(overrides: Partial<MediaAssetRecord> = {}): MediaAssetRecord {
  return {
    id: "row",
    organizationId: "org-a",
    requestFingerprint: "fixture-fingerprint",
    normalizedQuery: "notebook",
    provider: "wikipedia",
    providerAssetId: "asset",
    status: "available",
    sourceUrl: "https://upload.wikimedia.org/media.png",
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Media.png",
    creator: "Fixture creator",
    licence: "CC BY",
    licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
    objectKey: "e4s-media/org-a/hash.png",
    mimeType: "image/png",
    width: 640,
    height: 480,
    sha256: "hash",
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}
