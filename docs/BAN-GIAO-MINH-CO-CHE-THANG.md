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

## Giai đoạn 2 · Vận hành — ĐÃ LÀM (backend + web; đã chạy test tích hợp Postgres nhúng)
### Domain (`packages/domain/src/calendar/framework.ts`, `exam.ts`; test `framework.test.ts` 16, `exam.test.ts` 6)
- `buildSampleFramework(cefr, {N,Y,Z})`: khung mẫu cố định 5 level (60 từ, 3 chủ điểm × 3 bước scaffolding, 4 âm × 18 ví dụ) để test trọn luồng khi tắt AI.
- `validateMonthFramework`: đúng N/Y/Z, từ không lặp, mỗi âm đủ ví dụ khác nhau cho cả tháng.
- `distributeFramework(framework, lessonCount)`: 3 từ/ngày theo thứ tự, hết từ mới thì ôn từ học lâu nhất (`firstReviewLesson`); ngữ pháp chia Y đoạn liên tiếp, bước tăng dần; Z âm xoay vòng, ví dụ không trùng. Kế hoạch lưu `month_frameworks.distribution_plan`.
- `buildLessonFromDayPlan`: dựng bài ngày đủ 11 phần, qua `validateLessonDraft` + `validateLessonPublication` cho cả 5 level (B1+ tiếng Anh). Từ trừu tượng có `abstract: true` trong vocabulary item (web ẩn khung ảnh — làm ở giai đoạn 3).
- `buildMonthlyExamBlueprint`: theo **"E4S Cấu trúc bài thi cuối tháng và quy tắc AI" v1.1 (31/10)**: 4 kỹ năng × 25 điểm = 100; **30 phút** chia 8–8–8–6 (scale theo cài đặt); Listening 20 câu (2 bản nghe × 10, phát 2 lần), Reading 30 câu, Writing 1 email 80–100 từ (6 mục từ, G1/G2/G3), Speaking = Read Aloud (4 âm × 2 vị trí) + voice note 60–75 s (4 mục từ, G1/G2/G3). 3 lựa chọn A/B/C, đáp án đảo vị trí. N chia 20–30–6–4 (`allocateExamItems`). Có `mapping` (mỗi mục từ đúng 1 vị trí), `graderPackage` (script, key, giải thích, rubric W1–W5 / S1–S5, bài mẫu), `checks` GEN02/03/10/11/13/16/17/20, `audioStatus: SCRIPT_ONLY`. `studentPackageOf` lọc key/evidence/script (GEN18).
- `applyAiMonthlyExamContent`: AI chỉ điền nội dung vào cấu hình đã khoá; sai mapping/số câu thì trả null → giữ bản template.

### DB (`0082_month_lesson_sets.sql`, `0083_lessons_day_number_month.sql`, `monthly-repository.ts`)
- `lesson_sets.program_week_id` nới NOT NULL + thêm `month_framework_id`; `lessons.day_number` check 1..31 (trước 1..7); `assessment_definitions.kind` thêm `monthly_exam`, `course_pass` (giữ cả giá trị cũ).
- `MonthlyContentRepository`: `overview` (3 tháng, trạng thái từng level), `framework`, `requestFrameworkGeneration` (job `monthly.framework.generate`, sinh lại nhiều lần tới khi duyệt), `approveFramework` (job `monthly.lessons.distribute`), `distributeLessons` (lesson_set + version nháp + 20/22 lessons, ghi lỗi từng bài), `lessonDetail`/`saveLessonDay` (soạn tay; nếu set đã publish thì tạo version nháp mới copy toàn bộ bài vì version published là bất biến), `approveLessonDay` (đủ bài → publish), `requestExamGeneration` (job `monthly.exam.generate`), `storeGeneratedExam`, `approveExam`. `readyForLearners` = khung duyệt ∧ mọi bài duyệt ∧ đề duyệt.
- Test: `packages/database/test/monthly-content.integration.test.ts` đi trọn luồng (pass).

### API (`apps/api/src/modules/content/monthly-routes.ts`)
`GET /api/v1/content/months`, `GET /api/v1/content/months/:month/:cefr`, `POST …/framework/generate` (202), `POST /api/v1/content/month-frameworks/:id/approve` (202), `GET|PUT …/lessons/:n`, `POST …/lessons/:n/approve`, `POST …/exam/generate` (202), `POST …/exam/approve`. Ngày "hôm nay" lấy từ clock tổ chức (giờ giả lập).

