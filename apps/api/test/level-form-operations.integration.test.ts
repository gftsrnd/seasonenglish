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
    await pool.query("update assessment_versions set status = 'published' where id = $1", [DEMO_IDS.levelUpVersion]);
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
    expect(managerDelete.statusCode).toBe(403);
  });

  it("allows Operator to edit an unused draft and keeps Manager read-only", async () => {
    await pool.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint)
       values ($1, $2, 2, 'draft', $3::jsonb)`,
      [draftVersionId, DEMO_IDS.levelUpDefinition, JSON.stringify(levelUpDefinition)]
    );
    const payload = {
      title: "Đề B1 đã chỉnh",
      sections: levelUpDefinition.sections.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({ ...group, tasks: group.tasks.map((task) => ({ ...task, prompt: `${task.prompt} (đã sửa)` })) }))
      }))
    };

    const managerUpdate = await app.inject({ method: "PUT", url: `/api/v1/assessment-level-forms/${draftVersionId}`, headers: { cookie: managerCookie }, payload });
    expect(managerUpdate.statusCode).toBe(403);

    const operatorUpdate = await app.inject({ method: "PUT", url: `/api/v1/assessment-level-forms/${draftVersionId}`, headers: { cookie: operatorCookie }, payload });
    expect(operatorUpdate.statusCode, operatorUpdate.body).toBe(200);
    expect(operatorUpdate.json()).toMatchObject({ title: "Đề B1 đã chỉnh", status: "draft" });
    expect(operatorUpdate.json().sections[0].groups[0].tasks[0].prompt).toMatch(/đã sửa/);
  });

  it("keeps a listening draft unpublished until every listening group has a real audio source", async () => {
    const withoutAudio = structuredClone(levelUpDefinition);
    for (const group of withoutAudio.sections.find((section) => section.code === "listening")?.groups ?? []) {
      if (group.stimulus?.type === "audio_script") {
        const { audioSrc: _audioSrc, ...stimulus } = group.stimulus;
        group.stimulus = stimulus;
      }
    }
    await pool.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint)
       values ($1, $2, 2, 'draft', $3::jsonb)`,
      [draftVersionId, DEMO_IDS.levelUpDefinition, JSON.stringify(withoutAudio)]
    );

    const detail = await app.inject({ method: "GET", url: `/api/v1/assessment-level-forms/${draftVersionId}`, headers: { cookie: operatorCookie } });
    expect(detail.json().warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_audio", severity: "error" })]));

    const blocked = await app.inject({ method: "POST", url: `/api/v1/assessment-level-forms/${draftVersionId}/publication`, headers: { cookie: operatorCookie } });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json()).toEqual({ code: "LEVEL_FORM_AUDIO_REQUIRED" });

    const withAudio = structuredClone(levelUpDefinition);
    for (const group of withAudio.sections.find((section) => section.code === "listening")?.groups ?? []) {
      group.stimulus = group.stimulus?.type === "audio_script"
        ? { ...group.stimulus, audioSrc: "/media/audio/level-up-b1.ogg" }
        : { type: "audio_script", audioSrc: "/media/audio/level-up-b1.ogg", lines: [{ speaker: "Narrator", text: group.instruction }] };
    }
    await pool.query("update assessment_versions set blueprint = $2::jsonb where id = $1", [draftVersionId, JSON.stringify(withAudio)]);
    const published = await app.inject({ method: "POST", url: `/api/v1/assessment-level-forms/${draftVersionId}/publication`, headers: { cookie: operatorCookie } });
    expect(published.statusCode, published.body).toBe(200);
    expect(published.json()).toMatchObject({ versionId: draftVersionId, status: "published" });
  });

  it("creates a new editable draft from a published form without changing published history", async () => {
    const copied = await app.inject({
      method: "POST", url: `/api/v1/assessment-level-forms/${DEMO_IDS.levelUpVersion}/draft`, headers: { cookie: operatorCookie }
    });
    expect(copied.statusCode, copied.body).toBe(201);
    expect(copied.json()).toMatchObject({ status: "draft", targetLevel: "B1", title: expect.any(String) });
    expect(copied.json().versionId).not.toBe(DEMO_IDS.levelUpVersion);
    expect(copied.json().sections).toHaveLength(4);

    const published = await app.inject({ method: "GET", url: `/api/v1/assessment-level-forms/${DEMO_IDS.levelUpVersion}`, headers: { cookie: operatorCookie } });
    expect(published.json()).toMatchObject({ status: "published" });
  });
});
