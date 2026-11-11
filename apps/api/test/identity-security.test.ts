import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createCredentialHash, createPinHash } from "@e4s/domain/identity";
import { createRoleGuard } from "../src/modules/identity/policy.js";
import type { IdentityEmailSender } from "../src/modules/identity/email.js";
import { registerIdentityRoutes } from "../src/modules/identity/routes.js";

type Account = { id: string; display_name: string; email: string; role: "learner" | "operator" | "manager"; status: "active" | "disabled"; credential_hash: string };

function identityPool(account: Account, courseCompleted = false) {
  let failedPinAttempts = 0;
  let pinLockedUntil: Date | null = null;
  const sessions: Array<{ tokenHash: string; expiresAt: Date }> = [];
  const pool = {
    connect: async () => ({ query: pool.query, release: () => {} }),
    query: vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("from users u join user_credentials c")) {
        const includeDisabled = sql.includes("'disabled'");
        const accountIsEligible = account.status === "active" || (includeDisabled && account.status === "disabled");
        return { rowCount: accountIsEligible ? 1 : 0, rows: accountIsEligible ? [{ ...account, failed_pin_attempts: failedPinAttempts, pin_locked_until: pinLockedUntil }] : [] };
      }
      if (sql.includes("from users") && sql.includes("where lower(email) = lower($1)")) {
        const matches = String(parameters[0]).toLowerCase() === account.email;
        const eligible = matches && (!sql.includes("for update") || (account.role === (parameters[1] ?? "operator") && account.status === "active"));
        return { rowCount: eligible ? 1 : 0, rows: eligible ? [{ ...account, organization_id: "org-1" }] : [] };
      }
      if (sql.includes("set failed_pin_attempts") && sql.includes("returning")) {
        if (pinLockedUntil && pinLockedUntil > new Date()) return { rowCount: 0, rows: [] };
        failedPinAttempts = pinLockedUntil && pinLockedUntil <= new Date() ? 1 : failedPinAttempts + 1;
        pinLockedUntil = failedPinAttempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
        return { rowCount: 1, rows: [{ failed_pin_attempts: failedPinAttempts, pin_locked_until: pinLockedUntil }] };
      }
      if (sql.includes("set failed_pin_attempts = 0")) {
        failedPinAttempts = 0;
        pinLockedUntil = null;
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("insert into sessions")) {
        sessions.push({ tokenHash: String(parameters[2]), expiresAt: parameters[3] as Date });
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes("from pass_course_certificates")) return { rowCount: courseCompleted ? 1 : 0, rows: [] };
      if (sql.includes("from sessions s join users u")) {
        const session = sessions.find((item) => item.tokenHash === parameters[0] && item.expiresAt > new Date());
        const allowDisabled = sql.includes("status = 'disabled'");
        const visible = session && (account.status === "active" || (allowDisabled && account.status === "disabled"));
        return { rowCount: visible ? 1 : 0, rows: visible ? [{ session_id: "session-1", expires_at: session.expiresAt, ...account }] : [] };
      }
      return { rowCount: 1, rows: [] };
    })
  };
  return pool;
}

async function makeApp(pool: ReturnType<typeof identityPool>, emailSender?: IdentityEmailSender) {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  registerIdentityRoutes(app, { pool: pool as unknown as Pool, secureCookies: false, otpSecret: "test-secret", ...(emailSender ? { emailSender } : {}) });
  app.get("/__test/learner", { preHandler: createRoleGuard(pool as unknown as Pool, ["learner"]) }, async () => ({ ok: true }));
  await app.ready();
  return app;
}

afterEach(() => vi.useRealTimers());

describe("learner login protection", () => {
  it("locks the account for fifteen minutes after five consecutive wrong PINs", async () => {
    const credentialHash = await createPinHash("123456");
    const pool = identityPool({ id: "learner-1", display_name: "Học viên Demo", email: "learner@example.test", role: "learner", status: "active", credential_hash: credentialHash });
    const app = await makeApp(pool);
    try {
      const responses = [];
      const firstAttemptAt = Date.now();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        responses.push(await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@example.test", pin: "000000" } }));
      }
      expect(responses.slice(0, 4).map((response) => response.statusCode)).toEqual([401, 401, 401, 401]);
      expect(responses[4]?.statusCode).toBe(423);
      const lockout = responses[4]?.json() as { code: string; lockedUntil: string };
      expect(lockout).toMatchObject({ code: "PIN_LOGIN_LOCKED", lockedUntil: expect.any(String) });
      expect(new Date(lockout.lockedUntil).getTime()).toBeGreaterThanOrEqual(firstAttemptAt + 15 * 60_000);
      expect(new Date(lockout.lockedUntil).getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60_000);
      const blockedCorrectPin = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@example.test", pin: "123456" } });
      expect(blockedCorrectPin.statusCode).toBe(423);
    } finally { await app.close(); }
  });

  it("resets the consecutive failure count after a correct PIN", async () => {
    const credentialHash = await createPinHash("123456");
    const pool = identityPool({ id: "learner-1", display_name: "Học viên Demo", email: "learner@example.test", role: "learner", status: "active", credential_hash: credentialHash });
    const app = await makeApp(pool);
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@example.test", pin: "000000" } });
      }
      const success = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@example.test", pin: "123456" } });
      expect(success.statusCode).toBe(200);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@example.test", pin: "000000" } });
        expect(response.statusCode).toBe(401);
      }
    } finally { await app.close(); }
  });

  it("allows a disabled learner to sign in to the lock screen but blocks learner APIs", async () => {
    const credentialHash = await createPinHash("123456");
    const pool = identityPool({ id: "learner-1", display_name: "Học viên Demo", email: "learner@example.test", role: "learner", status: "disabled", credential_hash: credentialHash });
    const app = await makeApp(pool);
    try {
      const login = await app.inject({ method: "POST", url: "/api/auth/learner/login", payload: { email: "learner@example.test", pin: "123456" } });
      expect(login.statusCode).toBe(200);
      expect(login.json()).toMatchObject({ role: "learner", accountStatus: "disabled" });
      const sessionCookie = String(login.headers["set-cookie"]).split(";")[0] ?? "";
      const currentSession = await app.inject({ method: "GET", url: "/api/session", headers: { cookie: sessionCookie } });
      expect(currentSession.statusCode).toBe(200);
      expect(currentSession.json()).toMatchObject({ accountStatus: "disabled" });
      const learnerApi = await app.inject({ method: "GET", url: "/__test/learner", headers: { cookie: sessionCookie } });
      expect(learnerApi.statusCode).toBe(401);
    } finally { await app.close(); }
  });
});

