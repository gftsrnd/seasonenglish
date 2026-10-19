import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type SafeBitmapMime = "image/jpeg" | "image/png" | "image/webp";

export type MediaSafetyCode =
  | "MEDIA_URL_UNSAFE"
  | "MEDIA_DNS_FAILED"
  | "MEDIA_ADDRESS_UNSAFE"
  | "MEDIA_REDIRECT_REJECTED"
  | "MEDIA_DOWNLOAD_TIMEOUT"
  | "MEDIA_DOWNLOAD_FAILED"
  | "MEDIA_HTTP_FAILED"
  | "MEDIA_TOO_LARGE"
  | "MEDIA_BITMAP_INVALID"
  | "MEDIA_MIME_MISMATCH"
  | "MEDIA_DIMENSIONS_TOO_SMALL";

export class MediaSafetyError extends Error {
  constructor(readonly code: MediaSafetyCode, message: string) {
    super(message);
    this.name = "MediaSafetyError";
  }
}

export interface SafeDownloadInput {
  url: string;
  allowedHosts: ReadonlySet<string>;
  fetchImpl?: typeof fetch;
  lookup?: (hostname: string) => Promise<readonly string[]>;
  timeoutMs?: number;
  maxBytes?: number;
  minWidth?: number;
  minHeight?: number;
}

export interface SafeBitmap {
  bytes: Uint8Array;
  mimeType: SafeBitmapMime;
  width: number;
  height: number;
  sourceUrl: string;
}

export function validateProviderUrl(value: string, allowedHosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MediaSafetyError("MEDIA_URL_UNSAFE", "Media URL is invalid");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const approved = [...allowedHosts].some((host) => host.toLowerCase().replace(/\.$/, "") === hostname);
  if (url.protocol !== "https:" || !approved || url.username || url.password || (url.port && url.port !== "443")) {
    throw new MediaSafetyError("MEDIA_URL_UNSAFE", "Media URL is not an approved HTTPS destination");
  }
  return url;
}

export function normalizeLicence(value: string): "CC0" | "PDM" | "CC BY" | "CC BY-SA" | null {
  const normalized = value.trim().toLowerCase().replace(/[_–—]/g, "-").replace(/\s+/g, " ");
  if (!normalized || /\b(?:noncommercial|no derivatives|nc|nd)\b/.test(normalized)) return null;
  if (/\bcc\s*0\b|creative commons zero|public domain dedication/.test(normalized)) return "CC0";
  if (/public domain mark|\bpdm\b/.test(normalized)) return "PDM";
  if (/cc\s*by\s*-?\s*sa|attribution\s*-?\s*sharealike/.test(normalized)) return "CC BY-SA";
  if (/\bcc\s*by\b|creative commons attribution/.test(normalized)) return "CC BY";
  return null;
}

export function inspectBitmap(bytes: Uint8Array, claimedMime: string): {
  mimeType: SafeBitmapMime;
  width: number;
  height: number;
} {
  const detected = inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
  if (!detected) throw new MediaSafetyError("MEDIA_BITMAP_INVALID", "Media body is not a supported bitmap");
  const claimed = claimedMime.split(";", 1)[0]?.trim().toLowerCase();
  if (claimed !== detected.mimeType) {
    throw new MediaSafetyError("MEDIA_MIME_MISMATCH", "Media Content-Type does not match its bytes");
  }
  return detected;
}

