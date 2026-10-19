import { describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_RECOVERY_COMMAND, verifyLocalObjectStorage, waitForHttpReady } from "./local-storage-preflight.mjs";

describe("local object-storage preflight", () => {
  it("stops with the exact recovery command when MinIO is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(verifyLocalObjectStorage({ fetchImpl, headBucket: vi.fn() }))
      .rejects.toThrow(LOCAL_STORAGE_RECOVERY_COMMAND);
  });

  it("stops with the exact recovery command when either required bucket is unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const headBucket = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("missing media bucket"));

    await expect(verifyLocalObjectStorage({ fetchImpl, headBucket }))
      .rejects.toThrow(LOCAL_STORAGE_RECOVERY_COMMAND);
    expect(headBucket).toHaveBeenNthCalledWith(1, "e4s-evidence");
    expect(headBucket).toHaveBeenNthCalledWith(2, "e4s-media");
  });

  it("returns the verified endpoint and both buckets without starting containers", async () => {
    const headBucket = vi.fn().mockResolvedValue(undefined);

    await expect(verifyLocalObjectStorage({
      endpoint: "http://127.0.0.1:9002",
      fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
      headBucket
    })).resolves.toEqual({ endpoint: "http://127.0.0.1:9002", buckets: ["e4s-evidence", "e4s-media"] });
    expect(headBucket.mock.calls).toEqual([["e4s-evidence"], ["e4s-media"]]);
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
