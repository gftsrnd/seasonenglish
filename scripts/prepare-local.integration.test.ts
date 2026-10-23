import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildApi } from "../apps/api/src/app.js";
import { migrateDatabase, resetPublicSchema } from "../packages/database/src/index.js";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("local demo fixture preparation", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const app = buildApi({ pool, allowDemoLogin: true, secureCookies: false });
  const credentials = [
    ["minh.anh.nguyen@e4s.local", "246810", "learner", "pin"],
    ["thu.ha.tran@e4s.local", "staff-pass", "operator", "password"],
    ["quoc.bao.le@e4s.local", "manager-pass", "manager", "password"]
  ] as const;

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
    } finally {
      client.release();
    }
    await execFileAsync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/prepare-local.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl }
    });
    await app.ready();
  }, 30_000);

  afterAll(async () => { await app.close(); await pool.end(); });

  it("creates active credentials for every seeded role account", async () => {
    for (const [email, secret, role, credentialType] of credentials) {
      const account = await pool.query<{ role: string; status: string }>(
        "select role, status from users where email = $1",
        [email]
      );
      expect(account.rows[0]).toEqual({ role, status: "active" });

      const credential = await pool.query(
        "select 1 from user_credentials c join users u on u.id = c.user_id where u.email = $1",
        [email]
      );
      expect(credential.rowCount).toBe(1);

      const audience = role === "learner" ? "learner" : "staff";
      const login = await app.inject({
        method: "POST",
        url: `/api/auth/${audience}/login`,
        payload: credentialType === "pin" ? { email, pin: secret } : { email, password: secret }
      });
      expect(login.statusCode, login.body).toBe(200);
      expect(login.json()).toMatchObject({ role });
      const setCookie = String(login.headers["set-cookie"] ?? "");
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      const cookie = setCookie.split(";")[0] ?? "";

      const session = await app.inject({ method: "GET", url: "/api/session", headers: { cookie } });
      expect(session.statusCode, session.body).toBe(200);
      expect(session.json()).toMatchObject({ role });
    }
  });

  it("keeps test-only accounts out of the local fixture", async () => {
    const accounts = await pool.query<{ email: string }>(
      "select email from users where email like '%@e4s.local' order by email"
    );
    expect(accounts.rows.map(({ email }) => email)).toEqual([
      "minh.anh.nguyen@e4s.local",
      "quoc.bao.le@e4s.local",
      "thu.ha.tran@e4s.local"
    ]);
  });
});
