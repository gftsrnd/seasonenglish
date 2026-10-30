# Kế hoạch: chuyển học theo tuần sang học theo tháng

Spec: `docs/superpowers/specs/2026-10-31-monthly-learning-cycle-design.md`. Branch: `claude/co-che-thang` (từ `codex/deploy-web-fallback`).

## Chỗ đang dựa vào tuần / pilot (khảo sát bằng grep)
- DB `packages/database/src/schema.ts`: `programs` (`start_date`, `week_count`, `current_week_override`), `program_weeks`, `lesson_sets.program_week_id`, `practice_submissions`, `practice_appeals`, `scheduled_level_changes`, `level_up_*`, `game_sets.program_week_id`, `reminders`. Truy cập qua `repositories.ts` (~87 chỗ dùng các tên trên), `seed.ts`.
- Domain `progression/index.ts`: `validateWeeklyPractice`, `calculateWeeklyPracticeScore`, `buildLevelReadiness` (chỉ số `weeklyPractice`), `nextEffectiveMonday`.
- API: `content/weekly-generation.ts`, `week-suggestion-generation.ts`, `content/routes.ts`, `learning/routes.ts`, `assessment/routes.ts`, `engagement/routes.ts`, `manager`, `coach`.
- Worker `handlers.ts`: job sinh bài theo tuần.
- Web: `operator/{Weeks,Lessons,lesson-generation,Dashboard,Review}`, `learner/{Home,Learning,CoachPractice,Games,ProfileReward,LearnerRouteController}`, `manager/{Progress,Reminders,Report,Operations}`, `settings/Settings`.
- Scripts: `prepare-local-scenarios.ts`, `local-scenario-accounts.ts`, `core-flow-e2e.mjs`, `docs/local-scenario-accounts.md`.

## Mô hình dữ liệu mới (chỉ thêm, không drop)
- `program_months`, `month_frameworks` (tháng × level), `month_lessons` (bài ngày của khung, liên kết `lessons`), `monthly_exam_appeals`, `monthly_exam_unlock_requests`, `placement_appeals`, `learner_month_enrollments` (chế độ người mới, ngày bắt đầu), `learner_attendance_days`, `account_locks`.
- Thêm cột vào `organization_settings`: N/Y/Z, thời lượng thi, bật dọn tháng, ngưỡng lên mức, giờ giả lập.
- `assessment_definitions.kind`: thêm `monthly_exam`, `course_pass`.
- Đánh dấu deprecated: `programs.start_date/week_count/current_week_override`, `program_weeks`, `practice_*`, `scheduled_level_changes`.

## Giai đoạn
1. Nền (domain lịch + clock + migration + cài đặt). Đã có: `packages/domain/src/calendar`, test, spec, kế hoạch. Còn: migration, cài đặt, clock cho API.
2. Vận hành: màn tháng, khung, job sinh/chia, soạn tay, thi tháng, khung mẫu.
3. Học viên: trang chủ tháng, mở bài theo ngày, điểm danh, màn thi, khiếu nại 24 giờ, người mới.
4. Khoá/mở và Quản lý.
5. Kháng nghị đầu vào, pass course, Season, mini game, lên mức tạm.
6. Job xoá tháng, dọn route cũ (410), bàn giao.

## Kiểm tra
`pnpm typecheck`, `pnpm test:unit`, `pnpm test` (Postgres nhúng), 10 kịch bản trong `docs/test-guides/KICH-BAN-KIEM-THU-CO-CHE-THANG.md`.

## Rủi ro
- Môi trường hiện tại không có Node/pnpm nên chưa chạy được typecheck/test (xem báo cáo).
- `repositories.ts` dùng tên tuần ở nhiều chỗ: sửa từng chỗ, không đổi tên hàng loạt.
- Migration chạy trên DB có dữ liệu tuần cũ: chỉ thêm, kiểm thử bằng `pnpm test`.
