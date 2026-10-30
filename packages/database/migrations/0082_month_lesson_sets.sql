-- Bài ngày của tháng dùng lại lesson_sets / lesson_set_versions / lessons để giữ nguyên editor,
-- kháng nghị và tiến độ. Lesson set của tháng không có program_week_id: nới NOT NULL (không xoá dữ liệu).
alter table lesson_sets alter column program_week_id drop not null;
alter table lesson_sets add column if not exists month_framework_id uuid references month_frameworks(id) on delete cascade;
create unique index if not exists lesson_sets_month_framework_unique on lesson_sets (month_framework_id) where month_framework_id is not null;
alter table lesson_sets add constraint lesson_sets_week_or_month_check
  check (program_week_id is not null or month_framework_id is not null) not valid;
