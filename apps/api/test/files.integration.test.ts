import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("assessment evidence upload API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const uploaded: Array<{ bucket: string; objectKey: string; body: Uint8Array; mimeType: string }> = [];
  const deleted: Array<{ bucket: string; objectKey: string }> = [];
  let uploadError: unknown;
  let readError: unknown;
  const storage = {
    putObject: async (input: { bucket: string; objectKey: string; body: Uint8Array; mimeType: string }) => {
      if (uploadError) throw uploadError;
      uploaded.push(input);
    },
    deleteObject: async (bucket: string, objectKey: string) => {
      deleted.push({ bucket, objectKey });
    },
    ready: async () => undefined,
    presignGetObject: async (input: { bucket: string; objectKey: string; expiresInSeconds: number }) => {
      if (readError) throw readError;
      return {
        url: `https://audio.example.test/${input.objectKey}`,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000)
      };
    }
  };
  const app = buildApi({
    pool,
    allowDemoLogin: true,
    secureCookies: false,
    storage
  } as Parameters<typeof buildApi>[0] & { storage: typeof storage });
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("delete from assessment_decisions where attempt_id = $1", [DEMO_IDS.placementAttempt]);
      await client.query("delete from assessment_attempts where id = $1", [DEMO_IDS.placementAttempt]);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
        [
          DEMO_IDS.learner, await createCredentialHash("learner-pass"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", password: "learner-pass" }
    });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  beforeEach(() => {
    uploadError = undefined;
    readError = undefined;
    deleted.length = 0;
  });

  afterAll(async () => { await app.close(); await pool.end(); });

  const startSpeaking = async (): Promise<string> => {
    const started = await app.inject({
      method: "POST", url: "/api/v1/assessments/placement/start", headers: { cookie }, payload: {}
    });
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    for (const section of ["listening", "reading", "writing"] as const) {
      const advanced = await app.inject({
        method: "POST",
        url: `/api/v1/assessment-attempts/${attemptId}/sections/${section}/complete`,
        headers: { cookie },
        payload: {}
      });
      expect(advanced.statusCode, advanced.body).toBe(200);
    }
    return attemptId;
  };

  it("stores a learner audio upload under a server-issued assessment artifact key", async () => {
    const boundary = "E4S-audio-boundary";
    const payload = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="speaking.webm"',
      "Content-Type: audio/webm",
      "",
      "voice evidence bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n"));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/files/assessment-audio",
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload
    });

    expect(response.statusCode, response.body).toBe(201);
    const body = response.json() as { artifactKey: string };
    expect(body.artifactKey).toMatch(new RegExp(`^assessment-audio/${DEMO_IDS.learner}/[0-9a-f-]+\\.webm$`));
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatchObject({
      bucket: "e4s-evidence",
      objectKey: body.artifactKey,
      mimeType: "audio/webm"
    });
    expect(Buffer.from(uploaded[0]!.body).toString()).toBe("voice evidence bytes");
    await expect(pool.query(
      "select owner_user_id, purpose, bucket, object_key, mime_type from files where object_key = $1",
      [body.artifactKey]
    )).resolves.toMatchObject({ rows: [{
      owner_user_id: DEMO_IDS.learner,
      purpose: "assessment_audio",
      bucket: "e4s-evidence",
      object_key: body.artifactKey,
      mime_type: "audio/webm"
    }] });
  });

  it("accepts a WebM recording when the browser reports a non-audio MIME", async () => {
    const boundary = "E4S-video-webm-boundary";
    const payload = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="speaking.webm"',
      "Content-Type: video/webm",
      "",
      "voice evidence bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n"));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/files/assessment-audio",
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({ artifactKey: expect.stringMatching(/^assessment-audio\/.+\.webm$/) });
  });

  it("rejects an audio artifact key supplied by the browser when the learner does not own it", async () => {
    const attemptId = await startSpeaking();

    const response = await app.inject({
      method: "PUT",
      url: `/api/v1/assessment-attempts/${attemptId}/responses/speaking/S1`,
      headers: { cookie },
      payload: {
        value: "Bản ghi âm đã nộp",
        evidenceType: "audio",
        artifactKey: "assessment-audio/another-learner/not-owned.webm"
      }
    });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json()).toMatchObject({ code: "ASSESSMENT_ARTIFACT_NOT_OWNED" });
  });

  it("keeps assessment file routes behind learner authentication", async () => {
    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/v1/files/assessment-audio/read?artifactKey=assessment-audio%2Fmissing%2Fvoice.wav"
    });
    expect(unauthenticated.statusCode, unauthenticated.body).toBe(401);
    expect(unauthenticated.json()).toEqual({ code: "UNAUTHENTICATED" });

    const staff = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "operator@e4s.local", password: "operator-pass" }
    });
    expect(staff.statusCode, staff.body).toBe(200);
    const staffCookie = String(staff.headers["set-cookie"]).split(";")[0] ?? "";
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/files/assessment-audio/read?artifactKey=assessment-audio%2Fmissing%2Fvoice.wav",
      headers: { cookie: staffCookie }
    });
    expect(forbidden.statusCode, forbidden.body).toBe(403);
    expect(forbidden.json()).toEqual({ code: "FORBIDDEN" });
  });

  it("returns a short-lived read URL only for an owned persisted object", async () => {
    const artifactKey = `assessment-audio/${DEMO_IDS.learner}/read.wav`;
    await pool.query(
      `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
       values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', $4, 'audio/wav', 4, $5)`,
      ["00000000-0000-4000-8000-000000000933", DEMO_IDS.organization, DEMO_IDS.learner, artifactKey, "f".repeat(64)]
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      url: `https://audio.example.test/${artifactKey}`,
      expiresAt: expect.any(String)
    });
  });

  it("maps a missing MinIO object to a stable not-found error", async () => {
    const artifactKey = `assessment-audio/${DEMO_IDS.learner}/missing.wav`;
    await pool.query(
      `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
       values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', $4, 'audio/wav', 4, $5)`,
      ["00000000-0000-4000-8000-000000000934", DEMO_IDS.organization, DEMO_IDS.learner, artifactKey, "a".repeat(64)]
    );
    readError = Object.assign(new Error("NoSuchKey: secret=minio-credential"), { name: "NoSuchKey" });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie }
    });

    expect(response.statusCode, response.body).toBe(404);
    expect(response.json()).toEqual({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
    expect(response.body).not.toContain("minio-credential");
  });

  it("does not leak storage errors when an upload cannot reach MinIO", async () => {
    uploadError = new Error("AccessDenied: secret=minio-credential");
    const uploadedBefore = uploaded.length;
    const boundary = "E4S-storage-error-boundary";
    const payload = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="speaking.webm"',
      "Content-Type: audio/webm",
      "",
      "voice evidence bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n"));

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/files/assessment-audio",
      headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload
    });

    expect(response.statusCode, response.body).toBe(503);
    expect(response.json()).toEqual({ code: "ASSESSMENT_AUDIO_UPLOAD_UNAVAILABLE" });
    expect(response.body).not.toContain("minio-credential");
    expect(uploaded).toHaveLength(uploadedBefore);
  });

  it("cleans up the object when evidence metadata cannot be persisted", async () => {
    const originalQuery = pool.query.bind(pool);
    const mutablePool = pool as unknown as { query: (...args: unknown[]) => Promise<unknown> };
    mutablePool.query = async (...args) => {
      if (typeof args[0] === "string" && args[0].toLowerCase().includes("insert into files")) {
        return { rows: [], rowCount: 0 };
      }
      return originalQuery(...args as Parameters<typeof originalQuery>);
    };

    const boundary = "E4S-cleanup-boundary";
    const payload = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="speaking.webm"',
      "Content-Type: audio/webm",
      "",
      "voice evidence bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n"));

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/files/assessment-audio",
        headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
        payload
      });

      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toEqual({ code: "ASSESSMENT_AUDIO_NOT_SAVED" });
    } finally {
      mutablePool.query = originalQuery;
    }

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ bucket: "e4s-evidence" });
  });
});
