import type { Client } from "pg";
import { finalDefinition, levelUpDefinition, placementDefinition } from "./assessment-blueprints.js";

export const DEMO_IDS = {
  organization: "00000000-0000-4000-8000-000000000001",
  learner: "00000000-0000-4000-8000-000000000101",
  operator: "00000000-0000-4000-8000-000000000102",
  manager: "00000000-0000-4000-8000-000000000103",
  checker: "00000000-0000-4000-8000-000000000104",
  program: "00000000-0000-4000-8000-000000000201",
  week: "00000000-0000-4000-8000-000000000301",
  week2: "00000000-0000-4000-8000-000000000302",
  lessonSet: "00000000-0000-4000-8000-000000000401",
  publishedLessonSetVersion: "00000000-0000-4000-8000-000000000501",
  lessons: [
    "00000000-0000-4000-8000-000000000601",
    "00000000-0000-4000-8000-000000000602",
    "00000000-0000-4000-8000-000000000603",
    "00000000-0000-4000-8000-000000000604",
    "00000000-0000-4000-8000-000000000605"
  ],
  lessonVersions: [
    "00000000-0000-4000-8000-000000000701",
    "00000000-0000-4000-8000-000000000702",
    "00000000-0000-4000-8000-000000000703",
    "00000000-0000-4000-8000-000000000704",
    "00000000-0000-4000-8000-000000000705"
  ],
  progress: "00000000-0000-4000-8000-000000000801",
  activity: "00000000-0000-4000-8000-000000000811",
  badge: "00000000-0000-4000-8000-000000000821",
  reward: "00000000-0000-4000-8000-000000000831",
  microLesson: "00000000-0000-4000-8000-000000000841",
  coachSession: "00000000-0000-4000-8000-000000000851",
  practiceSubmission: "00000000-0000-4000-8000-000000000861",
  gameSet: "00000000-0000-4000-8000-000000000862",
  placementDefinition: "00000000-0000-4000-8000-000000000871",
  placementVersion: "00000000-0000-4000-8000-000000000872",
  placementAttempt: "00000000-0000-4000-8000-000000000873",
  finalDefinition: "00000000-0000-4000-8000-000000000881",
  finalVersion: "00000000-0000-4000-8000-000000000882",
  levelUpDefinition: "00000000-0000-4000-8000-000000000891",
  levelUpVersion: "00000000-0000-4000-8000-000000000892"
} as const;

const badgeCatalog = [
  ["00000000-0000-4000-8000-000000000821", "starter", "Khởi động", "Hoàn thành bài học đầu tiên", 2],
  ["00000000-0000-4000-8000-000000000822", "streak3", "Chuỗi 3 ngày", "Học 3 ngày liên tiếp từ T2–T6", 2],
  ["00000000-0000-4000-8000-000000000823", "week_complete", "Tuần trọn vẹn", "Hoàn thành toàn bộ bài trong một tuần", 3],
  ["00000000-0000-4000-8000-000000000824", "friday", "Đúng hẹn thứ Sáu", "Nộp bài thực hành tuần đúng hạn", 3],
  ["00000000-0000-4000-8000-000000000825", "coach_friend", "Bạn của Season", "Hoàn thành 10 lượt luyện với Season", 3],
  ["00000000-0000-4000-8000-000000000826", "streak5", "Chuỗi 5 ngày", "Học đủ 5 ngày trong tuần", 4],
  ["00000000-0000-4000-8000-000000000827", "first_try", "Chuẩn ngay lần đầu", "Bốn kỹ năng đúng ở lần thử đầu", 4],
  ["00000000-0000-4000-8000-000000000828", "wordsmith", "Thợ mở khoá", "Mở đủ ô từ bí mật với Season", 4]
] as const;

const lessonTitles = [
  "I work in… as…",
  "Past simple: I joined…",
  "What do you do?",
  "I am working on…",
  "be going to + verb"
] as const;

