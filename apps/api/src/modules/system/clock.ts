import { createOffsetClock, fakeClockAllowed, systemClock, type Clock } from "@e4s/domain";
import type { Pool } from "pg";

/**
 * Nguồn thời gian duy nhất cho luật nghiệp vụ theo tháng.
 * Quản lý có thể đặt "ngày giờ giả lập" trong Cài đặt (configuration.monthly.fakeClockAt);
 * giá trị chỉ có hiệu lực ngoài production hoặc khi E4S_ALLOW_FAKE_CLOCK=1.
 */
export interface OrganizationClock extends Clock {
  readonly fake: boolean;
  /** ISO của mốc giả lập đã lưu, null khi dùng giờ thật. */
  readonly fakeClockAt: string | null;
}

export function fakeClockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return fakeClockAllowed({ NODE_ENV: env.NODE_ENV, E4S_ALLOW_FAKE_CLOCK: env.E4S_ALLOW_FAKE_CLOCK });
}

export function buildOrganizationClock(fakeClockAt: string | null | undefined, env: NodeJS.ProcessEnv = process.env): OrganizationClock {
  if (!fakeClockAt || !fakeClockEnabled(env) || Number.isNaN(Date.parse(fakeClockAt))) {
    return { now: () => systemClock.now(), fake: false, fakeClockAt: null };
  }
  const clock = createOffsetClock(fakeClockAt);
  return { now: () => clock.now(), fake: true, fakeClockAt };
}

export async function clockForUser(pool: Pool, userId: string, env: NodeJS.ProcessEnv = process.env): Promise<OrganizationClock> {
  const result = await pool.query<{ fake_clock_at: string | null }>(
    `select os.configuration #>> '{monthly,fakeClockAt}' as fake_clock_at
     from users u
     left join organization_settings os on os.organization_id = u.organization_id
     where u.id = $1`,
    [userId]
  );
  return buildOrganizationClock(result.rows[0]?.fake_clock_at ?? null, env);
}

export async function clockForOrganization(pool: Pool, organizationId: string, env: NodeJS.ProcessEnv = process.env): Promise<OrganizationClock> {
  const result = await pool.query<{ fake_clock_at: string | null }>(
    "select configuration #>> '{monthly,fakeClockAt}' as fake_clock_at from organization_settings where organization_id = $1",
    [organizationId]
  );
  return buildOrganizationClock(result.rows[0]?.fake_clock_at ?? null, env);
}
