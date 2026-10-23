import type { Client } from "pg";
import type { GameWordView } from "../packages/contracts/src/engagement-contract.js";
import { createCredentialHash, createPinHash } from "../packages/domain/src/identity/index.js";
import { DEMO_IDS } from "../packages/database/src/seed.js";

export type LocalScenarioAccount = {
  key: string;
  id: string;
  role: "learner" | "operator" | "manager";
  email: string;
  displayName: string;
  secret: string;
  cefr?: "A2" | "B1";
  cefrApproved?: boolean;
  onboarding?: boolean;
  reminder?: boolean;
  appeal?: boolean;
  placement?: "listening" | "reading" | "writing" | "speaking" | "submitted" | "review" | "borderline";
};

const learner = (
  sequence: number,
  key: string,
  displayName: string,
  email: string,
  extra: Omit<Partial<LocalScenarioAccount>, "key" | "id" | "role" | "email" | "displayName" | "secret"> = {}
): LocalScenarioAccount => ({
  key,
  id: `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
  role: "learner",
  email,
  displayName,
  secret: "246810",
  ...extra
});

export const LOCAL_SCENARIO_ACCOUNTS: readonly LocalScenarioAccount[] = [
  learner(15, "learner-onboarding-new", "Nguyễn Khánh Linh", "khanh.linh.nguyen@scenario.e4s.local", { onboarding: true }),
  learner(1, "learner-placement-new", "Trần Minh Quân", "minh.quan.tran@scenario.e4s.local"),
  learner(2, "learner-placement-listening", "Lê Hoàng Anh", "hoang.anh.le@scenario.e4s.local", { placement: "listening" }),
  learner(3, "learner-placement-reading", "Phạm Thu Trang", "thu.trang.pham@scenario.e4s.local", { placement: "reading" }),
  learner(4, "learner-placement-writing", "Vũ Đức Long", "duc.long.vu@scenario.e4s.local", { placement: "writing" }),
  learner(5, "learner-placement-speaking", "Đỗ Ngọc Mai", "ngoc.mai.do@scenario.e4s.local", { placement: "speaking" }),
  learner(16, "learner-placement-submitted", "Bùi Gia Hân", "gia.han.bui@scenario.e4s.local", { placement: "submitted" }),
  learner(6, "learner-placement-review", "Hồ Anh Tuấn", "anh.tuan.ho@scenario.e4s.local", { placement: "review" }),
  learner(7, "learner-placement-borderline", "Dương Mỹ Linh", "my.linh.duong@scenario.e4s.local", { placement: "borderline" }),
  learner(8, "learner-lesson-b1", "Võ Thành Nam", "thanh.nam.vo@scenario.e4s.local", { cefr: "B1", cefrApproved: true }),
  learner(9, "learner-lesson-attempts", "Nguyễn Quỳnh Anh", "quynh.anh.nguyen@scenario.e4s.local", { cefr: "A2", cefrApproved: true }),
  learner(10, "learner-weekly", "Trương Hải Yến", "hai.yen.truong@scenario.e4s.local", { cefr: "A2", cefrApproved: true }),
  learner(11, "learner-level-ready", "Đặng Quốc Việt", "quoc.viet.dang@scenario.e4s.local", { cefr: "A2", cefrApproved: true }),
  learner(12, "learner-history", "Ngô Thanh Thảo", "thanh.thao.ngo@scenario.e4s.local", { cefr: "A2", cefrApproved: true }),
  learner(17, "learner-reminder", "Mai Đức Thịnh", "duc.thinh.mai@scenario.e4s.local", { cefr: "A2", cefrApproved: true, reminder: true }),
  learner(18, "learner-appeal", "Tạ Bảo Trâm", "bao.tram.ta@scenario.e4s.local", { placement: "review", appeal: true }),
  {
    key: "operator-review",
    id: "20000000-0000-4000-8000-000000000013",
    role: "operator",
    email: "minh.chau.phan@scenario.e4s.local",
    displayName: "Phan Minh Châu",
    secret: "review-pass"
  },
  {
    key: "manager-review",
    id: "20000000-0000-4000-8000-000000000014",
    role: "manager",
    email: "quoc.hung.ly@scenario.e4s.local",
    displayName: "Lý Quốc Hưng",
    secret: "review-pass"
  }
] as const;

export const LEGACY_LOCAL_SCENARIO_EMAILS = [
  "learner-placement-new@scenario.e4s.local",
  "learner-placement-listening@scenario.e4s.local",
  "learner-placement-reading@scenario.e4s.local",
  "learner-placement-writing@scenario.e4s.local",
  "learner-placement-speaking@scenario.e4s.local",
  "learner-placement-review@scenario.e4s.local",
  "learner-placement-borderline@scenario.e4s.local",
  "learner-lesson-b1@scenario.e4s.local",
  "learner-lesson-attempts@scenario.e4s.local",
  "learner-weekly@scenario.e4s.local",
  "learner-level-ready@scenario.e4s.local",
  "learner-history@scenario.e4s.local",
  "operator-review@scenario.e4s.local",
  "manager-review@scenario.e4s.local"
] as const;

const LOCAL_SCENARIO_FIXTURE_EMAILS = new Set([
  ...LEGACY_LOCAL_SCENARIO_EMAILS,
  ...LOCAL_SCENARIO_ACCOUNTS.map(({ email }) => email)
].map((email) => email.toLowerCase()));

export function isKnownLocalScenarioFixtureEmail(email: string | null | undefined) {
  return LOCAL_SCENARIO_FIXTURE_EMAILS.has(email?.trim().toLowerCase() ?? "");
}

export function isPreservedLocalScenarioEmail(email: string | null | undefined) {
  return /^[a-z0-9.-]+@scenario\.e4s\.local$/i.test(email?.trim() ?? "")
    && LOCAL_SCENARIO_ACCOUNTS.some((account) => account.email.toLowerCase() === email?.trim().toLowerCase());
}

function scenarioAttemptId(account: LocalScenarioAccount) {
  return account.id.replace("20000000", "21000000");
}

async function resetScenarioRows(client: Client) {
  const ids = LOCAL_SCENARIO_ACCOUNTS.map(({ id }) => id);
  await client.query("update sessions set revoked_at = coalesce(revoked_at, now()) where user_id = any($1::uuid[])", [ids]);
  await client.query("delete from notification_deliveries where reminder_id in (select id from reminders where learner_id = any($1::uuid[]))", [ids]);
  await client.query("delete from manager_pin_reports where subject_user_id = any($1::uuid[])", [ids]);
  await client.query("delete from level_up_challenge_results where learner_id = any($1::uuid[])", [ids]);
  await client.query("delete from assessment_decisions where attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))", [ids]);
  await client.query("delete from appeals where learner_id = any($1::uuid[]) or attempt_id in (select id from assessment_attempts where learner_id = any($1::uuid[]))", [ids]);
  await client.query("delete from assessment_attempts where learner_id = any($1::uuid[])", [ids]);
  await client.query("delete from reminders where learner_id = any($1::uuid[])", [ids]);
  await client.query("delete from game_results where learner_id = any($1::uuid[]) or game_set_id in (select id from game_sets where learner_id = any($1::uuid[]))", [ids]);
  await client.query("delete from duels where challenger_id = any($1::uuid[]) or opponent_id = any($1::uuid[]) or game_set_id in (select id from game_sets where learner_id = any($1::uuid[]))", [ids]);
  await client.query("delete from game_sets where learner_id = any($1::uuid[])", [ids]);
  await client.query("delete from coach_sessions where learner_id = any($1::uuid[])", [ids]);
  await client.query("delete from practice_submissions where learner_id = any($1::uuid[])", [ids]);
  for (const table of [
    "learner_vocabulary_unlocks", "lesson_part_appeals", "lesson_part_attempts", "topic_reports", "topic_strikes",
    "micro_lessons", "progress_records", "activities", "reward_events", "surveys"
  ]) {
    await client.query(`delete from ${table} where learner_id = any($1::uuid[])`, [ids]);
  }
  await client.query("delete from enrollments where learner_id = any($1::uuid[])", [ids]);
}

function profileFor(account: LocalScenarioAccount) {
  if (account.onboarding) return { fullName: account.displayName, email: account.email };
  return {
    fullName: account.displayName,
    email: account.email,
    department: "QA",
    position: "Scenario tester",
    goals: ["meeting", "email"],
    environmentUse: "weekly",
    familyUse: "none",
    habits: ["documents"],
    situations: `Kiểm thử ${account.key}`,
    learningStyles: ["examples", "speaking"],
    explanationLanguage: "auto",
    persona: "professional",
    durationMinutes: 10,
    device: "desktop",
    selfLevel: account.cefr ?? "A2",
    certificates: [],
    experience: "Tài khoản kịch bản local cố định",
    concerns: "Chỉ dùng để kiểm thử local",
    avatar: { color: "olive", acc: "none", bg: 1 }
  };
}

export async function seedLocalScenarioAccounts(client: Client) {
  await client.query("begin");
  try {
    await resetScenarioRows(client);
    for (const account of LOCAL_SCENARIO_ACCOUNTS) {
      await client.query(
        `insert into users (id, organization_id, role, display_name, email)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do update set organization_id = excluded.organization_id,
           role = excluded.role, display_name = excluded.display_name, email = excluded.email,
           status = 'active', updated_at = now()`,
        [account.id, DEMO_IDS.organization, account.role, account.displayName, account.email]
      );
      const credentialHash = account.role === "learner"
        ? await createPinHash(account.secret)
        : await createCredentialHash(account.secret);
      await client.query(
        `insert into user_credentials (user_id, credential_hash) values ($1, $2)
         on conflict (user_id) do update set credential_hash = excluded.credential_hash, updated_at = now()`,
        [account.id, credentialHash]
      );
      if (account.role !== "learner") continue;
      await client.query(
        `insert into learner_profiles (user_id, profile, completed_at)
         values ($1, $2::jsonb, $3)
         on conflict (user_id) do update set profile = excluded.profile, completed_at = excluded.completed_at,
           draft_profile = null, draft_updated_at = null,
           version = learner_profiles.version + 1, updated_at = now()`,
        [account.id, JSON.stringify(profileFor(account)), account.onboarding ? null : new Date()]
      );
      await client.query(
        `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
         values (gen_random_uuid(), $1, $2, $3, $4)`,
        [DEMO_IDS.program, account.id, account.cefr ?? null, account.cefrApproved ?? false]
      );
      if (account.placement) await seedPlacementScenario(client, account);
    }
    await seedLearningScenarios(client);
    await seedReminderAndAppealScenarios(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function seedPlacementScenario(client: Client, account: LocalScenarioAccount) {
  const review = account.placement === "review" || account.placement === "borderline";
  const submitted = account.placement === "submitted";
  const attemptId = scenarioAttemptId(account);
  await client.query(
    `insert into assessment_attempts
       (id, assessment_version_id, learner_id, status, current_section, timing_state, submitted_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      attemptId,
      DEMO_IDS.placementVersion,
      account.id,
      review ? "pending_review" : submitted ? "submitted" : "in_progress",
      review || submitted ? "speaking" : account.placement,
      JSON.stringify({ timezone: "Asia/Ho_Chi_Minh", fixture: account.key }),
      review || submitted ? new Date() : null
    ]
  );
  const sections = ["listening", "reading", "writing", "speaking"];
  const currentIndex = Math.max(0, sections.indexOf(account.placement ?? "listening"));
  const completed = review || submitted ? sections : sections.slice(0, currentIndex);
  for (const section of completed) {
    await client.query(
      `insert into assessment_responses (id, attempt_id, section, task_key, response)
       values (gen_random_uuid(), $1, $2, $3, $4::jsonb)`,
      [attemptId, section, `${section}-fixture`, JSON.stringify({ fixture: true, answer: `${section} response` })]
    );
  }
  if (review) {
    const borderline = account.placement === "borderline";
    for (const [section, score] of [["listening", borderline ? 13 : 17], ["reading", borderline ? 14 : 18]] as const) {
      await client.query(
        `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
         values (gen_random_uuid(), $1, $2, $3, '{"fixture":true}'::jsonb, 'deterministic')`,
        [attemptId, section, score]
      );
    }
    if (account.key === "learner-placement-review" || account.key === "learner-placement-borderline") {
      const source = account.key === "learner-placement-review" ? "ai" : "human";
      const writingScore = source === "ai" ? 15 : 12;
      const speakingScore = source === "ai" ? 16 : 13;
      for (const [section, score] of [["writing", writingScore], ["speaking", speakingScore]] as const) {
        await client.query(
          `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
           values (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)`,
          [attemptId, section, score, JSON.stringify({ fixture: true, scoringExample: source }), source]
        );
      }
    }
  }
}