const promptDefaults = [
  ["00000000-0000-4000-8000-000000001001", "system_rules", "You are the AI engine of Season English, an internal English-learning product for Vietnamese office staff. Adapt vocabulary, sentence length and grammar strictly to the learner's CEFR level. Use Vietnamese explanations for A1–A2 and English for B1+. Be warm but honest, point out real errors, and keep examples workplace-relevant."],
  ["00000000-0000-4000-8000-000000001002", "assessment_scoring", "Grade the productive parts of the Workplace English CEFR Placement Test using the approved writing and speaking rubrics. Return criterion scores, one suggested CEFR level, a short Vietnamese rationale and a realistic one-month goal. Do not assess pronunciation from transcript text."],
  ["00000000-0000-4000-8000-000000001003", "weekly_lessons", "Return valid JSON only. Create {n} CEFR-aligned workplace English lessons for {topic}, {job} and {learning_style}. Keep the approved lesson order and all required keys for objective, theory, vocabulary, pronunciation, listening, reading, writing, speaking and practice."],
  ["00000000-0000-4000-8000-000000001004", "week_suggestions", "Return valid JSON only. Suggest three distinct workplace-English topic options for each of {n} weeks, using {learners}, {levels} and {used}. Include a concrete situation, measurable objectives, vocabulary hints and a five-day plan for every level."],
  ["00000000-0000-4000-8000-000000001005", "micro_grading", "Return valid JSON only. Grade {answer} against {practice}, {theory} and {vocab} at {cefr_level}. Accept any grammatically correct answer that follows the taught pattern and fits the meaning. Give concise feedback without revealing the answer when retry is needed."],
  ["00000000-0000-4000-8000-000000001006", "coach_dialogue", "You are Season, the learner's friendly conversation coach. Reply naturally at the learner's CEFR level, ask one follow-up question, score meaning, vocabulary and grammar, give at most three concrete corrections and return a corrected version when needed."],
  ["00000000-0000-4000-8000-000000001007", "weekly_practice_grading", "Grade a learner's weekly practice with the shared rubric. Return valid JSON only. Score meaning, vocabulary and grammar from 1 to 5, calculate a total score from 0 to 100, give concise Vietnamese feedback, at most three concrete suggestions and a corrected version."],
  ["00000000-0000-4000-8000-000000001008", "vocabulary_generation", "Return valid JSON only. Create exactly 15 useful workplace-English words or short phrases for the requested topic and CEFR level. Give a stable lowercase id, English form, concise Vietnamese meaning, simple English definition and one partOfSpeech from noun, verb, adjective, adverb, preposition or phrase. Avoid duplicates and unsafe or irrelevant content."]
] as const;