### Worker (`apps/worker/src/monthly-handlers.ts`)
3 job trên. AI (Groq của worker) với task key mới `month_framework` / `monthly_exam` (prompt mặc định trong `packages/ai/src/month-framework.ts`, `monthly-exam.ts`; nếu tổ chức có `prompt_versions` active cùng key thì dùng). AI lỗi/không đạt kiểm tra → khung mẫu / đề template, ghi `source = 'sample'`.

### Web (`apps/web/src/app/operator/Months.tsx`, route `/op/months`, nav "Tháng học")
Màn chia đôi: trái khung (tab từ vựng/ngữ pháp/phát âm, Sinh lại khung, Duyệt khung với hộp xác nhận đúng câu chữ PO), phải lưới bài ngày (trạng thái, soạn tay bằng `LessonFormEditor`, duyệt từng bài) + khối bài thi tháng (sinh/duyệt). Tự tải lại mỗi 4 s khi worker đang chạy. Tháng trước chỉ xem.

### Môi trường test
`scripts/run-with-test-postgres.mjs` thêm `initdbFlags: ["--encoding=UTF8", "--locale=C"]`: trên Windows embedded Postgres mặc định WIN1252 nên MỌI migration có tiếng Việt lỗi (baseline 47 lỗi "no equivalent in encoding WIN1252" → các suite DB bị skip). Sau sửa, suite DB chạy được trên Windows.

## Giai đoạn 3 · Học viên — ĐÃ LÀM (backend + web; chưa chạy test tích hợp riêng cho phần này)
### Backend
- `packages/database/src/learner-monthly-repository.ts` (`repositories.learnerMonthly`): `placeLearner` (cơ chế người mới → `learner_month_enrollments`), tự ghi danh trọn tháng khi sang tháng mới, `monthView` (lịch, ghi danh, nội dung đủ chưa, bài tháng + khoá theo ngày/tuần tự, điểm danh, cửa sổ thi, khiếu nại, lượt Season tháng), `findMonthLesson` (để `/api/v1/lessons/:id` dùng bài tháng), `publishedExamForLearner`, `createExamAppeal` (24 giờ, quá hạn tự `auto_approved`).
- Điểm danh: `LearningRepository.saveLessonProgress` ghi `learner_attendance_days` khi bài hoàn thành (ngày T2–T6, không phải ngày thi; 1 ngày 1 dòng).
- Duyệt mức (`POST /api/v1/assessment-reviews/:attemptId/decision`): mức mới có hiệu lực ngay, gọi `placeLearner` theo cơ chế người mới; `decide()` không còn ghi `scheduled_level_changes` (deprecated).
- API mới: `GET /api/v1/learner/month`, `POST /api/v1/learner/month/exam-appeal`. `GET /api/v1/learner/home` trả thêm `month` và dùng bài tháng khi có ghi danh.
- Bài thi tháng dùng runtime bài đầu vào: `GET/POST /api/v1/assessments/monthly-exam(/start)` với kiểm tra giờ mở/khoá (`MONTHLY_EXAM_NOT_OPEN`, `MONTHLY_EXAM_LOCKED`), điều kiện (`MONTHLY_EXAM_NOT_ELIGIBLE`), đã nộp (`MONTHLY_EXAM_ALREADY_SUBMITTED`); `definitionForAttempt` tìm theo đúng phiên bản (`findPublishedByVersion`).
### Web học viên
- Trang chủ: khi có `month` → tiêu đề "Tháng x/yyyy · Bài k/N", lộ trình "Bài n · dd/mm" (khoá theo ngày + tuần tự, nhãn "học bù"), thẻ "Điểm danh tháng" (ngày điểm danh/ngày hiệu lực, vắng/tối đa, lượt Season/100), ô "Bài thi tháng" (thay bài thực hành cuối tuần), thông báo chế độ chỉ Season (chờ tháng sau "Bạn sẽ bắt đầu học từ dd/mm", nội dung chưa duyệt đủ, khoá vì bỏ thi).
- Màn `/exam` (`MonthExam.tsx`): (1) báo cáo điểm danh, (2) khu bài thi: giờ mở/khoá, nút "Vào bài thi" → `/test/monthly-exam` (UI bài đầu vào: tắt nhạc, đếm ngược, chống thoát, nộp), khiếu nại lên Quản lý (đếm ngược 24 giờ, trạng thái). `/practice` chuyển về `/exam`.
### Đã bỏ theo yêu cầu PO (31/10)
- Đấu trường nội bộ: gỡ `/arena`, `/duel/:id`, màn LearnerArena/LearnerDuel, API `engagement/arena|duels` trả **410 ARENA_REMOVED**; `duels` chỉ đánh dấu deprecated (0084), repository giữ nguyên.
- Bài tuần ở Vận hành: menu còn Duyệt mức · **Bài học** (= trang tháng, đổi tên từ "Tháng học") · **Kháng nghị** (review chỉ còn Phản hồi AI Coach / Kháng nghị / Lịch sử làm bài) · Bài kiểm tra · Cài đặt. `/op/weeks`, `/op/lessons`, `/op/lessons/:week/:cefr` chuyển hướng về `/op/months`. Code `Weeks.tsx`, `Lessons.tsx`, `WeeksRoute`, `LessonsRoute`, `LessonSetRoute` vẫn còn trong repo (chưa xoá) để Minh quyết định.
### Còn thiếu trong giai đoạn 3
- Ẩn khung ảnh cho từ trừu tượng ở màn Học (vocabulary item đã có `abstract: true`).
- Nhãn editor "Sửa bài T1 · Tuần 0".
- Tiêu đề bài tháng trong màn Học vẫn dùng `lessonDayLabel` theo T2–T6 cho `dayNumber` > 7 (hiển thị "Bài n", chấp nhận được).

