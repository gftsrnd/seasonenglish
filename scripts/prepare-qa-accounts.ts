/**
 * Recreates the fixed E4S QA learner cohort (`qa-*@learner-qa.e4s.local`).
 *
 * Source of truth: "Tai khoan Learner QA E4S - 2026-11-09.md" (17 learners,
 * PIN, level, status and test case per account).
 *
 * Safety contract:
 * - one transaction; only rows owned by the fixed QA user ids/emails are
 *   deleted and recreated (users, credentials, profiles, enrollments,
 *   attempts, appeals, complaints, progress, certificates, inbox rows, ...);
 * - content (frameworks, lessons, resources, exams) is only read, never
 *   created, approved or published, and no AI generation is triggered;
 * - staff accounts and the organization settings (simulated date) are never
 *   touched;
 * - lesson-dependent cases are seeded only when the current system month has
 *   a published framework with an approved lesson for that level; otherwise
 *   the account is still created and the gap is reported as a warning.
 *
 * Usage (inside the api container, which has DATABASE_URL and
 * E4S_SETTINGS_ENCRYPTION_KEY):
 *   docker cp scripts/prepare-qa-accounts.ts e4s-local-api-1:/app/scripts/
 *   docker exec -e E4S_ALLOW_QA_ACCOUNTS=true e4s-local-api-1 pnpm exec tsx scripts/prepare-qa-accounts.ts          # dry run, rolls back
 *   docker exec -e E4S_ALLOW_QA_ACCOUNTS=true e4s-local-api-1 pnpm exec tsx scripts/prepare-qa-accounts.ts --apply  # commit
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { createPinHash } from "../packages/domain/src/identity/index.js";
import { DEMO_IDS } from "../packages/database/src/seed.js";

export type QaCefr = "A1" | "A2" | "B1" | "B2" | "C1";
export type QaCase =
  | "level" | "onboarding" | "placement" | "locked" | "lesson-resume" | "learned-game"
  | "monthly-appeal" | "monthly-ready" | "level-ready" | "pass-ready" | "pass-completed"
  | "lowered" | "learning-appeal" | "absent-within-limit" | "absent-over-limit"
  | "monthly-ineligible-attendance" | "monthly-ineligible-cohort";

export type QaAccount = {
  key: string;
  id: string;
  email: string;
  displayName: string;
  pin: string;
  cefr: QaCefr | null;
  status: "active" | "disabled";
  scenario: QaCase;
};

export const QA_EMAIL_DOMAIN = "learner-qa.e4s.local";

const qa = (key: string, id: string, pin: string, cefr: QaCefr | null, scenario: QaCase, extra: Partial<QaAccount> = {}): QaAccount => ({
  key,
  id,
  email: `qa-${key}@${QA_EMAIL_DOMAIN}`,
  displayName: `Kiểm thử ${key.replace(/-/g, " ")}`,
  pin,
  cefr,
  status: "active",
  scenario,
  ...extra
});

/** Ids are the ones the role-audit stack used, so both stacks stay comparable. */
export const QA_ACCOUNTS: readonly QaAccount[] = [
  qa("level-a1", "4f009c49-b13d-4ed8-b7d3-d2e51d2a534a", "190972", "A1", "level"),
  qa("level-a2", "4ed78bcc-4723-4261-853e-1e95f76d344c", "622215", "A2", "level"),
  qa("level-b1", "1214b570-09f4-4466-ad3d-8cac36c689ca", "304972", "B1", "level"),
  qa("level-b2", "dfeb8709-5a62-4574-88bc-1ca6b4cb13c8", "307028", "B2", "level"),
  qa("level-c1", "0470426a-4e93-408d-a0d2-4c66735cf3fd", "379202", "C1", "level"),
  qa("onboarding", "437fc6ba-b6f8-4c52-9ca3-c2096f80f26c", "505484", null, "onboarding"),
  qa("placement", "25bdb600-232d-41a6-b3aa-d52cec7bc3e9", "396648", null, "placement"),
  qa("locked", "e14e3649-7934-49b9-abbd-44e5ea9ebd2b", "322483", "A2", "locked", { status: "disabled" }),
  qa("lesson-resume", "3b386d4a-9158-40be-9c90-089b94a27547", "115196", "A1", "lesson-resume"),
  qa("learned-game", "bc6cef31-3d86-4bc7-9019-33b4b8603985", "662721", "A1", "learned-game"),
  qa("monthly-appeal", "f3757b38-beef-4014-b8ce-97feb98cb64d", "154738", "A1", "monthly-appeal"),
  qa("monthly-ready", "3a69a086-972c-49ef-9075-a7fe103d8d6e", "326235", "A1", "monthly-ready"),
  qa("level-ready", "21d8f5fc-d37c-49b7-8d8f-dd261546617d", "587853", "A1", "level-ready"),
  qa("pass-ready", "2506cbb3-be34-4478-a253-4df730dd1a81", "381901", "C1", "pass-ready"),
  // The spec lists this account as "Khóa" (course finished). A disabled user
  // would see the lock screen instead of the completion screen, so the
  // account stays active and the certificate is what closes the course.
  qa("pass-completed", "2027c48d-b255-46fe-af7a-64cc35b43706", "105068", "C1", "pass-completed"),
  qa("lowered-a1", "051c7bfc-5a2b-4ffe-a738-1c8ca2f04fff", "767961", "A1", "lowered"),
  qa("learning-appeal", "7a579d3e-8033-4a1a-a1db-716bed3b4931", "214541", "A1", "learning-appeal", { displayName: "Học viên Kháng Nghị" }),
  // Added 2026-11-12: attendance and monthly-exam eligibility cases.
  qa("absent-1", "4e6cbbb0-f893-4822-9fb4-d81531d45f10", "829505", "A2", "absent-within-limit"),
  qa("absent-2", "897592a7-35c5-48fc-b91a-190e6b2f08b3", "751480", "B1", "absent-over-limit"),
  qa("monthly-ineligible-1", "50a9437f-0495-450c-a1c7-9ec98010d274", "720698", "A1", "monthly-ineligible-attendance"),
  qa("monthly-ineligible-2", "bf865874-e8c2-4aab-b94e-e58cb81eb29a", "320988", "B2", "monthly-ineligible-cohort")
] as const;