async function seedReminderAndAppealScenarios(client: Client) {
  const byKey = new Map(LOCAL_SCENARIO_ACCOUNTS.map((account) => [account.key, account]));
  const reminder = byKey.get("learner-reminder")!;
  const appeal = byKey.get("learner-appeal")!;
  await client.query(
    `insert into reminders (id, learner_id, reason, message, status, created_by)
     values ($1, $2, 'inactive_learning', 'Bạn chưa có hoạt động học gần đây. Hãy quay lại E4S để tiếp tục mục tiêu tuần.', 'queued', $3)`,
    [reminder.id.replace("20000000", "22000000"), reminder.id, byKey.get("manager-review")!.id]
  );
  await client.query(
    `insert into appeals (id, attempt_id, learner_id, reason, status)
     values ($1, $2, $3, 'Tôi muốn được xem lại kết quả phần Nói.', 'pending')`,
    [appeal.id.replace("20000000", "23000000"), scenarioAttemptId(appeal), appeal.id]
  );
}

async function seedLearningScenarios(client: Client) {
  const byKey = new Map(LOCAL_SCENARIO_ACCOUNTS.map((account) => [account.key, account]));
  const referenceA2LessonIds = await ensurePublishedScenarioLessons(client, "A2");
  await ensurePublishedScenarioLessons(client, "B1");
  const sets = await publishedScenarioLessonSets(client);
  const currentWeek = await client.query<{ id: string }>(
    `select pw.id from programs p join program_weeks pw on pw.program_id = p.id
       and pw.week_number = coalesce(p.current_week_override,
         least(p.week_count, greatest(1, floor((current_date - p.start_date) / 7.0)::int + 1)))
     where p.id = $1`, [DEMO_IDS.program]
  );
  const activeA2LessonIds = sets.find((set) => set.cefr === "A2" && set.weekId === currentWeek.rows[0]?.id)
    ?.lessons.map((lesson) => lesson.id) ?? referenceA2LessonIds;
  await seedScenarioGameSets(client, sets);
  const completeKeys = ["learner-weekly", "learner-level-ready", "learner-history"];
  for (const key of completeKeys) {
    const account = byKey.get(key)!;
    const lessonIds = key === "learner-level-ready"
      ? sets.filter((set) => set.cefr === "A2").flatMap((set) => set.lessons.map((lesson) => lesson.id))
      : activeA2LessonIds;
    for (const [index, lessonId] of lessonIds.entries()) {
      const partCodes = ["listening", "reading", "writing", "word_class", "word_use", "speaking"];
      const evidence = Object.fromEntries(partCodes.map((code) => [code, { attempts: 1, score: 100, status: "correct" }]));
      await client.query(
        `insert into progress_records
           (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
         values (gen_random_uuid(), $1, $2, 'completed', $3, $4::jsonb,
           now() - interval '2 days', now() - interval '1 day')`,
        [account.id, lessonId, key === "learner-level-ready" ? 100 : 88, JSON.stringify({ fixture: key, completedPartCodes: partCodes, evidence })]
      );
      await client.query(
        `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence, occurred_at)
         values (gen_random_uuid(), $1, 'lesson', 'lesson', $2, 10, $3::jsonb, now() - interval '1 day' - make_interval(hours => $4))`,
        [account.id, lessonId, JSON.stringify({ fixture: key }), index]
      );
    }
  }
  const attemptsAccount = byKey.get("learner-lesson-attempts")!;
  await client.query(
    `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at)
     values (gen_random_uuid(), $1, $2, 'in_progress', 40, $3::jsonb, now() - interval '1 hour')`,
    [attemptsAccount.id, activeA2LessonIds[0] ?? DEMO_IDS.lessons[0], JSON.stringify({ fixture: attemptsAccount.key, completedPartCodes: [], evidence: {
      listening: { attempts: 2, status: "wrong_exhausted", score: 0, answer: "Incorrect scenario answer", feedback: "Đã hết lượt thử. Xem đáp án hoặc gửi kháng nghị." }
    } })]
  );
  for (const attemptNumber of [1, 2]) {
    await client.query(
      `insert into lesson_part_attempts (id, learner_id, lesson_id, part_code, request_key, attempt_number, status, answer, score, feedback)
       values (gen_random_uuid(), $1, $2, 'listening', gen_random_uuid(), $3, $4, 'Incorrect scenario answer', 0, 'Nghe lại rồi kiểm tra đáp án.')`,
      [attemptsAccount.id, activeA2LessonIds[0], attemptNumber, attemptNumber === 1 ? "wrong_retry" : "wrong_exhausted"]
    );
  }
  await seedLevelReadyEvidence(client, byKey.get("learner-level-ready")!, sets);
}