const lessonStudyContent = [
  {
    objective: "Giới thiệu được tên, vai trò và nhóm làm việc bằng 3–4 câu ngắn.",
    vocabulary: [
      { word: "colleague", type: "danh từ", pronunciation: "/ˈkɒliːɡ/", meaning: "đồng nghiệp", examples: ["my colleague", "a new colleague"] },
      { word: "role", type: "danh từ", pronunciation: "/rəʊl/", meaning: "vai trò", examples: ["my role", "project role"] },
      { word: "work with", type: "cụm từ", pronunciation: "/wɜːk wɪð/", meaning: "làm việc cùng", examples: ["I work with the AI team."] }
    ],
    grammar: { formula: "I am + vai trò · I work with + nhóm", usage: "Dùng be để nói vai trò và work with để nói nhóm cộng tác.", examples: ["I am an AI intern.", "I work with the product team."] },
    pronunciation: { focus: "/wɜː/", instruction: "Giữ âm giữa dài và không đọc thành âm /o/.", words: ["work", "worker", "working"] }
  },
  {
    objective: "Hỏi và trả lời được mình đến từ đâu trong một cuộc làm quen ngắn.",
    vocabulary: [
      { word: "new", type: "tính từ", pronunciation: "/njuː/", meaning: "mới", examples: ["new here", "a new job", "a new team"] },
      { word: "nice", type: "tính từ", pronunciation: "/naɪs/", meaning: "vui, dễ chịu", examples: ["nice to meet you", "a nice team"] },
      { word: "from", type: "giới từ", pronunciation: "/frɒm/", meaning: "từ, đến từ", examples: ["from Hue", "from Vietnam", "from my team"] }
    ],
    grammar: { formula: "Where are you from? · I am from + nơi", usage: "Dùng khi làm quen và hỏi nguồn gốc hoặc nơi sinh sống.", examples: ["I am from Hue.", "Nice to meet you.", "I am new here."] },
    pronunciation: { focus: "/aɪ/", instruction: "Mở rộng miệng ở âm /a/ rồi lướt nhanh sang /ɪ/.", words: ["I", "nice", "time"] }
  },
  {
    objective: "Mô tả được 2–3 công việc thường làm trong một ngày.",
    vocabulary: [
      { word: "prepare", type: "động từ", pronunciation: "/prɪˈpeə/", meaning: "chuẩn bị", examples: ["prepare a report"] },
      { word: "review", type: "động từ", pronunciation: "/rɪˈvjuː/", meaning: "xem lại", examples: ["review the data"] },
      { word: "usually", type: "trạng từ", pronunciation: "/ˈjuːʒuəli/", meaning: "thường xuyên", examples: ["I usually check email."] }
    ],
    grammar: { formula: "I usually + động từ · I + động từ + every day", usage: "Dùng hiện tại đơn để mô tả công việc lặp lại.", examples: ["I prepare reports every day.", "I usually review the data."] },
    pronunciation: { focus: "/juː/", instruction: "Bắt đầu nhẹ bằng /j/ rồi kéo dài âm /uː/.", words: ["usually", "you", "review"] }
  },
  {
    objective: "Hỏi lại lịch sự khi chưa nghe rõ hoặc chưa hiểu một yêu cầu.",
    vocabulary: [
      { word: "repeat", type: "động từ", pronunciation: "/rɪˈpiːt/", meaning: "nhắc lại", examples: ["repeat that, please"] },
      { word: "mean", type: "động từ", pronunciation: "/miːn/", meaning: "có nghĩa là", examples: ["What do you mean?"] },
      { word: "clarify", type: "động từ", pronunciation: "/ˈklærəfaɪ/", meaning: "làm rõ", examples: ["Could you clarify that?"] }
    ],
    grammar: { formula: "Could you + động từ, please?", usage: "Dùng could để hỏi lại lịch sự trong công việc.", examples: ["Could you repeat that, please?", "Could you clarify the deadline?"] },
    pronunciation: { focus: "/iː/", instruction: "Kéo dài âm /iː/ và giữ môi hơi ngang.", words: ["repeat", "mean", "please"] }
  },
  {
    objective: "Tóm tắt được nội dung chính và đề xuất một bước tiếp theo rõ ràng.",
    vocabulary: [
      { word: "summary", type: "danh từ", pronunciation: "/ˈsʌməri/", meaning: "bản tóm tắt", examples: ["a short summary"] },
      { word: "action item", type: "cụm danh từ", pronunciation: "/ˈækʃən ˌaɪtəm/", meaning: "việc cần làm", examples: ["confirm the action items"] },
      { word: "next step", type: "cụm danh từ", pronunciation: "/nekst step/", meaning: "bước tiếp theo", examples: ["agree on the next step"] }
    ],
    grammar: { formula: "To summarise, ... · Next, we will + động từ", usage: "Dùng để kết thúc cuộc trao đổi và xác nhận hành động tiếp theo.", examples: ["To summarise, the report is ready.", "Next, we will review it."] },
    pronunciation: { focus: "/st st/", instruction: "Nối hai cụm phụ âm trong next step, không thêm nguyên âm ở giữa.", words: ["next step", "first step", "last step"] }
  }
] as const;

