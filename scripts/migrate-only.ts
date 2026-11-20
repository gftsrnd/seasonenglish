// Applies pending SQL migrations (packages/database/migrations) and nothing else:
// no demo seed, no password reset, no canonical-assessment sync.
// Each migration runs in its own transaction and is recorded in schema_migrations.
// Use: DATABASE_URL=... pnpm db:migrate   (or ./scripts/ops/e4s.ps1 -Env <env> -Action migrate)
import { Client } from "pg";
import { migrateDatabase } from "../packages/database/src/migrate.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const before = await client.query<{ count: string }>("select count(*)::text as count from schema_migrations").catch(() => ({ rows: [{ count: "0" }] }));
  await migrateDatabase(client);
  const after = await client.query<{ count: string }>("select count(*)::text as count from schema_migrations");
  process.stdout.write(`Migrations applied: ${Number(after.rows[0]!.count) - Number(before.rows[0]!.count)} (total ${after.rows[0]!.count}).\n`);
} finally {
  await client.end();
}