## Giai đoạn 4–6 — CHƯA LÀM
(cập nhật khi làm)

## Chỗ tự quyết
- Giờ khoá thi = 24:00 − thời lượng − 5 phút (khớp ví dụ 22:55; công thức "23:59 − …" ra 22:54).
- `monthly` trong `ManagerSettingsView` là optional để fixture test cũ không vỡ; server luôn điền mặc định.
- Thời lượng bài thi tháng mặc định 30 phút theo tài liệu PO v1.1 (thay 60 của prompt ban đầu); vẫn chỉnh được trong Cài đặt.
- Bài ngày của tháng dùng `lesson_sets.month_framework_id` (nới NOT NULL của `program_week_id`) thay vì tạo `program_weeks` giả; version published bất biến nên sửa tay sau publish tạo version nháp mới.
- Đề thi tháng: bản template deterministic trước, AI chỉ điền nội dung (GEN01); audio luôn SCRIPT_ONLY vì chưa có pipeline TTS/nghe soát.
- Bài ngày của tháng tái dùng bảng `lessons`/`lesson_versions` qua `month_lessons.lesson_id` thay vì tạo bảng nội dung mới, để `LessonFormEditor`, `lesson_part_appeals`, `progress_records` dùng lại nguyên vẹn.
- Khiếu nại đầu vào / pass course dùng lại bảng `appeals` (thêm cột) thay vì bảng mới.

## Điểm còn chờ PO
- Điều kiện lên mức (giữ 4 tín hiệu, đổi đơn vị sang tháng, ghi "tạm").
- Thời lượng bài thi tháng: 30 phút theo tài liệu v1.1 (chưa thử nghiệm thời lượng với học viên thật như tài liệu yêu cầu).
- KPI và mức rủi ro (giữ cách tính, nhãn theo tháng).

## Cách Minh chạy local
```bash
pnpm install
pnpm typecheck
pnpm test:unit
pnpm test
```
Trên Windows với đường dẫn dài: `pnpm install --config.node-linker=hoisted`.

## Đã chạy thử local (31/10, máy Windows, không MinIO)
Launcher riêng (không commit): Postgres nhúng + `prepare-local.ts` + API + worker + Vite. Đi trọn luồng trên `/op/months` với tài khoản Vận hành mẫu: Tháng 11/2026 · A2 → **Sinh khung** (worker trả khung mẫu vì không có AI) → **Duyệt khung** (hộp xác nhận đúng câu chữ PO) → worker chia 20 bài (02/11 → 27/11, đúng lịch T2–T6) → duyệt 20 bài → lesson set publish → **Sinh bài thi tháng** → **Duyệt bài thi** → banner "Đủ điều kiện: học viên A2 đã thấy bài của Tháng 11/2026". Mở soạn tay bài 1 bằng `LessonFormEditor` thành công.
Lưu ý nhỏ: tiêu đề editor còn ghi "Sửa bài T1 · Tuần 0" vì `LessonFormEditor` nhận `weekNumber`; cần đổi nhãn sang "Bài n · Tháng" (giai đoạn 3).
`/api/readiness` trả `not_ready` khi không có object storage — không ảnh hưởng luồng tháng.
