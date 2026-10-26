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
  const contentAuthorOnly = createRoleGuard(pool, ["operator", "manager"]);
  const authenticatedContentUser = createRoleGuard(pool, ["learner", "operator", "manager"]);

  app.get("/api/v1/files/content-media/read", { preHandler: authenticatedContentUser }, async (request, reply) => {
    const artifactKey = (request.query as { artifactKey?: unknown }).artifactKey;
    if (typeof artifactKey !== "string" || artifactKey.length > 512 || !artifactKey.startsWith("content-media/")) {
      return reply.code(400).send({ code: "CONTENT_MEDIA_KEY_INVALID" });
    }
    const visible = await pool.query(
      `select f.bucket
       from files f
       join users owner on owner.id = f.owner_user_id
       join users viewer on viewer.id = $1
       where f.purpose = 'content_media' and f.object_key = $2
         and owner.organization_id = viewer.organization_id
       limit 1`,
      [request.e4sSession!.user.id, artifactKey]
    );
    const bucket = visible.rows[0]?.bucket as string | undefined;
    if (!bucket) return reply.code(404).send({ code: "CONTENT_MEDIA_NOT_FOUND" });
    if (!storage.presignGetObject) return reply.code(503).send({ code: "CONTENT_MEDIA_READ_UNAVAILABLE" });
    try {
      const signed = await storage.presignGetObject({ bucket, objectKey: artifactKey, expiresInSeconds: 300 });
      return reply.redirect(signed.url);
    } catch (error) {
      logStorageFailure(request, "presignContentMedia", error);
      return reply.code(isMissingObjectError(error) ? 404 : 503).send({
        code: isMissingObjectError(error) ? "CONTENT_MEDIA_NOT_FOUND" : "CONTENT_MEDIA_READ_UNAVAILABLE"
      });
    }
  });

  app.post("/api/v1/files/content-media/:kind", { preHandler: contentAuthorOnly }, async (request, reply) => {
    const kind = (request.params as { kind?: unknown }).kind;
    if (kind !== "audio" && kind !== "image") return reply.code(400).send({ code: "CONTENT_MEDIA_KIND_INVALID" });
    const file = await request.file();
    const supported = file && (kind === "audio"
      ? file.mimetype.startsWith("audio/") || isSupportedAudioFilename(file.filename)
      : file.mimetype.startsWith("image/") || isSupportedImageFilename(file.filename));
    if (!file || !supported) return reply.code(400).send({ code: "CONTENT_MEDIA_FILE_INVALID" });
    let body: Buffer;
    try {
      body = await file.toBuffer();
    } catch (error) {
      logStorageFailure(request, "readContentMediaUpload", error);
      return reply.code(400).send({ code: "CONTENT_MEDIA_FILE_INVALID" });
    }
    if (file.file.truncated || body.length === 0) return reply.code(400).send({ code: "CONTENT_MEDIA_FILE_INVALID" });
    const ownerUserId = request.e4sSession!.user.id;
    const objectKey = `content-media/${ownerUserId}/${randomUUID()}${extensionFor(file.filename)}`;
    const sha256 = createHash("sha256").update(body).digest("hex");
    try {
      await storage.putObject({ bucket: EVIDENCE_BUCKET, objectKey, body, mimeType: file.mimetype });
      const saved = await repositories.files.createForOwner({
        id: randomUUID(), ownerUserId, purpose: "content_media", bucket: EVIDENCE_BUCKET,
        objectKey, mimeType: file.mimetype, sizeBytes: body.length, sha256
      });
      if (!saved) throw new Error("CONTENT_MEDIA_NOT_SAVED");
    } catch (error) {
      logStorageFailure(request, "saveContentMedia", error);
      await cleanupUploadedObject(request, storage, objectKey);
      return reply.code(503).send({ code: "CONTENT_MEDIA_UPLOAD_UNAVAILABLE" });
    }
    return reply.code(201).send({
      artifactKey: objectKey,
      url: `/api/v1/files/content-media/read?artifactKey=${encodeURIComponent(objectKey)}`
    });
  });

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
    if (storage.objectExists) {
      try {
        if (!await storage.objectExists(EVIDENCE_BUCKET, artifactKey)) {
          return reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
        }
      } catch (error) {
        logStorageFailure(request, "objectExists", error);
        return reply.code(503).send({ code: "ASSESSMENT_AUDIO_READ_UNAVAILABLE" });
      }
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

function isSupportedImageFilename(filename: string): boolean {
  return /\.(png|jpe?g|webp|gif)$/i.test(filename);
}
