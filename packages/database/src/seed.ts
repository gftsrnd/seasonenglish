import type { Client } from "pg";

export const DEMO_IDS = {
  organization: "00000000-0000-4000-8000-000000000001",
  learner: "00000000-0000-4000-8000-000000000101",
  operator: "00000000-0000-4000-8000-000000000102",
  manager: "00000000-0000-4000-8000-000000000103",
  program: "00000000-0000-4000-8000-000000000201",
  week: "00000000-0000-4000-8000-000000000301",
  lessonSet: "00000000-0000-4000-8000-000000000401",
  publishedLessonSetVersion: "00000000-0000-4000-8000-000000000501"
} as const;

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
     values ($1, $2::jsonb, now()) on conflict (user_id) do nothing`,
    [DEMO_IDS.learner, JSON.stringify({ position: "AI Intern", goals: ["meeting", "email"], preferredLanguage: "vi" })]
  );
  await client.query(
    `insert into programs (id, organization_id, name, start_date, week_count, status)
     values ($1, $2, 'E4S Pilot', current_date, 4, 'active') on conflict (id) do nothing`,
    [DEMO_IDS.program, DEMO_IDS.organization]
  );
  await client.query(
    `insert into enrollments (id, program_id, learner_id, cefr, cefr_approved)
     values ('00000000-0000-4000-8000-000000000211', $1, $2, 'A2', true)
     on conflict (program_id, learner_id) do nothing`,
    [DEMO_IDS.program, DEMO_IDS.learner]
  );
  await client.query(
    `insert into program_weeks (id, program_id, week_number, topic, description, objectives)
     values ($1, $2, 1, 'Giới thiệu trong công việc', 'Tự giới thiệu và hỏi thông tin cơ bản', '["Tự giới thiệu 4-5 câu"]'::jsonb)
     on conflict (id) do nothing`,
    [DEMO_IDS.week, DEMO_IDS.program]
  );
  await client.query(
    `insert into lesson_sets (id, program_week_id, cefr)
     values ($1, $2, 'A2') on conflict (id) do nothing`,
    [DEMO_IDS.lessonSet, DEMO_IDS.week]
  );
  await client.query(
    `insert into lesson_set_versions (id, lesson_set_id, version, status, payload, created_by, approved_by, published_at)
     values ($1, $2, 1, 'published', '{"source":"deterministic-seed"}'::jsonb, $3, $4, now())
     on conflict (id) do nothing`,
    [DEMO_IDS.publishedLessonSetVersion, DEMO_IDS.lessonSet, DEMO_IDS.operator, DEMO_IDS.manager]
  );
}

