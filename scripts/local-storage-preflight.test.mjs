import { describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_RECOVERY_COMMAND, verifyLocalObjectStorage, waitForHttpReady } from "./local-storage-preflight.mjs";

describe("local object-storage preflight", () => {
  it("stops with the exact recovery command when MinIO is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(verifyLocalObjectStorage({ fetchImpl, headBucket: vi.fn() }))
      .rejects.toThrow(LOCAL_STORAGE_RECOVERY_COMMAND);
  });

  it("stops with the exact recovery command when the evidence bucket is unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(verifyLocalObjectStorage({ fetchImpl, headBucket: vi.fn().mockRejectedValue(new Error("missing bucket")) }))
      .rejects.toThrow(LOCAL_STORAGE_RECOVERY_COMMAND);
  });

  it("returns the verified endpoint and bucket without starting containers", async () => {
    const headBucket = vi.fn().mockResolvedValue(undefined);

    await expect(verifyLocalObjectStorage({
      endpoint: "http://127.0.0.1:9002",
      bucket: "e4s-evidence",
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      headBucket
    })).resolves.toEqual({ endpoint: "http://127.0.0.1:9002", bucket: "e4s-evidence" });
    expect(headBucket).toHaveBeenCalledWith("e4s-evidence");
  });

  it("waits for an HTTP service to report ready", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(waitForHttpReady("API", "http://127.0.0.1:3001/api/readiness", {
      fetchImpl,
      timeoutMs: 100,
      intervalMs: 0
    })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
