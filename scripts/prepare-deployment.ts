import { Client } from "pg";
import { migrateDatabase } from "../packages/database/src/migrate.js";
import { syncCanonicalAssessmentBlueprints } from "../packages/database/src/sync-canonical-assessments.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for deployment preparation");

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await migrateDatabase(client);
  const result = await syncCanonicalAssessmentBlueprints(client);
  process.stdout.write(`Deployment database ready; canonical assessments updated=${result.updated}, unchanged=${result.unchanged}.\n`);
} finally {
  await client.end();
}
