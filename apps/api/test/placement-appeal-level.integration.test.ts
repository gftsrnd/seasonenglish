import { randomUUID } from "node:crypto";
import { learnerMonthlyAccess, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/app.js";

// B8-001: an accepted placement appeal moves the learner to the proposed level as a new joiner from the approval date
// (biên bản 30/10 mục 11 & 6): approved on 12/11 → outside November's 75% window → starts on 01/12.
describe("accepted placement appeal changes the level", () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  const month = "2026-11";

  async function setSystemDate(date: string) {
    await pool.query(
      `insert into organization_settings (organization_id, configuration) values ($1, jsonb_build_object('simulatedSystemDate', $2::text))
       on conflict (organization_id) do update set configuration = organization_settings.configuration || excluded.configuration`,
      [DEMO_IDS.organization, date]
    );
  }
  async function operatorCookie() {
    const email = (await pool.query<{ email: string }>("select email from users where id = $1", [DEMO_IDS.operator])).rows[0]?.email;
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password: "test-password" } });
    expect(login.statusCode, login.body).toBe(200);
    return String(login.headers["set-cookie"]).split(";")[0]!;
  }
  async function pendingAppeal(proposedLevel: string) {
    const id = randomUUID();
    await pool.query(
      `insert into appeals (id, attempt_id, learner_id, reason, expires_at, proposed_level)
       values ($1, $2, $3, 'Tôi nghĩ phần nói của tôi xứng đáng mức cao hơn.', now() + interval '3 days', $4)`,
      [id, DEMO_IDS.placementAttempt, DEMO_IDS.learner, proposedLevel]
    );
    return id;
  }
  const level = async () => (await pool.query<{ cefr: string; started: string }>(
    "select cefr, cefr_started_on::text as started from enrollments where learner_id = $1", [DEMO_IDS.learner]
  )).rows[0];

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.operator, await createCredentialHash("test-password")]);
      await client.query("update enrollments set cefr = 'A1', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
      // The level-start trigger stamps the change date; set the original start afterwards.
      await client.query("update enrollments set cefr_started_on = '2026-11-02' where learner_id = $1", [DEMO_IDS.learner]);
      const monthId = randomUUID();
      await client.query(
        "insert into program_months (id, organization_id, month, exam_date, lesson_count, brief_status) values ($1, $2, $3, '2026-11-30', 20, 'approved')",
        [monthId, DEMO_IDS.organization, month]
      );
      for (const cefr of ["A1", "A2"]) {
        await client.query(
          `insert into month_frameworks (id, program_month_id, cefr, status, curriculum_contract, scope_hash, published_at, published_on)
           values ($1, $2, $3, 'approved', '{}'::jsonb, 'scope', now(), '2026-11-02')`,
          [randomUUID(), monthId, cefr]
        );
      }
    } finally { client.release(); }
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("keeps the level when the appeal is rejected", async () => {
    await setSystemDate("2026-11-12");
    const id = await pendingAppeal("A2");
    const response = await app.inject({ method: "POST", url: `/api/v1/assessment-appeals/${id}/decision`, headers: { cookie: await operatorCookie() },
      payload: { status: "rejected", resolution: "Giữ nguyên kết quả sau khi nghe lại bản ghi." } });
    expect(response.statusCode, response.body).toBe(200);
    expect(await level()).toEqual({ cefr: "A1", started: "2026-11-02" });
  });

  it("moves to the proposed level from the approval date and waits for next month after the 75% cut-off", async () => {
    await setSystemDate("2026-11-12");
    const id = await pendingAppeal("A2");
    const response = await app.inject({ method: "POST", url: `/api/v1/assessment-appeals/${id}/decision`, headers: { cookie: await operatorCookie() },
      payload: { status: "accepted", resolution: "Phần nói đạt mức A2." } });
    expect(response.statusCode, response.body).toBe(200);
    expect(await level()).toEqual({ cefr: "A2", started: "2026-11-12" });
    const access = await learnerMonthlyAccess(pool, DEMO_IDS.learner, month);
    expect(access).toMatchObject({ state: "waiting_next_month", startDate: "2026-12-01", cefr: "A2" });
    const audit = await pool.query("select payload from audit_events where action = 'assessment.learner.level_changed' and entity_id = $1", [DEMO_IDS.learner]);
    expect(audit.rows.at(-1)?.payload).toMatchObject({ mode: "direct", targetLevel: "A2", previousLevel: "A1", evidence: `appeal:${id}` });
  });
});
