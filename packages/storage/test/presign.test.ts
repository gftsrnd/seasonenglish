import { S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createS3Storage } from "../src/index.js";

afterEach(() => vi.restoreAllMocks());

describe("S3 object playback URLs", () => {
  it("returns the S3 response stream and forwards a normalized byte range", async () => {
    const source = Object.assign(Readable.from(["streamed audio"]), {
      transformToByteArray: async () => new TextEncoder().encode("streamed audio")
    });
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      Body: source,
      ContentType: "audio/webm",
      ContentLength: 6,
      ContentRange: "bytes 10-15/42",
      AcceptRanges: "bytes"
    } as never);
    const storage = createS3Storage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret"
    });

    const object = await storage.getObject!({
      bucket: "e4s-evidence",
      objectKey: "assessment-audio/learner-1/speaking.webm",
      range: "bytes=10-15"
    } as never);

    expect(object.body).toBe(source);
    expect(object).toMatchObject({
      mimeType: "audio/webm",
      contentLength: 6,
      contentRange: "bytes 10-15/42",
      acceptRanges: "bytes"
    });
    expect(send.mock.calls[0]?.[0].input).toMatchObject({ Range: "bytes=10-15" });
  });

  it("creates a bounded read URL and reports its expiry", async () => {
    const storage = createS3Storage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret"
    });
    expect(storage.presignGetObject).toBeTypeOf("function");

    const before = Date.now();
    const signed = await storage.presignGetObject!({
      bucket: "e4s-evidence",
      objectKey: "assessment-audio/learner-1/speaking.wav",
      expiresInSeconds: 3_600
    });

    expect(signed.url).toContain("X-Amz-Expires=900");
    expect(signed.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 899_000);
    expect(signed.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 901_000);
  });

  it("reports that an object exists when S3 accepts the head request", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = createS3Storage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret"
    });

    await expect(storage.objectExists!("e4s-media", "org/notebook.jpg")).resolves.toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it("returns false only when S3 reports a missing object", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(Object.assign(new Error("missing"), {
      name: "NotFound",
      $metadata: { httpStatusCode: 404 }
    }));
    const storage = createS3Storage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret"
    });

    await expect(storage.objectExists!("e4s-media", "org/missing.jpg")).resolves.toBe(false);
  });

  it("does not hide object-store failures behind a missing result", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(new Error("connection refused"));
    const storage = createS3Storage({
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      accessKeyId: "test-access",
      secretAccessKey: "test-secret"
    });

    await expect(storage.objectExists!("e4s-media", "org/notebook.jpg"))
      .rejects.toThrow("connection refused");
  });
});
