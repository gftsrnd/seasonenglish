import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { placementDefinition } from "./assessment-blueprints.js";

type QueryClient = Pick<Client, "query">;

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeJson(child)])
    );
  }
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeJson(left)) === JSON.stringify(normalizeJson(right));
}

export async function syncCanonicalAssessmentBlueprints(
  client: QueryClient
): Promise<{ updated: number; unchanged: number }> {
  const canonical = [{ key: "placement-a", kind: "placement", blueprint: placementDefinition }] as const;
  let updated = 0;
  let unchanged = 0;

  await client.query("begin");
  try {
    for (const assessment of canonical) {
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [`canonical-assessment:${assessment.key}`]);
      const definitions = await client.query<{ id: string }>(
        `select id from assessment_definitions
         where assessment_key = $1 and kind = $2
         order by id`,
        [assessment.key, assessment.kind]
      );

      for (const definition of definitions.rows) {
        const current = await client.query<{ id: string; version: number; blueprint: unknown }>(
          `select id, version, blueprint
           from assessment_versions
           where definition_id = $1 and status = 'published'
           order by version desc
           limit 1
           for update`,
          [definition.id]
        );
        const published = current.rows[0];
        if (published && sameJson(published.blueprint, assessment.blueprint)) {
          unchanged += 1;
          continue;
        }

        const next = await client.query<{ version: number }>(
          `select coalesce(max(version), 0) + 1 as version
           from assessment_versions
           where definition_id = $1`,
          [definition.id]
        );
        await client.query(
          "update assessment_versions set status = 'retired' where definition_id = $1 and status = 'published'",
          [definition.id]
        );
        await client.query(
          `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
           values ($1, $2, $3, 'published', $4::jsonb, now())`,
          [randomUUID(), definition.id, next.rows[0]?.version ?? 1, JSON.stringify(assessment.blueprint)]
        );
        updated += 1;
      }
    }
    await client.query("commit");
    return { updated, unchanged };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
