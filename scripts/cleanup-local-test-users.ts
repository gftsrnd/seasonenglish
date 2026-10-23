import { Client } from "pg";
import { DEMO_IDS } from "../packages/database/src/index.js";
import { isKnownLocalScenarioFixtureEmail } from "./local-scenario-accounts.js";

const REQUIRED_KEEP_IDS = [DEMO_IDS.manager, DEMO_IDS.operator, DEMO_IDS.learner] as const;
const KEEP_IDS = REQUIRED_KEEP_IDS;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const TEST_FIXTURE_EMAIL = /^(?:(?:checker|learner2|core-check-[^@]+|core-double-check-[^@]+|core-flow-[^@]+|lane4-o004-[^@]+|p0-[^@]+)@e4s\.local|lane2-[^@]+@example\.com)$/i;
const EXACT_FIXTURE_EMAILS = new Set([
  "learner@e4s.local", "operator@e4s.local", "manager@e4s.local", "checker@e4s.local",
  "minh.anh.nguyen@e4s.local", "thu.ha.tran@e4s.local", "quoc.bao.le@e4s.local", "gia.huy.pham@e4s.local"
].map((email) => email.toLowerCase()));

type Account = { id: string; email: string | null; displayName: string; role: string; status: string };
type ReferenceImpact = { table: string; column: string; count: number };

function isTestFixtureAccount(account: Account) {
  const email = account.email?.trim().toLowerCase() ?? "";
  return account.id === DEMO_IDS.checker
    || EXACT_FIXTURE_EMAILS.has(email)
    || isKnownLocalScenarioFixtureEmail(email)
    || TEST_FIXTURE_EMAIL.test(email);
}

function assertLocalDatabase(connectionString: string) {
  const parsed = new URL(connectionString);
  if (!LOCAL_HOSTS.has(parsed.hostname)) throw new Error(`REFUSING_NON_LOCAL_DATABASE:${parsed.hostname}`);
  const database = parsed.pathname.replace(/^\//, "");
  if (!database || database === "postgres" || database.startsWith("template")) {
    throw new Error(`REFUSING_SYSTEM_DATABASE:${database || "missing"}`);
  }
}

function identifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`UNSAFE_IDENTIFIER:${value}`);
  return `"${value}"`;
}

async function referenceImpact(client: Client, userIds: string[]): Promise<ReferenceImpact[]> {
  if (!userIds.length) return [];
  const references = await client.query<{ table_name: string; column_name: string }>(
    `select distinct tc.table_name, kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
     join information_schema.constraint_column_usage ccu
       on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
     where tc.constraint_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
       and ccu.table_schema = 'public' and ccu.table_name = 'users' and ccu.column_name = 'id'
     order by tc.table_name, kcu.column_name`
  );
  const impact: ReferenceImpact[] = [];
  for (const reference of references.rows) {
    const result = await client.query<{ count: number }>(
      `select count(*)::int as count from ${identifier(reference.table_name)} where ${identifier(reference.column_name)} = any($1::uuid[])`,
      [userIds]
    );
    const count = result.rows[0]?.count ?? 0;
    if (count) impact.push({ table: reference.table_name, column: reference.column_name, count });
  }
  return impact;
}

async function transferSharedOwnership(client: Client, targetIds: string[]) {
  const operatorId = DEMO_IDS.operator;
  const managerId = DEMO_IDS.manager;
  await client.query("update prompt_versions set created_by = $1 where created_by = any($2::uuid[])", [operatorId, targetIds]);
  await client.query("update rubric_versions set created_by = $1 where created_by = any($2::uuid[])", [operatorId, targetIds]);
  await client.query("alter table lesson_set_versions disable trigger lesson_set_versions_immutable");
  try {
    await client.query("update lesson_set_versions set created_by = $1 where created_by = any($2::uuid[])", [operatorId, targetIds]);
    await client.query("update lesson_set_versions set approved_by = $1 where approved_by = any($2::uuid[])", [managerId, targetIds]);
  } finally {
    await client.query("alter table lesson_set_versions enable trigger lesson_set_versions_immutable");
  }
  await client.query("update assessment_decisions set decided_by = $1 where decided_by = any($2::uuid[])", [managerId, targetIds]);
  await client.query("update appeals set resolved_by = $1 where resolved_by = any($2::uuid[])", [operatorId, targetIds]);
  await client.query("update practice_submissions set checked_by = $1 where checked_by = any($2::uuid[])", [operatorId, targetIds]);
  await client.query("update topic_reports set resolved_by = $1 where resolved_by = any($2::uuid[])", [operatorId, targetIds]);
  await client.query("update reminders set created_by = $1 where created_by = any($2::uuid[])", [managerId, targetIds]);
  await client.query("update organization_settings set updated_by = $1 where updated_by = any($2::uuid[])", [managerId, targetIds]);
  await client.query("update provider_configurations set updated_by = $1 where updated_by = any($2::uuid[])", [managerId, targetIds]);
  await client.query("update manager_pin_reports set created_by = $1 where created_by = any($2::uuid[])", [managerId, targetIds]);
  await client.query("update manager_pin_reports set resolved_by = $1 where resolved_by = any($2::uuid[])", [managerId, targetIds]);
  await client.query("update ai_runs set user_id = null where user_id = any($1::uuid[])", [targetIds]);
  await client.query("update audit_events set actor_user_id = null where actor_user_id = any($1::uuid[])", [targetIds]);
}

