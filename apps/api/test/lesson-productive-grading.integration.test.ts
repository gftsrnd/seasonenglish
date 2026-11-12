import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiGatewayError, type AiRunResult, type SpeechTranscriber } from "@e4s/ai";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import type { ObjectStorage } from "@e4s/storage";
import { buildApi } from "../src/app.js";
import type { ContentMediaService } from "../src/modules/media/index.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

function aiResult(output: unknown): AiRunResult {
  return {
    output,
    metadata: {
      traceId: randomUUID(), taskId: "lesson_productive_grading", provider: "mock", model: "mock-grader", attempts: 1,
      latencyMs: 5, inputHash: "hash", schemaValid: true, usage: { inputTokens: 100, outputTokens: 20 }
    }
  };
}

describe("daily lesson Speaking/Writing AI grading", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const mediaService: ContentMediaService = {
    resolveForUser: vi.fn().mockResolvedValue({ status: "unavailable" }),
    diagnoseForUser: vi.fn().mockResolvedValue({ image: { status: "unavailable" }, provider: null, cached: false }),
    clearForUser: vi.fn().mockResolvedValue({ cleared: 0 })
  };
  const runTask = vi.fn();
  const transcribe = vi.fn();
  let sttAvailable = true;
  const transcriber: SpeechTranscriber = { provider: "mock-stt", model: "mock-transcribe", transcribe };
  const storage: ObjectStorage = {
    putObject: vi.fn(), deleteObject: vi.fn(), ready: vi.fn(),
    getObject: vi.fn(async () => ({ body: Readable.from([Buffer.from("fake-webm-bytes")]), mimeType: "audio/webm" }))
  };
  const app = buildApi({
    pool, secureCookies: false, mediaService, storage,
    aiRunner: { runTask },
    speechToTextFactory: async () => sttAvailable ? transcriber : undefined
  });
  let cookie = "";
  let lessonId = "";
  let organizationId = "";

  async function attempt(partCode: "speaking" | "writing", evidence: Record<string, unknown>) {
    return app.inject({
      method: "POST", url: `/api/v1/lessons/${lessonId}/parts/${partCode}/attempts`, headers: { cookie },
      payload: { requestId: randomUUID(), evidence }
    });
  }

  async function recording(): Promise<string> {
    const objectKey = `assessment-audio/${DEMO_IDS.learner}/${randomUUID()}.webm`;
    await pool.query(
      `insert into files (id, organization_id, owner_user_id, purpose, bucket, object_key, mime_type, size_bytes, sha256)
       values ($1, $2, $3, 'assessment_audio', 'e4s-evidence', $4, 'audio/webm', 15, 'sha')`,
      [randomUUID(), organizationId, DEMO_IDS.learner, objectKey]
    );
    return objectKey;
  }

  async function settled(partCode: "speaking" | "writing") {
    for (let index = 0; index < 100; index += 1) {
      const lesson = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
      const evidence = lesson.json().progress.evidence[partCode];
      if (evidence?.aiGrading !== "pending") return lesson.json().progress;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("grading did not finish");
  }

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("delete from progress_records where learner_id = $1 and lesson_id = any($2::uuid[])", [DEMO_IDS.learner, DEMO_IDS.lessons.slice(1)]);
      await client.query("update programs set start_date = current_date - 1 where id = $1", [DEMO_IDS.program]);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.learner, await createPinHash("123456")]);
      organizationId = (await client.query<{ organization_id: string }>("select organization_id from users where id = $1", [DEMO_IDS.learner])).rows[0]!.organization_id;
    } finally {
      client.release();
    }
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" } });
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
    lessonId = DEMO_IDS.lessons[0]!;
  }, 60_000);

  beforeEach(async () => {
    runTask.mockReset();
    transcribe.mockReset();
    sttAvailable = true;
    await pool.query("delete from lesson_part_attempts where learner_id = $1 and lesson_id = $2", [DEMO_IDS.learner, lessonId]);
    await pool.query("delete from progress_records where learner_id = $1 and lesson_id = $2", [DEMO_IDS.learner, lessonId]);
    await pool.query("delete from ai_runs where user_id = $1", [DEMO_IDS.learner]);
    const study = await app.inject({ method: "POST", url: `/api/v1/lessons/${lessonId}/study-completion`, headers: { cookie } });
    expect(study.statusCode, study.body).toBe(200);
    const lesson = await app.inject({ method: "GET", url: `/api/v1/lessons/${lessonId}`, headers: { cookie } });
    const pronunciation = lesson.json().content.parts.find((part: { code: string }) => part.code === "pronunciation");
    for (const entry of pronunciation.content.words.slice(0, 3)) {
      const word = typeof entry === "string" ? entry : entry.word;
      const listened = await app.inject({ method: "POST", url: `/api/v1/lessons/${lessonId}/pronunciation/listens`, headers: { cookie }, payload: { word } });
      expect(listened.statusCode, listened.body).toBe(200);
    }
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("transcribes the recording, grades only the day's item and maps near → retry, then pass → correct", async () => {
    transcribe.mockResolvedValueOnce({ text: "I walk in sales and I am in charge of customer emails.", uncertainWords: ["walk"], usage: {}, provider: "mock-stt", model: "mock-transcribe", latencyMs: 10, durationSeconds: 4 });
    runTask.mockResolvedValueOnce(aiResult({
      audioClear: true, level: "near", feedback: "Bạn nói đúng yêu cầu. Hãy đọc rõ âm /wɜː/ trong từ work.",
      failedPositions: [{ target: "work", kind: "pronunciation", note: "heard as walk" }], usedRequiredWords: []
    }));
    const first = await attempt("speaking", { artifactKey: await recording() });
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json().evidence).toMatchObject({ status: "submitted", aiGrading: "pending", attempts: 1 });

    const progress = await settled("speaking");
    expect(progress.evidence.speaking).toMatchObject({
      status: "wrong_retry", attempts: 1, score: 50,
      feedback: "Bạn nói đúng yêu cầu. Hãy đọc rõ âm /wɜː/ trong từ work.",
      answer: "I walk in sales and I am in charge of customer emails."
    });
    expect(progress.evidence.speaking).not.toHaveProperty("aiGrading");
    expect(progress.completedPartCodes).not.toContain("speaking");
    const [taskId, input, options] = runTask.mock.calls[0]!;
    expect(taskId).toBe("lesson_productive_grading");
    expect(input).toMatchObject({
      mode: "speaking", cefr: "A2", feedbackLanguage: "vi",
      pronunciation: { focus: "/wɜː/", words: [{ word: "work" }, { word: "worker" }, { word: "working" }] },
      response: { text: "I walk in sales and I am in charge of customer emails.", uncertainWords: ["walk"], durationSeconds: 4 }
    });
    expect(options.systemPrompt).toContain("Never penalise a Vietnamese accent");
    const stored = await pool.query<{ status: string; grading: Record<string, unknown> }>(
      "select status, grading from lesson_part_attempts where learner_id = $1 and lesson_id = $2", [DEMO_IDS.learner, lessonId]
    );
    expect(stored.rows[0]).toMatchObject({ status: "wrong_retry", grading: { state: "graded", level: "near", focus: "/wɜː/", failedPositions: [{ target: "work", kind: "pronunciation" }], sttModel: "mock-transcribe" } });
    const runs = await pool.query<{ request_key: string; status: string; model: string }>(
      "select request_key, status, model from ai_runs where user_id = $1 order by request_key", [DEMO_IDS.learner]
    );
    expect(runs.rows.map((row) => [row.status, row.model])).toEqual([["succeeded", "mock-grader"], ["succeeded", "mock-transcribe"]]);

    const reused = await attempt("speaking", { artifactKey: (first.json().evidence as { artifactKey: string }).artifactKey });
    expect(reused.statusCode).toBe(409);
    expect(reused.json()).toEqual({ code: "LESSON_SPEAKING_NEW_RECORDING_REQUIRED" });

    transcribe.mockResolvedValueOnce({ text: "I work in sales and I am in charge of customer emails.", uncertainWords: [], usage: {}, provider: "mock-stt", model: "mock-transcribe", latencyMs: 10 });
    runTask.mockResolvedValueOnce(aiResult({ audioClear: true, level: "pass", feedback: "Bạn đọc rõ từ work.", failedPositions: [], usedRequiredWords: [] }));
    const second = await attempt("speaking", { artifactKey: await recording() });
    expect(second.json().evidence).toMatchObject({ status: "submitted", aiGrading: "pending", attempts: 2 });
    const done = await settled("speaking");
    expect(done.evidence.speaking).toMatchObject({ status: "correct", attempts: 2, score: 100, feedback: "Bạn đọc rõ từ work." });
    expect(done.completedPartCodes).toContain("speaking");
  });

  it("asks for a new recording when the audio is empty, without using an attempt or calling the grader", async () => {
    transcribe.mockResolvedValueOnce({ text: "", uncertainWords: [], usage: {}, provider: "mock-stt", model: "mock-transcribe", latencyMs: 10 });
    await attempt("speaking", { artifactKey: await recording() });
    const progress = await settled("speaking");
    expect(progress.evidence.speaking).toMatchObject({ status: "wrong_retry", attempts: 0, feedback: "Bản ghi chưa nghe rõ hoặc quá ngắn. Hãy ghi âm lại, nói to và rõ hơn." });
    expect(runTask).not.toHaveBeenCalled();
    transcribe.mockResolvedValueOnce({ text: "I work in sales.", uncertainWords: [], usage: {}, provider: "mock-stt", model: "mock-transcribe", latencyMs: 10 });
    runTask.mockResolvedValueOnce(aiResult({ audioClear: true, level: "fail", feedback: "Hãy dùng đủ câu mẫu và đọc rõ từ worker.", failedPositions: [{ target: "worker", kind: "pronunciation", note: "missing" }], usedRequiredWords: [] }));
    const next = await attempt("speaking", { artifactKey: await recording() });
    expect(next.json().evidence.attempts).toBe(1);
    expect((await settled("speaking")).evidence.speaking).toMatchObject({ status: "wrong_retry", attempts: 1, score: 0 });
  });

  it("keeps the recording with the operator, visibly, when AI grading fails", async () => {
    transcribe.mockResolvedValueOnce({ text: "I work in sales and I am in charge of customer emails.", uncertainWords: [], usage: {}, provider: "mock-stt", model: "mock-transcribe", latencyMs: 10 });
    runTask.mockRejectedValueOnce(new AiGatewayError("AI_OUTPUT_INVALID", { issues: [] }));
    await attempt("speaking", { artifactKey: await recording() });
    const progress = await settled("speaking");
    expect(progress.evidence.speaking).toMatchObject({ status: "submitted", aiGrading: "operator" });
    expect(progress.completedPartCodes).toContain("speaking");
    const attemptRow = await pool.query<{ grading: Record<string, unknown> }>("select grading from lesson_part_attempts where learner_id = $1 and lesson_id = $2", [DEMO_IDS.learner, lessonId]);
    expect(attemptRow.rows[0]!.grading).toMatchObject({ state: "operator", code: "AI_OUTPUT_INVALID" });
    const failedRun = await pool.query("select 1 from ai_runs where user_id = $1 and status = 'failed' and error_code = 'AI_OUTPUT_INVALID'", [DEMO_IDS.learner]);
    expect(failedRun.rowCount).toBe(1);
  });

  it("does not queue AI grading when no speech-to-text provider is configured", async () => {
    sttAvailable = false;
    const response = await attempt("speaking", { artifactKey: await recording() });
    expect(response.json().evidence).toMatchObject({ status: "submitted" });
    expect(response.json().evidence).not.toHaveProperty("aiGrading");
    const jobs = await pool.query("select 1 from jobs where kind = 'lesson.productive-grade' and payload->>'learnerId' = $1 and state = 'queued'", [DEMO_IDS.learner]);
    expect(jobs.rowCount).toBe(0);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("grades self-written Writing without speech-to-text", async () => {
    runTask.mockResolvedValueOnce(aiResult({ audioClear: true, level: "pass", feedback: "Câu của bạn rõ nghĩa và dùng đúng từ của bài.", failedPositions: [], usedRequiredWords: [] }));
    const response = await attempt("writing", { answer: "I work in sales. I write customer emails every day." });
    expect(response.json().evidence).toMatchObject({ status: "submitted", aiGrading: "pending" });
    const progress = await settled("writing");
    expect(progress.evidence.writing).toMatchObject({ status: "correct", score: 100, answer: "I work in sales. I write customer emails every day." });
    expect(runTask.mock.calls[0]![1]).toMatchObject({ mode: "writing", response: { text: "I work in sales. I write customer emails every day." } });
    expect(runTask.mock.calls[0]![1]).not.toHaveProperty("pronunciation");
    expect(transcribe).not.toHaveBeenCalled();
  });
});
