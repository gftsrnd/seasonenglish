import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const initialMigration = fileURLToPath(
  new URL("../migrations/0001_initial.sql", import.meta.url)
);

export async function resetPublicSchema(client: Client): Promise<void> {
  await client.query("drop schema if exists public cascade");
  await client.query("create schema public");
}

export async function migrateDatabase(client: Client): Promise<void> {
  await client.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const version = "0001_initial";
  const existing = await client.query(
    "select 1 from schema_migrations where version = $1",
    [version]
  );
  if (existing.rowCount) return;

  const sql = await readFile(initialMigration, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into schema_migrations (version) values ($1)", [version]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

