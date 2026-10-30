import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { ObjectStorage } from "@e4s/storage";
import { createRepositories, type AudioFileRecord, type AudioSourceFlow } from "@e4s/database";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { createRoleGuard } from "../identity/policy.js";
import { EVIDENCE_BUCKET } from "./constants.js";

export function registerFileRoutes(app: FastifyInstance, pool: Pool, storage: ObjectStorage): void {
  const repositories = createRepositories(pool);
  const learnerOnly = createRoleGuard(pool, ["learner"]);
  const contentAuthorOnly = createRoleGuard(pool, ["operator", "manager"]);
  const authenticatedContentUser = createRoleGuard(pool, ["learner", "operator", "manager"]);
  const audioReaders = createRoleGuard(pool, ["learner", "operator", "manager"]);
  const staffOnly = createRoleGuard(pool, ["operator", "manager"]);

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

  app.get("/api/v1/files/assessment-audio/read", { preHandler: audioReaders }, async (request, reply) => {
    const artifactKey = (request.query as { artifactKey?: unknown }).artifactKey;
    if (typeof artifactKey !== "string" || artifactKey.length > 512 || !artifactKey.startsWith("assessment-audio/")) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_KEY_INVALID" });
    }
    const file = await repositories.files.findAssessmentAudioForViewer(request.e4sSession!.user.id, artifactKey);
    if (!file) {
      return reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
    }
    const playback = await signedPlayback(request, storage, file);
    if (playback.error) return reply.code(playback.error.status).send({ code: playback.error.code });
    return reply.send(audioView(file, playback.signed));
  });

  app.get("/api/v1/files/assessment-audio/playback", { preHandler: audioReaders }, async (request, reply) => {
    const artifactKey = (request.query as { artifactKey?: unknown }).artifactKey;
    if (typeof artifactKey !== "string" || artifactKey.length > 512 || !artifactKey.startsWith("assessment-audio/")) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_KEY_INVALID" });
    }
    const file = await repositories.files.findAssessmentAudioForViewer(request.e4sSession!.user.id, artifactKey);
    if (!file || file.deletedAt) return reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
    if (!storage.getObject) return reply.code(503).send({ code: "ASSESSMENT_AUDIO_READ_UNAVAILABLE" });
    const range = parseByteRange(request.headers.range, file.sizeBytes);
    if (range === "unsatisfiable") {
      return reply
        .code(416)
        .header("Accept-Ranges", "bytes")
        .header("Content-Range", `bytes */${file.sizeBytes}`)
        .send();
    }
    try {
      const object = await storage.getObject({
        bucket: file.bucket,
        objectKey: file.objectKey,
        ...(range ? { range: range.header } : {})
      });
      const response = reply
        .code(range ? 206 : 200)
        .header("Cache-Control", "private, no-store")
        .header("Accept-Ranges", object.acceptRanges || "bytes")
        .header("Content-Length", String(object.contentLength ?? range?.length ?? file.sizeBytes))
        .type(file.mimeType || object.mimeType || "application/octet-stream");
      if (range) response.header("Content-Range", object.contentRange || range.contentRange);
      return response.send(object.body);
    } catch (error) {
      logStorageFailure(request, "getObject", error);
      return reply.code(isMissingObjectError(error) ? 404 : 503).send({
        code: isMissingObjectError(error) ? "ASSESSMENT_AUDIO_NOT_FOUND" : "ASSESSMENT_AUDIO_READ_UNAVAILABLE"
      });
    }
  });

  app.get("/api/v1/files/assessment-audio", { preHandler: staffOnly }, async (request, reply) => {
    const query = request.query as { learnerId?: unknown; sourceFlow?: unknown };
    const learnerId = query.learnerId === undefined ? undefined : String(query.learnerId);
    const sourceFlow = query.sourceFlow === undefined ? undefined : parseSourceFlow(query.sourceFlow);
    if ((learnerId && !isUuid(learnerId)) || (query.sourceFlow !== undefined && !sourceFlow)) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_FILTER_INVALID" });
    }
    const files = await repositories.files.listAssessmentAudioForStaff({
      viewerId: request.e4sSession!.user.id,
      ...(learnerId ? { learnerId } : {}),
      ...(sourceFlow ? { sourceFlow } : {})
    });
    const items = await Promise.all(files.map(async (file) => {
      const playback = await signedPlayback(request, storage, file);
      return audioView(file, playback.signed);
    }));
    return reply.send({ items });
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

    const sourceFlow = parseSourceFlow(multipartField(file.fields, "sourceFlow") ?? "placement");
    const sourceEntityId = multipartField(file.fields, "sourceEntityId") ?? null;
    const taskKey = multipartField(file.fields, "taskKey") ?? null;
    const questionKey = multipartField(file.fields, "questionKey") ?? null;
    const transcript = multipartField(file.fields, "transcript") ?? null;
    if (!sourceFlow || (sourceEntityId !== null && !isUuid(sourceEntityId))
      || (taskKey !== null && (taskKey.length < 1 || taskKey.length > 160))
      || (questionKey !== null && (questionKey.length < 1 || questionKey.length > 160))
      || (transcript !== null && transcript.length > 20_000)) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_METADATA_INVALID" });
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

    let saved: Awaited<ReturnType<typeof repositories.files.createForOwner>>;
    try {
      saved = await repositories.files.createForOwner({
        id: randomUUID(),
        ownerUserId,
        purpose: "assessment_audio",
        bucket: EVIDENCE_BUCKET,
        objectKey,
        mimeType: file.mimetype,
        sizeBytes: body.length,
        sha256, sourceFlow, sourceEntityId, taskKey, questionKey, transcript
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
    const playback = await signedPlayback(request, storage, saved);
    return reply.code(201).send(audioView(saved, playback.signed));
  });

  app.post("/api/v1/files/assessment-audio/:fileId/complete", { preHandler: authenticatedContentUser }, async (request, reply) => {
    const fileId = (request.params as { fileId?: unknown }).fileId;
    const body = request.body as { transcript?: unknown } | undefined;
    if (typeof fileId !== "string" || !isUuid(fileId) || (body?.transcript !== undefined && typeof body.transcript !== "string")) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_LIFECYCLE_INVALID" });
    }
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : undefined;
    if (transcript !== undefined && transcript.length > 20_000) return reply.code(400).send({ code: "ASSESSMENT_AUDIO_TRANSCRIPT_INVALID" });
    const updated = await repositories.files.markAudioCompleted({ actorId: request.e4sSession!.user.id, fileId, transcript: transcript ?? null });
    return updated ? reply.send(audioView(updated, undefined)) : reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
  });

  app.post("/api/v1/files/assessment-audio/:fileId/grade", { preHandler: staffOnly }, async (request, reply) => {
    const fileId = (request.params as { fileId?: unknown }).fileId;
    const body = request.body as { transcript?: unknown } | undefined;
    if (typeof fileId !== "string" || !isUuid(fileId) || (body?.transcript !== undefined && typeof body.transcript !== "string")) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_LIFECYCLE_INVALID" });
    }
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : undefined;
    if (transcript !== undefined && transcript.length > 20_000) return reply.code(400).send({ code: "ASSESSMENT_AUDIO_TRANSCRIPT_INVALID" });
    const updated = await repositories.files.markAudioGraded({ actorId: request.e4sSession!.user.id, fileId, transcript: transcript ?? null });
    return updated ? reply.send(audioView(updated, undefined)) : reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
  });

  app.post("/api/v1/files/assessment-audio/:fileId/delete-confirmation", { preHandler: staffOnly }, async (request, reply) => {
    const fileId = (request.params as { fileId?: unknown }).fileId;
    if (typeof fileId !== "string" || !isUuid(fileId)) return reply.code(400).send({ code: "ASSESSMENT_AUDIO_FILE_INVALID" });
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);
    const created = await repositories.files.createAudioDeletionConfirmation({
      actorId: request.e4sSession!.user.id,
      fileId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt
    });
    return created
      ? reply.send({ confirmationToken: token, expiresAt: expiresAt.toISOString() })
      : reply.code(404).send({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
  });

  app.delete("/api/v1/files/assessment-audio/:fileId", { preHandler: staffOnly }, async (request, reply) => {
    const fileId = (request.params as { fileId?: unknown }).fileId;
    const confirmationToken = (request.body as { confirmationToken?: unknown } | undefined)?.confirmationToken;
    if (typeof fileId !== "string" || !isUuid(fileId) || typeof confirmationToken !== "string" || confirmationToken.length < 32) {
      return reply.code(400).send({ code: "ASSESSMENT_AUDIO_CONFIRMATION_REQUIRED" });
    }
    const tokenHash = createHash("sha256").update(confirmationToken).digest("hex");
    const target = await repositories.files.findAudioDeleteTarget(request.e4sSession!.user.id, fileId, tokenHash);
    if (!target) {
      return reply.code(409).send({ code: "ASSESSMENT_AUDIO_CONFIRMATION_INVALID" });
    }
    try {
      await storage.deleteObject(target.bucket, target.objectKey);
    } catch (error) {
      logStorageFailure(request, "deleteAudioObject", error);
      return reply.code(503).send({ code: "ASSESSMENT_AUDIO_DELETE_UNAVAILABLE" });
    }
    const deleted = await repositories.files.deleteAudioWithConfirmation({
      actorId: request.e4sSession!.user.id,
      fileId,
      tokenHash,
      traceId: request.id
    });
    if (deleted.status !== "deleted" || !deleted.file) return reply.code(409).send({ code: "ASSESSMENT_AUDIO_CONFIRMATION_INVALID" });
    return reply.send({ ...audioView(deleted.file, undefined), deleted: true });
  });
}

