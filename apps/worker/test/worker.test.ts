import { describe, expect, it, vi } from "vitest";
import { loadWorkerConfig } from "../src/config.js";
import { createPoller } from "../src/poller.js";
import { createWorkerHandlers } from "../src/handlers.js";
import { processNextJob } from "../src/worker.js";

describe("worker job processing", () => {
  it("acknowledges a handled job using the worker that leased it", async () => {
    const jobs = {
      leaseNext: vi.fn().mockResolvedValue({
        id: "job-1", kind: "maintenance.health-check", payload: {}, state: "running",
        attempts: 1, maxAttempts: 3, lockedBy: "worker-a"
      }),
      markSucceeded: vi.fn().mockResolvedValue(true),
      markFailed: vi.fn()
    };
    const handler = vi.fn().mockResolvedValue(undefined);

    const processed = await processNextJob({
      jobs,
      workerId: "worker-a",
      leaseSeconds: 30,
      handlers: { "maintenance.health-check": handler }
    });

    expect(processed).toBe(true);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1", kind: "maintenance.health-check" }));
    expect(jobs.markSucceeded).toHaveBeenCalledWith("job-1", "worker-a");
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it("records a handler failure for retry or dead-letter handling", async () => {
    const jobs = {
      leaseNext: vi.fn().mockResolvedValue({
        id: "job-2", kind: "ai.coach-feedback", payload: {}, state: "running",
        attempts: 1, maxAttempts: 3, lockedBy: "worker-a"
      }),
      markSucceeded: vi.fn(),
      markFailed: vi.fn().mockResolvedValue("queued")
    };

    const processed = await processNextJob({
      jobs,
      workerId: "worker-a",
      leaseSeconds: 30,
      handlers: { "ai.coach-feedback": async () => { throw new Error("provider unavailable"); } }
    });

    expect(processed).toBe(true);
    expect(jobs.markSucceeded).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith("job-2", "worker-a", "provider unavailable");
  });

  it("loads local service wiring and rejects invalid polling values", () => {
    expect(loadWorkerConfig({ DATABASE_URL: "postgres://localhost/e4s" })).toMatchObject({
      databaseUrl: "postgres://localhost/e4s",
      minio: {
        endpoint: "http://minio:9000",
        bucket: "e4s-evidence"
      }
    });

    expect(() => loadWorkerConfig({ DATABASE_URL: "postgres://localhost/e4s", WORKER_POLL_MS: "0" }))
      .toThrow("WORKER_POLL_MS must be a positive integer");

    expect(loadWorkerConfig({
      DATABASE_URL: "postgres://localhost/e4s",
      S3_ENDPOINT: "http://127.0.0.1:9002",
      S3_ACCESS_KEY: "minio-user",
      S3_SECRET_KEY: "minio-secret",
      GROQ_API_KEY: "groq-secret",
      GROQ_MODEL: "llama-test",
      GROQ_BASE_URL: "https://groq.example.test/v1"
    })).toMatchObject({
      minio: { endpoint: "http://127.0.0.1:9002", accessKeyId: "minio-user", secretAccessKey: "minio-secret" },
      groq: { apiKey: "groq-secret", model: "llama-test", baseUrl: "https://groq.example.test/v1" }
    });
  });

  it("runs real MinIO and Groq-backed handlers instead of a no-op health handler", async () => {
    const storage = { ready: vi.fn().mockResolvedValue(undefined), deleteObject: vi.fn().mockResolvedValue(undefined) };
    const ai = { complete: vi.fn().mockResolvedValue({ output: { ok: true }, usage: {} }) };
    const handlers = createWorkerHandlers({ storage, ai, bucket: "e4s-evidence" });
    const job = { id: "job-3", kind: "maintenance.health-check", payload: {}, state: "running" as const, attempts: 1, maxAttempts: 3, lockedBy: "worker-a" };

    await handlers["maintenance.health-check"]!(job);
    await handlers["storage.cleanup"]!({ ...job, kind: "storage.cleanup", payload: { bucket: "e4s-evidence", objectKey: "assessment-audio/a.wav" } });
    await handlers["ai.provider-health-check"]!({
      ...job,
      kind: "ai.provider-health-check",
      payload: {
        taskId: "health_check",
        systemPrompt: "Return JSON.",
        input: { ping: true },
        outputJsonSchema: { type: "object" },
        traceId: "worker-health"
      }
    });

    expect(storage.ready).toHaveBeenCalledWith("e4s-evidence");
    expect(storage.deleteObject).toHaveBeenCalledWith("e4s-evidence", "assessment-audio/a.wav");
    expect(ai.complete).toHaveBeenCalledWith(expect.objectContaining({ traceId: "worker-health" }));
  });

  it("delivers a configured reminder through the worker and records the provider result", async () => {
    const storage = { ready: vi.fn().mockResolvedValue(undefined), deleteObject: vi.fn().mockResolvedValue(undefined) };
    const notifications = {
      findWebhookDelivery: vi.fn().mockResolvedValue({
        reminderId: "reminder-1", deliveryId: "delivery-1", message: "Come back to E4S.",
        learnerName: "Nguyễn Minh Anh", webhookUrl: "http://127.0.0.1:3999/base", webhookTemplate: "{\"base_content\":\"{message}\",\"name\":\"{name}\"}"
      }),
      updateWebhookDelivery: vi.fn().mockResolvedValue(undefined)
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204, headers: { "x-request-id": "base-1" } }));
    try {
      const handlers = createWorkerHandlers({ storage, notifications, bucket: "e4s-evidence" });
      await handlers["notification.base-webhook"]!({
        id: "job-notification-1", kind: "notification.base-webhook", payload: { reminderId: "reminder-1" },
        state: "running", attempts: 1, maxAttempts: 3, lockedBy: "worker-a"
      });
      expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3999/base", expect.objectContaining({
        method: "POST", body: JSON.stringify({ base_content: "Come back to E4S.", name: "Nguyễn Minh Anh" })
      }));
      expect(notifications.updateWebhookDelivery).toHaveBeenCalledWith(expect.objectContaining({
        reminderId: "reminder-1", deliveryId: "delivery-1", status: "sent", externalId: "base-1"
      }));
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("does not overlap polling ticks", async () => {
    let release!: () => void;
    const tick = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const poller = createPoller(tick, 10);

    const first = poller.runOnce();
    const second = poller.runOnce();
    await Promise.resolve();
    expect(tick).toHaveBeenCalledTimes(1);

    release();
    await first;
    await second;
    await poller.stop();
  });
});