type ScenarioLessonSet = {
  weekId: string; topic: string; cefr: "A2" | "B1";
  lessons: Array<{ id: string; content: { parts?: Array<{ code: string; content: { items?: Array<Record<string, unknown>> } }> } }>;
};

async function publishedScenarioLessonSets(client: Client): Promise<ScenarioLessonSet[]> {
  const result = await client.query<{
    week_id: string; topic: string; cefr: "A2" | "B1"; lesson_id: string; content: ScenarioLessonSet["lessons"][number]["content"];
  }>(
    `select pw.id as week_id, pw.topic, ls.cefr, l.id as lesson_id, lv.content
     from program_weeks pw join lesson_sets ls on ls.program_week_id = pw.id and ls.cefr in ('A2', 'B1')
     join lateral (select id from lesson_set_versions where lesson_set_id = ls.id and status = 'published'
       order by published_at desc nulls last, version desc limit 1) lsv on true
     join lessons l on l.lesson_set_version_id = lsv.id
     join lateral (select content from lesson_versions where lesson_id = l.id and status = 'published'
       order by version desc limit 1) lv on true
     where pw.program_id = $1 order by pw.week_number, ls.cefr, l.day_number`,
    [DEMO_IDS.program]
  );
  const sets = new Map<string, ScenarioLessonSet>();
  for (const row of result.rows) {
    const key = `${row.week_id}:${row.cefr}`;
    const set: ScenarioLessonSet = sets.get(key) ?? { weekId: row.week_id, topic: row.topic, cefr: row.cefr, lessons: [] };
    set.lessons.push({ id: row.lesson_id, content: row.content });
    sets.set(key, set);
  }
  return [...sets.values()];
}

