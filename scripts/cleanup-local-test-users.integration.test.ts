import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { createCredentialHash } from "../packages/domain/src/identity/index.js";
import { DEMO_IDS, migrateDatabase, resetPublicSchema } from "../packages/database/src/index.js";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";
const testOperatorId = "10000000-0000-4000-8000-000000000104";
const testLearnerId = "10000000-0000-4000-8000-000000000105";
const legitimateLearnerId = "10000000-0000-4000-8000-000000000107";
const laneFixtureLearnerId = "10000000-0000-4000-8000-000000000108";
const laneTwoFixtureLearnerId = "10000000-0000-4000-8000-000000000109";
const p0FixtureLearnerId = "10000000-0000-4000-8000-000000000110";
const legacyScenarioLearnerId = "10000000-0000-4000-8000-000000000111";
const legitimateScenarioDomainLearnerId = "10000000-0000-4000-8000-000000000112";
const approvedScenarioLearnerId = "20000000-0000-4000-8000-000000000001";

describe("local test-user cleanup", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    const client = await pool.connect();
    try {
      await resetPublicSchema(client);
      await migrateDatabase(client);
    } finally {
      client.release();
    }
    await execFileAsync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/prepare-local.ts"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }
    });
    await pool.query(
      `insert into users (id, organization_id, role, display_name, email) values
         ($1, $3, 'operator', 'Core check operator', 'core-check-operator@e4s.local'),
         ($2, $3, 'learner', 'Core check learner', 'core-check-learner@e4s.local'),
         ($4, $3, 'learner', 'Nguyen Van An', 'an.nguyen@e4s.local'),
         ($5, $3, 'learner', 'Lane 4 O-004 fixture', 'lane4-o004-fixture@e4s.local'),
         ($6, $3, 'learner', 'Lane Two fixture', 'lane2-123@example.com'),
         ($7, $3, 'learner', 'P0 fixture', 'p0-fixture@e4s.local'),
         ($8, $3, 'learner', 'Legacy scenario fixture', 'learner-placement-new@scenario.e4s.local'),
         ($9, $3, 'learner', 'Nguyễn Văn An', 'nguyen.van.an@scenario.e4s.local'),
         ($10, $3, 'learner', 'Trần Minh Quân', 'minh.quan.tran@scenario.e4s.local')`,
      [testOperatorId, testLearnerId, DEMO_IDS.organization, legitimateLearnerId, laneFixtureLearnerId, laneTwoFixtureLearnerId, p0FixtureLearnerId, legacyScenarioLearnerId, legitimateScenarioDomainLearnerId, approvedScenarioLearnerId]
    );
    await pool.query(
      "insert into user_credentials (user_id, credential_hash) values ($1, $2), ($3, $4)",
      [testOperatorId, await createCredentialHash("test-pass"), testLearnerId, await createCredentialHash("test-pass")]
    );
    await pool.query(
      "insert into learner_profiles (user_id, profile) values ($1, '{\"fixture\":true}'::jsonb)",
      [testLearnerId]
    );
    await pool.query(
      `insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
       values ('10000000-0000-4000-8000-000000000106', $1, 'system_rules', 99, 'fixture', 'retired', $2)`,
      [DEMO_IDS.organization, testOperatorId]
    );
  }, 30_000);

  afterAll(async () => { await pool.end(); });

  async function cleanup(...args: string[]) {
    return execFileAsync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/cleanup-local-test-users.ts", ...args], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }
    });
  }

  it("defaults to a dry run with an exact account and impact report", async () => {
    const { stdout } = await cleanup();
    const report = JSON.parse(stdout) as { mode: string; accounts: Array<{ email: string }>; affectedReferences: number };
    expect(report.mode).toBe("dry-run");
    expect(report.accounts.map(({ email }) => email)).toEqual([
      "core-check-learner@e4s.local",
      "core-check-operator@e4s.local",
      "lane2-123@example.com",
      "lane4-o004-fixture@e4s.local",
      "learner-placement-new@scenario.e4s.local",
      "minh.quan.tran@scenario.e4s.local",
      "p0-fixture@e4s.local"
    ]);
    expect(report.affectedReferences).toBeGreaterThan(2);
    expect(await pool.query("select 1 from users where id = $1", [testLearnerId])).toHaveProperty("rowCount", 1);
    expect(await pool.query("select 1 from users where id = $1", [legitimateLearnerId])).toHaveProperty("rowCount", 1);
  });

  it("refuses a non-local database before connecting", async () => {
    await expect(execFileAsync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), "scripts/cleanup-local-test-users.ts"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: "postgres://e4s:secret@db.example.com/e4s" } }
    )).rejects.toMatchObject({ stderr: expect.stringContaining("REFUSING_NON_LOCAL_DATABASE") });
  });

  it("transfers shared authorship and removes private test-user data atomically", async () => {
    const { stdout } = await cleanup("--apply");
    const report = JSON.parse(stdout) as { mode: string; remainingAccounts: number };
    expect(report).toMatchObject({ mode: "apply", remainingAccounts: 5 });

    const users = await pool.query<{ email: string }>(
      "select email from users where organization_id = $1 order by email",
      [DEMO_IDS.organization]
    );
    expect(users.rows.map(({ email }) => email)).toEqual([
      "an.nguyen@e4s.local",
      "minh.anh.nguyen@e4s.local",
      "nguyen.van.an@scenario.e4s.local",
      "quoc.bao.le@e4s.local",
      "thu.ha.tran@e4s.local"
    ]);
    const prompt = await pool.query<{ created_by: string }>(
      "select created_by from prompt_versions where version = 99 and task_key = 'system_rules'"
    );
    expect(prompt.rows[0]?.created_by).toBe(DEMO_IDS.operator);
    expect(await pool.query("select 1 from learner_profiles where user_id = $1", [testLearnerId])).toHaveProperty("rowCount", 0);
    expect(await pool.query("select 1 from users where id = $1", [legitimateLearnerId])).toHaveProperty("rowCount", 1);
  });
});
