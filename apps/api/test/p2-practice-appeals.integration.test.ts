import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("P2 weekly-practice appeal lifecycle", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let learnerCookie = "";
  let operatorCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)`,
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.learner, await createPinHash("123456")
        ]
      );
      await client.query("delete from practice_appeals where learner_id = $1", [DEMO_IDS.learner]);
      await client.query(
        "update programs set current_week_override = 1 where id = $1",
        [DEMO_IDS.program]
      );
      await client.query(
        `insert into practice_submissions
           (id, learner_id, program_week_id, status, content, score, feedback, submitted_at, reviewed_at)
         select $1, $2, pw.id, 'reviewed', '{"text":"Weekly practice response"}'::jsonb,
                '{"total":70,"rubric":{"meaning":4,"vocabulary":3,"grammar":3}}'::jsonb,
                '{"source":"ai","message":"Cần xem lại."}'::jsonb, now(), now()
         from program_weeks pw where pw.program_id = $3 and pw.week_number = 1`,
        [DEMO_IDS.practiceSubmission, DEMO_IDS.learner, DEMO_IDS.program]
      );
    } finally { client.release(); }
    await app.ready();
    const learner = await app.inject({
      method: "POST", url: "/api/auth/learner/login",
      payload: { email: "learner@e4s.local", pin: "123456" }
    });
    expect(learner.statusCode, learner.body).toBe(200);
    learnerCookie = String(learner.headers["set-cookie"]).split(";")[0] ?? "";
    const operator = await app.inject({
      method: "POST", url: "/api/auth/staff/login",
      payload: { email: "operator@e4s.local", password: "operator-pass" }
    });
    expect(operator.statusCode, operator.body).toBe(200);
    operatorCookie = String(operator.headers["set-cookie"]).split(";")[0] ?? "";
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("allows one appeal and resolves an accepted appeal with one atomic score update", async () => {
    const appealRequest = {
      method: "POST" as const,
      url: `/api/v1/engagement/practice/${DEMO_IDS.practiceSubmission}/appeals`,
      headers: { cookie: learnerCookie },
      payload: { reason: "Điểm phần ngữ pháp chưa phản ánh đúng bài làm." }
    };
    const created = await app.inject(appealRequest);
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json()).toMatchObject({
      reviewState: "appeal-pending",
      appeal: { submissionId: DEMO_IDS.practiceSubmission, status: "pending" }
    });

    const duplicate = await app.inject(appealRequest);
    expect(duplicate.statusCode, duplicate.body).toBe(409);
    expect(duplicate.json()).toEqual({ code: "PRACTICE_APPEAL_EXISTS" });

    const queue = await app.inject({ method: "GET", url: "/api/v1/content/review", headers: { cookie: operatorCookie } });
    expect(queue.statusCode, queue.body).toBe(200);
    const appeal = queue.json().appeals.find((item: { submissionId?: string }) => item.submissionId === DEMO_IDS.practiceSubmission);
    expect(appeal).toMatchObject({
      kind: "weekly_practice",
      learnerName: expect.any(String),
      status: "pending",
      currentScore: 70
    });

    const missingScore = await app.inject({
      method: "POST", url: `/api/v1/content/review/appeals/${appeal.id}/decision`,
      headers: { cookie: operatorCookie },
      payload: { status: "accepted", resolution: "Chấm lại và điều chỉnh điểm." }
    });
    expect(missingScore.statusCode, missingScore.body).toBe(400);

    const decided = await app.inject({
      method: "POST", url: `/api/v1/content/review/appeals/${appeal.id}/decision`,
      headers: { cookie: operatorCookie },
      payload: { status: "accepted", resolution: "Chấm lại và điều chỉnh điểm.", newScore: 82 }
    });
    expect(decided.statusCode, decided.body).toBe(200);

    const stored = await pool.query<{
      status: string; resolution: string; resolved_by: string; total: string; source: string;
    }>(
      `select pa.status, pa.resolution, pa.resolved_by,
              ps.score->>'total' as total, ps.feedback->>'source' as source
       from practice_appeals pa join practice_submissions ps on ps.id = pa.submission_id
       where pa.id = $1`,
      [appeal.id]
    );
    expect(stored.rows[0]).toMatchObject({
      status: "accepted",
      resolution: "Chấm lại và điều chỉnh điểm.",
      resolved_by: DEMO_IDS.operator,
      total: "82",
      source: "appeal-human"
    });
    const audit = await pool.query<{ count: number }>(
      `select count(*)::int as count from audit_events
       where actor_user_id = $1 and action = 'weekly-practice.appeal.resolved'
         and entity_id = $2`,
      [DEMO_IDS.operator, appeal.id]
    );
    expect(audit.rows[0]?.count).toBe(1);

    const learnerView = await app.inject({
      method: "GET", url: "/api/v1/engagement/practice", headers: { cookie: learnerCookie }
    });
    expect(learnerView.statusCode, learnerView.body).toBe(200);
    expect(learnerView.json()).toMatchObject({
      reviewState: "appeal-decided",
      submission: { score: { total: 82 } },
      appeal: { status: "accepted", resolution: "Chấm lại và điều chỉnh điểm." }
    });

    const repeatedDecision = await app.inject({
      method: "POST", url: `/api/v1/content/review/appeals/${appeal.id}/decision`,
      headers: { cookie: operatorCookie },
      payload: { status: "accepted", resolution: "Không được ghi đè.", newScore: 99 }
    });
    expect(repeatedDecision.statusCode, repeatedDecision.body).toBe(409);
    const unchanged = await pool.query<{ total: string }>(
      "select score->>'total' as total from practice_submissions where id = $1",
      [DEMO_IDS.practiceSubmission]
    );
    expect(unchanged.rows[0]?.total).toBe("82");
  });
});
