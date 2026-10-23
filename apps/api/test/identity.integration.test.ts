import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase, resetPublicSchema, seedDemo } from "@e4s/database";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { DEMO_IDS } from "@e4s/test-support";
import { buildApi, createRoleGuard } from "../src/app.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("identity API", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const sentCodes: Array<{ to: string; code: string; purpose: "registration" | "pin_reset" }> = [];
  const app = buildApi({
    pool,
    allowDemoLogin: true,
    secureCookies: false,
    otpSecret: "identity-integration-test-secret",
    identityEmailSender: {
      sendOtp: async (message) => { sentCodes.push(message); }
    }
  });
  app.get("/__test/operator", { preHandler: createRoleGuard(pool, ["operator"]) }, async (request) => request.e4sSession);
  let learnerCookie = "";
  let managerCookie = "";

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
      await seedDemo(client);
      const learnerHash = await createPinHash("123456");
      const operatorHash = await createCredentialHash("staff-pass");
      const managerHash = await createCredentialHash("manager-pass");
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4), ($5, $6)`,
        [DEMO_IDS.learner, learnerHash, DEMO_IDS.operator, operatorHash, DEMO_IDS.manager, managerHash]
      );
    } finally {
      client.release();
    }
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("logs a learner in from the learner path and returns no token or credential", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456", role: "manager" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { id: DEMO_IDS.learner }, role: "learner" });
    expect(response.body).not.toMatch(/token|credentialHash|password/i);
    const setCookie = response.headers["set-cookie"];
    expect(setCookie).toBeTypeOf("string");
    learnerCookie = String(setCookie).split(";")[0] ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it("registers a learner immediately with a six-digit PIN", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: { displayName: "Học viên mới", email: "registered@e4s.local", pin: "654321" }
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json()).toMatchObject({
      user: { displayName: "Học viên mới", email: "registered@e4s.local" },
      role: "learner"
    });
    expect(response.body).not.toMatch(/token|credentialHash|password/i);
    expect(response.headers["set-cookie"]).toMatch(/HttpOnly/i);

    const stored = await pool.query(
      `select u.role, u.status, lp.user_id as profile_id, e.learner_id as enrollment_id
       from users u
       join learner_profiles lp on lp.user_id = u.id
       join enrollments e on e.learner_id = u.id
       join programs p on p.id = e.program_id and p.status = 'active'
       where u.email = $1`,
      ["registered@e4s.local"]
    );
    expect(stored.rows).toEqual([expect.objectContaining({ role: "learner", status: "active", profile_id: expect.any(String), enrollment_id: expect.any(String) })]);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: { displayName: "Tên khác", email: "REGISTERED@e4s.local", pin: "654321" }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ code: "LEARNER_REGISTRATION_EMAIL_EXISTS" });

    await pool.query(
      `insert into users (id, organization_id, role, display_name, email, status)
       values ('00000000-0000-4000-8000-000000000901', $1, 'learner', 'Học viên đã xoá', 'deleted@e4s.local', 'deleted')`,
      [DEMO_IDS.organization]
    );
    const deletedDuplicate = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: { displayName: "Tên mới", email: "DELETED@e4s.local", pin: "654321" }
    });
    expect(deletedDuplicate.statusCode).toBe(409);
    expect(deletedDuplicate.json()).toEqual({ code: "LEARNER_REGISTRATION_EMAIL_DELETED" });

    const deletedLogin = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "deleted@e4s.local", pin: "654321" }
    });
    expect(deletedLogin.statusCode).toBe(403);
    expect(deletedLogin.json()).toEqual({ code: "ACCOUNT_DELETED" });
  });

  it("rejects malformed learner registration input", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/learner/register",
      payload: { displayName: "A1", email: "not-an-email", pin: "12ab" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "INVALID_LEARNER_REGISTRATION" });
  });

  it("rejects an account when it enters through the wrong audience path", async () => {
    const learnerAtStaff = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "minh.anh.nguyen@e4s.local", password: "123456" }
    });
    const staffAtLearner = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "thu.ha.tran@e4s.local", pin: "123456" }
    });

    expect(learnerAtStaff.statusCode).toBe(403);
    expect(staffAtLearner.statusCode).toBe(401);
  });

  it("canonicalizes the login email without changing the audience guard", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "  OPERATOR@E4S.LOCAL  ", password: "staff-pass" }
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ user: { email: "thu.ha.tran@e4s.local" }, role: "operator" });
  });

  it("does not expose the removed demo login", async () => {
    const response = await app.inject({ method: "POST", url: "/api/auth/demo", payload: {} });

    expect(response.statusCode).toBe(404);
  });

  it("resolves and revokes the opaque HttpOnly session", async () => {
    const current = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: learnerCookie } });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ role: "learner" });

    const versionedCurrent = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: learnerCookie } });
    expect(versionedCurrent.statusCode).toBe(200);
    expect(versionedCurrent.json()).toMatchObject({ role: "learner" });

    const logout = await app.inject({ method: "POST", url: "/api/logout", headers: { cookie: learnerCookie } });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: learnerCookie } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("supports the versioned session contract without accepting role assignment", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/sessions",
      payload: { audience: "staff", email: "thu.ha.tran@e4s.local", password: "staff-pass", role: "manager" }
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ role: "operator" });
    const cookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";

    const logout = await app.inject({ method: "DELETE", url: "/api/v1/sessions/current", headers: { cookie } });
    expect(logout.statusCode).toBe(204);
  });

  it("enforces account role on protected API routes", async () => {
    const learnerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    const learnerCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const forbidden = await app.inject({ method: "GET", url: "/__test/operator", headers: { cookie: learnerCookie } });
    expect(forbidden.statusCode).toBe(403);

    const operatorLogin = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "thu.ha.tran@e4s.local", password: "staff-pass" }
    });
    const operatorCookie = String(operatorLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const allowed = await app.inject({ method: "GET", url: "/__test/operator", headers: { cookie: operatorCookie } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ role: "operator" });
  });

  it("keeps independent browser sessions bound to their own accounts", async () => {
    const learnerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    const managerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    const learnerBrowserCookie = String(learnerLogin.headers["set-cookie"]).split(";")[0] ?? "";
    const managerBrowserCookie = String(managerLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const learnerSession = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: learnerBrowserCookie } });
    const managerSession = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: managerBrowserCookie } });

    expect(learnerSession.statusCode).toBe(200);
    expect(learnerSession.json()).toMatchObject({ user: { id: DEMO_IDS.learner }, role: "learner" });
    expect(managerSession.statusCode).toBe(200);
    expect(managerSession.json()).toMatchObject({ user: { id: DEMO_IDS.manager }, role: "manager" });
  });

  it("resets a learner PIN through email OTP, revokes sessions, and records a manager audit notice", async () => {
    const oldLogin = await app.inject({
      method: "POST",
      url: "/api/auth/learner/login",
      payload: { email: "minh.anh.nguyen@e4s.local", pin: "123456" }
    });
    const oldCookie = String(oldLogin.headers["set-cookie"]).split(";")[0] ?? "";

    const started = await app.inject({
      method: "POST",
      url: "/api/auth/learner/pin-reset/start",
      payload: { email: "minh.anh.nguyen@e4s.local" }
    });
    expect(started.statusCode).toBe(202);
    const challengeId = started.json().challengeId as string;
    const delivered = sentCodes.at(-1);
    expect(delivered).toMatchObject({ to: "minh.anh.nguyen@e4s.local", purpose: "pin_reset" });

    const verified = await app.inject({
      method: "POST",
      url: "/api/auth/learner/pin-reset/verify",
      payload: { challengeId, code: delivered?.code }
    });
    expect(verified.statusCode, verified.body).toBe(200);

    const completed = await app.inject({
      method: "POST",
      url: "/api/auth/learner/pin-reset/complete",
      payload: { resetToken: verified.json().resetToken, pin: "789012" }
    });
    expect(completed.statusCode, completed.body).toBe(200);

    const oldSession = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: oldCookie } });
    expect(oldSession.statusCode).toBe(401);
    const newLogin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "minh.anh.nguyen@e4s.local", pin: "789012" } });
    expect(newLogin.statusCode).toBe(200);

    const notice = await pool.query(
      "select status, note from manager_pin_reports where subject_user_id = $1 order by created_at desc limit 1",
      [DEMO_IDS.learner]
    );
    expect(notice.rows[0]).toMatchObject({ status: "done", note: expect.stringContaining("xác minh email") });
  });

  it("persists the signed-in staff avatar and returns it with the session", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      payload: { email: "quoc.bao.le@e4s.local", password: "manager-pass" }
    });
    managerCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";

    const saved = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/avatar",
      headers: { cookie: managerCookie },
      payload: { acc: "leaf", color: "olive", bg: 2 }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ user: { avatar: { acc: "leaf", color: "olive", bg: 2 } }, role: "manager" });

    const current = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: managerCookie } });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({ user: { avatar: { acc: "leaf", color: "olive", bg: 2 } } });
  });

  it("rejects invalid avatar values", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/avatar",
      headers: { cookie: managerCookie },
      payload: { acc: "rocket", color: "olive", bg: 99 }
    });
    expect(response.statusCode).toBe(400);
  });
});
