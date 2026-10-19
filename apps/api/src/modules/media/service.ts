import { createHash } from "node:crypto";
import type { ContentImageAttribution, ContentImageDiagnosticView, ContentImageRequest, ContentImageView } from "@e4s/contracts";
import type { MediaAssetRecord, MediaProvider, MediaRepository } from "@e4s/database";
import { MEDIA_BUCKET, type ObjectStorage } from "@e4s/storage";
import { downloadBitmap, normalizeLicence, type SafeBitmap } from "./safety.js";
import type { OpenMediaProviders, ProviderCandidate } from "./types.js";

export interface ContentMediaService {
  resolveForUser(userId: string, request: ContentImageRequest): Promise<ContentImageView>;
  diagnoseForUser(userId: string, request: ContentImageRequest): Promise<ContentImageDiagnosticView>;
  clearForUser(userId: string): Promise<{ cleared: number }>;
}

export function createContentMediaService(options: {
  repository: MediaRepository;
  storage: ObjectStorage;
  providers: OpenMediaProviders;
  bucket?: string;
  now?: () => Date;
  download?: typeof downloadBitmap;
}): ContentMediaService {
  const bucket = options.bucket ?? MEDIA_BUCKET;
  const now = options.now ?? (() => new Date());
  const download = options.download ?? downloadBitmap;
  const inFlight = new Map<string, Promise<ContentImageDiagnosticView>>();

  async function diagnoseForUser(userId: string, request: ContentImageRequest): Promise<ContentImageDiagnosticView> {
    const organizationId = await options.repository.organizationIdForUser(userId);
    if (!organizationId) return unavailable(false);
    const normalized = normalizeRequest(request);
    const fingerprint = sha256(JSON.stringify(normalized));
    const flightKey = `${organizationId}:${fingerprint}`;
    const active = inFlight.get(flightKey);
    if (active) return active;
    const pending = resolve({ organizationId, fingerprint, request: normalized })
      .catch(() => unavailable(false))
      .finally(() => inFlight.delete(flightKey));
    inFlight.set(flightKey, pending);
    return pending;
  }

  async function resolve(input: {
    organizationId: string;
    fingerprint: string;
    request: NormalizedRequest;
  }): Promise<ContentImageDiagnosticView> {
    const cached = await options.repository.findByFingerprint(input.organizationId, input.fingerprint, now());
    if (cached?.status === "unavailable") return unavailable(true);
    if (cached?.status === "available") {
      const view = await viewFromRecord(cached, input.request.term, options.storage, bucket);
      if (view) return { image: view, provider: cached.provider, cached: true };
    }

    const explicit = explicitView(input.request);
    if (explicit) {
      await options.repository.saveAvailable({
        organizationId: input.organizationId,
        requestFingerprint: input.fingerprint,
        normalizedQuery: input.request.term,
        provider: "explicit",
        providerAssetId: null,
        sourceUrl: explicit.imageUrl,
        sourcePageUrl: explicit.attribution.sourceUrl,
        creator: explicit.attribution.creator,
        licence: explicit.attribution.licence,
        licenceUrl: explicit.attribution.licenceUrl,
        objectKey: null,
        mimeType: null,
        width: null,
        height: null,
        sha256: null
      });
      return { image: explicit, provider: "explicit", cached: false };
    }

    const providerForMiss: MediaProvider = input.request.imageQuery ? "wikimedia" : "wikipedia";
    let candidate: ProviderCandidate | null;
    try {
      candidate = await findCandidate(options.providers, input.request);
    } catch {
      return unavailable(false);
    }
    if (!candidate) {
      await options.repository.saveUnavailable({
        organizationId: input.organizationId,
        requestFingerprint: input.fingerprint,
        normalizedQuery: input.request.imageQuery ?? input.request.term,
        provider: providerForMiss
      }, now());
      return unavailable(false);
    }

    try {
      const bitmap = await download({ url: candidate.downloadUrl, allowedHosts: hostsFor(candidate.provider) });
      const digest = sha256(bitmap.bytes);
      const objectKey = `${bucket}/${input.organizationId}/${digest}.${extensionFor(bitmap.mimeType)}`;
      await options.storage.putObject({ bucket, objectKey, body: bitmap.bytes, mimeType: bitmap.mimeType });
      let stored: MediaAssetRecord;
      try {
        stored = await options.repository.saveAvailable({
          organizationId: input.organizationId,
          requestFingerprint: input.fingerprint,
          normalizedQuery: input.request.imageQuery ?? input.request.term,
          provider: candidate.provider,
          providerAssetId: candidate.providerAssetId,
          sourceUrl: candidate.downloadUrl,
          sourcePageUrl: candidate.sourcePageUrl,
          creator: candidate.creator,
          licence: candidate.licence,
          licenceUrl: candidate.licenceUrl,
          objectKey,
          mimeType: bitmap.mimeType,
          width: bitmap.width,
          height: bitmap.height,
          sha256: digest
        });
      } catch {
        await options.storage.deleteObject(bucket, objectKey).catch(() => undefined);
        return unavailable(false);
      }
      const view = await viewFromRecord(stored, input.request.term, options.storage, bucket);
      return view ? { image: view, provider: candidate.provider, cached: false } : unavailable(false);
    } catch {
      return unavailable(false);
    }
  }

  return {
    async resolveForUser(userId, request) {
      return (await diagnoseForUser(userId, request)).image;
    },
    diagnoseForUser,
    async clearForUser(userId) {
      const organizationId = await options.repository.organizationIdForUser(userId);
      if (!organizationId) return { cleared: 0 };
      const rows = await options.repository.listForOrganization(organizationId);
      const removable: string[] = [];
      for (const row of rows) {
        if (row.objectKey) {
          try {
            await options.storage.deleteObject(bucket, row.objectKey);
          } catch {
            continue;
          }
        }
        removable.push(row.id);
      }
      return { cleared: removable.length ? await options.repository.deleteByIds(organizationId, removable) : 0 };
    }
  };
}

