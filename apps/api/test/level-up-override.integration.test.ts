import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levelUpDefinition, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

// Readiness thresholds nobody meets: without the staff exception the learner is never eligible.
const strictLevelUp = '{"days":14,"lessons":0,"firstTry":0,"submission":0,"coach":0,"coachTurns":99,"wrong":100,"minParts":0}';

describe("Staff level-up override (Thi lên mức)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  const otherOrganizationId = randomUUID();
  const otherOperatorId = randomUUID();
  let learnerCookie = "";
  let operatorCookie = "";
  let managerCookie = "";
  let otherOperatorCookie = "";
  const overrideUrl = `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/level-up-override`;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)",
        [
          DEMO_IDS.learner, await createPinHash("123456"),
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
      await client.query("insert into organizations (id, name, slug) values ($1, 'Other org', $2)", [otherOrganizationId, `other-${otherOrganizationId}`]);
      await client.query(
        "insert into users (id, organization_id, role, display_name, email) values ($1, $2, 'operator', 'Other operator', 'other.override.operator@e4s.local')",
        [otherOperatorId, otherOrganizationId]
      );
      await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [otherOperatorId, await createCredentialHash("other-operator-pass")]);
      await client.query(
        `insert into organization_settings (organization_id, configuration)
         values ($1, jsonb_build_object('levelUp', $2::jsonb))
         on conflict (organization_id) do update
         set configuration = jsonb_set(organization_settings.configuration, '{levelUp}', $2::jsonb, true)`,
        [DEMO_IDS.organization, strictLevelUp]
      );
      await client.query("update enrollments set cefr = 'A2', cefr_approved = true where learner_id = $1", [DEMO_IDS.learner]);
      // A published B1 level-up form (test fixture only).
      const definitionId = randomUUID();
      await client.query(
        `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
         values ($1, $2, 'level-up-b1-override-test', 'level_up', 'Đề lên B1 (kiểm thử)')`,
        [definitionId, DEMO_IDS.organization]
      );
      await client.query(
        `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
         values ($1, $2, 1, 'published', $3::jsonb, now())`,
        [randomUUID(), definitionId, JSON.stringify(levelUpDefinition)]
      );
      await client.query(
        `delete from assessment_attempts aa using assessment_versions av, assessment_definitions ad
         where aa.assessment_version_id = av.id and av.definition_id = ad.id and ad.kind = 'level_up' and aa.learner_id = $1`,
        [DEMO_IDS.learner]
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
    managerCookie = await login("/api/auth/staff/login", { email: "quoc.bao.le@e4s.local", password: "manager-pass" });
    otherOperatorCookie = await login("/api/auth/staff/login", { email: "other.override.operator@e4s.local", password: "other-operator-pass" });
  }, 60_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  const readiness = async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/learner/progress", headers: { cookie: learnerCookie } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().levelReadiness as { eligible: boolean; targetLevel: string | null; staffOverride?: boolean };
  };
  const approvedRow = async (cookie = operatorCookie) => {
    const response = await app.inject({ method: "GET", url: "/api/v1/assessment-reviews/overview", headers: { cookie } });
    expect(response.statusCode, response.body).toBe(200);
    return (response.json().approvedLearners as Array<{ learnerId: string; levelUpOverride?: { targetLevel: string; reason: string } | null }>)
      .find((item) => item.learnerId === DEMO_IDS.learner);
  };
  const start = () => app.inject({ method: "POST", url: "/api/v1/assessments/level-up/start", headers: { cookie: learnerCookie }, payload: {} });

  it("is not eligible without the override", async () => {
    expect((await readiness()).eligible).toBe(false);
    expect((await start()).json()).toEqual({ code: "LEVEL_UP_NOT_READY" });
    expect((await approvedRow())?.levelUpOverride ?? null).toBeNull();
  });

  it("allows only operator/manager of the same organisation, and requires a reason", async () => {
    const learner = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: learnerCookie }, payload: { allowed: true, reason: "x" } });
    expect(learner.statusCode).toBe(403);
    const other = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: otherOperatorCookie }, payload: { allowed: true, reason: "x" } });
    expect(other.statusCode, other.body).toBe(404);
    const missingReason = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: operatorCookie }, payload: { allowed: true, reason: "  " } });
    expect(missingReason.statusCode).toBe(400);
    const revokeNone = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: operatorCookie }, payload: { allowed: false } });
    expect(revokeNone.statusCode).toBe(409);
    expect(revokeNone.json()).toEqual({ code: "LEVEL_UP_OVERRIDE_NOT_FOUND" });
    expect((await readiness()).eligible).toBe(false);
  });

  it("grant makes the learner eligible for the next level and lets them start the published level-up form", async () => {
    const granted = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: operatorCookie }, payload: { allowed: true, reason: "Kiểm thử ngoại lệ" } });
    expect(granted.statusCode, granted.body).toBe(200);
    expect(granted.json()).toMatchObject({ learnerId: DEMO_IDS.learner, currentLevel: "A2", override: { targetLevel: "B1", reason: "Kiểm thử ngoại lệ" } });

    expect(await readiness()).toMatchObject({ eligible: true, targetLevel: "B1", staffOverride: true });
    expect((await approvedRow())?.levelUpOverride).toMatchObject({ targetLevel: "B1", reason: "Kiểm thử ngoại lệ" });
    expect((await approvedRow(managerCookie))?.levelUpOverride).toMatchObject({ targetLevel: "B1" });

    const audit = await pool.query<{ actor_user_id: string; payload: { currentLevel: string; targetLevel: string; reason: string } }>(
      "select actor_user_id, payload from audit_events where entity_id = $1 and action = 'assessment.learner.level_up_override_granted'",
      [DEMO_IDS.learner]
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ actor_user_id: DEMO_IDS.operator, payload: { currentLevel: "A2", targetLevel: "B1", reason: "Kiểm thử ngoại lệ" } });

    const started = await start();
    expect(started.statusCode, started.body).toBe(201);
    expect(started.json()).toMatchObject({ definition: { kind: "level-up", targetLevel: "B1" } });
    await pool.query("delete from assessment_attempts where id = $1", [started.json().attempt.id]);
  });

  it("revoke ends eligibility and is audited; a manager may grant again", async () => {
    const revoked = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: operatorCookie }, payload: { allowed: false } });
    expect(revoked.statusCode, revoked.body).toBe(200);
    expect(revoked.json()).toMatchObject({ override: null });
    expect((await readiness()).eligible).toBe(false);
    expect((await approvedRow())?.levelUpOverride ?? null).toBeNull();
    expect((await start()).json()).toEqual({ code: "LEVEL_UP_NOT_READY" });
    const audit = await pool.query("select 1 from audit_events where entity_id = $1 and action = 'assessment.learner.level_up_override_revoked'", [DEMO_IDS.learner]);
    expect(audit.rowCount).toBe(1);

    const managerGrant = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: managerCookie }, payload: { allowed: true, reason: "Quản lý cho thi" } });
    expect(managerGrant.statusCode, managerGrant.body).toBe(200);
    expect((await readiness()).eligible).toBe(true);
  });

  it("is consumed once the level-up attempt is decided", async () => {
    const started = await start();
    expect(started.statusCode, started.body).toBe(201);
    const attemptId = started.json().attempt.id as string;
    await pool.query("update assessment_attempts set status = 'needs_retry', submitted_at = now() where id = $1", [attemptId]);
    await pool.query(
      "insert into assessment_decisions (id, attempt_id, status, reason, decided_by, decided_at) values ($1, $2, 'retry', 'Chưa đạt', $3, now())",
      [randomUUID(), attemptId, DEMO_IDS.operator]
    );
    expect((await readiness()).eligible).toBe(false);
    expect((await approvedRow())?.levelUpOverride ?? null).toBeNull();
    await pool.query("delete from assessment_decisions where attempt_id = $1", [attemptId]);
    await pool.query("delete from assessment_attempts where id = $1", [attemptId]);
    expect((await readiness()).eligible).toBe(true);
  });

  it("is cleared when the learner's level changes", async () => {
    const changed = await app.inject({
      method: "PATCH", url: `/api/v1/assessment-reviews/learners/${DEMO_IDS.learner}/level`, headers: { cookie: operatorCookie },
      payload: { mode: "direct", targetLevel: "B1", reason: "Đổi level", evidence: "Kiểm thử" }
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(await readiness()).toMatchObject({ eligible: false, targetLevel: "B2" });
    expect((await approvedRow())?.levelUpOverride ?? null).toBeNull();
    // A new grant at the new level supersedes the stale one and targets the next level again.
    const regrant = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: operatorCookie }, payload: { allowed: true, reason: "Mức mới" } });
    expect(regrant.json()).toMatchObject({ currentLevel: "B1", override: { targetLevel: "B2" } });
    const open = await pool.query("select count(*)::int as count from level_up_overrides where learner_id = $1 and ended_at is null", [DEMO_IDS.learner]);
    expect(open.rows[0].count).toBe(1);
  });

  it("refuses C1 learners", async () => {
    await pool.query("update enrollments set cefr = 'C1' where learner_id = $1", [DEMO_IDS.learner]);
    const refused = await app.inject({ method: "PUT", url: overrideUrl, headers: { cookie: operatorCookie }, payload: { allowed: true, reason: "x" } });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ code: "LEVEL_UP_OVERRIDE_TOP_LEVEL" });
  });
});