interface ByteRange {
  header: string;
  contentRange: string;
  length: number;
}

function parseByteRange(value: string | undefined, size: number): ByteRange | undefined | "unsatisfiable" {
  if (!value) return undefined;
  if (!Number.isSafeInteger(size) || size <= 0 || value.includes(",")) return "unsatisfiable";
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return "unsatisfiable";

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    if (!Number.isSafeInteger(start) || start < 0 || start >= size) return "unsatisfiable";
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(end) || end < start) return "unsatisfiable";
    end = Math.min(end, size - 1);
  }

  return {
    header: `bytes=${start}-${end}`,
    contentRange: `bytes ${start}-${end}/${size}`,
    length: end - start + 1
  };
}

function audioView(file: AudioFileRecord, signed: { url: string; expiresAt: Date } | undefined): Record<string, unknown> {
  const signedUrl = file.deletedAt || !signed ? null : assessmentAudioPlaybackUrl(file.objectKey);
  const expiresAt = file.deletedAt ? null : signed?.expiresAt.toISOString() ?? null;
  return {
    fileId: file.id,
    artifactKey: file.objectKey,
    url: signedUrl,
    signedUrl,
    expiresAt,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    sourceFlow: file.sourceFlow,
    sourceEntityId: file.sourceEntityId,
    taskKey: file.taskKey,
    questionKey: file.questionKey,
    transcript: file.transcript,
    createdAt: file.createdAt.toISOString(),
    completedAt: file.completedAt?.toISOString() ?? null,
    gradedAt: file.gradedAt?.toISOString() ?? null,
    retentionUntil: file.retentionUntil?.toISOString() ?? null,
    cleanupEligible: Boolean(file.retentionUntil && file.retentionUntil.getTime() <= Date.now()),
    deletedAt: file.deletedAt?.toISOString() ?? null,
    deletedBy: file.deletedBy
  };
}

