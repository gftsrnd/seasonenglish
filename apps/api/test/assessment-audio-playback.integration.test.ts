import { Pool } from "pg";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const responseId = "00000000-0000-4000-8000-000000000931";
const fileId = "00000000-0000-4000-8000-000000000932";
const artifactKey = `assessment-audio/${DEMO_IDS.learner}/playback.wav`;
const audioBody = "0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

describe("persisted assessment audio playback", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const presignCalls: Array<{ bucket: string; objectKey: string; expiresInSeconds: number }> = [];
  const readCalls: Array<{ bucket: string; objectKey: string; range?: string }> = [];
  const storage = {
    putObject: async () => undefined,
    deleteObject: async () => undefined,
    ready: async () => undefined,
    getObject: async (input: { bucket: string; objectKey: string; range?: string }) => {
      readCalls.push(input);
      const match = /^bytes=(\d+)-(\d+)$/.exec(input.range ?? "");
      const start = match ? Number(match[1]) : 0;
      const end = match ? Number(match[2]) : audioBody.length - 1;
      const body = audioBody.slice(start, end + 1);
      return {
        body: Readable.from([body]) as never,
        mimeType: "audio/wav",
        contentLength: Buffer.byteLength(body),
        ...(match ? { contentRange: `bytes ${start}-${end}/${audioBody.length}` } : {})
      };
    },
    presignGetObject: async (input: { bucket: string; objectKey: string; expiresInSeconds: number }) => {
      presignCalls.push(input);
      return {
        url: `http://minio:9000/${input.bucket}/${input.objectKey}`,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000)
      };
    }
  };
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false, storage });
  let operatorCookie = "";
  let managerCookie = "";
  let learnerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)`,
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass-123"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass-123"),
          DEMO_IDS.learner, await createPinHash("246810")
        ]
      );
      await client.query(
        `insert into assessment_responses (id, attempt_id, section, task_key, response)
         values ($1, $2, 'speaking', 'S1', $3::jsonb)`,
        [responseId, DEMO_IDS.placementAttempt, JSON.stringify({ value: "audio evidence", evidenceType: "audio", artifactKey })]
      );
      await client.query(
        `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
         values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', $4, 'audio/wav', 42, $5)`,
        [fileId, DEMO_IDS.organization, DEMO_IDS.learner, artifactKey, "e".repeat(64)]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (url: string, email: string, password: string) => {
      const response = await app.inject({
        method: "POST", url,
        payload: url.includes("/learner/") ? { email, pin: password } : { email, password }
      });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("/api/auth/staff/login", "thu.ha.tran@e4s.local", "operator-pass-123");
    managerCookie = await login("/api/auth/staff/login", "quoc.bao.le@e4s.local", "manager-pass-123");
    learnerCookie = await login("/api/auth/learner/login", "minh.anh.nguyen@e4s.local", "246810");
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("presigns persisted audio for Operator and Manager readers with a short TTL", async () => {
    const operator = await app.inject({
      method: "GET",
      url: `/api/v1/content/review/assessments/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: operatorCookie }
    });
    expect(operator.statusCode, operator.body).toBe(200);
    const operatorAudio = operator.json().answers.find((answer: { taskKey: string }) => answer.taskKey === "S1").audioArtifact;
    expect(operatorAudio).toMatchObject({
      artifactKey,
      mimeType: "audio/wav",
      sizeBytes: 42,
      signedUrl: `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`,
      expiresAt: expect.any(String)
    });
    expect(new Date(operatorAudio.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(presignCalls).toEqual([{ bucket: "e4s-evidence", objectKey: artifactKey, expiresInSeconds: 300 }]);

    const manager = await app.inject({
      method: "GET",
      url: `/api/v1/content/review/assessments/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: managerCookie }
    });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json().answers.find((answer: { taskKey: string }) => answer.taskKey === "S1").audioArtifact.signedUrl)
      .toBe(`/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`);
    expect(presignCalls).toHaveLength(2);
  });

  it("serves browser-safe audio through the authenticated same-organization playback route", async () => {
    const playbackUrl = `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`;
    const unauthenticated = await app.inject({ method: "GET", url: playbackUrl });
    expect(unauthenticated.statusCode).toBe(401);

    const operator = await app.inject({ method: "GET", url: playbackUrl, headers: { cookie: operatorCookie } });
    expect(operator.statusCode, operator.body).toBe(200);
    expect(operator.headers["content-type"]).toContain("audio/wav");
    expect(operator.headers["accept-ranges"]).toBe("bytes");
    expect(operator.headers["content-length"]).toBe("42");
    expect(operator.body).toBe(audioBody);
    expect(readCalls).toEqual([{ bucket: "e4s-evidence", objectKey: artifactKey }]);

    const outsideScope = await app.inject({
      method: "GET",
      url: "/api/v1/files/assessment-audio/playback?artifactKey=assessment-audio%2Fanother-learner%2Fvoice.wav",
      headers: { cookie: learnerCookie }
    });
    expect(outsideScope.statusCode).toBe(404);
  });

  it("streams one requested byte range so browser audio can seek without downloading the full object", async () => {
    const playbackUrl = `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`;
    const response = await app.inject({
      method: "GET",
      url: playbackUrl,
      headers: { cookie: operatorCookie, range: "bytes=10-19" }
    });

    expect(response.statusCode, response.body).toBe(206);
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.headers["content-range"]).toBe("bytes 10-19/42");
    expect(response.headers["content-length"]).toBe("10");
    expect(response.headers["content-type"]).toContain("audio/wav");
    expect(response.body).toBe("abcdefghij");
  });

  it("rejects an unsatisfiable browser range without reading object storage", async () => {
    const readsBefore = readCalls.length;
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie: operatorCookie, range: "bytes=42-" }
    });

    expect(response.statusCode).toBe(416);
    expect(response.headers["content-range"]).toBe("bytes */42");
    expect(readCalls).toHaveLength(readsBefore);
  });

  it("does not expose assessment audio to a learner session", async () => {
    const learner = await app.inject({
      method: "GET",
      url: `/api/v1/content/review/assessments/${DEMO_IDS.placementAttempt}`,
      headers: { cookie: learnerCookie }
    });
    expect(learner.statusCode).toBe(403);
  });

  it("presigns only the signed-in learner's persisted assessment audio", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie: learnerCookie }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      url: `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`,
      expiresAt: expect.any(String)
    });

    const notOwned = await app.inject({
      method: "GET",
      url: "/api/v1/files/assessment-audio/read?artifactKey=assessment-audio%2Fanother-learner%2Fvoice.wav",
      headers: { cookie: learnerCookie }
    });
    expect(notOwned.statusCode).toBe(404);
    expect(notOwned.json()).toMatchObject({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
  });
});
