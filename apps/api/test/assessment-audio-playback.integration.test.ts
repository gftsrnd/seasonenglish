import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const responseId = "00000000-0000-4000-8000-000000000931";
const fileId = "00000000-0000-4000-8000-000000000932";
const artifactKey = `assessment-audio/${DEMO_IDS.learner}/playback.wav`;

describe("persisted assessment audio playback", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const presignCalls: Array<{ bucket: string; objectKey: string; expiresInSeconds: number }> = [];
  const storage = {
    putObject: async () => undefined,
    deleteObject: async () => undefined,
    ready: async () => undefined,
    presignGetObject: async (input: { bucket: string; objectKey: string; expiresInSeconds: number }) => {
      presignCalls.push(input);
      return {
        url: `https://audio.example.test/${input.objectKey}`,
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
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass"),
          DEMO_IDS.learner, await createCredentialHash("learner-pass")
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
      const response = await app.inject({ method: "POST", url, payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("/api/auth/staff/login", "thu.ha.tran@e4s.local", "operator-pass");
    managerCookie = await login("/api/auth/staff/login", "quoc.bao.le@e4s.local", "manager-pass");
    learnerCookie = await login("/api/auth/learner/login", "minh.anh.nguyen@e4s.local", "learner-pass");
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
      signedUrl: `https://audio.example.test/${artifactKey}`,
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
      .toBe(`https://audio.example.test/${artifactKey}`);
    expect(presignCalls).toHaveLength(2);
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
      url: `https://audio.example.test/${artifactKey}`,
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
