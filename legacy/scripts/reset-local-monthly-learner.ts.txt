import { Client } from "pg";

const email = "minh.anh.nguyen@e4s.local";
const apply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const url = new URL(connectionString);
if (!["127.0.0.1", "localhost", "::1", "[::1]", "postgres"].includes(url.hostname)) throw new Error(`REFUSING_NON_LOCAL_DATABASE:${url.hostname}`);

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("begin");
  const learner = await client.query<{ id: string; cefr: string | null; cefr_approved: boolean }>(
    `select u.id, e.cefr, e.cefr_approved
     from users u join enrollments e on e.learner_id = u.id
     where lower(u.email) = lower($1) and u.role = 'learner'
     for update`, [email]
  );
  const row = learner.rows[0];
  if (!row) throw new Error("LOCAL_LEARNER_NOT_FOUND");
  const learnerId = row.id;
  const before = await client.query<{ legacy_progress: string; non_placement_attempts: string; practices: string }>(
    `select
       (select count(*) from progress_records pr join lessons l on l.id = pr.lesson_id join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id join lesson_sets ls on ls.id = lsv.lesson_set_id where pr.learner_id = $1 and ls.program_week_id is not null)::text as legacy_progress,
       (select count(*) from assessment_attempts aa join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id where aa.learner_id = $1 and ad.kind <> 'placement')::text as non_placement_attempts,
       (select count(*) from practice_submissions where learner_id = $1)::text as practices`, [learnerId]
  );
  if (apply) {
    await client.query(`delete from practice_appeals where learner_id = $1 or submission_id in (select id from practice_submissions where learner_id = $1)`, [learnerId]);
    await client.query(`delete from practice_submissions where learner_id = $1`, [learnerId]);
    await client.query(`delete from assessment_attempts aa using assessment_versions av, assessment_definitions ad where aa.learner_id = $1 and av.id = aa.assessment_version_id and ad.id = av.definition_id and ad.kind <> 'placement'`, [learnerId]);
    await client.query(`delete from progress_records pr using lessons l, lesson_set_versions lsv, lesson_sets ls where pr.learner_id = $1 and l.id = pr.lesson_id and lsv.id = l.lesson_set_version_id and ls.id = lsv.lesson_set_id and ls.program_week_id is not null`, [learnerId]);
    await client.query(`update enrollments set cefr = 'A2', cefr_approved = true where learner_id = $1`, [learnerId]);
  }
  const after = await client.query<{ legacy_progress: string; non_placement_attempts: string; placement_attempts: string; approved_month_frameworks: string }>(
    `select
       (select count(*) from progress_records pr join lessons l on l.id = pr.lesson_id join lesson_set_versions lsv on lsv.id = l.lesson_set_version_id join lesson_sets ls on ls.id = lsv.lesson_set_id where pr.learner_id = $1 and ls.program_week_id is not null)::text as legacy_progress,
       (select count(*) from assessment_attempts aa join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id where aa.learner_id = $1 and ad.kind <> 'placement')::text as non_placement_attempts,
       (select count(*) from assessment_attempts aa join assessment_versions av on av.id = aa.assessment_version_id join assessment_definitions ad on ad.id = av.definition_id where aa.learner_id = $1 and ad.kind = 'placement')::text as placement_attempts,
       (select count(*) from month_frameworks mf join program_months pm on pm.id = mf.program_month_id join users u on u.organization_id = pm.organization_id where u.id = $1 and mf.cefr = 'A2' and mf.status = 'approved')::text as approved_month_frameworks`, [learnerId]
  );
  if (apply) await client.query("commit"); else await client.query("rollback");
  process.stdout.write(JSON.stringify({ mode: apply ? "apply" : "dry-run", learner: email, retainedPlacementLevel: "A2", before: before.rows[0], after: after.rows[0], note: "No monthly framework, lesson, attendance, or exam was created by this reset." }, null, 2) + "\n");
} catch (error) { await client.query("rollback").catch(() => undefined); throw error; }
finally { await client.end(); }
