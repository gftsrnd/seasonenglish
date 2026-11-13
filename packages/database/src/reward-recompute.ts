import type { Pool, PoolClient } from "pg";

/** A reward row that paid an action a second time (before the per-learner reward lock existed). */
export interface DoublePaidReward {
  rewardId: string;
  learnerId: string;
  sourceType: string;
  points: number;
  reason: "duplicate_activity" | "repeated_lesson_part";
}

export interface DoublePaidRewardSummary {
  applied: boolean;
  rewards: DoublePaidReward[];
  learners: Array<{ learnerId: string; rewards: number; points: number }>;
  points: number;
}

/**
 * Rows to remove, keeping the earliest payment of each action:
 * - the same activity (type + reference) recorded and paid more than once
 *   (parallel requests, retries, double clicks);
 * - a lesson part paid for more than one correct answer.
 * Badges are not touched (one row per badge is enforced by a unique index).
 */
const DOUBLE_PAID_SQL = `
  with activity_paid as (
    select re.id as reward_id, re.learner_id, re.source_type, re.points, 'duplicate_activity'::text as reason,
           row_number() over (
             partition by a.learner_id, a.activity_type, a.reference_type, a.reference_id
             order by a.occurred_at, a.id, re.created_at, re.id
           ) as position
    from reward_events re
    join activities a on a.id = re.source_id and a.learner_id = re.learner_id
    where re.source_type = 'activity_points' and re.badge_id is null and re.points > 0
      and a.reference_id is not null
      and ($1::uuid is null or re.learner_id = $1)
  ),
  part_paid as (
    select re.id as reward_id, re.learner_id, re.source_type, re.points, 'repeated_lesson_part'::text as reason,
           row_number() over (
             partition by re.learner_id, attempt.lesson_id, attempt.part_code
             order by attempt.created_at, attempt.attempt_number, re.created_at, re.id
           ) as position
    from reward_events re
    join lesson_part_attempts attempt on attempt.id = re.source_id and attempt.learner_id = re.learner_id
    where re.source_type = 'lesson_part' and re.badge_id is null and re.points > 0
      and ($1::uuid is null or re.learner_id = $1)
  )
  select reward_id, learner_id, source_type, points, reason from activity_paid where position > 1
  union all
  select reward_id, learner_id, source_type, points, reason from part_paid where position > 1
  order by learner_id, reward_id`;

/**
 * Finds (dry run, the default) or removes (`apply`) reward points that were paid
 * twice for the same action. Runs in one transaction; with `apply` the rows are
 * deleted, otherwise the transaction is rolled back and nothing changes.
 */
export async function recomputeDoublePaidRewards(
  db: Pool | PoolClient,
  options: { apply?: boolean; learnerId?: string } = {}
): Promise<DoublePaidRewardSummary> {
  const client = "release" in db ? db : await db.connect();
  const owned = client !== db;
  try {
    await client.query("begin");
    // With --apply, a table lock keeps new payments from interleaving with this one-time fix.
    if (options.apply) await client.query("lock table reward_events in share row exclusive mode");
    const { rows } = await client.query<{ reward_id: string; learner_id: string; source_type: string; points: number; reason: DoublePaidReward["reason"] }>(
      DOUBLE_PAID_SQL, [options.learnerId ?? null]
    );
    const rewards = rows.map((row) => ({
      rewardId: row.reward_id, learnerId: row.learner_id, sourceType: row.source_type, points: Number(row.points), reason: row.reason
    }));
    if (options.apply && rewards.length) {
      await client.query("delete from reward_events where id = any($1::uuid[])", [rewards.map((reward) => reward.rewardId)]);
    }
    await client.query(options.apply ? "commit" : "rollback");
    const byLearner = new Map<string, { learnerId: string; rewards: number; points: number }>();
    for (const reward of rewards) {
      const entry = byLearner.get(reward.learnerId) ?? { learnerId: reward.learnerId, rewards: 0, points: 0 };
      entry.rewards += 1;
      entry.points += reward.points;
      byLearner.set(reward.learnerId, entry);
    }
    return {
      applied: Boolean(options.apply),
      rewards,
      learners: [...byLearner.values()],
      points: rewards.reduce((sum, reward) => sum + reward.points, 0)
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    if (owned) (client as PoolClient).release();
  }
}
