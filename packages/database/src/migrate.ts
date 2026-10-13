import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";

const migrationsDirectory = dirname(fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url)));

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

  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/i, "");
    const existing = await client.query(
      "select 1 from schema_migrations where version = $1",
      [version]
    );
    if (existing.rowCount) continue;

    const sql = await readFile(join(migrationsDirectory, file), "utf8");
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
}