async function deletePrivateData(client: Client, targetIds: string[]) {
  const privateFiles = await client.query<{ owner_user_id: string; bucket: string; object_key: string }>(
    "select owner_user_id, bucket, object_key from files where owner_user_id = any($1::uuid[]) for update",
    [targetIds]
  );
  for (const file of privateFiles.rows) {
    await client.query(
      `insert into jobs (id, kind, payload, max_attempts, idempotency_key)
       values (gen_random_uuid(), 'storage.cleanup', $1::jsonb, 3, $2)
       on conflict (idempotency_key) do nothing`,
      [
        JSON.stringify({ bucket: file.bucket, objectKey: file.object_key, reason: "local_test_user_cleanup" }),
        `local-test-cleanup:${file.owner_user_id}:${file.bucket}:${file.object_key}`
      ]
    );
  }
  await client.query("delete from notification_deliveries where reminder_id in (select id from reminders where learner_id = any($1::uuid[]))", [targetIds]);
  await client.query("delete from manager_pin_reports where subject_user_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from level_up_challenge_results where learner_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from assessment_decisions where attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))", [targetIds]);
  await client.query("delete from appeals where learner_id = any($1::uuid[]) or attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))", [targetIds]);
  await client.query("delete from assessment_attempts where learner_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from reminders where learner_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from game_results where learner_id = any($1::uuid[]) or game_set_id in (select id from game_sets where learner_id = any($1::uuid[]))", [targetIds]);
  await client.query("delete from duels where challenger_id = any($1::uuid[]) or opponent_id = any($1::uuid[]) or game_set_id in (select id from game_sets where learner_id = any($1::uuid[]))", [targetIds]);
  await client.query("delete from game_sets where learner_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from coach_sessions where learner_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from practice_submissions where learner_id = any($1::uuid[])", [targetIds]);
  for (const table of [
    "learner_vocabulary_unlocks", "lesson_part_appeals", "lesson_part_attempts", "topic_reports", "topic_strikes",
    "micro_lessons", "progress_records", "activities", "enrollments", "reward_events", "surveys"
  ]) {
    await client.query(`delete from ${identifier(table)} where learner_id = any($1::uuid[])`, [targetIds]);
  }
  await client.query("delete from files where owner_user_id = any($1::uuid[])", [targetIds]);
  await client.query("delete from users where id = any($1::uuid[])", [targetIds]);
}

export async function cleanupLocalTestUsers(connectionString: string, apply: boolean) {
  assertLocalDatabase(connectionString);
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("begin");
    const canonical = await client.query<{ id: string; organization_id: string }>(
      "select id, organization_id from users where id = any($1::uuid[]) for update",
      [REQUIRED_KEEP_IDS]
    );
    if (canonical.rowCount !== REQUIRED_KEEP_IDS.length || new Set(canonical.rows.map(({ organization_id }) => organization_id)).size !== 1) {
      throw new Error("CANONICAL_LOCAL_ACCOUNTS_MISSING");
    }
    const organizationId = canonical.rows[0]!.organization_id;
    const candidates = await client.query<{ id: string; email: string | null; display_name: string; role: string; status: string }>(
      `select id, email, display_name, role, status from users
       where organization_id = $1 and not (id = any($2::uuid[])) order by email nulls last, id for update`,
      [organizationId, KEEP_IDS]
    );
    const nonCanonicalAccounts: Account[] = candidates.rows.map((row) => ({
      id: row.id, email: row.email, displayName: row.display_name, role: row.role, status: row.status
    }));
    const accounts = nonCanonicalAccounts.filter(isTestFixtureAccount);
    const preservedAccounts = nonCanonicalAccounts.filter((account) => !isTestFixtureAccount(account));
    const targetIds = accounts.map(({ id }) => id);
    const references = await referenceImpact(client, targetIds);
    const baseReport = {
      mode: apply ? "apply" : "dry-run",
      database: new URL(connectionString).pathname.replace(/^\//, ""),
      organizationId,
      keepAccountIds: [...KEEP_IDS],
      accounts,
      preservedAccounts,
      references,
      affectedReferences: references.reduce((sum, item) => sum + item.count, 0)
    };
    if (!apply || !targetIds.length) {
      await client.query("rollback");
      return { ...baseReport, remainingAccounts: (canonical.rowCount ?? 0) + nonCanonicalAccounts.length };
    }
    await transferSharedOwnership(client, targetIds);
    await deletePrivateData(client, targetIds);
    const remaining = await client.query<{ count: number }>(
      "select count(*)::int as count from users where organization_id = $1",
      [organizationId]
    );
    const remainingAccounts = remaining.rows[0]?.count ?? 0;
    const remainingTargets = await client.query<{ count: number }>(
      "select count(*)::int as count from users where id = any($1::uuid[])",
      [targetIds]
    );
    if ((remainingTargets.rows[0]?.count ?? 0) !== 0) throw new Error("TEST_FIXTURE_ACCOUNTS_REMAIN");
    const remainingCanonical = await client.query<{ count: number }>(
      "select count(*)::int as count from users where id = any($1::uuid[])",
      [REQUIRED_KEEP_IDS]
    );
    if ((remainingCanonical.rows[0]?.count ?? 0) !== REQUIRED_KEEP_IDS.length) throw new Error("CANONICAL_LOCAL_ACCOUNTS_MISSING_AFTER_CLEANUP");
    await client.query("commit");
    return { ...baseReport, remainingAccounts };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const report = await cleanupLocalTestUsers(databaseUrl, process.argv.includes("--apply"));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