/**
 * Lesson numbers (among lessons dated before the system date) each attendance
 * case completes on the lesson's own date; every other elapsed weekday is an
 * absence. Fewer than five consecutive misses keeps the learner clear of the
 * inactivity lock at the default system date.
 */
export const ATTENDANCE_PATTERNS: Partial<Record<QaCase, readonly number[]>> = {
  "absent-within-limit": [1, 2, 4, 5],
  "absent-over-limit": [1],
  "monthly-ineligible-attendance": [1]
};

/**
 * First weekday of the month from which the monthly window can no longer be
 * studied (fewer than 3/4 of the weekdays left), mirroring monthlyLearnerWindow:
 * a level that starts then is outside this month's exam cohort.
 */
export function lateCohortStart(month: string, examDate: string): string {
  const weekdays: string[] = [];
  for (const date = new Date(`${month}-01T00:00:00Z`); date < new Date(`${examDate}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() >= 1 && date.getUTCDay() <= 5) weekdays.push(date.toISOString().slice(0, 10));
  }
  return weekdays.find((_, index) => (weekdays.length - index) * 4 < weekdays.length * 3) ?? weekdays.at(-1) ?? `${month}-28`;
}

/** Section scores of the completed Pass Course Form A attempt (93/100). */
export const PASS_COMPLETED_SCORES = { listening: 19, reading: 38, writing: 18, speaking: 18 } as const;

/** Deterministic child-row id (UUID v5 layout) so reruns produce the same ids. */
export function qaRowId(account: Pick<QaAccount, "id">, label: string): string {
  const hex = createHash("sha1").update(`e4s-qa:${account.id}:${label}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Midnight in Asia/Ho_Chi_Minh for a YYYY-MM-DD date. */
function vietnamStart(date: string) {
  return new Date(`${date}T00:00:00+07:00`);
}

export function qaProfile(account: QaAccount): Record<string, unknown> {
  if (account.scenario === "onboarding") return {};
  return {
    fullName: account.displayName,
    email: account.email,
    contact: "",
    department: "AI",
    position: "AI Intern",
    goals: ["meeting", "email"],
    environmentUse: "weekly",
    familyUse: "none",
    habits: ["podcast", "documents"],
    situations: "Họp daily với nhóm quốc tế",
    learningStyles: ["speaking", "examples"],
    explanationLanguage: "auto",
    persona: "informal",
    durationMinutes: 10,
    device: "both",
    selfLevel: account.cefr ?? "A1",
    certificates: [],
    experience: "Học ở trường",
    concerns: "Muốn nói rõ hơn trong cuộc họp"
  };
}

function encryptRecoverablePin(pin: string) {
  const encoded = process.env.E4S_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("E4S_SETTINGS_ENCRYPTION_KEY must decode to 32 bytes");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), nonce: nonce.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

type QaLesson = { lessonId: string; lessonNumber: number; lessonDate: string; partCodes: string[] };

type Context = {
  systemDate: string;
  month: string;
  examDate: string;
  placementVersionId: string | null;
  passCourseVersionId: string | null;
  firstLesson: Map<QaCefr, QaLesson>;
  lessons: Map<QaCefr, QaLesson[]>;
  publishedFinalMonthsA1: number;
};

async function loadContext(client: Client): Promise<Context> {
  const { rows: [dates] } = await client.query<{ system_date: string; exam_date: string | null }>(
    `select organization_system_date($1)::text as system_date,
            (select pm.exam_date::text from program_months pm where pm.organization_id = $1
               and pm.month = to_char(organization_system_date($1), 'YYYY-MM')) as exam_date`,
    [DEMO_IDS.organization]
  );
  if (!dates) throw new Error("QA_ORGANIZATION_NOT_FOUND");
  const month = dates.system_date.slice(0, 7);
  const versions = await client.query<{ kind: string; id: string }>(
    `select distinct on (d.kind) d.kind, v.id from assessment_definitions d
       join assessment_versions v on v.definition_id = d.id and v.status = 'published'
      where d.organization_id = $1 and (d.kind = 'placement' or d.assessment_key = 'pass-course-form-a')
      order by d.kind, v.version desc`,
    [DEMO_IDS.organization]
  );
  const lessons = await client.query<{ cefr: QaCefr; lesson_id: string; lesson_number: number; lesson_date: string; part_codes: string[] | null }>(
    `select mf.cefr, ml.lesson_id, ml.lesson_number, ml.lesson_date::text,
            (select array_agg(part->>'code') from lesson_versions lv
               cross join jsonb_array_elements(coalesce(lv.content->'parts', '[]'::jsonb)) part
              where lv.lesson_id = ml.lesson_id and lv.status = 'published') as part_codes
       from program_months pm
       join month_frameworks mf on mf.program_month_id = pm.id and mf.status = 'approved' and mf.published_at is not null
       join month_lessons ml on ml.framework_id = mf.id and ml.status = 'approved' and ml.lesson_id is not null
      where pm.organization_id = $1 and pm.month = $2
      order by mf.cefr, ml.lesson_number`,
    [DEMO_IDS.organization, month]
  );
  const finals = await client.query<{ count: number }>(
    `select count(distinct d.assessment_key)::int as count from assessment_definitions d
       join assessment_versions v on v.definition_id = d.id and v.published_at is not null
      where d.organization_id = $1 and d.kind = 'final' and d.assessment_key like 'monthly-final-%-a1'
        and d.assessment_key < 'monthly-final-' || $2`,
    [DEMO_IDS.organization, month]
  );
  const byLevel = new Map<QaCefr, QaLesson[]>();
  for (const row of lessons.rows) {
    const list = byLevel.get(row.cefr) ?? [];
    list.push({ lessonId: row.lesson_id, lessonNumber: row.lesson_number, lessonDate: row.lesson_date, partCodes: row.part_codes?.filter(Boolean) ?? [] });
    byLevel.set(row.cefr, list);
  }
  return {
    systemDate: dates.system_date,
    month,
    examDate: dates.exam_date ?? `${month}-28`,
    placementVersionId: versions.rows.find((row) => row.kind === "placement")?.id ?? null,
    passCourseVersionId: versions.rows.find((row) => row.kind === "pass_course")?.id ?? null,
    firstLesson: new Map([...byLevel].map(([cefr, list]) => [cefr, list[0]!])),
    lessons: byLevel,
    publishedFinalMonthsA1: finals.rows[0]?.count ?? 0
  };
}

/** All QA user ids: the fixed ids plus any user that took a QA email (e.g. self-registered). */
async function resolveQaUserIds(client: Client): Promise<string[]> {
  const result = await client.query<{ id: string }>(
    `select id::text from users where id = any($1::uuid[]) or lower(email) = any($2::text[])`,
    [QA_ACCOUNTS.map((account) => account.id), QA_ACCOUNTS.map((account) => account.email.toLowerCase())]
  );
  const ids = new Set(result.rows.map((row) => row.id));
  const staff = await client.query<{ email: string }>(
    "select email from users where id = any($1::uuid[]) and role <> 'learner'", [[...ids]]
  );
  if (staff.rowCount) throw new Error(`QA_ID_BELONGS_TO_STAFF:${staff.rows.map((row) => row.email).join(",")}`);
  return [...ids];
}

/** Deletes every row owned by the QA learners, children first. */
export async function deleteQaRows(client: Client, ids: readonly string[]) {
  if (!ids.length) return;
  const q = (sql: string) => client.query(sql, [ids]);
  // Entity ids that staff inbox rows embed in their event keys.
  const entities = await client.query<{ id: string }>(
    `select id::text from assessment_attempts where learner_id = any($1::uuid[])
     union all select id::text from appeals where learner_id = any($1::uuid[])
     union all select id::text from learner_complaints where learner_id = any($1::uuid[])
     union all select id::text from lesson_part_appeals where learner_id = any($1::uuid[])
     union all select pa.id::text from practice_appeals pa where pa.learner_id = any($1::uuid[])
     union all select id::text from pass_course_certificates where learner_id = any($1::uuid[])
     union all select id::text from level_up_challenge_results where learner_id = any($1::uuid[])
     union all select id::text from scheduled_level_changes where learner_id = any($1::uuid[])
     union all select id::text from topic_reports where learner_id = any($1::uuid[])
     union all select id::text from duels where challenger_id = any($1::uuid[]) or opponent_id = any($1::uuid[])
     union all select id::text from audit_events where actor_user_id = any($1::uuid[]) or entity_id = any($1::uuid[])
     union all select id::text from users where id = any($1::uuid[])`,
    [ids]
  );
  const entityIds = entities.rows.map((row) => row.id);
  await client.query(
    `delete from inbox_notifications where recipient_id = any($1::uuid[])
        or exists (select 1 from unnest($2::text[]) entity(id) where strpos(inbox_notifications.event_key, entity.id) > 0)`,
    [ids, entityIds]
  );
  await client.query(
    "delete from audit_events where actor_user_id = any($1::uuid[]) or entity_id::text = any($2::text[])",
    [ids, entityIds]
  );
  await q("delete from jobs where payload->>'learnerId' = any($1::text[]) and state in ('queued', 'running', 'failed', 'dead', 'succeeded')");
  await q("delete from notification_deliveries where reminder_id in (select id from reminders where learner_id = any($1::uuid[]))");
  await q("delete from reminders where learner_id = any($1::uuid[])");
  await q("delete from manager_pin_reports where subject_user_id = any($1::uuid[]) or created_by = any($1::uuid[])");
  await q("delete from pass_course_certificates where learner_id = any($1::uuid[]) or attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))");
  await q("delete from appeals where learner_id = any($1::uuid[]) or attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))");
  await q("delete from assessment_decisions where attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))");
  await q("delete from level_up_challenge_results where learner_id = any($1::uuid[])");
  await q("delete from coach_sessions where learner_id = any($1::uuid[])");
  await q("delete from micro_lessons where learner_id = any($1::uuid[])");
  await q("delete from assessment_attempts where learner_id = any($1::uuid[])");
  await q("delete from game_results where learner_id = any($1::uuid[]) or game_set_id in (select id from game_sets where learner_id = any($1::uuid[])) or duel_id in (select id from duels where challenger_id = any($1::uuid[]) or opponent_id = any($1::uuid[]))");
  await q("delete from duels where challenger_id = any($1::uuid[]) or opponent_id = any($1::uuid[]) or game_set_id in (select id from game_sets where learner_id = any($1::uuid[]))");
  await q("delete from game_sets where learner_id = any($1::uuid[])");
  for (const table of ["practice_submissions", "progress_records", "activities", "reward_events", "surveys", "pass_course_readiness", "enrollments"]) {
    await q(`delete from ${table} where learner_id = any($1::uuid[])`);
  }
  await q("delete from files where owner_user_id = any($1::uuid[])");
  await q("delete from ai_runs where user_id = any($1::uuid[])");
  // Remaining learner-owned tables cascade from users.
  await q("delete from users where id = any($1::uuid[])");
}

async function insertAccount(client: Client, account: QaAccount, context: Context) {
  const monthStart = `${context.month}-01`;
  const levelStart = account.scenario === "level-ready" ? `${shiftMonth(context.month, -6)}-01`
    : account.scenario === "lowered" ? context.systemDate
    : account.scenario === "monthly-ineligible-cohort" ? lateCohortStart(context.month, context.examDate) : monthStart;
  await client.query(
    `insert into users (id, organization_id, role, display_name, email, status, created_at, updated_at)
     values ($1, $2, 'learner', $3, $4, $5, $6, $6)`,
    [account.id, DEMO_IDS.organization, account.displayName, account.email, account.status, vietnamStart(levelStart < monthStart ? levelStart : monthStart)]
  );
  const recovery = encryptRecoverablePin(account.pin);
  await client.query(
    `insert into user_credentials (user_id, credential_hash, recovery_ciphertext, recovery_nonce, recovery_auth_tag)
     values ($1, $2, $3, $4, $5)`,
    [account.id, await createPinHash(account.pin), recovery?.ciphertext ?? null, recovery?.nonce ?? null, recovery?.authTag ?? null]
  );
  const profile = qaProfile(account);
  if (account.scenario === "lowered") {
    profile._operator = { levelHistory: [{
      from: "A2", to: "A1", mode: "direct", reason: "Ca kiểm thử hạ mức",
      changedAt: new Date().toISOString(), changedBy: DEMO_IDS.operator
    }] };
  }
  await client.query(
    `insert into learner_profiles (user_id, profile, version, completed_at)
     values ($1, $2::jsonb, 1, $3)`,
    [account.id, JSON.stringify(profile), account.scenario === "onboarding" ? null : vietnamStart(monthStart)]
  );
  // cefr_started_on is explicit so the monthly window does not depend on when the script runs.
  await client.query(
    `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved, enrolled_at, cefr_started_on)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [qaRowId(account, "enrollment"), DEMO_IDS.program, account.id, account.cefr, account.cefr !== null,
      vietnamStart(levelStart), account.cefr ? levelStart : null]
  );
}

async function seedScenario(client: Client, account: QaAccount, context: Context, warnings: string[]): Promise<string[]> {
  const seeded: string[] = [];
  const lesson = account.cefr ? context.firstLesson.get(account.cefr) : undefined;
  const missingLesson = (what: string) => warnings.push(
    `${account.email}: ${what} skipped — no published ${account.cefr} framework with an approved lesson for ${context.month}`
  );
  switch (account.scenario) {
    case "level":
    case "onboarding":
    case "placement":
    case "locked":
      if (account.cefr && !lesson) missingLesson("monthly calendar");
      break;
    case "lesson-resume": {
      if (!lesson) { missingLesson("in-progress first lesson"); break; }
      await client.query(
        `insert into progress_records (id, learner_id, lesson_id, status, evidence, started_at, updated_at)
         values ($1, $2, $3, 'in_progress', '{}'::jsonb, now() - interval '10 minutes', now() - interval '10 minutes')`,
        [qaRowId(account, "progress:1"), account.id, lesson.lessonId]
      );
      seeded.push("first lesson in progress");
      break;
    }
    case "learned-game":
    case "monthly-ready": {
      if (account.scenario === "monthly-ready") {
        await client.query(
          `insert into learner_complaints (id, organization_id, learner_id, kind, reason, related_data, status, resolution,
             resolved_by, submitted_at, due_at, resolved_at)
           values ($1, $2, $3, 'exam_eligibility', 'Ca kiểm thử điều kiện thi tháng', $4::jsonb, 'approved',
             'Đã duyệt ngoại lệ điểm danh cho ca kiểm thử', $5, now() - interval '2 hours', now() + interval '22 hours', now() - interval '1 hour')`,
          [qaRowId(account, "complaint:exam"), DEMO_IDS.organization, account.id,
            JSON.stringify({ month: context.month, cefr: account.cefr, examDate: context.examDate, resolvedOn: context.systemDate }), DEMO_IDS.manager]
        );
        seeded.push("approved attendance exception (exam_eligibility)");
      }
      if (!lesson) { missingLesson("completed first lesson"); break; }
      if (lesson.lessonDate > context.systemDate) { warnings.push(`${account.email}: first lesson opens ${lesson.lessonDate}, after ${context.systemDate}; completion skipped`); break; }
      const codes = lesson.partCodes;
      await client.query(
        `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at, updated_at)
         values ($1, $2, $3, 'completed', 100, $4::jsonb, $5::timestamptz - interval '20 minutes', $5, $5)`,
        [qaRowId(account, "progress:1"), account.id, lesson.lessonId,
          JSON.stringify({ completedPartCodes: codes, evidence: Object.fromEntries(codes.map((code) => [code, { attempts: 1, score: 100, status: "correct" }])) }),
          new Date(`${lesson.lessonDate}T08:20:00+07:00`)]
      );
      seeded.push("first lesson completed");
      break;
    }
    case "monthly-appeal": {
      await client.query(
        `insert into learner_complaints (id, organization_id, learner_id, kind, reason, related_data, status, submitted_at, due_at)
         values ($1, $2, $3, 'exam_eligibility', 'Em vắng vài buổi vì đi công tác, nhờ Quản lý xét điều kiện thi tháng.', $4::jsonb,
           'pending', now(), now() + make_interval(hours => $5::int))`,
        [qaRowId(account, "complaint:exam"), DEMO_IDS.organization, account.id,
          JSON.stringify({ month: context.month, cefr: account.cefr, examDate: context.examDate }),
          Number(process.env.QA_ELIGIBILITY_DUE_HOURS ?? 24)]
      );
      seeded.push("pending exam_eligibility complaint for Manager");
      break;
    }
    case "absent-within-limit":
    case "absent-over-limit":
    case "monthly-ineligible-attendance": {
      const elapsed = (context.lessons.get(account.cefr!) ?? []).filter((item) => item.lessonDate < context.systemDate);
      if (!elapsed.length) { missingLesson("attendance history (lesson completions with skipped days)"); break; }
      const attend = new Set(ATTENDANCE_PATTERNS[account.scenario] ?? []);
      let completed = 0;
      for (const item of elapsed) {
        if (!attend.has(item.lessonNumber)) continue;
        const codes = item.partCodes;
        await client.query(
          `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at, updated_at)
           values ($1, $2, $3, 'completed', 90, $4::jsonb, $5::timestamptz - interval '20 minutes', $5, $5)`,
          [qaRowId(account, `progress:${item.lessonNumber}`), account.id, item.lessonId,
            JSON.stringify({ completedPartCodes: codes, evidence: Object.fromEntries(codes.map((code) => [code, { attempts: 1, score: 90, status: "correct" }])) }),
            new Date(`${item.lessonDate}T08:20:00+07:00`)]
        );
        completed++;
      }
      seeded.push(`completed ${completed} of ${elapsed.length} elapsed lessons (${elapsed.length - completed} missed days), no exception`);
      break;
    }
    case "monthly-ineligible-cohort":
      seeded.push(`level started ${lateCohortStart(context.month, context.examDate)}: outside the ${context.month} exam cohort`);
      if (!lesson) missingLesson("monthly calendar");
      break;
    case "level-ready":
      warnings.push(`${account.email}: six-month A1 history not seeded — it needs published monthly finals and frameworks for the six months before ${context.month} (found ${context.publishedFinalMonthsA1} published earlier A1 monthly finals)`);
      break;
    case "pass-ready":
      await client.query(
        `insert into pass_course_readiness (learner_id, organization_id, cefr_ready, updated_at) values ($1, $2, true, now())`,
        [account.id, DEMO_IDS.organization]
      );
      seeded.push("pass course readiness (cefr_ready)");
      break;
    case "pass-completed": {
      if (!context.passCourseVersionId) { warnings.push(`${account.email}: no published pass-course-form-a; certificate skipped`); break; }
      const attemptId = qaRowId(account, "attempt:pass-course");
      await client.query(
        `insert into assessment_attempts (id, assessment_version_id, learner_id, status, timing_state, started_at, submitted_at, updated_at)
         values ($1, $2, $3, 'approved', '{}'::jsonb, now() - interval '4 hours', now() - interval '150 minutes', now() - interval '1 hour')`,
        [attemptId, context.passCourseVersionId, account.id]
      );
      for (const [section, score] of Object.entries(PASS_COMPLETED_SCORES)) {
        await client.query(
          `insert into assessment_scores (id, attempt_id, section, score, criteria, source, created_at)
           values ($1, $2, $3, $4, '{}'::jsonb, 'human', now() - interval '1 hour')`,
          [qaRowId(account, `score:${section}`), attemptId, section, score]
        );
      }
      await client.query(
        `insert into assessment_decisions (id, attempt_id, approved_level, status, reason, decided_by, decided_at)
         values ($1, $2, 'C1', 'approved', 'Bài thi đầu ra đạt yêu cầu ở cả bốn kỹ năng.', $3, now() - interval '1 hour')`,
        [qaRowId(account, "decision:pass-course"), attemptId, DEMO_IDS.operator]
      );
      await client.query(
        `insert into pass_course_certificates (id, attempt_id, learner_id, organization_id, certificate_number, issued_by, issued_at, metadata)
         values ($1, $2, $3, $4, $5, $6, now() - interval '1 hour', $7::jsonb)`,
        [qaRowId(account, "certificate"), attemptId, account.id, DEMO_IDS.organization,
          `E4S-C1-${attemptId.replace(/-/g, "").slice(0, 12).toUpperCase()}`, DEMO_IDS.operator,
          JSON.stringify({ form: "A", totalMinutes: 90, totalScore: 100, passingScore: 85 })]
      );
      await client.query(
        `insert into pass_course_readiness (learner_id, organization_id, cefr_ready, reset_at, reset_reason, updated_at)
         values ($1, $2, false, now() - interval '1 hour', 'pass_course_certified', now() - interval '1 hour')`,
        [account.id, DEMO_IDS.organization]
      );
      seeded.push(`pass course approved ${Object.values(PASS_COMPLETED_SCORES).reduce((a, b) => a + b, 0)}/100 with certificate`);
      break;
    }
    case "lowered":
      // Same audit row the operator "direct" level change writes; its trigger sends the learner the neutral notice.
      await client.query(
        `insert into audit_events (id, organization_id, actor_user_id, action, entity_type, entity_id, payload, trace_id)
         values ($1, $2, $3, 'assessment.learner.level_changed', 'user', $4, $5::jsonb, 'learner-qa-cohort')`,
        [qaRowId(account, "audit:level-changed"), DEMO_IDS.organization, DEMO_IDS.operator, account.id,
          JSON.stringify({ mode: "direct", targetLevel: "A1", previousLevel: "A2", reason: "Ca kiểm thử hạ mức", effectiveAt: new Date().toISOString() })]
      );
      seeded.push("direct A2→A1 level change + learner notice");
      if (!lesson) missingLesson("A1 monthly calendar");
      break;
    case "learning-appeal": {
      if (!context.placementVersionId) { warnings.push(`${account.email}: no published placement test; placement appeal skipped`); }
      else {
        const attemptId = qaRowId(account, "attempt:placement");
        await client.query(
          `insert into assessment_attempts (id, assessment_version_id, learner_id, status, timing_state, started_at, submitted_at, updated_at)
           values ($1, $2, $3, 'approved', '{}'::jsonb, now() - interval '3 hours', now() - interval '150 minutes', now() - interval '1 hour')`,
          [attemptId, context.placementVersionId, account.id]
        );
        await client.query(
          `insert into assessment_decisions (id, attempt_id, approved_level, status, reason, decided_by, decided_at)
           values ($1, $2, 'A1', 'approved', 'Ca kết quả thi kiểm thử', $3, now() - interval '1 hour')`,
          [qaRowId(account, "decision:placement"), attemptId, DEMO_IDS.operator]
        );
        await client.query(
          `insert into appeals (id, attempt_id, learner_id, reason, status, created_at, expires_at)
           values ($1, $2, $3, 'Nhờ Vận hành xem lại kết quả xếp mức đầu vào.', 'pending', now(), now() + interval '71 hours')`,
          [qaRowId(account, "appeal:placement"), attemptId, account.id]
        );
        seeded.push("pending placement appeal");
      }
      await client.query(
        `insert into learner_complaints (id, organization_id, learner_id, kind, reason, related_data, status, submitted_at)
         values ($1, $2, $3, 'attendance', 'Nhờ Quản lý đối chiếu một ngày điểm danh.', '{}'::jsonb, 'pending', now())`,
        [qaRowId(account, "complaint:attendance"), DEMO_IDS.organization, account.id]
      );
      seeded.push("pending attendance complaint");
      if (!lesson) { missingLesson("pending daily-lesson (listening) appeal"); break; }
      for (const attemptNumber of [1, 2]) {
        await client.query(
          `insert into lesson_part_attempts (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, answer, score, feedback, created_at)
           values ($1, $2, $3, 'listening', $4, $5, $6, $7, 0, $8, now() - make_interval(mins => $9::int))`,
          [qaRowId(account, `lesson-attempt:${attemptNumber}`), account.id, lesson.lessonId, qaRowId(account, `lesson-request:${attemptNumber}`),
            attemptNumber, attemptNumber === 1 ? "wrong_retry" : "wrong_exhausted", `qa-wrong-option-${attemptNumber === 1 ? "a" : "b"}`,
            attemptNumber === 1 ? "Chưa đúng. Bạn còn một lượt thử; hãy xem lại gợi ý." : "Bạn đã hết lượt thử. Hãy xem lại phần hướng dẫn hoặc gửi kháng nghị.",
            attemptNumber === 1 ? 20 : 15]
        );
      }
      await client.query(
        `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, updated_at)
         values ($1, $2, $3, 'in_progress', 0, $4::jsonb, now() - interval '25 minutes', now() - interval '10 minutes')`,
        [qaRowId(account, "progress:1"), account.id, lesson.lessonId, JSON.stringify({ completedPartCodes: [], evidence: {
          listening: { attempts: 2, score: 0, status: "appealed", answer: "qa-wrong-option-b", feedback: "Bạn đã hết lượt thử. Hãy xem lại phần hướng dẫn hoặc gửi kháng nghị." }
        } })]
      );
      await client.query(
        `insert into lesson_part_appeals (id, learner_id, lesson_id, part_code, reason, status, created_at)
         values ($1, $2, $3, 'listening', 'Nhờ Vận hành kiểm tra lại đáp án phần nghe của bài ngày.', 'pending', now() - interval '10 minutes')`,
        [qaRowId(account, "lesson-appeal:listening"), account.id, lesson.lessonId]
      );
      seeded.push("pending daily-lesson listening appeal");
      break;
    }
  }
  return seeded;
}

export async function prepareQaAccounts(client: Client, options: { apply: boolean }) {
  const warnings: string[] = [];
  await client.query("begin");
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('e4s-prepare-qa-accounts'))");
    const program = await client.query("select 1 from programs where id = $1 and organization_id = $2 and status = 'active'", [DEMO_IDS.program, DEMO_IDS.organization]);
    if (!program.rowCount) throw new Error("QA_ACTIVE_PROGRAM_NOT_FOUND");
    const context = await loadContext(client);
    const existing = await resolveQaUserIds(client);
    await deleteQaRows(client, existing);
    if (!process.env.E4S_SETTINGS_ENCRYPTION_KEY) warnings.push("E4S_SETTINGS_ENCRYPTION_KEY missing: PINs are not recoverable from the Manager screen");
    const accounts = [];
    for (const account of QA_ACCOUNTS) {
      await insertAccount(client, account, context);
      const seeded = await seedScenario(client, account, context, warnings);
      accounts.push({ email: account.email, cefr: account.cefr, status: account.status, scenario: account.scenario, seeded });
    }
    await client.query(options.apply ? "commit" : "rollback");
    return {
      mode: options.apply ? "apply" : "dry-run",
      systemDate: context.systemDate,
      month: context.month,
      removedUsers: existing.length,
      publishedLessonLevels: [...context.firstLesson.keys()],
      accounts,
      warnings
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  // The local api container runs with NODE_ENV=production, so the opt-in flag
  // plus the local-host check are the guard instead of NODE_ENV.
  if (process.env.E4S_ALLOW_QA_ACCOUNTS !== "true") throw new Error("E4S_ALLOW_QA_ACCOUNTS=true is required");
  const host = new URL(connectionString).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]", "postgres"].includes(host)) throw new Error(`REFUSING_NON_LOCAL_DATABASE:${host}`);
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const report = await prepareQaAccounts(client, { apply: process.argv.includes("--apply") });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