export async function downloadBitmap(input: SafeDownloadInput): Promise<SafeBitmap> {
  const url = validateProviderUrl(input.url, input.allowedHosts);
  const lookup = input.lookup ?? defaultLookup;
  let addresses: readonly string[];
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw new MediaSafetyError("MEDIA_DNS_FAILED", "Media host could not be resolved");
  }
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new MediaSafetyError("MEDIA_ADDRESS_UNSAFE", "Media host resolved to a non-public address");
  }

  const timeoutMs = Math.max(1, Math.min(15_000, input.timeoutMs ?? 4_000));
  const maxBytes = Math.max(1, Math.min(20 * 1024 * 1024, input.maxBytes ?? 5 * 1024 * 1024));
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg" }
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new MediaSafetyError("MEDIA_DOWNLOAD_TIMEOUT", "Media download timed out");
    }
    throw new MediaSafetyError("MEDIA_DOWNLOAD_FAILED", "Media download failed");
  }
  if (response.status >= 300 && response.status < 400) {
    throw new MediaSafetyError("MEDIA_REDIRECT_REJECTED", "Media redirects are not accepted");
  }
  if (!response.ok) throw new MediaSafetyError("MEDIA_HTTP_FAILED", `Media server returned HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new MediaSafetyError("MEDIA_TOO_LARGE", "Media body exceeds the byte limit");
  }
  const bytes = await readBoundedBody(response, maxBytes);
  const inspected = inspectBitmap(bytes, response.headers.get("content-type") ?? "");
  if (inspected.width < (input.minWidth ?? 240) || inspected.height < (input.minHeight ?? 160)) {
    throw new MediaSafetyError("MEDIA_DIMENSIONS_TOO_SMALL", "Media dimensions are too small");
  }
  return { bytes, ...inspected, sourceUrl: url.href };
}

async function defaultLookup(hostname: string): Promise<readonly string[]> {
  return (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new MediaSafetyError("MEDIA_TOO_LARGE", "Media body exceeds the byte limit");
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function inspectPng(bytes: Uint8Array): { mimeType: "image/png"; width: number; height: number } | null {
  if (bytes.byteLength < 24 || !matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || ascii(bytes, 12, 4) !== "IHDR") return null;
  const view = dataView(bytes);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return validDimensions(width, height) ? { mimeType: "image/png", width, height } : null;
}

function inspectJpeg(bytes: Uint8Array): { mimeType: "image/jpeg"; width: number; height: number } | null {
  if (bytes.byteLength < 11 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = dataView(bytes);
  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.byteLength) return null;
    const segmentLength = view.getUint16(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return null;
    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 7) return null;
      const height = view.getUint16(offset + 3);
      const width = view.getUint16(offset + 5);
      return validDimensions(width, height) ? { mimeType: "image/jpeg", width, height } : null;
    }
    offset += segmentLength;
  }
  return null;
}

function inspectWebp(bytes: Uint8Array): { mimeType: "image/webp"; width: number; height: number } | null {
  if (bytes.byteLength < 25 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return null;
  const kind = ascii(bytes, 12, 4);
  let width = 0;
  let height = 0;
  if (kind === "VP8X" && bytes.byteLength >= 30) {
    width = readUint24LE(bytes, 24) + 1;
    height = readUint24LE(bytes, 27) + 1;
  } else if (kind === "VP8 " && bytes.byteLength >= 30 && matches(bytes, 23, [0x9d, 0x01, 0x2a])) {
    width = readUint16LE(bytes, 26) & 0x3fff;
    height = readUint16LE(bytes, 28) & 0x3fff;
  } else if (kind === "VP8L" && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    width = 1 + (b0 | (b1 & 0x3f) << 8);
    height = 1 + (b1 >>> 6 | b2 << 2 | (b3 & 0x0f) << 10);
  }
  return validDimensions(width, height) ? { mimeType: "image/webp", width, height } : null;
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const first = parts[0] ?? -1;
    const second = parts[1] ?? -1;
    return !(first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19))
      || first >= 224);
  }
  if (version === 6) {
    const normalized = address.toLowerCase().split("%", 1)[0] ?? "";
    if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(normalized)) return false;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPublicAddress(mapped) : true;
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
    || Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

function isJpegStartOfFrame(marker: number): boolean {
  return (marker >= 0xc0 && marker <= 0xc3)
    || (marker >= 0xc5 && marker <= 0xc7)
    || (marker >= 0xc9 && marker <= 0xcb)
    || (marker >= 0xcd && marker <= 0xcf);
}

function validDimensions(width: number, height: number): boolean {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | (bytes[offset + 1] ?? 0) << 8;
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | (bytes[offset + 1] ?? 0) << 8 | (bytes[offset + 2] ?? 0) << 16;
}
