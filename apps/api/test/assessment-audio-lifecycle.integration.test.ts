import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const otherOrganizationId = "00000000-0000-4000-8000-000000000951";
const otherLearnerId = "00000000-0000-4000-8000-000000000952";
const otherOperatorId = "00000000-0000-4000-8000-000000000953";

describe("assessment audio lifecycle contract", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const uploaded: Array<{ bucket: string; objectKey: string; body: Uint8Array; mimeType: string }> = [];
  const deleted: Array<{ bucket: string; objectKey: string }> = [];
  const storage = {
    putObject: async (input: { bucket: string; objectKey: string; body: Uint8Array; mimeType: string }) => {
      uploaded.push(input);
    },
    deleteObject: async (bucket: string, objectKey: string) => {
      deleted.push({ bucket, objectKey });
    },
    ready: async () => undefined,
    presignGetObject: async (input: { bucket: string; objectKey: string; expiresInSeconds: number }) => ({
      url: `https://audio.example.test/${input.objectKey}`,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000)
    })
  };
  const app = buildApi({ pool, secureCookies: false, storage });
  let learnerCookie = "";
  let operatorCookie = "";
  let otherOperatorCookie = "";
  let otherLearnerCookie = "";
  let fileId = "";
  let artifactKey = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)`,
        [
          DEMO_IDS.learner, await createPinHash("123456"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
      await client.query("insert into organizations (id, name, slug) values ($1, 'Other org', 'other-org')", [otherOrganizationId]);
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $3, 'learner', 'Other learner', 'other.learner@e4s.local'),
                ($2, $3, 'operator', 'Other operator', 'other.operator@e4s.local')`,
        [otherLearnerId, otherOperatorId, otherOrganizationId]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [otherOperatorId, await createCredentialHash("other-operator-pass")]
      );
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [otherLearnerId, await createPinHash("654321")]
      );
      await client.query(
        `insert into practice_submissions (id, learner_id, program_week_id, status, content, score, feedback)
         values ($1, $2, $3, 'submitted', '{}'::jsonb, $4::jsonb, $5::jsonb)`,
        [DEMO_IDS.practiceSubmission, DEMO_IDS.learner, DEMO_IDS.week, JSON.stringify({ total: 80 }), JSON.stringify({ message: "Keep the handoff concise." })]
      );
      await client.query(
        "update practice_submissions set score = $2::jsonb, feedback = $3::jsonb where id = $1",
        [DEMO_IDS.practiceSubmission, JSON.stringify({ total: 80 }), JSON.stringify({ message: "Keep the handoff concise." })]
      );
    } finally {
      client.release();
    }
    await app.ready();
    const login = async (url: string, payload: Record<string, string>) => {
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    learnerCookie = await login("/api/auth/learner/login", { email: "minh.anh.nguyen@e4s.local", pin: "123456" });
    operatorCookie = await login("/api/auth/staff/login", { email: "thu.ha.tran@e4s.local", password: "operator-pass" });
    otherOperatorCookie = await login("/api/auth/staff/login", { email: "other.operator@e4s.local", password: "other-operator-pass" });
    otherLearnerCookie = await login("/api/auth/learner/login", { email: "other.learner@e4s.local", pin: "654321" });
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("persists speaking-flow linkage and returns authorized staff metadata", async () => {
    const boundary = "E4S-audio-lifecycle-boundary";
    const sourceEntityId = DEMO_IDS.practiceSubmission;
    const payload = Buffer.from([
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="weekly.webm"',
      "Content-Type: audio/webm",
      "",
      "weekly voice bytes",
      `--${boundary}`,
      'Content-Disposition: form-data; name="sourceFlow"',
      "",
      "weekly_practice",
      `--${boundary}`,
      'Content-Disposition: form-data; name="sourceEntityId"',
      "",
      sourceEntityId,
      `--${boundary}`,
      'Content-Disposition: form-data; name="taskKey"',
      "",
      "weekly-speaking",
      `--${boundary}`,
      'Content-Disposition: form-data; name="questionKey"',
      "",
      "Q1",
      `--${boundary}`,
      'Content-Disposition: form-data; name="transcript"',
      "",
      "I coordinate the weekly handoff.",
      `--${boundary}--`,
      ""
    ].join("\r\n"));

    const uploadedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/files/assessment-audio",
      headers: { cookie: learnerCookie, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload
    });

    expect(uploadedResponse.statusCode, uploadedResponse.body).toBe(201);
    const uploadedBody = uploadedResponse.json();
    fileId = uploadedBody.fileId;
    artifactKey = uploadedBody.artifactKey;
    expect(uploadedBody).toMatchObject({
      fileId: expect.any(String),
      artifactKey: expect.stringMatching(/^assessment-audio\/.*\.webm$/),
      sourceFlow: "weekly_practice",
      sourceEntityId,
      taskKey: "weekly-speaking",
      questionKey: "Q1",
      mimeType: "audio/webm",
      transcript: "I coordinate the weekly handoff.",
      retentionUntil: null,
      cleanupEligible: false,
      deletedAt: null
    });
    expect(Buffer.from(uploaded[0]!.body).toString()).toBe("weekly voice bytes");

    const stored = await pool.query(
      `select owner_user_id, organization_id, source_flow, source_entity_id, task_key, question_key,
              transcript, size_bytes, sha256, completed_at, graded_at, retention_until, deleted_at
       from files where id = $1`,
      [fileId]
    );
    expect(stored.rows[0]).toMatchObject({
      owner_user_id: DEMO_IDS.learner,
      organization_id: DEMO_IDS.organization,
      source_flow: "weekly_practice",
      source_entity_id: sourceEntityId,
      task_key: "weekly-speaking",
      question_key: "Q1",
      transcript: "I coordinate the weekly handoff.",
      size_bytes: "18",
      completed_at: null,
      graded_at: null,
      retention_until: null,
      deleted_at: null
    });

    const staffRead = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie: operatorCookie }
    });
    expect(staffRead.statusCode, staffRead.body).toBe(200);
    expect(staffRead.json()).toMatchObject({
      fileId,
      artifactKey,
      signedUrl: `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`,
      url: `/api/v1/files/assessment-audio/playback?artifactKey=${encodeURIComponent(artifactKey)}`,
      expiresAt: expect.any(String),
      transcript: "I coordinate the weekly handoff.",
      sourceFlow: "weekly_practice",
      sourceEntityId,
      cleanupEligible: false,
      deletedAt: null
    });

    const crossOrganizationRead = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie: otherOperatorCookie }
    });
    expect(crossOrganizationRead.statusCode).toBe(404);
    expect(crossOrganizationRead.json()).toEqual({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });

    const crossUserRead = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie: otherLearnerCookie }
    });
    expect(crossUserRead.statusCode).toBe(404);
    expect(crossUserRead.json()).toEqual({ code: "ASSESSMENT_AUDIO_NOT_FOUND" });
  });

  it("accepts daily lesson and Season audio metadata and staff flow filters", async () => {
    const uploadFlow = async (sourceFlow: "daily_lesson" | "season", sourceEntityId: string) => {
      const boundary = `E4S-${sourceFlow}-boundary`;
      const payload = Buffer.from([
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${sourceFlow}.webm"`,
        "Content-Type: audio/webm",
        "",
        `${sourceFlow} voice bytes`,
        `--${boundary}`,
        'Content-Disposition: form-data; name="sourceFlow"',
        "",
        sourceFlow,
        `--${boundary}`,
        'Content-Disposition: form-data; name="sourceEntityId"',
        "",
        sourceEntityId,
        `--${boundary}--`,
        ""
      ].join("\r\n"));
      return app.inject({
        method: "POST",
        url: "/api/v1/files/assessment-audio",
        headers: { cookie: learnerCookie, "content-type": `multipart/form-data; boundary=${boundary}` },
        payload
      });
    };

    for (const [sourceFlow, sourceEntityId] of [
      ["daily_lesson", DEMO_IDS.lessons[0]],
      ["season", DEMO_IDS.coachSession]
    ] as const) {
      const response = await uploadFlow(sourceFlow, sourceEntityId);
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json()).toMatchObject({ sourceFlow, sourceEntityId, mimeType: "audio/webm" });
      const list = await app.inject({
        method: "GET",
        url: `/api/v1/files/assessment-audio?sourceFlow=${sourceFlow}`,
        headers: { cookie: operatorCookie }
      });
      expect(list.statusCode, list.body).toBe(200);
      expect(list.json().items).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceFlow, sourceEntityId })
      ]));
    }
  });

  it("marks completion for 60-day cleanup eligibility and deletes only the object after confirmation", async () => {
    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/files/assessment-audio/${fileId}/complete`,
      headers: { cookie: learnerCookie },
      payload: { transcript: "Updated transcript from completion." }
    });
    expect(completed.statusCode, completed.body).toBe(200);
    expect(completed.json()).toMatchObject({
      fileId,
      transcript: "Updated transcript from completion.",
      retentionUntil: expect.any(String),
      cleanupEligible: false
    });
    expect(new Date(completed.json().retentionUntil).getTime()).toBeGreaterThan(Date.now() + 59 * 24 * 60 * 60 * 1_000);

    const graded = await app.inject({
      method: "POST",
      url: `/api/v1/files/assessment-audio/${fileId}/grade`,
      headers: { cookie: operatorCookie },
      payload: {}
    });
    expect(graded.statusCode, graded.body).toBe(200);
    expect(graded.json()).toMatchObject({ fileId, gradedAt: expect.any(String), transcript: "Updated transcript from completion." });

    await pool.query("update files set retention_until = now() - interval '1 second' where id = $1", [fileId]);
    const eligible = await app.inject({
      method: "GET",
      url: `/api/v1/files/assessment-audio/read?artifactKey=${encodeURIComponent(artifactKey)}`,
      headers: { cookie: operatorCookie }
    });
    expect(eligible.json()).toMatchObject({ cleanupEligible: true, transcript: "Updated transcript from completion." });

    const confirmation = await app.inject({
      method: "POST",
      url: `/api/v1/files/assessment-audio/${fileId}/delete-confirmation`,
      headers: { cookie: operatorCookie },
      payload: {}
    });
    expect(confirmation.statusCode, confirmation.body).toBe(200);
    expect(confirmation.json()).toMatchObject({ confirmationToken: expect.any(String), expiresAt: expect.any(String) });

    const deletedResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/files/assessment-audio/${fileId}`,
      headers: { cookie: operatorCookie },
      payload: { confirmationToken: confirmation.json().confirmationToken }
    });
    expect(deletedResponse.statusCode, deletedResponse.body).toBe(200);
    expect(deletedResponse.json()).toMatchObject({
      fileId,
      deleted: true,
      transcript: "Updated transcript from completion.",
      signedUrl: null,
      deletedAt: expect.any(String),
      deletedBy: DEMO_IDS.operator
    });
    expect(deleted).toEqual([{ bucket: "e4s-evidence", objectKey: artifactKey }]);

    const stored = await pool.query(
      "select transcript, deleted_at, deleted_by from files where id = $1",
      [fileId]
    );
    expect(stored.rows[0]).toMatchObject({
      transcript: "Updated transcript from completion.",
      deleted_by: DEMO_IDS.operator
    });
    expect(stored.rows[0]?.deleted_at).toBeTruthy();
    await expect(pool.query(
      "select score, feedback from practice_submissions where id = $1",
      [DEMO_IDS.practiceSubmission]
    )).resolves.toMatchObject({ rows: [{ score: { total: 80 }, feedback: { message: "Keep the handoff concise." } }] });
    await expect(pool.query(
      "select action, entity_type, entity_id, payload from audit_events where entity_id = $1 order by created_at desc limit 1",
      [fileId]
    )).resolves.toMatchObject({ rows: [expect.objectContaining({ action: "audio_object_deleted", entity_type: "file", entity_id: fileId })] });

    const replay = await app.inject({
      method: "DELETE",
      url: `/api/v1/files/assessment-audio/${fileId}`,
      headers: { cookie: operatorCookie },
      payload: { confirmationToken: confirmation.json().confirmationToken }
    });
    expect(replay.statusCode).toBe(409);
  });
});
