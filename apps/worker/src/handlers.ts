import type { JobHandler } from "./worker.js";

export interface NotificationDeliveryPort {
  findWebhookDelivery(reminderId: string): Promise<{
    reminderId: string;
    deliveryId: string;
    message: string;
    learnerName: string;
    webhookUrl: string;
    webhookTemplate: string;
  } | null>;
  updateWebhookDelivery(input: {
    reminderId: string;
    deliveryId: string;
    status: "sent" | "failed";
    response: Record<string, unknown>;
    externalId?: string | null;
  }): Promise<void>;
}

export interface WorkerStorage {
  ready(bucket: string): Promise<void>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
}

export interface WorkerAiProvider {
  complete(request: {
    taskId: string;
    systemPrompt: string;
    input: unknown;
    outputJsonSchema: Record<string, unknown>;
    signal: AbortSignal;
    traceId: string;
  }): Promise<unknown>;
}

export function createWorkerHandlers(input: {
  storage: WorkerStorage;
  ai?: WorkerAiProvider;
  bucket: string;
  notifications?: NotificationDeliveryPort;
}): Record<string, JobHandler> {
  const handlers: Record<string, JobHandler> = {
    "maintenance.health-check": async () => {
      await input.storage.ready(input.bucket);
    },
    "storage.health-check": async (job) => {
      await input.storage.ready(bucketFrom(job.payload, input.bucket));
    },
    "storage.cleanup": async (job) => {
      const payload = objectPayload(job.payload);
      const bucket = stringValue(payload.bucket, input.bucket);
      const objectKey = stringValue(payload.objectKey);
      await input.storage.deleteObject(bucket, objectKey);
    }
  };

  if (input.notifications) {
    handlers["notification.base-webhook"] = async (job) => {
      const reminderId = stringValue(objectPayload(job.payload).reminderId);
      const delivery = await input.notifications!.findWebhookDelivery(reminderId);
      if (!delivery) return;
      try {
        const response = await fetch(delivery.webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(renderWebhookPayload(delivery.webhookTemplate, delivery.message, delivery.learnerName))
        });
        const responseBody = await response.text().catch(() => "");
        if (!response.ok) throw new Error(`NOTIFICATION_PROVIDER_HTTP_${response.status}`);
        await input.notifications!.updateWebhookDelivery({
          reminderId: delivery.reminderId,
          deliveryId: delivery.deliveryId,
          status: "sent",
          externalId: response.headers.get("x-request-id"),
          response: { statusCode: response.status, body: responseBody.slice(0, 2_000) }
        });
      } catch (error) {
        await input.notifications!.updateWebhookDelivery({
          reminderId: delivery.reminderId,
          deliveryId: delivery.deliveryId,
          status: "failed",
          response: { error: errorMessage(error) }
        });
        throw error;
      }
    };
  }

  if (input.ai) {
    handlers["ai.provider-health-check"] = async (job) => {
      const payload = objectPayload(job.payload);
      const taskId = stringValue(payload.taskId);
      const systemPrompt = stringValue(payload.systemPrompt);
      const outputJsonSchema = objectValue(payload.outputJsonSchema, "outputJsonSchema");
      await input.ai!.complete({
        taskId,
        systemPrompt,
        input: payload.input,
        outputJsonSchema,
        signal: new AbortController().signal,
        traceId: stringValue(payload.traceId, job.id)
      });
    };
  }

  return handlers;
}

function renderWebhookPayload(template: string, message: string, learnerName: string): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(template); } catch { parsed = { base_content: "{message}" }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = { base_content: "{message}" };
  return replaceTemplateValues(parsed as Record<string, unknown>, message, learnerName);
}

function replaceTemplateValues(value: Record<string, unknown>, message: string, learnerName: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTemplateValue(item, message, learnerName)]));
}

function replaceTemplateValue(value: unknown, message: string, learnerName: string): unknown {
  if (typeof value === "string") return value.replaceAll("{message}", message).replaceAll("{name}", learnerName);
  if (Array.isArray(value)) return value.map((item) => replaceTemplateValue(item, message, learnerName));
  if (value && typeof value === "object") return replaceTemplateValues(value as Record<string, unknown>, message, learnerName);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function objectPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Job payload must be an object");
  return payload as Record<string, unknown>;
}

function bucketFrom(payload: unknown, fallback: string): string {
  const value = objectPayload(payload).bucket;
  return stringValue(value, fallback);
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, fallback?: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error("Job payload string is required");
}
