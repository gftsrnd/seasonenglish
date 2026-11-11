import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AI_TASKS, createAiService, type AiProviderRequest } from "@e4s/ai";
import { DEMO_IDS, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { buildApi } from "../src/app.js";
import { buildManualMonthlyFinalDraft } from "../src/modules/assessment/monthly-final-builder.js";
import { frameworkRef, monthlyFinalContract } from "./support/monthly-final-fixture.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("productive grading uses the published exam rubric", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const complete = vi.fn(async (_request: AiProviderRequest) => ({
    output: { writingScore: 25, speakingScore: 25, suggestedLevel: "C1", rationale: "Evidence review", monthlyGoal: "Practise updates" },
    usage: {}
  }));
  const runner = createAiService({ registry: AI_TASKS, provider: { name: "controlled", model: "rubric", complete }, loadPrompt: async () => "Grade the response", maxAttempts: 1 });
  const app = buildApi({ pool, secureCookies: false, aiRunner: runner });
  const monthlyAttempt = randomUUID();
  const passCourseAttempt = randomUUID();
  const manualPassCourseAttempt = randomUUID();
  const manualPassCourseLearner = randomUUID();
  let cookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.operator, await createCredentialHash("operator-pass")]);
      const monthlyDefinition = randomUUID();
      const monthlyVersion = randomUUID();
      const blueprint = buildManualMonthlyFinalDraft(monthlyFinalContract("B1"), frameworkRef, new Date("2026-11-20T03:00:00Z"));
      await client.query("insert into assessment_definitions (id, organization_id, assessment_key, kind, title) values ($1, $2, $3, 'final', $4)", [monthlyDefinition, DEMO_IDS.organization, blueprint.key, blueprint.title]);
      await client.query("insert into assessment_versions (id, definition_id, version, status, blueprint) values ($1, $2, 1, 'published', $3)", [monthlyVersion, monthlyDefinition, blueprint]);
      await client.query("update enrollments set cefr = 'C1', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
      await client.query("insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'learner', 'Manual Pass Course QA', 'pass-manual-qa@e4s.local')", [manualPassCourseLearner, DEMO_IDS.organization]);
      await client.query("insert into enrollments (id, program_id, learner_id, cefr, cefr_approved) values ($1, $2, $3, 'C1', true)", [randomUUID(), DEMO_IDS.program, manualPassCourseLearner]);
      await client.query("insert into pass_course_readiness (learner_id, organization_id, cefr_ready) values ($1, $2, true)", [manualPassCourseLearner, DEMO_IDS.organization]);
      for (const [attemptId, versionId, learnerId] of [[monthlyAttempt, monthlyVersion, DEMO_IDS.learner], [passCourseAttempt, DEMO_IDS.passCourseVersion, DEMO_IDS.learner], [manualPassCourseAttempt, DEMO_IDS.passCourseVersion, manualPassCourseLearner]]) {
        await client.query("insert into assessment_attempts (id, assessment_version_id, learner_id, status, submitted_at) values ($1, $2, $3, 'pending_review', now())", [attemptId, versionId, learnerId]);
        await client.query("insert into assessment_scores (id, attempt_id, section, score, source) values ($1, $2, 'listening', 18, 'deterministic'), ($3, $2, 'reading', 19, 'deterministic')", [randomUUID(), attemptId, randomUUID()]);
      }
      await client.query("update assessment_scores set score = 35 where attempt_id = $1 and section = 'reading'", [manualPassCourseAttempt]);
      await client.query("insert into assessment_responses (id, attempt_id, section, task_key, response) values ($1, $2, 'writing', 'W', $3), ($4, $2, 'speaking', 'SB', $5), ($6, $2, 'speaking', 'SA', $7)", [
        randomUUID(), monthlyAttempt, { value: "I can send the report by Friday.", evidenceType: "text" },
        randomUUID(), { value: "File ghi âm đã nộp", evidenceType: "audio", artifactKey: "monthly-voice-audit.wav" },
        randomUUID(), { value: "", evidenceType: "audio", artifactKey: "monthly-audit.wav" }
      ]);
      for (const attemptId of [passCourseAttempt, manualPassCourseAttempt]) {
        for (const [section, keys] of [["writing", ["W1", "W2"]], ["speaking", ["S1", "S2", "S3", "S4"]]] as const) {
          for (const taskKey of keys) {
            await client.query("insert into assessment_responses (id, attempt_id, section, task_key, response) values ($1, $2, $3, $4, $5)", [
              randomUUID(), attemptId, section, taskKey, { value: "I can send the report by Friday.", evidenceType: section === "writing" ? "text" : "transcript" }
            ]);
          }
        }
      }
    } finally { client.release(); }
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "thu.ha.tran@e4s.local", password: "operator-pass" } });
    expect(login.statusCode, login.body).toBe(200);
    cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  const rescore = (attemptId: string, requestId: string) => app.inject({
    method: "POST", url: `/api/v1/assessment-reviews/${attemptId}/rescore`, headers: { cookie }, payload: { requestId }
  });
  const scoreOutput = (componentScores: Array<{ code: string; score: number }>) => ({
    output: { writingScore: 25, speakingScore: 25, suggestedLevel: "C1", rationale: "Evidence review", monthlyGoal: "Practise updates", componentScores },
    usage: {}
  });

  it("grades the monthly Writing rubric and leaves audio-only Speaking criteria for manual review", async () => {
    complete.mockResolvedValueOnce(scoreOutput(["W1","W2","W3","W4","W5"].map(code => ({ code, score: 1 }))));
    const response = await rescore(monthlyAttempt, "monthly-ai");
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      status: "pending_review",
      totalScore: null,
      scores: expect.arrayContaining([{ section: "writing", score: 5, source: "ai", criteria: expect.objectContaining({ pendingSpeakingCriteria: ["S1", "S2", "S3", "S4", "S5"] }) }])
    });
    expect(response.json().scores).not.toContainEqual(expect.objectContaining({ section: "speaking" }));
    expect(complete.mock.calls.at(-1)?.[0].input).toMatchObject({ kind: "final", rubric: expect.arrayContaining([expect.objectContaining({ code: "S1", manualOnly: true, maxScore: 8 })]) });
    expect(complete.mock.calls.at(-1)?.[0].input).toMatchObject({ speaking: expect.arrayContaining([expect.objectContaining({ taskKey: "SB", answer: "" })]) });
  });

  it("saves all monthly rubric criteria through the manual scoring route", async () => {
    const response = await app.inject({
      method: "POST", url: `/api/v1/assessment-reviews/${monthlyAttempt}/manual-score`, headers: { cookie },
      payload: { writingTasks: [], speakingTasks: [], comment: "Đã nghe audio và đọc bài viết", rubricScores: ["W1","W2","W3","W4","W5","S1","S2","S3","S4","S5"].map(code => ({ code, score: 1 })) }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      status: "pending_review", totalScore: 47,
      scores: expect.arrayContaining([expect.objectContaining({ section: "writing", score: 5, source: "human" }), expect.objectContaining({ section: "speaking", score: 5, source: "human" })])
    });
    complete.mockResolvedValueOnce(scoreOutput(["W1","W2","W3","W4","W5"].map(code => ({ code, score: 0 }))));
    const retry = await rescore(monthlyAttempt, "monthly-after-human");
    expect(retry.statusCode, retry.body).toBe(200);
    expect(retry.json()).toMatchObject({
      status: "pending_review", totalScore: 47,
      scores: expect.arrayContaining([expect.objectContaining({ section: "writing", score: 5, source: "human" }), expect.objectContaining({ section: "speaking", score: 5, source: "human" })])
    });
    const decision = await app.inject({ method: "POST", url: `/api/v1/assessment-reviews/${monthlyAttempt}/decision`, headers: { cookie }, payload: { status: "approved", reason: "Đã kiểm tra đủ bốn phần" } });
    expect(decision.statusCode, decision.body).toBe(200);
    expect(decision.json()).toMatchObject({ status: "approved", approvedLevel: null });
  });

  it("rejects an above-rubric Pass Course score and can retry with the blueprint task weights", async () => {
    const rubricScores = [{ code: "W1", score: 7 }, { code: "W2", score: 13 }, ...["S1","S2","S3","S4"].map(code => ({ code, score: 5 }))];
    complete.mockResolvedValueOnce(scoreOutput(rubricScores.map(item => item.code === "W1" ? { ...item, score: 8 } : item)));
    const invalid = await rescore(passCourseAttempt, "pass-ai-invalid");
    expect(invalid.statusCode, invalid.body).toBe(502);
    expect(invalid.json()).toEqual({ code: "AI_OUTPUT_INVALID" });
    complete.mockResolvedValueOnce(scoreOutput(rubricScores));
    const retried = await rescore(passCourseAttempt, "pass-ai-retry");
    expect(retried.statusCode, retried.body).toBe(200);
    expect(retried.json()).toMatchObject({
      status: "pending_review", totalScore: 77,
      scores: expect.arrayContaining([expect.objectContaining({ section: "writing", score: 20, source: "ai" }), expect.objectContaining({ section: "speaking", score: 20, source: "ai" })])
    });
  });

  it("can finish a Pass Course review with AI unavailable", async () => {
    const withoutAi = buildApi({ pool, secureCookies: false });
    try {
      const ai = await withoutAi.inject({ method: "POST", url: `/api/v1/assessment-reviews/${manualPassCourseAttempt}/rescore`, headers: { cookie }, payload: { requestId: "pass-offline" } });
      expect(ai.statusCode, ai.body).toBe(503);
      const manual = await withoutAi.inject({
        method: "POST", url: `/api/v1/assessment-reviews/${manualPassCourseAttempt}/manual-score`, headers: { cookie },
        payload: {
          writingTasks: ["W1","W2"].map(taskKey => ({ taskKey, criteria: { taskCompletion: 4, organization: 4, vocabulary: 4, grammar: 4, workplaceRegister: 4 } })),
          speakingTasks: ["S1","S2","S3","S4"].map(taskKey => ({ taskKey, evidenceType: "audio", criteria: { taskCompletionRelevance: 5, grammarVocabulary: 5, coherenceClarity: 5, interactionProfessionalRegister: 5 } })),
          comment: "Đã chấm tay theo rubric"
        }
      });
      expect(manual.statusCode, manual.body).toBe(200);
      expect(manual.json()).toMatchObject({ status: "pending_review", totalScore: 93 });
      expect(manual.json().scores.find((score: { section: string }) => score.section === "speaking").criteria.tasks.map((task: { evidenceType: string }) => task.evidenceType)).toEqual(["transcript", "transcript", "transcript", "transcript"]);
      const decision = await withoutAi.inject({ method: "POST", url: `/api/v1/assessment-reviews/${manualPassCourseAttempt}/decision`, headers: { cookie }, payload: { status: "approved", reason: "Đạt điều kiện cấp chứng nhận" } });
      expect(decision.statusCode, decision.body).toBe(200);
      expect(decision.json()).toMatchObject({ status: "approved", approvedLevel: null });
      const certificate = await pool.query("select id from pass_course_certificates where attempt_id = $1", [manualPassCourseAttempt]);
      expect(certificate.rowCount).toBe(1);
    } finally {
      await withoutAi.close();
    }
  });
});
