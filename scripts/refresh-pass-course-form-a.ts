import { Client } from "pg";
import { passCourseFormADefinition } from "../packages/database/src/assessment-blueprints.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
try {
  await client.connect();
  const result = await client.query(
    `update assessment_versions version
       set blueprint = $1::jsonb,
           updated_at = now()
      from assessment_definitions definition
     where version.definition_id = definition.id
       and definition.assessment_key = 'pass-course-form-a'`,
    [JSON.stringify(passCourseFormADefinition)]
  );
  if (result.rowCount !== 1) {
    throw new Error(`Expected one persisted Pass Course Form A version; updated ${result.rowCount ?? 0}. Run scripts/prepare-local.ts once if the local seed is absent.`);
  }
  process.stdout.write("Refreshed canonical Pass Course Form A blueprint.\n");
} finally {
  await client.end().catch(() => undefined);
}
