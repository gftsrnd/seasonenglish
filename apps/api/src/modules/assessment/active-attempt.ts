import type { Pool } from "pg";

export async function assessmentInProgress(pool: Pool, learnerId: string): Promise<boolean> {
  const result = await pool.query<{ active: boolean }>(
    "select exists(select 1 from assessment_attempts where learner_id = $1 and status = 'in_progress') as active",
    [learnerId]
  );
  return Boolean(result.rows[0]?.active);
}
