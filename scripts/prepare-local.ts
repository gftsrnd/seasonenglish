import { Client } from "pg";
import { migrateDatabase, seedDemo, DEMO_IDS } from "../packages/database/src/index.js";
import { createCredentialHash } from "../packages/domain/src/identity/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
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
    [DEMO_IDS.learner, "learner-pass"],
    [DEMO_IDS.operator, "staff-pass"],
    [DEMO_IDS.manager, "manager-pass"]
  ] as const;
  for (const [userId, password] of credentials) {
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
      [userId, await createCredentialHash(password)]
    );
  }
} finally {
  await client.end();
}
