import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { levelUpDefinition, migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const draftVersionId = "00000000-0000-4000-8000-000000000901";
const inUseVersionId = "00000000-0000-4000-8000-000000000902";
const inUseAttemptId = "00000000-0000-4000-8000-000000000903";

describe("level-form preview/version/delete API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  let operatorCookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      await client.query(
        "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
        [
          DEMO_IDS.operator, await createCredentialHash("operator-pass"),
          DEMO_IDS.manager, await createCredentialHash("manager-pass")
        ]
      );
    } finally { client.release(); }
    await app.ready();
    const login = async (email: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
      expect(response.statusCode, response.body).toBe(200);
      return String(response.headers["set-cookie"]).split(";")[0] ?? "";
    };
    operatorCookie = await login("thu.ha.tran@e4s.local", "operator-pass");
    managerCookie = await login("quoc.bao.le@e4s.local", "manager-pass");
  }, 30_000);

  beforeEach(async () => {
    await pool.query("delete from assessment_attempts where id = $1", [inUseAttemptId]);
    await pool.query("delete from assessment_versions where id in ($1, $2)", [draftVersionId, inUseVersionId]);
  });

  afterAll(async () => { await app.close(); await pool.end(); });

  it("returns all four sections, answer keys, warnings and version history to both staff roles", async () => {
    const operator = await app.inject({
      method: "GET", url: `/api/v1/assessment-level-forms/${DEMO_IDS.levelUpVersion}`,
      headers: { cookie: operatorCookie }
    });
    expect(operator.statusCode, operator.body).toBe(200);
    expect(operator.json()).toMatchObject({
      versionId: DEMO_IDS.levelUpVersion,
      targetLevel: "B1",
      status: "published",
      deletable: false,
      deleteReason: "Đề đã duyệt/phát hành.",
      sections: expect.arrayContaining([
        expect.objectContaining({ code: "listening", groups: expect.any(Array) }),
        expect.objectContaining({ code: "reading", groups: expect.any(Array) }),
        expect.objectContaining({ code: "writing", groups: expect.any(Array) }),
        expect.objectContaining({ code: "speaking", groups: expect.any(Array) })
      ]),
      versions: expect.arrayContaining([expect.objectContaining({ versionId: DEMO_IDS.levelUpVersion, status: "published" })])
    });
    const firstTask = operator.json().sections[0].groups[0].tasks[0];
    expect(firstTask).toHaveProperty("correctAnswer");

    const manager = await app.inject({
      method: "GET", url: "/api/v1/assessment-level-forms/B1/versions", headers: { cookie: managerCookie }
    });
    expect(manager.statusCode, manager.body).toBe(200);
    expect(manager.json()).toEqual(expect.arrayContaining([expect.objectContaining({ versionId: DEMO_IDS.levelUpVersion, status: "published" })]));
  });

  it("deletes only an unused draft and blocks in-use drafts", async () => {
    await pool.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint)
       values ($1, $2, 2, 'draft', $3::jsonb)`,
      [draftVersionId, DEMO_IDS.levelUpDefinition, JSON.stringify(levelUpDefinition)]
    );
    const draft = await app.inject({
      method: "GET", url: `/api/v1/assessment-level-forms/${draftVersionId}`, headers: { cookie: operatorCookie }
    });
    expect(draft.statusCode, draft.body).toBe(200);
    expect(draft.json()).toMatchObject({ status: "draft", deletable: true, deleteReason: null });

    const deleted = await app.inject({
      method: "DELETE", url: `/api/v1/assessment-level-forms/${draftVersionId}`, headers: { cookie: operatorCookie }
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json()).toEqual({ deleted: true, versionId: draftVersionId });

    await pool.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint)
       values ($1, $2, 3, 'draft', $3::jsonb)`,
      [inUseVersionId, DEMO_IDS.levelUpDefinition, JSON.stringify(levelUpDefinition)]
    );
    await pool.query(
      `insert into assessment_attempts (id, assessment_version_id, learner_id, status, current_section)
       values ($1, $2, $3, 'in_progress', 'listening')`,
      [inUseAttemptId, inUseVersionId, DEMO_IDS.learner]
    );
    const inUse = await app.inject({
      method: "DELETE", url: `/api/v1/assessment-level-forms/${inUseVersionId}`, headers: { cookie: operatorCookie }
    });
    expect(inUse.statusCode, inUse.body).toBe(409);
    expect(inUse.json()).toEqual({ code: "LEVEL_FORM_IN_USE" });

    const managerDelete = await app.inject({
      method: "DELETE", url: `/api/v1/assessment-level-forms/${inUseVersionId}`, headers: { cookie: managerCookie }
    });
    expect(managerDelete.statusCode).toBe(409);
    expect(managerDelete.json()).toEqual({ code: "LEVEL_FORM_IN_USE" });
  });
});
