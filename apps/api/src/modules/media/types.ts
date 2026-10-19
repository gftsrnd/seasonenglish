import { normalizeLicence, validateProviderUrl } from "./safety.js";

export interface ProviderCandidate {
  provider: "wikipedia" | "wikimedia" | "openverse";
  providerAssetId: string;
  downloadUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  licence: string;
  licenceUrl: string;
}

export interface OpenMediaProviders {
  exactWikipedia(term: string): Promise<ProviderCandidate | null>;
  searchCommons(query: string): Promise<ProviderCandidate | null>;
  searchOpenverse(query: string): Promise<ProviderCandidate | null>;
}

export interface ProviderOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type JsonObject = Record<string, unknown>;

export async function fetchProviderJson(
  url: URL,
  apiHost: string,
  options: ProviderOptions
): Promise<JsonObject | null> {
  validateProviderUrl(url.href, new Set([apiHost]));
  try {
    const response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(1, Math.min(5_000, options.timeoutMs ?? 1_500))),
      headers: {
        accept: "application/json",
        "user-agent": "E4S/1.0 (open media resolver)"
      }
    });
    if (!response.ok || response.status >= 300 || response.redirected) return null;
    return asObject(await response.json());
  } catch {
    return null;
  }
}

export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function metadataValue(metadata: JsonObject | null, key: string): string | null {
  return stringValue(asObject(metadata?.[key])?.value);
}

export function cleanMetadataText(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function safeHttpsUrl(value: unknown, allowedHosts?: ReadonlySet<string>): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (allowedHosts && ![...allowedHosts].some((host) => host.toLowerCase() === url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function candidateFromWikimediaPage(
  provider: "wikipedia" | "wikimedia",
  value: unknown
): ProviderCandidate | null {
  const page = asObject(value);
  const title = stringValue(page?.title);
  const imageInfo = asObject(asArray(page?.imageinfo)[0]);
  if (!page || !title || !imageInfo || isSensitiveMedia(page, imageInfo)) return null;
  const mime = stringValue(imageInfo.mime)?.toLowerCase();
  if (!mime || !["image/jpeg", "image/png", "image/webp"].includes(mime)) return null;
  const downloadUrl = safeHttpsUrl(imageInfo.thumburl ?? imageInfo.url, new Set(["upload.wikimedia.org"]));
  const sourcePageUrl = safeHttpsUrl(imageInfo.descriptionurl, new Set(["commons.wikimedia.org", "en.wikipedia.org"]));
  const metadata = asObject(imageInfo.extmetadata);
  const licence = normalizeLicence(metadataValue(metadata, "LicenseShortName") ?? "");
  const licenceUrl = safeHttpsUrl(metadataValue(metadata, "LicenseUrl"), new Set(["creativecommons.org"]));
  if (!downloadUrl || !sourcePageUrl || !licence || !licenceUrl) return null;
  return {
    provider,
    providerAssetId: title,
    downloadUrl,
    sourcePageUrl,
    creator: cleanMetadataText(metadataValue(metadata, "Artist")),
    licence,
    licenceUrl
  };
}

function isSensitiveMedia(page: JsonObject, imageInfo: JsonObject): boolean {
  const metadata = asObject(imageInfo.extmetadata);
  const haystack = [
    stringValue(page.title),
    metadataValue(metadata, "Categories"),
    metadataValue(metadata, "ImageDescription"),
    metadataValue(metadata, "ObjectName")
  ].filter(Boolean).join(" ").toLowerCase();
  return /\b(?:nude|nudity|porn|pornographic|sexual|explicit|gore|graphic violence)\b/.test(haystack);
}
