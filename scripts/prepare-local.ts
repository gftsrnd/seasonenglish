import { Client } from "pg";
import { migrateDatabase, seedDemo, DEMO_IDS } from "../packages/database/src/index.js";
import { createCredentialHash, createPinHash } from "../packages/domain/src/identity/index.js";
import { seedLocalScenarioAccounts } from "./local-scenario-accounts.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  await migrateDatabase(client);
  await seedDemo(client, { mode: "local" });
  await client.query(
    `update sessions
     set revoked_at = coalesce(revoked_at, now())
     where user_id = any($1::uuid[])
       and revoked_at is null`,
    [[DEMO_IDS.learner, DEMO_IDS.operator, DEMO_IDS.manager]]
  );
  const credentials = [
    [DEMO_IDS.learner, "246810", "pin"],
    [DEMO_IDS.operator, "staff-pass", "password"],
    [DEMO_IDS.manager, "manager-pass", "password"]
  ] as const;
  for (const [userId, secret, credentialType] of credentials) {
    await client.query(
      `update users
       set status = 'active', updated_at = now()
       where id = $1`,
      [userId]
    );
    await client.query(
      `insert into user_credentials (user_id, credential_hash)
       values ($1, $2)
       on conflict (user_id) do update set credential_hash = excluded.credential_hash, updated_at = now()`,
      [userId, credentialType === "pin" ? await createPinHash(secret) : await createCredentialHash(secret)]
    );
  }
  if (process.env.E4S_SEED_SCENARIOS === "true") {
    const host = new URL(databaseUrl).hostname;
    const localDatabase = ["127.0.0.1", "localhost", "::1", "[::1]", "postgres"].includes(host);
    if (!localDatabase && process.env.E4S_ALLOW_REMOTE_SCENARIOS !== "true") {
      throw new Error(`REFUSING_NON_LOCAL_SCENARIO_DATABASE:${host}`);
    }
    await seedLocalScenarioAccounts(client);
    process.stdout.write(`Scenario accounts prepared for ${localDatabase ? "this local deployment" : "the explicitly allowed remote deployment"}.\n`);
  }
} catch (error) {
  const failure = error as { code?: unknown; message?: unknown; detail?: unknown; hint?: unknown };
  console.error("prepare-local failed", JSON.stringify({
    code: failure.code ?? null,
    message: failure.message ?? String(error),
    detail: failure.detail ?? null,
    hint: failure.hint ?? null
  }));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