function lessonContent(dayNumber: number, title: string) {
  const study = lessonStudyContent[dayNumber - 1] ?? lessonStudyContent[0];
  const text = study.objective;
  return {
    durationMinutes: 10,
    parts: [
      { code: "objective", title: "Mục tiêu bài học", content: { text } },
      { code: "instruction", title: "Hướng dẫn làm bài", content: { steps: ["Học nội dung", "Làm lần lượt các bài tập", "Xem phản hồi và làm lại"] } },
      { code: "vocabulary", title: "Từ vựng", content: { items: study.vocabulary } },
      { code: "grammar", title: "Ngữ pháp", content: study.grammar },
      { code: "pronunciation", title: "Phát âm", content: study.pronunciation },
      { code: "listening", title: "Nghe", content: { prompt: "Chọn ý chính bạn nghe được.", answer: "A", options: ["A", "B", "C"] } },
      { code: "reading", title: "Đọc", content: { prompt: "Chọn thông tin đúng trong đoạn ngắn.", answer: "B", options: ["A", "B", "C"] } },
      { code: "writing", title: "Viết", content: { prompt: `Viết 2–3 câu về chủ đề ngày ${dayNumber}.` } },
      { code: "word_class", title: "Từ loại", content: { prompt: "Chọn từ loại đúng.", answer: "noun" } },
      { code: "word_use", title: "Dùng từ", content: { prompt: "Chọn câu dùng từ đúng.", answer: "A" } },
      { code: "speaking", title: "Nói", content: { prompt: "Ghi âm câu trả lời ngắn." } }
    ]
  };
}

