import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { placementDefinition } from "../src/assessment-blueprints.js";
import { migrateDatabase, resetPublicSchema } from "../src/migrate.js";
import { syncCanonicalAssessmentBlueprints } from "../src/sync-canonical-assessments.js";
import { DEMO_IDS, seedDemo } from "../src/seed.js";

const databaseUrl = process.env.TEST_DATABASE_URL
  ?? "postgres://e4s:e4s_test_password@127.0.0.1:55432/e4s_test";

describe("canonical assessment deployment sync", () => {
  const client = new Client({ connectionString: databaseUrl });

  beforeAll(async () => {
    await client.connect();
    await resetPublicSchema(client);
    await migrateDatabase(client);
    await seedDemo(client);
  }, 30_000);

  afterAll(async () => {
    await client.end();
  });

  it("publishes one new version when the deployed placement blueprint is stale", async () => {
    await client.query(
      `update assessment_versions
       set blueprint = jsonb_set(blueprint, '{title}', '"Stale placement"'::jsonb)
       where id = $1`,
      [DEMO_IDS.placementVersion]
    );

    const first = await syncCanonicalAssessmentBlueprints(client);
    expect(first).toEqual({ updated: 1, unchanged: 0 });

    const rows = await client.query<{
      version: number;
      status: string;
      blueprint: typeof placementDefinition;
    }>(
      `select av.version, av.status, av.blueprint
       from assessment_versions av
       join assessment_definitions ad on ad.id = av.definition_id
       where ad.assessment_key = 'placement-a'
       order by av.version`
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ version: 1, status: "retired" });
    expect(rows.rows[1]).toMatchObject({ version: 2, status: "published" });
    expect(rows.rows[1]?.blueprint).toEqual(placementDefinition);

    const second = await syncCanonicalAssessmentBlueprints(client);
    expect(second).toEqual({ updated: 0, unchanged: 1 });
  });
});
