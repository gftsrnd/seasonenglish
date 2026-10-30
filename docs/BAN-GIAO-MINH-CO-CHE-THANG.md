# Bàn giao Minh: cơ chế học theo tháng

Branch: `claude/co-che-thang` (từ `codex/deploy-web-fallback`). File này được cập nhật cuốn chiếu sau mỗi phần; phần nào ghi "chưa làm" là thật sự chưa làm.

Spec đầy đủ: `docs/superpowers/specs/2026-10-31-monthly-learning-cycle-design.md`. Kế hoạch: `docs/superpowers/plans/2026-10-31-monthly-learning-cycle.md`.

## Trạng thái môi trường và test (baseline trên `codex/deploy-web-fallback`)
- Máy làm việc: Windows, Node 24.20, pnpm 12.3.4. Đường dẫn repo dài hơn 260 ký tự nên `pnpm install` mặc định (isolated) hỏng esbuild; cài bằng `pnpm install --config.node-linker=hoisted` thì chạy được. Không ảnh hưởng tới repo (không commit `.npmrc`).
- `pnpm typecheck`: xanh trên baseline.
- `pnpm test:unit` (không Postgres): 1563 pass, 17 fail có sẵn trên base branch (xem danh sách bên dưới), 41 suite lỗi `ECONNREFUSED 127.0.0.1:55432` vì cần Postgres, 1 suite cần Playwright browser.
- Fail có sẵn trên base (không do nhánh này): `packages/contracts/test/screen-contract.test.ts` (thiếu route `/micro/:id`), `apps/web/test/learner-route-controller.test.tsx` (2), `apps/web/test/lesson-app-states.test.tsx` (1), `apps/web/test/lesson-vocabulary-modals.test.tsx` (2), `apps/web/src/app/operator/LessonFormEditor.test.tsx` (2), `OperatorRouteController.test.tsx` (2), `settings-ai-parity.test.tsx` (2), và vài test timeout/jsdom khác.

## Giai đoạn 1 · Nền — ĐÃ LÀM
### Domain `packages/domain/src/calendar/index.ts` (test: `packages/domain/test/calendar.test.ts`, 24 test)
| Hàm | Vào | Ra |
| --- | --- | --- |
| `buildMonthlyCalendar("2026-11")` | tháng | `studyDays` 21 ngày, `examDate` 2026-11-30, `lessonCount` 20, `effectiveDays` 20, `maxAbsences` 6 |
| `buildMonthlyCalendar("2026-12")` | | 23 ngày học, thi 2026-12-31, 22 bài, vắng tối đa 6 |
| `maxAbsencesFor(25)` | ngày hiệu lực | 7 (floor 30%) |
| `isLessonLearnable(cal, k, completed, today)` | | bài k mở từ ngày học thứ k và đã học hết bài trước |
| `buildAttendanceReport({learnerEffectiveDays, completedAt, today})` | | `attendedDays`, `absentDays`, `maxAbsences`, `eligible` |
| `consecutiveAbsentStudyDays({today, attendedDates, countFrom})` | | số ngày học liên tiếp vắng (bỏ T7/CN và ngày thi); `shouldLockForAbsence(n)` ⇔ n ≥ 5 |
| `placeNewcomer(approvedAt)` | thời điểm duyệt | `join_current_month` (02/11 → 100%, 09/11 → 75% vắng tối đa 4, T7 07/11 → 75%) hoặc `wait_next_month` (10/11 → 70%, 16/11 → 50%, `startsOn` 2026-12-01) |
| `buildExamWindow("2026-11-30", 60)` | ngày thi, phút | mở 00:00, khoá 22:55 giờ VN; `examAccessAt(window, now)` |
| `examAppealAutoApproved(submittedAt, now)` | | true khi qua 24 giờ |
| `validateMonthFrameworkSettings({N,Y,Z}, lessonCount)` | | lỗi nếu N ≥ 90 hoặc N > 3 × số bài |
| `operatorVisibleMonths(today)` / `isMonthOutsideRetention(month, today)` | | tháng trước / này / sau; ngoài phạm vi thì dọn |
| `systemClock`, `createFixedClock`, `createOffsetClock`, `fakeClockAllowed(env)` | | nguồn thời gian duy nhất |

### Clock cho API `apps/api/src/modules/system/clock.ts`
`clockForUser(pool, userId)` / `clockForOrganization(pool, orgId)` đọc `organization_settings.configuration.monthly.fakeClockAt`; chỉ có hiệu lực khi `NODE_ENV !== 'production'` hoặc `E4S_ALLOW_FAKE_CLOCK=1`. `/api/v1/system/capabilities` trả thêm `fakeClockAllowed`, `fakeClockAt`.

### Cài đặt tổ chức (`configuration.monthly`)
Contract `MonthlyCycleSettings` trong `packages/contracts/src/manager-contract.ts`; zod ở `apps/api/src/modules/manager/routes.ts`; mặc định ở `repositories.ts` (`settingsForOrganization`); UI mục "Cơ chế học theo tháng" trong `apps/web/src/app/settings/Settings.tsx`.
Mặc định: N=60, Y=3, Z=4, thời lượng thi 60 phút (tạm), mục tiêu Season 100 lượt/tháng (tạm), dọn tháng cũ = bật, `fakeClockAt` = null.

### Migration `packages/database/migrations/0081_monthly_learning_cycle.sql` (+ `schema.ts`)
Bảng mới: `program_months`, `month_frameworks` (kèm cột bài thi tháng `exam_*`), `month_lessons` (liên kết `lessons` để giữ editor/kháng nghị/tiến độ), `learner_month_enrollments`, `learner_attendance_days`, `monthly_exam_appeals`, `monthly_unlock_requests`, `account_locks`. Cột mới: `appeals.proposed_level`, `appeals.kind` (mặc định `placement`), `appeals.expires_at`.
Deprecated (chỉ `comment on`, không drop): `programs.start_date/week_count/current_week_override`, `program_weeks`, `practice_submissions`, `practice_appeals`, `scheduled_level_changes`.

## Giai đoạn 2–6 — CHƯA LÀM
(cập nhật khi làm)

## Chỗ tự quyết
- Giờ khoá thi = 24:00 − thời lượng − 5 phút (khớp ví dụ 22:55; công thức "23:59 − …" ra 22:54).
- `monthly` trong `ManagerSettingsView` là optional để fixture test cũ không vỡ; server luôn điền mặc định.
- Bài ngày của tháng tái dùng bảng `lessons`/`lesson_versions` qua `month_lessons.lesson_id` thay vì tạo bảng nội dung mới, để `LessonFormEditor`, `lesson_part_appeals`, `progress_records` dùng lại nguyên vẹn.
- Khiếu nại đầu vào / pass course dùng lại bảng `appeals` (thêm cột) thay vì bảng mới.

## Điểm còn chờ PO
- Điều kiện lên mức (giữ 4 tín hiệu, đổi đơn vị sang tháng, ghi "tạm").
- Thời lượng bài thi tháng (tạm 60 phút).
- KPI và mức rủi ro (giữ cách tính, nhãn theo tháng).

## Cách Minh chạy local
```bash
pnpm install
pnpm typecheck
pnpm test:unit
pnpm test
```
Trên Windows với đường dẫn dài: `pnpm install --config.node-linker=hoisted`.
