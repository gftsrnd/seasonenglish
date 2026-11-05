import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createPinHash } from "@e4s/domain/identity";
import { createRoleGuard } from "../src/modules/identity/policy.js";
import { registerIdentityRoutes } from "../src/modules/identity/routes.js";

type Account = { id: string; display_name: string; email: string; role: "learner"; status: "active" | "disabled"; credential_hash: string };

function identityPool(account: Account) {
  let failedPinAttempts = 0;
  let pinLockedUntil: Date | null = null;
  const sessions: Array<{ tokenHash: string; expiresAt: Date }> = [];
  const pool = {
    query: vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("from users u join user_credentials c")) {
        const includeDisabled = sql.includes("'disabled'");
        const accountIsEligible = account.status === "active" || (includeDisabled && account.status === "disabled");
        return { rowCount: accountIsEligible ? 1 : 0, rows: accountIsEligible ? [{ ...account, failed_pin_attempts: failedPinAttempts, pin_locked_until: pinLockedUntil }] : [] };
      }
      if (sql.includes("from users") && sql.includes("where lower(email) = lower($1)")) {
        return { rowCount: 1, rows: [{ id: account.id, display_name: account.display_name, email: account.email, role: account.role, status: account.status }] };
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

async function makeApp(pool: ReturnType<typeof identityPool>) {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  registerIdentityRoutes(app, { pool: pool as unknown as Pool, secureCookies: false, otpSecret: "test-secret" });
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
