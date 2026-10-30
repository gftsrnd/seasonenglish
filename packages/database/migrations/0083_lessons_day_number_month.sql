-- Bai ngay cua thang co toi da 23 bai (thang 12/2026: 22). Noi check constraint day_number tu 1..7 len 1..31.
-- Khong xoa du lieu; chi thay rang buoc.
alter table lessons drop constraint if exists lessons_day_number_check;
alter table lessons add constraint lessons_day_number_check check (day_number between 1 and 31);

-- Them loai bai kiem tra: monthly_exam (bai thi thang) va course_pass (bai pass course).
alter table assessment_definitions drop constraint if exists assessment_definitions_kind_check;
alter table assessment_definitions add constraint assessment_definitions_kind_check
  check (kind in ('placement', 'final', 'level_up', 'level-up', 'monthly_exam', 'course_pass'));
