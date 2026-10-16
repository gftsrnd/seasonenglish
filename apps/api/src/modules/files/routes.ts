import { createHash, randomUUID } from "node:crypto";
import type { ObjectStorage } from "@e4s/storage";
import { createRepositories } from "@e4s/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { createRoleGuard } from "../identity/policy.js";
import { EVIDENCE_BUCKET } from "./constants.js";

export function registerFileRoutes(app: FastifyInstance, pool: Pool, storage: ObjectStorage): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);

  app.get("/api/v1/files/assessment-audio/read", { preHandler: learnerOnly }, async (request, reply) => {
    const artifactKey = (request.query as { artifactKey?: unknown }).artifactKey;
    if (typeof artifactKey !== "string" || artifactKey.length > 512 || !artifactKey.startsWith("assessment-audio/")) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_KEY_INVALID" });
    }
    const ownerUserId = request.e4sSession!.user.id;
    if (!await repositories.files.ownedBy(ownerUserId, "assessment_audio", artifactKey)) {
      return reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
    }
    const presignGetObject = storage.presignGetObject;
    if (!presignGetObject) {
      return reply.code(503).send({ code: "ASSESSMENT_AUDIO_READ_UNAVAILABLE" });
    }
    let signed: Awaited<ReturnType<typeof presignGetObject>>;
    try {
      signed = await presignGetObject({
        bucket: EVIDENCE_BUCKET,
        objectKey: artifactKey,
        expiresInSeconds: 300
      });
    } catch (error) {
      logStorageFailure(request, "presignGetObject", error);
      if (isMissingObjectError(error)) {
        return reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
      }
      return reply.code(503).send({ code: "ASSESSMENT_AUDIO_READ_UNAVAILABLE" });
    }
    return reply.send({ url: signed.url, expiresAt: signed.expiresAt.toISOString() });
  });

  app.post("/api/v1/files/assessment-audio", { preHandler: learnerOnly }, async (request, reply) => {
    const file = await request.file();
    // Browser and automation MIME detection is inconsistent for audio-only
    // WebM recordings (`audio/webm`, `video/webm`, or octet-stream). Keep the
    // API aligned with the learner-side extension validation without allowing
    // arbitrary non-audio uploads.
    if (!file || (!file.mimetype.startsWith("audio/") && !isSupportedAudioFilename(file.filename))) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_REQUIRED" });
    }
    let body: Buffer;
    try {
      body = await file.toBuffer();
    } catch (error) {
      logStorageFailure(request, "readUpload", error);
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_INVALID" });
    }
    if (file.file.truncated || body.length === 0) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_INVALID" });
    }

    const extension = extensionFor(file.filename);
    const ownerUserId = request.e4sSession!.user.id;
    const objectKey = `assessment-audio/${ownerUserId}/${randomUUID()}${extension}`;
    const sha256 = createHash("sha256").update(body).digest("hex");
    try {
      await storage.putObject({ bucket: EVIDENCE_BUCKET, objectKey, body, mimeType: file.mimetype });
    } catch (error) {
      logStorageFailure(request, "putObject", error);
      return reply.code(503).send({ code: "ASSESSMENT_AUDIO_UPLOAD_UNAVAILABLE" });
    }

    let saved: boolean;
    try {
      saved = await repositories.files.createForOwner({
        id: randomUUID(),
        ownerUserId,
        purpose: "assessment_audio",
        bucket: EVIDENCE_BUCKET,
        objectKey,
        mimeType: file.mimetype,
        sizeBytes: body.length,
        sha256
      });
    } catch (error) {
      logStorageFailure(request, "saveMetadata", error);
      await cleanupUploadedObject(request, storage, objectKey);
      return reply.code(500).send({ code: "ASSESSMENT_AUDIO_NOT_SAVED" });
    }
    if (!saved) {
      await cleanupUploadedObject(request, storage, objectKey);
      return reply.code(409).send({ code: "ASSESSMENT_AUDIO_NOT_SAVED" });
    }
    return reply.code(201).send({ artifactKey: objectKey });
  });
}

async function cleanupUploadedObject(
  request: Pick<FastifyRequest, "log">,
  storage: ObjectStorage,
  objectKey: string
): Promise<void> {
  try {
    await storage.deleteObject(EVIDENCE_BUCKET, objectKey);
  } catch (error) {
    logStorageFailure(request, "deleteObject", error);
  }
}

function logStorageFailure(request: Pick<FastifyRequest, "log">, operation: string, error: unknown): void {
  request.log.warn({ operation, code: storageErrorCode(error) }, "Assessment evidence storage operation failed");
}

function isMissingObjectError(error: unknown): boolean {
  const code = storageErrorCode(error);
  return code === "NoSuchKey" || code === "NoSuchObject" || code === "NotFound" || code === "ENOENT";
}

function storageErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const candidate = error as { name?: unknown; code?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } };
  if (candidate.name === "NoSuchKey" || candidate.name === "NoSuchObject" || candidate.name === "NotFound") {
    return String(candidate.name);
  }
  if (candidate.code === "ENOENT" || candidate.Code === "NoSuchKey" || candidate.Code === "NoSuchObject" || candidate.Code === "NotFound") {
    return String(candidate.code ?? candidate.Code);
  }
  if (candidate.$metadata?.httpStatusCode === 404) return "NotFound";
  return "UNKNOWN";
}

function extensionFor(filename: string): string {
  const match = /\.[a-z0-9]{1,10}$/i.exec(filename);
  return match ? match[0].toLowerCase() : ".audio";
}

function isSupportedAudioFilename(filename: string): boolean {
  return /\.(mp3|m4a|wav|ogg|oga|webm|aac|flac|amr|3gp)$/i.test(filename);
}
