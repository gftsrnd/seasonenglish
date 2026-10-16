import { describe, expect, it } from "vitest";
import { createS3Storage } from "../src/index.js";

describe("S3 object playback URLs", () => {
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
});