function scenarioGameWords(set: ScenarioLessonSet): GameWordView[] {
  const words = new Map<string, GameWordView>();
  const wordTypes: Record<string, string> = {
    "danh từ": "noun", "động từ": "verb", "tính từ": "adjective", "trạng từ": "adverb", "giới từ": "preposition", "cụm từ": "phrase"
  };
  for (const lesson of set.lessons) {
    const items = lesson.content.parts?.find((part) => part.code === "vocabulary")?.content.items ?? [];
    for (const item of items) {
      if (typeof item.word !== "string" || !item.word.trim() || typeof item.meaning !== "string" || !item.meaning.trim()) continue;
      const english = item.word.trim();
      const key = english.toLowerCase();
      if (words.has(key)) continue;
      const rawType = String(item.partOfSpeech ?? item.type ?? "phrase").toLowerCase();
      const partOfSpeech = wordTypes[rawType] ?? (["noun", "verb", "adjective", "adverb", "preposition", "phrase"].includes(rawType) ? rawType : "phrase");
      words.set(key, {
        id: `word-${words.size + 1}`, english, vietnamese: item.meaning.trim(),
        definition: typeof item.definition === "string" && item.definition.trim() ? item.definition.trim() : item.meaning.trim(),
        partOfSpeech,
        ...(typeof item.imageQuery === "string" ? { imageQuery: item.imageQuery } : {})
      });
    }
  }
  return [...words.values()];
}