export async function seedDemo(client: Client): Promise<void> {
  await client.query(
    `insert into organizations (id, name, slug)
     values ($1, 'GFT Demo', 'gft-demo')
     on conflict (id) do nothing`,
    [DEMO_IDS.organization]
  );

  const users = [
    [DEMO_IDS.learner, "learner", "Học viên Demo", "learner@e4s.local"],
    [DEMO_IDS.operator, "operator", "Thư Demo", "operator@e4s.local"],
    [DEMO_IDS.checker, "operator", "Minh Checker", "checker@e4s.local"],
    [DEMO_IDS.manager, "manager", "Quản lý Demo", "manager@e4s.local"]
  ] as const;
  for (const user of users) {
    await client.query(
      `insert into users (id, organization_id, role, display_name, email)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do nothing`,
      [user[0], DEMO_IDS.organization, user[1], user[2], user[3]]
    );
  }

  await client.query(
    `insert into learner_profiles (user_id, profile, completed_at)
     values ($1, $2::jsonb, now())
     on conflict (user_id) do update set profile = case
       when learner_profiles.profile ? 'avatar' then learner_profiles.profile
       else learner_profiles.profile || jsonb_build_object('avatar', excluded.profile->'avatar')
     end`,
    [DEMO_IDS.learner, JSON.stringify({
      fullName: "Học viên Demo",
      email: "learner@e4s.local",
      department: "AI",
      position: "AI Intern",
      contact: "",
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
      selfLevel: "A2",
      certificates: [],
      experience: "Học ở trường",
      concerns: "Muốn nói rõ hơn trong cuộc họp",
      avatar: { color: "olive", acc: "sun", bg: 2 }
    })]
  );
  await client.query(
    `insert into programs (id, organization_id, name, start_date, week_count, current_week_override, status)
     values ($1, $2, 'E4S Pilot', date '2026-10-05', 2, 1, 'active')
     on conflict (id) do update set start_date = excluded.start_date, week_count = excluded.week_count,
       current_week_override = excluded.current_week_override, status = excluded.status`,
    [DEMO_IDS.program, DEMO_IDS.organization]
  );
  await client.query(
    `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
     values ('00000000-0000-4000-8000-000000000211', $1, $2, 'A2', true)
     on conflict (program_id, learner_id) do nothing`,
    [DEMO_IDS.program, DEMO_IDS.learner]
  );
  await client.query(
    `insert into program_weeks (id, program_id, week_number, topic, description, objectives, key_vocab_hint)
     values ($1, $2, 1, 'Introducing yourself & your job',
       'Tự giới thiệu trong buổi họp đầu với khách hoặc đồng nghiệp mới.',
       '["Nói/viết 4–6 câu về bản thân và công việc."]'::jsonb,
       'colleague, in charge of, department, deadline')
     on conflict (id) do update set topic = excluded.topic, description = excluded.description,
       objectives = excluded.objectives, key_vocab_hint = excluded.key_vocab_hint`,
    [DEMO_IDS.week, DEMO_IDS.program]
  );
  await client.query(
    `insert into program_weeks (id, program_id, week_number, topic, description, objectives, key_vocab_hint)
     values ($1, $2, 2, 'Emails & rescheduling meetings',
       'Viết email ngắn xin dời lịch và xác nhận lịch mới.',
       '["Viết email 60–100 từ xin dời lịch."]'::jsonb,
       'reschedule, postpone, available, confirm')
     on conflict (id) do update set topic = excluded.topic, description = excluded.description,
       objectives = excluded.objectives, key_vocab_hint = excluded.key_vocab_hint`,
    [DEMO_IDS.week2, DEMO_IDS.program]
  );
  for (const [id, taskKey, content] of promptDefaults) {
    await client.query(
      `insert into prompt_versions (id, organization_id, task_key, version, content, status, created_by)
       values ($1, $2, $3, 1, $4, 'active', $5)
       on conflict (id) do nothing`,
      [id, DEMO_IDS.organization, taskKey, content, DEMO_IDS.operator]
    );
  }
  await client.query(
    `insert into lesson_sets (id, program_week_id, cefr)
     values ($1, $2, 'A2') on conflict (id) do nothing`,
    [DEMO_IDS.lessonSet, DEMO_IDS.week]
  );
  await client.query(
    `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by, approved_by, published_at)
     values ($1, $2, 1, 'published', '{"source":"deterministic-seed"}'::jsonb, $3, $4, now())
     on conflict (id) do nothing`,
    [DEMO_IDS.publishedLessonSetVersion, DEMO_IDS.lessonSet, DEMO_IDS.operator, DEMO_IDS.checker]
  );

  for (const [index, lessonId] of DEMO_IDS.lessons.entries()) {
    const dayNumber = index + 1;
    const title = lessonTitles[index] ?? `Bài ${dayNumber}`;
    await client.query(
      `insert into lessons (id, lesson_set_version_id, day_number, title)
       values ($1, $2, $3, $4) on conflict (id) do update set title = excluded.title`,
      [lessonId, DEMO_IDS.publishedLessonSetVersion, dayNumber, title]
    );
    await client.query(
      `insert into lesson_versions (id, lesson_id, version, status, content)
       values ($1, $2, 1, 'published', $3::jsonb)
       on conflict (id) do update set content = excluded.content`,
      [DEMO_IDS.lessonVersions[index], lessonId, JSON.stringify(lessonContent(dayNumber, title))]
    );
  }

  await client.query(
    `insert into progress_records (id, learner_id, lesson_id, status, score, evidence, started_at, completed_at)
     values ($1, $2, $3, 'completed', 90,
       '{"completedPartCodes":["listening","reading","writing","speaking"],"evidence":{"listening":{"attempts":1,"answer":"A"},"reading":{"attempts":1,"answer":"B"},"writing":{"attempts":1,"answer":"I work in AI."},"speaking":{"attempts":1,"answer":"seed-audio"}}}'::jsonb,
       now() - interval '1 day', now() - interval '1 day')
     on conflict (learner_id, lesson_id) do nothing`,
    [DEMO_IDS.progress, DEMO_IDS.learner, DEMO_IDS.lessons[0]]
  );
  await client.query(
    `insert into activities (id, learner_id, activity_type, reference_type, reference_id, minutes, evidence, occurred_at)
     values ($1, $2, 'lesson', 'lesson', $3, 10, '{"source":"deterministic-seed"}'::jsonb, date_trunc('week', now()) + interval '9 hours')
     on conflict (id) do update set occurred_at = excluded.occurred_at`,
    [DEMO_IDS.activity, DEMO_IDS.learner, DEMO_IDS.lessons[0]]
  );
  for (const [id, key, label, description, seasonLevel] of badgeCatalog) {
    await client.query(
      `insert into badges (id, organization_id, badge_key, label, rule)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (id) do update set label = excluded.label, rule = excluded.rule`,
      [id, DEMO_IDS.organization, key, label, JSON.stringify({ description, seasonLevel })]
    );
  }
  await client.query(
    `insert into reward_events (id, learner_id, badge_id, points, source_type, source_id)
     values ($1, $2, $3, 20, 'lesson', $4) on conflict (id) do nothing`,
    [DEMO_IDS.reward, DEMO_IDS.learner, DEMO_IDS.badge, DEMO_IDS.lessons[0]]
  );
  await client.query(
    `insert into micro_lessons (id, learner_id, program_week_id, cefr, topic, content, source)
     values ($1, $2, $3, 'A2', 'Email ngắn',
       '{"durationMinutes":5,"theory":"Dùng could để yêu cầu lịch sự.","vocabulary":["could","reschedule","confirm"],"practice":{"prompt":"Chọn câu xin dời lịch lịch sự.","type":"mcq","options":["Move it.","Could we reschedule to 3 PM?","I no come."],"answer":"Could we reschedule to 3 PM?"}}'::jsonb,
       'seed') on conflict (id) do update set content = excluded.content, source = excluded.source`,
    [DEMO_IDS.microLesson, DEMO_IDS.learner, DEMO_IDS.week]
  );

  await client.query(
    `insert into coach_sessions (id, learner_id, scenario, status)
     values ($1, $2, '{"title":"Daily meeting"}'::jsonb, 'active') on conflict (id) do nothing`,
    [DEMO_IDS.coachSession, DEMO_IDS.learner]
  );
  await client.query(
    `insert into coach_turns (id, session_id, turn_number, speaker, content, feedback, created_at)
     values
       ('00000000-0000-4000-8000-000000000852', $1, 1, 'learner', '{"text":"I work in AI."}'::jsonb, '{"rubricScore":4.2}'::jsonb, date_trunc('week', now()) + interval '10 hours'),
       ('00000000-0000-4000-8000-000000000853', $1, 2, 'learner', '{"text":"I prepare data."}'::jsonb, '{"rubricScore":4.4}'::jsonb, date_trunc('week', now()) + interval '11 hours')
     on conflict (id) do nothing`,
    [DEMO_IDS.coachSession]
  );
  await client.query(
    `insert into practice_submissions (id, learner_id, program_week_id, status, content, score, submitted_at, reviewed_at)
     values ($1, $2, $3, 'reviewed', '{"text":"Weekly sample"}'::jsonb, '{"total":86}'::jsonb,
       date_trunc('week', now()) - interval '3 days', date_trunc('week', now()) - interval '2 days')
     on conflict (id) do nothing`,
    [DEMO_IDS.practiceSubmission, DEMO_IDS.learner, DEMO_IDS.week]
  );
  await client.query(
    `insert into game_sets (id, program_week_id, game_key, status, payload)
     values ($1, $2, 'weekly_vocabulary', 'published', $3::jsonb)
     on conflict (id) do update set payload = excluded.payload, status = excluded.status`,
    [DEMO_IDS.gameSet, DEMO_IDS.week, JSON.stringify({
      topic: "Tuần 1: Introducing yourself & your job",
      cefr: "A2",
      words: [
        { id: "colleague", english: "colleague", vietnamese: "đồng nghiệp", definition: "a person you work with", partOfSpeech: "noun" },
        { id: "in-charge-of", english: "in charge of", vietnamese: "phụ trách", definition: "responsible for something", partOfSpeech: "phrase" },
        { id: "customer", english: "customer", vietnamese: "khách hàng", definition: "a person who buys goods or services", partOfSpeech: "noun" },
        { id: "join", english: "join", vietnamese: "gia nhập", definition: "to become part of a group", partOfSpeech: "verb" },
        { id: "project", english: "project", vietnamese: "dự án", definition: "a planned piece of work", partOfSpeech: "noun" },
        { id: "finish", english: "finish", vietnamese: "hoàn thành", definition: "to complete something", partOfSpeech: "verb" },
        { id: "deadline", english: "deadline", vietnamese: "hạn chót", definition: "the latest time work must be completed", partOfSpeech: "noun" },
        { id: "manager", english: "manager", vietnamese: "quản lý, trưởng phòng", definition: "a person who manages a team", partOfSpeech: "noun" },
        { id: "report-to", english: "report to", vietnamese: "báo cáo cho", definition: "to work under someone's direction", partOfSpeech: "phrase" },
        { id: "update", english: "update", vietnamese: "bản cập nhật", definition: "new information about progress", partOfSpeech: "noun" },
        { id: "website", english: "website", vietnamese: "trang web", definition: "a collection of web pages", partOfSpeech: "noun" },
        { id: "app", english: "app", vietnamese: "ứng dụng", definition: "a software application", partOfSpeech: "noun" },
        { id: "client", english: "client", vietnamese: "khách hàng (doanh nghiệp)", definition: "a person or company receiving a service", partOfSpeech: "noun" },
        { id: "plan", english: "plan", vietnamese: "lên kế hoạch", definition: "to decide how to do something", partOfSpeech: "verb" },
        { id: "visit", english: "visit", vietnamese: "đến thăm", definition: "to go and see a person or place", partOfSpeech: "verb" }
      ]
    })]
  );

  const assessments = [
    [DEMO_IDS.placementDefinition, "placement-a", "placement", "Bài test đầu vào", DEMO_IDS.placementVersion, placementDefinition],
    [DEMO_IDS.finalDefinition, "final-b", "final", "Bài kiểm tra cuối kỳ", DEMO_IDS.finalVersion, finalDefinition],
    [DEMO_IDS.levelUpDefinition, "levelup-b1", "level_up", "Đề thi lên mức B1", DEMO_IDS.levelUpVersion, levelUpDefinition]
  ] as const;
  for (const [definitionId, key, kind, title, versionId, blueprint] of assessments) {
    await client.query(
      `insert into assessment_definitions (id, organization_id, assessment_key, kind, title)
       values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
      [definitionId, DEMO_IDS.organization, key, kind, title]
    );
    await client.query(
      `insert into assessment_versions (id, definition_id, version, status, blueprint, published_at)
       values ($1, $2, 1, 'published', $3::jsonb, now())
       on conflict (id) do update set blueprint = excluded.blueprint`,
      [versionId, definitionId, JSON.stringify(blueprint)]
    );
  }
  await client.query(
    `insert into assessment_attempts (id, assessment_version_id, learner_id, status, current_section, submitted_at)
     values ($1, $2, $3, 'approved', 'speaking', now() - interval '5 days') on conflict (id) do nothing`,
    [DEMO_IDS.placementAttempt, DEMO_IDS.placementVersion, DEMO_IDS.learner]
  );
  for (const [index, [section, score]] of [["listening", 14], ["reading", 16], ["writing", 13], ["speaking", 12]].entries()) {
    await client.query(
      `insert into assessment_scores (id, attempt_id, section, score, criteria, source)
       values ($1, $2, $3, $4, '{}'::jsonb, 'human') on conflict (id) do nothing`,
      [`00000000-0000-4000-8000-${String(900 + index).padStart(12, "0")}`, DEMO_IDS.placementAttempt, section, score]
    );
  }
  await client.query(
    `insert into assessment_decisions (id, attempt_id, suggested_level, approved_level, status, reason, decided_by, decided_at)
     values ('00000000-0000-4000-8000-000000000910', $1, 'A2', 'A2', 'approved', 'Seeded demo decision', $2, now() - interval '4 days')
     on conflict (id) do nothing`,
    [DEMO_IDS.placementAttempt, DEMO_IDS.operator]
  );
}
