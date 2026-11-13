/**
 * One-time fix: remove reward points that were paid twice for the same action
 * (same lesson / game / Season turn / test recorded twice, or a lesson part paid
 * for more than one correct answer) before rewards were serialised per learner.
 *
 *   DATABASE_URL=… tsx scripts/recompute-reward-double-pay.ts            # dry run (default): report only
 *   DATABASE_URL=… tsx scripts/recompute-reward-double-pay.ts --apply    # delete the duplicate rows
 *   … --learner <uuid>                                                   # limit to one learner
 *
 * The earliest payment of each action is kept. Badges are not changed.
 */
import { Pool } from "pg";
import { recomputeDoublePaidRewards } from "../packages/database/src/reward-recompute.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const learnerIndex = args.indexOf("--learner");
const learnerId = learnerIndex >= 0 ? args[learnerIndex + 1] : undefined;
if (learnerIndex >= 0 && !/^[0-9a-f-]{36}$/i.test(learnerId ?? "")) throw new Error("--learner needs a learner id (uuid)");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString });
try {
  const summary = await recomputeDoublePaidRewards(pool, { apply, ...(learnerId ? { learnerId } : {}) });
  for (const learner of summary.learners) {
    console.log(`${learner.learnerId}\t${learner.rewards} duplicate reward row(s)\t-${learner.points} points`);
  }
  console.log(`${summary.applied ? "Removed" : "Would remove (dry run)"}: ${summary.rewards.length} row(s), ${summary.points} points, ${summary.learners.length} learner(s).`);
  if (!summary.applied && summary.rewards.length) console.log("Run again with --apply to delete them.");
} finally {
  await pool.end();
}