async function seedScenarioGameSets(client: Client, sets: ScenarioLessonSet[]) {
  for (const account of LOCAL_SCENARIO_ACCOUNTS.filter((item) => item.role === "learner" && item.cefrApproved)) {
    for (const set of sets.filter((item) => item.cefr === account.cefr && item.lessons.length === 5)) {
      const words = scenarioGameWords(set);
      if (!words.length) throw new Error(`SCENARIO_GAME_VOCABULARY_MISSING:${account.key}:${set.weekId}`);
      await client.query(
        `insert into game_sets (id, program_week_id, learner_id, game_key, status, payload)
         values (md5($1 || ':' || $2 || ':scenario-games')::uuid, $2::uuid, $1::uuid, 'weekly_vocabulary', 'published', $3::jsonb)`,
        [account.id, set.weekId, JSON.stringify({ source: "scenario-deploy-seed", topic: set.topic, cefr: set.cefr, words })]
      );
    }
  }
}

async function seedLevelReadyEvidence(client: Client, account: LocalScenarioAccount, sets: ScenarioLessonSet[]) {
  for (const set of sets.filter((item) => item.cefr === account.cefr && item.lessons.length === 5)) {
    const vocabulary = scenarioGameWords(set).map((word) => word.english);
    const text = vocabulary.slice(0, 3).map((word) => `I practise the expression "${word}" at work.`).join(" ");
    await client.query(
      `insert into practice_submissions (id, learner_id, program_week_id, status, content, score, feedback,
        cefr_snapshot, vocabulary_snapshot, submitted_at, reviewed_at)
       values (gen_random_uuid(), $1, $2, 'reviewed', $3::jsonb,
         '{"total":100,"rubric":{"meaning":5,"vocabulary":5,"grammar":5}}'::jsonb,
         '{"source":"human","message":"Bài mẫu tình huống đã được chấm tay."}'::jsonb, $4, $5::jsonb, now(), now())`,
      [account.id, set.weekId, JSON.stringify({ text, fixture: account.key }), account.cefr, JSON.stringify(vocabulary)]
    );
  }
  const sessionId = account.id.replace("20000000", "26000000");
  await client.query(
    `insert into coach_sessions (id, learner_id, scenario, status, completed_at)
     values ($1, $2, '{"kind":"practice","title":"Luyện nói tình huống công việc"}'::jsonb, 'completed', now())`,
    [sessionId, account.id]
  );
  for (const [index, text] of [
    "I work with the product team.", "My role is to help customers.", "We have a meeting every morning.",
    "Could you repeat the question, please?", "I will check the schedule today.", "The next step is to confirm the plan."
  ].entries()) {
    await client.query(
      `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback)
       values (gen_random_uuid(), $1, $2, 'learner', $3::jsonb,
         '{"relevant":true,"evaluation":{"countsTowardGoal":true},"rubric":{"meaning":5,"vocabulary":5,"grammar":5}}'::jsonb)`,
      [sessionId, index + 1, JSON.stringify({ text, fixture: account.key })]
    );
  }
}

