import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
if (new URL(databaseUrl).pathname !== "/e4s_test") throw new Error("Expected a disposable test database.");
const pool = new Pool({ connectionString: databaseUrl });
const app = buildApi({ pool, secureCookies: false });
const ids = { complaint: randomUUID(), pending: randomUUID(), foreign: randomUUID(), lesson: randomUUID(), framework: randomUUID() };
let cookie: string;

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
    const learner = randomUUID();
    const otherOrg = randomUUID();
    const otherLearner = randomUUID();
    await client.query("insert into organizations (id, name, slug) values ($1, 'Other org', 'manager-history-test')", [otherOrg]);
    await client.query("insert into users (id, organization_id, role, display_name) values ($1, $2, 'learner', 'History test learner'), ($3, $4, 'learner', 'Other learner')", [learner, DEMO_IDS.organization, otherLearner, otherOrg]);
    await client.query(
      `insert into learner_complaints (id, organization_id, learner_id, kind, reason, status, resolution, resolved_at)
       values ($1, $4, $5, 'attendance', 'Handled complaint', 'approved', 'Decision retained', now()),
              ($2, $4, $5, 'attendance', 'Pending complaint', 'pending', null, null),
              ($3, $6, $7, 'attendance', 'Other organization', 'rejected', 'Other decision', now())`,
      [ids.complaint, ids.pending, ids.foreign, DEMO_IDS.organization, learner, otherOrg, otherLearner]
    );
    const month = randomUUID();
    const framework = randomUUID();
    const lesson = randomUUID();
    await client.query("insert into program_months (id, organization_id, month, exam_date, lesson_count) values ($1, $2, '2030-01', '2030-01-31', 1)", [month, DEMO_IDS.organization]);
    await client.query("insert into month_frameworks (id, program_month_id, cefr) values ($1, $2, 'A1')", [framework, month]);
    await client.query("insert into month_lessons (id, framework_id, lesson_number, lesson_date, scope_hash) values ($1, $2, 1, '2030-01-02', 'history-test')", [lesson, framework]);
    await client.query("insert into month_lesson_corrections (id, month_lesson_id, requested_by, reason, status, decision_reason, decided_at) values ($1, $2, $3, 'Published lesson correction', 'published', 'Decision retained', now())", [ids.lesson, lesson, DEMO_IDS.manager]);
    await client.query("insert into month_framework_reopen_requests (id, framework_id, framework_version, requested_by, reason, status, decision_reason, decided_at) values ($1, $2, 1, $3, 'Monthly resources correction', 'rejected', 'Decision retained', now())", [ids.framework, framework, DEMO_IDS.manager]);
    await client.query("insert into user_credentials (user_id, credential_hash) values ($1, $2)", [DEMO_IDS.manager, await createCredentialHash("test-manager-pw")]);
  } finally {
    client.release();
  }
  const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email: "quoc.bao.le@e4s.local", password: "test-manager-pw" } });
  expect(login.statusCode).toBe(200);
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
}, 30_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

function archive(kind: "complaint" | "reopen", id: string, archived: boolean, authenticated = true) {
  return app.inject({
    method: "PATCH",
    url: `/api/v1/manager/request-history/${kind}/${id}`,
    headers: authenticated ? { cookie } : {},
    payload: { archived }
  });
}

it("archives and restores each handled request without changing its decision", async () => {
  for (const [kind, id, status, decisionKey] of [
    ["complaint", ids.complaint, "approved", "resolution"],
    ["reopen", ids.lesson, "approved", "decisionReason"],
    ["reopen", ids.framework, "rejected", "decisionReason"]
  ] as const) {
    const list = async () => {
      const path = kind === "complaint" ? "complaints" : "reopen-requests";
      const response = await app.inject({ method: "GET", url: `/api/v1/manager/${path}`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      return (kind === "complaint" ? response.json().complaints : response.json().requests).find((item: { id: string }) => item.id === id);
    };
    expect((await archive(kind, id, true)).statusCode).toBe(204);
    expect(await list()).toMatchObject({ status, [decisionKey]: "Decision retained", archivedAt: expect.any(String) });
    expect((await archive(kind, id, false)).statusCode).toBe(204);
    expect(await list()).toMatchObject({ status, [decisionKey]: "Decision retained", archivedAt: null });
    const audit = await pool.query("select action, actor_user_id from audit_events where entity_id = $1 order by created_at", [id]);
    expect(audit.rows).toEqual(["archived", "restored"].map(action => ({ action: `manager.request_${action}`, actor_user_id: DEMO_IDS.manager })));
  }
});

it("refuses pending requests, other organizations, and unauthenticated callers", async () => {
  expect((await archive("complaint", ids.pending, true)).statusCode).toBe(409);
  expect((await archive("complaint", ids.foreign, true)).statusCode).toBe(409);
  expect((await archive("complaint", ids.complaint, true, false)).statusCode).toBe(401);
});


it("removes handled items from both Manager history lists while retaining decisions", async () => {
  const remove = (kind: string, id: string) => app.inject({
    method: "DELETE", url: `/api/v1/manager/request-history/${kind}/${id}`, headers: { cookie }
  });
  expect((await remove("complaint", ids.pending)).statusCode).toBe(409);
  expect((await remove("complaint", ids.foreign)).statusCode).toBe(409);
  expect((await archive("reopen", ids.framework, true)).statusCode).toBe(204);
  expect((await remove("complaint", ids.complaint)).statusCode).toBe(204);
  expect((await remove("reopen", ids.lesson)).statusCode).toBe(204);
  expect((await remove("reopen", ids.framework)).statusCode).toBe(204);
  const complaints = await app.inject({ method: "GET", url: "/api/v1/manager/complaints", headers: { cookie } });
  const requests = await app.inject({ method: "GET", url: "/api/v1/manager/reopen-requests", headers: { cookie } });
  expect(complaints.statusCode).toBe(200);
  expect(requests.statusCode).toBe(200);
  expect(complaints.json().complaints.map((item: { id: string }) => item.id)).not.toContain(ids.complaint);
  expect(requests.json().requests.map((item: { id: string }) => item.id)).not.toContain(ids.framework);
  expect(requests.json().requests.map((item: { id: string }) => item.id)).not.toContain(ids.lesson);
  expect((await archive("complaint", ids.complaint, false)).statusCode).toBe(409);
  const retained = await pool.query("select status, resolution from learner_complaints where id = $1", [ids.complaint]);
  expect(retained.rows).toEqual([{ status: "approved", resolution: "Decision retained" }]);
  const audit = await pool.query("select count(*)::int as count from audit_events where action = 'manager.request_deleted' and entity_id = any($1::uuid[])", [[ids.complaint, ids.lesson, ids.framework]]);
  expect(audit.rows[0]?.count).toBe(3);
});
