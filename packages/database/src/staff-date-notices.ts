import type { Pool, PoolClient } from "pg";

/**
 * Refreshes the staff inbox notices that depend on the organisation date: the active test date and
 * upcoming lessons of published months that learners cannot see yet. Idempotent; safe to run often.
 * With no scope it runs for every organisation; `userId` narrows it to that user's organisation.
 */
export async function syncStaffDateNotices(
  db: Pool | PoolClient, scope: { organizationId?: string; userId?: string } = {}
): Promise<void> {
  await db.query(
    `select sync_staff_date_notices(o.id) from organizations o
     where ($1::uuid is null or o.id = $1)
       and ($2::uuid is null or o.id = (select organization_id from users where id = $2))`,
    [scope.organizationId ?? null, scope.userId ?? null]
  );
}