async function ensurePublishedScenarioLessons(client: Client, cefr: "A2" | "B1"): Promise<string[]> {
  const lessonRows = async () => client.query<{ id: string }>(
    `select l.id
     from lesson_sets ls
     join lesson_set_versions lsv on lsv.lesson_set_id = ls.id and lsv.status = 'published'
     join lessons l on l.lesson_set_version_id = lsv.id
     where ls.program_week_id = $1 and ls.cefr = $2
     order by l.day_number`,
    [DEMO_IDS.week, cefr]
  );
  let current = await lessonRows();
  if (current.rows.length === 5) return current.rows.map((row) => row.id);

  if (cefr === "B1") {
    const lessonSetId = "24000000-0000-4000-8000-000000000001";
    const versionId = "24000000-0000-4000-8000-000000000002";
    await client.query(
      `insert into lesson_sets (id, program_week_id, cefr)
       values ($1, $2, 'B1') on conflict (program_week_id, cefr) do nothing`,
      [lessonSetId, DEMO_IDS.week]
    );
    const canonicalSet = await client.query<{ id: string }>(
      "select id from lesson_sets where program_week_id = $1 and cefr = 'B1' limit 1",
      [DEMO_IDS.week]
    );
    const canonicalSetId = canonicalSet.rows[0]?.id;
    if (!canonicalSetId) throw new Error("SCENARIO_B1_LESSON_SET_MISSING");
    const versionNumber = await client.query<{ version: number }>(
      `select version from lesson_set_versions where id = $1
       union all
       select coalesce(max(version), 0)::int + 1 from lesson_set_versions
       where lesson_set_id = $2 and not exists (select 1 from lesson_set_versions where id = $1)
       limit 1`,
      [versionId, canonicalSetId]
    );
    await client.query(
      `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by, approved_by, published_at)
       values ($1, $2, $5, 'published', $3::jsonb, $4, $4, now())
       on conflict (id) do nothing`,
      [versionId, canonicalSetId, JSON.stringify({ source: "scenario-deploy-seed", weeklyPractice: {
        task: "Write 3–5 sentences about asking for directions at work.",
        guidance: "Use at least 3 words from this week's lessons.",
        inputMode: "write",
        requiredVocabulary: ["direction", "meeting room", "turn left"]
      } }), DEMO_IDS.operator, versionNumber.rows[0]?.version ?? 1]
    );
    for (const [index, sourceLessonId] of DEMO_IDS.lessons.entries()) {
      const lessonId = `24000000-0000-4000-8100-${String(index + 1).padStart(12, "0")}`;
      const lessonVersionId = `24000000-0000-4000-8200-${String(index + 1).padStart(12, "0")}`;
      await client.query(
        `insert into lessons (id, lesson_set_version_id, day_number, title)
         select $1, $2, $3, replace(title, 'A2', 'B1') from lessons where id = $4
         on conflict (id) do update set lesson_set_version_id = excluded.lesson_set_version_id,
           day_number = excluded.day_number, title = excluded.title`,
        [lessonId, versionId, index + 1, sourceLessonId]
      );
      await client.query(
        `insert into lesson_versions (id, lesson_id, version, status, content)
         select $1, $2, 1, 'published', content || '{"scenarioLevel":"B1"}'::jsonb
         from lesson_versions where lesson_id = $3 order by version desc limit 1
         on conflict (id) do update set status = 'published', content = excluded.content`,
        [lessonVersionId, lessonId, sourceLessonId]
      );
    }
    current = await lessonRows();
    if (current.rows.length !== 5) throw new Error(`SCENARIO_B1_PUBLISHED_LESSON_COUNT:${current.rows.length}`);
    return current.rows.map((row) => row.id);
  }

  const fallback = await client.query<{ id: string }>(
    `select lsv.id
     from lesson_sets ls
     join lesson_set_versions lsv on lsv.lesson_set_id = ls.id
     where ls.program_week_id = $1 and ls.cefr = $2
       and lsv.published_at is not null
       and (select count(*) from lessons l where l.lesson_set_version_id = lsv.id) > 0
     order by lsv.published_at desc, lsv.version desc
     limit 1`,
    [DEMO_IDS.week, cefr]
  );
  const fallbackVersionId = fallback.rows[0]?.id;
  if (!fallbackVersionId) return [...DEMO_IDS.lessons];

  await client.query("update lesson_set_versions set status = 'published' where id = $1", [fallbackVersionId]);
  await client.query(
    `update lesson_versions lv set status = 'published'
     from lessons l where l.id = lv.lesson_id and l.lesson_set_version_id = $1`,
    [fallbackVersionId]
  );
  current = await lessonRows();
  return current.rows.map((row) => row.id);
}