it("sends the learner's PIN reset code by email", async () => {
  const email = "learner@example.test";
  const pool = identityPool({ id: "learner-1", display_name: "Học viên Demo", email, role: "learner", status: "active", credential_hash: "" });
  const sendOtp = vi.fn(async () => {});
  const app = await makeApp(pool, { sendOtp });
  try {
    const response = await app.inject({ method: "POST", url: "/api/auth/learner/pin-reset/start", payload: { email } });
    expect(response.statusCode).toBe(202);
    expect(sendOtp).toHaveBeenCalledExactlyOnceWith({ to: email, code: expect.stringMatching(/^\d{6}$/), purpose: "pin_reset" });
    expect(pool.query.mock.calls.some(([sql]) => sql.includes("insert into manager_pin_reports"))).toBe(false);
  } finally { await app.close(); }
});

it("refuses a second PIN reset code for the same email within 60 seconds (Gửi lại mã)", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T08:00:00Z"));
  const email = "learner@example.test";
  const pool = identityPool({ id: "learner-1", display_name: "Học viên Demo", email, role: "learner", status: "active", credential_hash: "" });
  // In-memory auth_challenges: the route's per-email interval query reads these rows.
  const challenges: Array<{ email: string; createdAt: number }> = [];
  const baseQuery = pool.query.getMockImplementation()!;
  pool.query.mockImplementation((async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes("insert into auth_challenges")) challenges.push({ email: String(parameters[1]).toLowerCase(), createdAt: Date.now() });
    if (sql.includes("from auth_challenges") && sql.includes("make_interval")) {
      const intervalMs = Number(parameters[1]) * 1_000;
      const latest = challenges.filter((item) => item.email === String(parameters[0]).toLowerCase() && item.createdAt > Date.now() - intervalMs).at(-1);
      return latest ? { rowCount: 1, rows: [{ retry_after: Math.ceil((latest.createdAt + intervalMs - Date.now()) / 1_000) }] } : { rowCount: 0, rows: [] };
    }
    return baseQuery(sql, parameters);
  }) as typeof baseQuery);
  const sendOtp = vi.fn(async () => {});
  const app = await makeApp(pool, { sendOtp });
  try {
    const start = () => app.inject({ method: "POST", url: "/api/auth/learner/pin-reset/start", payload: { email } });
    expect((await start()).statusCode).toBe(202);
    vi.setSystemTime(new Date("2026-11-11T08:00:15Z"));
    const tooSoon = await start();
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json()).toEqual({ code: "PIN_RESET_RESEND_TOO_SOON", retryAfterSeconds: 45 });
    expect(tooSoon.headers["retry-after"]).toBe("45");
    expect(sendOtp).toHaveBeenCalledTimes(1);
    // Another email is not blocked by this one.
    expect((await app.inject({ method: "POST", url: "/api/auth/learner/pin-reset/start", payload: { email: "other@example.test" } })).statusCode).toBe(202);
    vi.setSystemTime(new Date("2026-11-11T08:01:01Z"));
    expect((await start()).statusCode).toBe(202);
    expect(sendOtp).toHaveBeenCalledTimes(2);
  } finally { await app.close(); }
});

it.each(["manager", "operator"] as const)("signs in %s with only email and password", async (role) => {
  const email = "staff@example.test";
  const password = "Test-password-89";
  const pool = identityPool({ id: "staff-1", display_name: "Nhân sự", email, role, status: "active", credential_hash: await createCredentialHash(password) });
  const app = await makeApp(pool);
  try {
    const login = await app.inject({ method: "POST", url: "/api/auth/staff/login", payload: { email, password } });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ role });
    expect(login.cookies.some(({ name }) => name === "e4s_session")).toBe(true);
  } finally { await app.close(); }
});

it.each(["manager", "operator", "learner"] as const)("gives a generic recovery response for %s", async (role) => {
  const email = "user@example.test";
  const pool = identityPool({ id: "user-1", display_name: "Người dùng", email, role, status: "active", credential_hash: "" });
  const sendOtp = vi.fn(async () => {});
  const app = await makeApp(pool, { sendOtp });
  try {
    for (const address of [email, "unknown@example.test"]) {
      const response = await app.inject({ method: "POST", url: "/api/auth/staff/password-help", payload: { email: address } });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ requested: true });
      expect(response.cookies).toHaveLength(0);
    }
    const reports = pool.query.mock.calls.filter(([sql]) => sql.includes("insert into manager_pin_reports"));
    expect(reports).toHaveLength(role === "learner" ? 0 : 1);
    expect(sendOtp).not.toHaveBeenCalled();
  } finally { await app.close(); }
});