type NormalizedRequest = {
  term: string;
  partOfSpeech?: string;
  imageQuery?: string;
  explicitImageUrl?: string;
  explicitAttribution?: ContentImageAttribution;
};

function normalizeRequest(request: ContentImageRequest): NormalizedRequest {
  const normalized: NormalizedRequest = { term: request.term.normalize("NFKC").trim().slice(0, 160) };
  const partOfSpeech = request.partOfSpeech?.normalize("NFKC").trim().toLowerCase().slice(0, 40);
  const imageQuery = request.imageQuery?.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 160);
  const explicitImageUrl = request.explicitImageUrl?.trim();
  if (partOfSpeech) normalized.partOfSpeech = partOfSpeech;
  if (imageQuery) normalized.imageQuery = imageQuery;
  if (explicitImageUrl) normalized.explicitImageUrl = explicitImageUrl;
  if (request.explicitAttribution) normalized.explicitAttribution = request.explicitAttribution;
  return normalized;
}

async function findCandidate(providers: OpenMediaProviders, request: NormalizedRequest): Promise<ProviderCandidate | null> {
  if (request.imageQuery) {
    return await providers.searchCommons(request.imageQuery) ?? await providers.searchOpenverse(request.imageQuery);
  }
  return request.partOfSpeech === "noun" ? providers.exactWikipedia(request.term) : null;
}

function explicitView(request: NormalizedRequest): Extract<ContentImageView, { status: "available" }> | null {
  if (!request.explicitImageUrl || !request.explicitAttribution) return null;
  const imageUrl = safeExternalHttps(request.explicitImageUrl);
  const sourceUrl = safeExternalHttps(request.explicitAttribution.sourceUrl);
  const licenceUrl = safeExternalHttps(request.explicitAttribution.licenceUrl);
  const licence = normalizeLicence(request.explicitAttribution.licence);
  if (!imageUrl || !sourceUrl || !licenceUrl || !licence) return null;
  return {
    status: "available",
    imageUrl,
    alt: request.term,
    attribution: {
      creator: request.explicitAttribution.creator?.trim() || null,
      licence,
      licenceUrl,
      sourceUrl
    }
  };
}

async function viewFromRecord(
  record: MediaAssetRecord,
  term: string,
  storage: ObjectStorage,
  bucket: string
): Promise<Extract<ContentImageView, { status: "available" }> | null> {
  if (!record.sourceUrl || !record.sourcePageUrl || !record.licence || !record.licenceUrl) return null;
  let imageUrl = record.sourceUrl;
  if (record.objectKey) {
    if (storage.objectExists && !await storage.objectExists(bucket, record.objectKey)) return null;
    if (!storage.presignGetObject) return null;
    imageUrl = (await storage.presignGetObject({ bucket, objectKey: record.objectKey, expiresInSeconds: 300 })).url;
  }
  return {
    status: "available",
    imageUrl,
    alt: term,
    attribution: {
      creator: record.creator,
      licence: record.licence,
      licenceUrl: record.licenceUrl,
      sourceUrl: record.sourcePageUrl
    }
  };
}

function unavailable(cached: boolean): ContentImageDiagnosticView {
  return { image: { status: "unavailable" }, provider: null, cached };
}

function hostsFor(provider: ProviderCandidate["provider"]): ReadonlySet<string> {
  return provider === "openverse" ? new Set(["api.openverse.org"]) : new Set(["upload.wikimedia.org"]);
}

function extensionFor(mimeType: SafeBitmap["mimeType"]): "jpg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function safeExternalHttps(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
