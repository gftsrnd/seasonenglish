import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo, createRepositories } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("audio flow integration contract", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const storage = {
    putObject: async () => undefined,
    deleteObject: async () => undefined,
    ready: async () => undefined,
    presignGetObject: async ({ objectKey, expiresInSeconds }: { objectKey: string; expiresInSeconds: number }) => ({
      url: `https://audio.example.test/${objectKey}`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000)
    })
  };
  const app = buildApi({
    pool,
    secureCookies: false,
    storage,
    aiRunner: {
      runTask: async (taskId: string) => ({
        output: taskId === "weekly_practice_grading" ? {
          score: { total: 84, rubric: { meaning: 4, vocabulary: 4, grammar: 3 } },
          offTopic: false, feedback: "Good work.", suggestions: [], correctedText: ""
        } : {
          evaluation: { status: "valid", result: "correct", countsTowardGoal: true, noteVi: "Đúng ý." },
          seasonReply: "That is useful. 😊", seasonReplyTranslation: "Điều đó hữu ích.",
          nextQuestion: "What do you do next?", nextQuestionTranslation: "Bạn làm gì tiếp theo?",
          rubric: {
            meaning: { score: 4, evidence: "Clear.", improvement: "Add detail." },
            vocabulary: { score: 4, evidence: "Relevant.", improvement: "Add one phrase." },
            grammar: { score: 4, evidence: "Correct.", improvement: "No change." }
          }, corrections: [], correctedText: "", suggestedAnswer: { text: "I plan the next step.", translation: "Tôi lên kế hoạch bước tiếp theo." }, usedWords: []
        },
        metadata: {
          traceId: `audio-flow-${taskId}`, taskId, provider: "fixture", model: "fixture-model",
          attempts: 1, latencyMs: 1, inputHash: "a".repeat(64), schemaValid: true as const, usage: {}
        }
      })
    }
  });
  let learnerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2)",
        [DEMO_IDS.learner, await createPinHash("123456")]
      );
    } finally { client.release(); }
    await app.ready();
    const login = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    expect(login.statusCode, login.body).toBe(200);
    learnerCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  async function insertAudio(objectKey: string, fileId: string) {
    await pool.query(
      `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
       values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', $4, 'audio/webm', 42, $5)`,
      [fileId, DEMO_IDS.organization, DEMO_IDS.learner, objectKey, "b".repeat(64)]
    );
  }

  it("persists Season audio payloads and returns refreshed playback metadata", async () => {
    const objectKey = `assessment-audio/${DEMO_IDS.learner}/season-contract.webm`;
    const fileId = "10000000-0000-4000-8000-000000000701";
    await insertAudio(objectKey, fileId);
    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000702",
        message: "I plan the next step.",
        audio: { fileId, artifactKey: objectKey, transcript: "I plan the next step.", mimeType: "audio/webm", sizeBytes: 42 }
      }
    });
    expect(response.statusCode, response.body).toBe(200);
    const message = response.json().messages.find((item: { speaker: string; audioArtifact?: unknown }) => item.speaker === "learner" && item.audioArtifact);
    expect(message.audioArtifact).toMatchObject({
      fileId, artifactKey: objectKey, signedUrl: `https://audio.example.test/${objectKey}`,
      mimeType: "audio/webm", sizeBytes: 42, transcript: "I plan the next step.", cleanupEligible: false,
      deletedAt: null, deletedBy: null
    });
    const linked = await pool.query("select source_flow, source_entity_id, transcript, retention_until from files where id = $1", [fileId]);
    expect(linked.rows[0]).toMatchObject({ source_flow: "season", transcript: "I plan the next step." });
    expect(linked.rows[0].source_entity_id).toEqual(expect.any(String));
    expect(linked.rows[0].retention_until).toEqual(expect.any(Date));
  });

  it("accepts an audio-only Season message and preserves its canonical file key", async () => {
    const objectKey = `assessment-audio/${DEMO_IDS.learner}/season-audio-only.webm`;
    const fileId = "10000000-0000-4000-8000-000000000705";
    await insertAudio(objectKey, fileId);

    const response = await app.inject({
      method: "POST", url: "/api/v1/coach/messages", headers: { cookie: learnerCookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000706",
        message: "",
        audio: { fileId, artifactKey: objectKey, mimeType: "audio/webm", sizeBytes: 42 }
      }
    });

    expect(response.statusCode, response.body).toBe(200);
    const message = response.json().messages.find((item: { speaker: string; audioArtifact?: { artifactKey?: string } }) => item.speaker === "learner" && item.audioArtifact?.artifactKey === objectKey);
    expect(message).toMatchObject({ text: "", audioArtifact: { fileId, artifactKey: objectKey, signedUrl: `https://audio.example.test/${objectKey}` } });
  });

  it("persists weekly-practice audio payloads on the canonical submission", async () => {
    await pool.query("update progress_records set status = 'completed', completed_at = now() where learner_id = $1", [DEMO_IDS.learner]);
    const view = await createRepositories(pool).engagement.weeklyPractice(DEMO_IDS.learner);
    expect(view?.state).toBe("open");
    const requirements = await createRepositories(pool).engagement.weeklyPracticeRequirements(DEMO_IDS.learner);
    expect(requirements).not.toBeNull();
    const words = requirements!.vocabulary.slice(0, 3);
    const text = `I use ${words[0] ?? "work"} every day. My colleague studies ${words[1] ?? "role"}. We review ${words[2] ?? "plan"} each week.`;
    const objectKey = `assessment-audio/${DEMO_IDS.learner}/weekly-contract.webm`;
    const fileId = "10000000-0000-4000-8000-000000000703";
    await insertAudio(objectKey, fileId);
    const response = await app.inject({
      method: "POST", url: "/api/v1/engagement/practice/submit", headers: { cookie: learnerCookie },
      payload: {
        requestId: "10000000-0000-4000-8000-000000000704", text,
        audio: { fileId, artifactKey: objectKey, transcript: text, mimeType: "audio/webm", sizeBytes: 42 }
      }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().submission.audioArtifact).toMatchObject({
      fileId, artifactKey: objectKey, signedUrl: `https://audio.example.test/${objectKey}`,
      mimeType: "audio/webm", sizeBytes: 42, transcript: text, deletedAt: null, deletedBy: null
    });
    const linked = await pool.query("select source_flow, source_entity_id, task_key from files where id = $1", [fileId]);
    expect(linked.rows[0]).toMatchObject({ source_flow: "weekly_practice", task_key: "weekly_practice" });
    expect(linked.rows[0].source_entity_id).toEqual(response.json().submission.id);
  });
});
