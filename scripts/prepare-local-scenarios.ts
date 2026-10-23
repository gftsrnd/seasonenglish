import { Client } from "pg";
import { migrateDatabase, seedDemo } from "../packages/database/src/index.js";
import { LOCAL_SCENARIO_ACCOUNTS, seedLocalScenarioAccounts } from "./local-scenario-accounts.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (process.env.NODE_ENV === "production") throw new Error("REFUSING_PRODUCTION_SCENARIO_SEED");
if (process.env.E4S_ALLOW_LOCAL_SCENARIOS !== "true") throw new Error("E4S_ALLOW_LOCAL_SCENARIOS=true is required");
const host = new URL(databaseUrl).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]", "postgres"].includes(host)) {
  throw new Error(`REFUSING_NON_LOCAL_DATABASE:${host}`);
}

const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
try {
  await client.connect();
  await migrateDatabase(client);
  await seedDemo(client, { mode: "local" });
  await seedLocalScenarioAccounts(client);
  process.stdout.write(`${JSON.stringify({
    timezone: "Asia/Ho_Chi_Minh",
    learnerPin: "246810",
    staffPassword: "review-pass",
    accounts: LOCAL_SCENARIO_ACCOUNTS.map(({ key, displayName, email, role }) => ({ key, displayName, email, role }))
  }, null, 2)}\n`);
} finally {
  await client.end().catch(() => undefined);
}