function assessmentAudioPlaybackUrl(artifactKey: string): string {
  return `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`;
}

async function signedPlayback(
  request: Pick<FastifyRequest, "log">,
  storage: ObjectStorage,
  file: AudioFileRecord
): Promise<{ signed?: { url: string; expiresAt: Date }; error?: { status: number; code: string } }> {
  if (file.deletedAt) return {};
  if (!storage.presignGetObject) return { error: { status: 503, code: "ASSESSMENT_AUDIO_READ_UNAVAILABLE" } };
  if (storage.objectExists) {
    try {
      if (!await storage.objectExists(file.bucket, file.objectKey)) return { error: { status: 404, code: "ASSESSMENT_AUDIO_NOT_FOUND" } };
    } catch (error) {
      logStorageFailure(request, "objectExists", error);
      return { error: { status: 503, code: "ASSESSMENT_AUDIO_READ_UNAVAILABLE" } };
    }
  }
  try {
    return { signed: await storage.presignGetObject({ bucket: file.bucket, objectKey: file.objectKey, expiresInSeconds: 300 }) };
  } catch (error) {
    logStorageFailure(request, "presignGetObject", error);
    return { error: { status: isMissingObjectError(error) ? 404 : 503, code: isMissingObjectError(error) ? "ASSESSMENT_AUDIO_NOT_FOUND" : "ASSESSMENT_AUDIO_READ_UNAVAILABLE" } };
  }
}

function multipartField(fields: Record<string, unknown>, name: string): string | undefined {
  const value = fields[name];
  if (!value || typeof value !== "object" || !("value" in value)) return undefined;
  const fieldValue = (value as { value?: unknown }).value;
  return typeof fieldValue === "string" ? fieldValue.trim() : undefined;
}

function parseSourceFlow(value: unknown): AudioSourceFlow | undefined {
  return value === "placement" || value === "daily_lesson" || value === "weekly_practice" || value === "season" ? value : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
