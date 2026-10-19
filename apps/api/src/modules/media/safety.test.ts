import { describe, expect, it, vi } from "vitest";
import {
  downloadBitmap,
  inspectBitmap,
  normalizeLicence,
  validateProviderUrl
} from "./safety.js";

const allowedHosts = new Set(["upload.wikimedia.org"]);
const publicLookup = async () => ["208.80.154.240"];

describe("provider URL safety", () => {
  it("requires HTTPS and an exact allowlisted host", () => {
    expect(() => validateProviderUrl("http://upload.wikimedia.org/image.png", allowedHosts))
      .toThrowError(expect.objectContaining({ code: "MEDIA_URL_UNSAFE" }));
    expect(() => validateProviderUrl("https://upload.wikimedia.org.attacker.test/image.png", allowedHosts))
      .toThrowError(expect.objectContaining({ code: "MEDIA_URL_UNSAFE" }));
    expect(validateProviderUrl("https://upload.wikimedia.org/image.png", allowedHosts).hostname)
      .toBe("upload.wikimedia.org");
  });

  it.each([
    ["loopback IPv4", ["127.0.0.1"]],
    ["private IPv4", ["10.0.0.8"]],
    ["link-local IPv4", ["169.254.20.10"]],
    ["loopback IPv6", ["::1"]],
    ["private IPv6", ["fd00::1"]],
    ["link-local IPv6", ["fe80::1"]]
  ])("rejects %s returned by DNS", async (_label, addresses) => {
    await expect(downloadBitmap({
      url: "https://upload.wikimedia.org/image.png",
      allowedHosts,
      lookup: async () => addresses,
      fetchImpl: vi.fn()
    })).rejects.toMatchObject({ code: "MEDIA_ADDRESS_UNSAFE" });
  });

  it("rejects redirects instead of following a second unchecked host", async () => {
    await expect(downloadBitmap({
      url: "https://upload.wikimedia.org/image.png",
      allowedHosts,
      lookup: publicLookup,
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, {
        status: 302,
        headers: { location: "https://127.0.0.1/private" }
      }))
    })).rejects.toMatchObject({ code: "MEDIA_REDIRECT_REJECTED" });
  });

  it("bounds provider latency with an abort signal", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));

    await expect(downloadBitmap({
      url: "https://upload.wikimedia.org/image.png",
      allowedHosts,
      lookup: publicLookup,
      fetchImpl,
      timeoutMs: 5
    })).rejects.toMatchObject({ code: "MEDIA_DOWNLOAD_TIMEOUT" });
  });
});

describe("bitmap inspection", () => {
  it.each([
    ["PNG", png(640, 480), "image/png", 640, 480],
    ["JPEG", jpeg(800, 600), "image/jpeg", 800, 600],
    ["WebP", webp(320, 240), "image/webp", 320, 240]
  ])("reads %s dimensions from file bytes", (_label, bytes, mimeType, width, height) => {
    expect(inspectBitmap(bytes, mimeType)).toEqual({ mimeType, width, height });
  });

  it("rejects SVG bytes even when the server claims PNG", () => {
    expect(() => inspectBitmap(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/png"))
      .toThrowError(expect.objectContaining({ code: "MEDIA_BITMAP_INVALID" }));
  });

  it("rejects a claimed MIME type that differs from the detected bitmap", () => {
    expect(() => inspectBitmap(png(640, 480), "image/jpeg"))
      .toThrowError(expect.objectContaining({ code: "MEDIA_MIME_MISMATCH" }));
  });
});

describe("safe bitmap download", () => {
  it("downloads a public allowlisted bitmap and returns verified metadata", async () => {
    const bytes = png(640, 480);
    const result = await downloadBitmap({
      url: "https://upload.wikimedia.org/notebook.png",
      allowedHosts,
      lookup: publicLookup,
      fetchImpl: vi.fn().mockResolvedValue(new Response(body(bytes), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(bytes.byteLength) }
      })),
      minWidth: 300,
      minHeight: 200
    });

    expect(result).toMatchObject({ mimeType: "image/png", width: 640, height: 480 });
    expect(result.bytes).toEqual(bytes);
  });

  it("rejects a declared or streamed body larger than the byte limit", async () => {
    await expect(downloadBitmap({
      url: "https://upload.wikimedia.org/large.png",
      allowedHosts,
      lookup: publicLookup,
      fetchImpl: vi.fn().mockResolvedValue(new Response(body(png(640, 480)), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "5000" }
      })),
      maxBytes: 100
    })).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });

    await expect(downloadBitmap({
      url: "https://upload.wikimedia.org/large.png",
      allowedHosts,
      lookup: publicLookup,
      fetchImpl: vi.fn().mockResolvedValue(new Response(body(new Uint8Array(101)), {
        status: 200,
        headers: { "content-type": "image/png" }
      })),
      maxBytes: 100
    })).rejects.toMatchObject({ code: "MEDIA_TOO_LARGE" });
  });

  it("rejects a bitmap below the required card dimensions", async () => {
    const bytes = png(120, 80);
    await expect(downloadBitmap({
      url: "https://upload.wikimedia.org/tiny.png",
      allowedHosts,
      lookup: publicLookup,
      fetchImpl: vi.fn().mockResolvedValue(new Response(body(bytes), {
        status: 200,
        headers: { "content-type": "image/png" }
      })),
      minWidth: 300,
      minHeight: 200
    })).rejects.toMatchObject({ code: "MEDIA_DIMENSIONS_TOO_SMALL" });
  });
});

describe("open media licences", () => {
  it.each([
    ["CC0 1.0", "CC0"],
    ["Public Domain Mark 1.0", "PDM"],
    ["CC BY 4.0", "CC BY"],
    ["Creative Commons Attribution-ShareAlike 3.0", "CC BY-SA"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeLicence(input)).toBe(expected);
  });

  it.each(["", "all rights reserved", "CC BY-NC 4.0", "CC BY-ND 4.0"])("rejects %s", (input) => {
    expect(normalizeLicence(input)).toBeNull();
  });
});

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(21);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  bytes[11] = 3;
  return bytes;
}

function webp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8X"), 12);
  writeUint24LE(bytes, 24, width - 1);
  writeUint24LE(bytes, 27, height - 1);
  return bytes;
}

function writeUint24LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8 & 0xff;
  bytes[offset + 2] = value >>> 16 & 0xff;
}

function body(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}
