-- Cơ chế học theo tháng (thay cơ chế theo tuần). Chỉ THÊM bảng/cột và đánh dấu deprecated;
-- không drop gì để dữ liệu tuần cũ còn nguyên cho Minh quyết định sau.

-- Đánh dấu ngừng dùng lịch pilot và các bảng theo tuần.
comment on column programs.start_date is 'deprecated 2026-10-31: lịch pilot theo tuần; dùng program_months';
comment on column programs.week_count is 'deprecated 2026-10-31: lịch pilot theo tuần; dùng program_months';
comment on column programs.current_week_override is 'deprecated 2026-10-31: không còn ép tuần';
comment on table program_weeks is 'deprecated 2026-10-31: thay bằng program_months + month_frameworks';
comment on table practice_submissions is 'deprecated 2026-10-31: bài thực hành cuối tuần, thay bằng bài thi tháng (assessment kind monthly_exam)';
comment on table practice_appeals is 'deprecated 2026-10-31: thay bằng monthly_exam_appeals';
comment on table scheduled_level_changes is 'deprecated 2026-10-31: mức mới có hiệu lực theo cơ chế người mới (learner_month_enrollments)';

-- Một dòng cho mỗi tháng của tổ chức. month dạng YYYY-MM theo Asia/Ho_Chi_Minh.
create table if not exists program_months (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  exam_date date not null,
  lesson_count integer not null check (lesson_count > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, month)
);

-- Một khung cho mỗi tháng × level.
create table if not exists month_frameworks (
  id uuid primary key,
  program_month_id uuid not null references program_months(id) on delete cascade,
  cefr text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  version integer not null default 1,
  -- vocabulary: [{word, meaning, example, abstract, imageQuery?}] (N phần tử)
  vocabulary jsonb not null default '[]'::jsonb,
  -- grammar_topics: [{title, summary, steps: [{step, focus, description}]}] (Y phần tử)
  grammar_topics jsonb not null default '[]'::jsonb,
  -- sounds: [{ipa, label, description}] (Z phần tử)
  sounds jsonb not null default '[]'::jsonb,
  -- Kế hoạch chia bài ngày (từ nào, bước ngữ pháp nào, ví dụ âm nào cho từng ngày) để tái hiện được.
  distribution_plan jsonb not null default '{}'::jsonb,
  source text not null default 'ai' check (source in ('ai', 'sample', 'manual')),
  generation_job_id uuid references jobs(id),
  generation_error text,
  created_by uuid references users(id),
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_month_id, cefr)
);

-- Bài ngày của khung: liên kết sang lessons hiện có để giữ nguyên editor, kháng nghị, tiến độ.
create table if not exists month_lessons (
  id uuid primary key,
  framework_id uuid not null references month_frameworks(id) on delete cascade,
  lesson_number integer not null check (lesson_number > 0),
  lesson_date date not null,
  lesson_id uuid references lessons(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'generating', 'draft', 'approved', 'failed')),
  generation_error text,
  approved_by uuid references users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_id, lesson_number)
);

-- Bài thi tháng của khung: assessment_definitions kind 'monthly_exam'.
alter table month_frameworks
  add column if not exists exam_assessment_version_id uuid references assessment_versions(id),
  add column if not exists exam_status text not null default 'none' check (exam_status in ('none', 'generating', 'draft', 'approved', 'failed')),
  add column if not exists exam_generation_error text,
  add column if not exists exam_approved_by uuid references users(id),
  add column if not exists exam_approved_at timestamptz;

-- Ghi danh theo tháng của học viên (cơ chế người mới).
create table if not exists learner_month_enrollments (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  program_month_id uuid not null references program_months(id) on delete cascade,
  cefr text not null,
  mode text not null check (mode in ('join_current_month', 'wait_next_month', 'locked_missed_exam', 'unlocked_by_manager')),
  -- Ngày hiệu lực của riêng học viên (ngày duyệt → trước ngày thi), dạng ['YYYY-MM-DD', ...]
  effective_days jsonb not null default '[]'::jsonb,
  max_absences integer not null default 0,
  ratio_percent numeric(5, 2),
  approved_at timestamptz not null,
  starts_on date,
  -- Lý do ghi danh: placement, level_up, placement_appeal, course_pass_failed, exam_appeal, content_approved, manager_unlock
  reason text not null,
  -- Tháng không tính vào số tháng xét lên mức (bỏ thi rồi được Quản lý mở).
  counts_for_level_up boolean not null default true,
  created_at timestamptz not null default now(),
  unique (learner_id, program_month_id)
);

-- Ngày điểm danh: 1 dòng cho mỗi ngày học có hoàn thành >= 1 bài.
create table if not exists learner_attendance_days (
  learner_id uuid not null references users(id) on delete cascade,
  attendance_date date not null,
  lesson_id uuid references lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (learner_id, attendance_date)
);

-- Khiếu nại không đủ điều kiện thi tháng: Quản lý có 24 giờ, quá hạn thì tự cho thi.
create table if not exists monthly_exam_appeals (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  program_month_id uuid not null references program_months(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'auto_approved')),
  deadline_at timestamptz not null,
  resolution text,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (learner_id, program_month_id)
);

-- Bỏ thi tháng → khoá tháng sau; học viên gửi báo cáo xin mở, Quản lý mở thì vào thẳng tháng mới.
create table if not exists monthly_unlock_requests (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  missed_program_month_id uuid not null references program_months(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolution text,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (learner_id, missed_program_month_id)
);

-- Khiếu nại bài kiểm tra đầu vào / pass course: 1 lần, trong 3 ngày kể từ khi được duyệt mức.
alter table appeals
  add column if not exists proposed_level text,
  add column if not exists kind text not null default 'placement',
  add column if not exists expires_at timestamptz;

-- Khoá tài khoản vì vắng 5 ngày học liên tiếp; Quản lý mở lại.
create table if not exists account_locks (
  id uuid primary key,
  learner_id uuid not null references users(id) on delete cascade,
  reason text not null check (reason in ('consecutive_absence', 'manual')),
  detail jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  unlocked_by uuid references users(id),
  unlocked_at timestamptz,
  unlock_note text
);

create index if not exists account_locks_active_idx on account_locks (learner_id) where unlocked_at is null;
create index if not exists month_lessons_framework_idx on month_lessons (framework_id, lesson_number);
create index if not exists learner_month_enrollments_learner_idx on learner_month_enrollments (learner_id, created_at desc);
create index if not exists monthly_exam_appeals_pending_idx on monthly_exam_appeals (status, deadline_at);
