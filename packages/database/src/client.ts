import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { databaseSchema } from "./schema.js";

export interface DatabaseConnection {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof databaseSchema>;
}

export function createDatabase(config: PoolConfig): DatabaseConnection {
  const pool = new Pool(config);
  return { pool, db: drizzle(pool, { schema: databaseSchema }) };
}
