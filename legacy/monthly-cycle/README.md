# legacy/monthly-cycle/

Sổ kiểm kê **cơ chế học theo tháng** trước khi chuyển sang **khoá học theo tuần**. Kế hoạch: `docs/superpowers/plans/2026-11-23-weekly-prototype-revert.md`.

## Bản chụp đầy đủ

- **Git:** tag `legacy-monthly-cycle-2026-11-23` và nhánh `legacy/monthly-cycle`, cùng trỏ vào commit `195e2e9f`. Đây là toàn bộ app ở cơ chế tháng, CI xanh.
- **Sao lưu dữ liệu 4300 (23/11/2026):** `backups/e4s-dev-20261123-1525.dump` và `backups/e4s-dev-20261123-1525-minio.tar.gz`. Thư mục `backups/` nằm ngoài repo.
- **Dữ liệu tháng không bị xoá.** Giữ nguyên các bảng `program_months`, `month_frameworks`, `month_lessons`, `month_lesson_corrections` và các bảng thi tháng (từ migration `0081_monthly_learning_cycle.sql` trở về sau).

## Cách đọc bảng

- **Trạng thái:**
  - `live`: file còn chạy trong app.
  - `legacy`: file đã được chuyển vào đây, thêm đuôi `.txt`, không còn biên dịch hay chạy test.
- **Dùng lại:**
  - `có`: file được giữ và sửa cho khoá học tuần.
  - `không`: file chỉ phục vụ tháng, sẽ chuyển vào đây khi phần thay thế đã chạy xanh. Khi chuyển thì cất kèm test của nó, rồi đổi trạng thái thành `legacy`.

Test `scripts/legacy-monthly-inventory.test.ts` giữ bảng này khớp với code. Nếu có file tháng mới mà chưa ghi vào bảng thì test báo lỗi.

| Đường dẫn | Trạng thái | Dùng lại | Thay bằng / ghi chú |
|---|---|---|---|
| `apps/web/src/app/operator/Months.tsx` | live | có | GĐ3: sửa thành trang Sinh bài theo khoá/tuần |
| `apps/web/src/app/operator/months.css` | live | có | GĐ3: sửa cùng trang Sinh bài |
| `apps/web/src/app/operator/MonthlyFinalReview.tsx` | live | có | GĐ6: duyệt đề bài cuối kỳ |
| `apps/web/src/app/operator/MonthlyFindingsPanel.tsx` | live | có | GĐ3: cảnh báo chất lượng |
| `apps/web/src/app/operator/MonthlyIllustrationPanel.tsx` | live | có | GĐ3: ảnh minh hoạ từ |
| `apps/web/src/app/operator/MonthlyResourceEditor.tsx` | live | có | GĐ3: tài nguyên theo tuần |
| `apps/web/src/app/operator/MonthlyResourceProgress.tsx` | live | có | GĐ3: tiến độ sinh tài nguyên |
| `apps/web/src/app/operator/MonthlyReviewPractice.tsx` | live | không | GĐ4: bỏ bài ôn thứ Sáu |
| `apps/web/src/app/operator/monthly-day-grammar-steps.ts` | live | có | GĐ3 |
| `apps/web/src/app/operator/monthly-failure-findings.ts` | live | có | GĐ3 |
| `apps/web/src/app/operator/monthly-generation-message.ts` | live | có | GĐ3 |
| `apps/web/src/app/operator/monthly-generation-progress.ts` | live | có | GĐ3 |
| `apps/web/src/app/operator/monthly-manual-seed.ts` | live | có | GĐ3: soạn tay |
| `apps/web/src/app/learner/WeeklyReview.tsx` | live | không | GĐ4: T6 là bài mới |
| `apps/web/src/app/learner/LevelReadiness.tsx` | live | có | GĐ7: sửa thành 3 điều kiện của khoá |
| `apps/web/src/app/learner/MonthlySurveys.tsx` | live | có | GĐ6: khảo sát cuối khoá |
| `apps/web/src/app/learner/CertificateDocument.tsx` | live | có | Giữ cho chứng nhận tốt nghiệp C1 |
| `apps/web/src/app/manager/MonthlyOverview.tsx` | live | không | GĐ9: thay bằng số liệu theo khoá |
| `apps/web/src/app/manager/MonthlySurveys.tsx` | live | có | GĐ6: soạn khảo sát cuối khoá |
| `apps/web/src/app/manager/Holidays.tsx` | live | có | Giữ ngày nghỉ lễ |
| `apps/web/src/app/shared/LockedLearnerSupport.tsx` | live | không | GĐ4: bỏ khoá tài khoản do vắng |
| `apps/web/src/app/shared/MonthlySurveyFields.tsx` | live | có | GĐ6 |
| `apps/web/src/app/shared/monthly-surveys.css` | live | có | GĐ6 |
| `apps/web/src/app/shared/monthly-uncounted.ts` | live | không | GĐ4: bỏ học thử |
| `apps/web/src/api/monthly-surveys.ts` | live | có | GĐ6 |
| `apps/api/src/modules/content/monthly-answer-checks.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-british-ipa.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-core-phase.ts` | live | có | GĐ2: sinh từ cốt lõi theo tuần |
| `apps/api/src/modules/content/monthly-day-generation.ts` | live | có | GĐ2: sinh bài T2–T6 |
| `apps/api/src/modules/content/monthly-enrichment-phase.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-generation-errors.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-grammar-roadmap.ts` | live | có | GĐ2: 1 chủ điểm mỗi khối |
| `apps/api/src/modules/content/monthly-illustrations.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-integrity.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-objective-quality.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-quality.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-register-phase.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-resource-generation.ts` | live | có | GĐ2: tài nguyên theo tuần |
| `apps/api/src/modules/content/monthly-resource-manual-edit.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-resource-plan-spec.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-resource-progress.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-resource-quality-gates.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-review-quality.ts` | live | không | GĐ4: bỏ bài ôn thứ Sáu |
| `apps/api/src/modules/content/monthly-routes.ts` | live | không | GĐ2: thay bằng route theo khoá/tuần |
| `apps/api/src/modules/content/monthly-word-form-scope.ts` | live | có | GĐ2 |
| `apps/api/src/modules/content/monthly-word-verification.ts` | live | có | GĐ2 |
| `apps/api/src/modules/assessment/monthly-final-answer-verification.ts` | live | có | GĐ6: bài cuối kỳ |
| `apps/api/src/modules/assessment/monthly-final-builder.ts` | live | có | GĐ6 |
| `apps/api/src/modules/assessment/monthly-final-checks.ts` | live | có | GĐ6 |
| `apps/api/src/modules/assessment/monthly-final-listening-generation.ts` | live | có | GĐ6 |
| `apps/api/src/modules/assessment/monthly-final-productive-generation.ts` | live | có | GĐ6 |
| `apps/api/src/modules/assessment/monthly-final-reading-generation.ts` | live | có | GĐ6 |
| `apps/api/src/modules/assessment/monthly-final-routes.ts` | live | có | GĐ6: đổi phạm vi thành khoá |
| `apps/api/src/modules/assessment/monthly-final-scope.ts` | live | có | GĐ6 |
| `apps/api/src/modules/assessment/monthly-final-spec.ts` | live | có | GĐ6: thời lượng 30/60 phút |
| `apps/api/src/modules/learning/weekly-review-routes.ts` | live | không | GĐ4: bỏ bài ôn thứ Sáu |
| `apps/api/src/modules/manager/holiday-complaint-routes.ts` | live | có | Giữ ngày lễ; GĐ6 bỏ khiếu nại điều kiện thi |
| `apps/api/src/modules/monthly-surveys/routes.ts` | live | có | GĐ6: khảo sát cuối khoá |
| `apps/api/src/scripts/monthly-register-trial.ts` | live | không | Script thử một lần của bản tháng |
| `packages/domain/src/monthly/calendar.ts` | live | không | GĐ1: thay bằng domain/course/calendar |
| `packages/domain/src/monthly/carryover-review.ts` | live | không | GĐ4: bỏ ôn chuyển tháng |
| `packages/domain/src/monthly/curriculum.ts` | live | có | GĐ2: hợp đồng nội dung |
| `packages/domain/src/monthly/daily-progression.ts` | live | có | GĐ2: chia ngày theo khối 10 bài |
| `packages/domain/src/monthly/exercise-translation.ts` | live | có | Giữ |
| `packages/domain/src/monthly/grammar-catalog.ts` | live | có | GĐ2: lộ trình ngữ pháp |
| `packages/domain/src/monthly/grammar-day-topic.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/grammar-formula-examples.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/index.ts` | live | có | Giữ |
| `packages/domain/src/monthly/lesson-vocabulary.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/pronunciation-catalog.ts` | live | có | GĐ2: 2 âm mỗi khối |
| `packages/domain/src/monthly/pronunciation-contrast.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/pronunciation-ipa.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/pronunciation-rules.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/read-aloud-targets.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/register-terms.ts` | live | có | GĐ2 |
| `packages/domain/src/monthly/weekly-review-session.ts` | live | không | GĐ4: bỏ bài ôn thứ Sáu |
| `packages/domain/src/monthly/weekly-review.ts` | live | không | GĐ4: bỏ bài ôn thứ Sáu |
| `packages/domain/src/progression/monthly-eligibility.ts` | live | không | GĐ7: thay bằng 3 điều kiện cuối khoá |
| `packages/domain/src/engagement/season-rewards.ts` | live | có | GĐ8: đổi bảng số |
| `packages/database/src/monthly-content-repository.ts` | live | không | GĐ2: thay bằng kho nội dung theo tuần |
| `packages/database/src/monthly-content-retention.ts` | live | không | GĐ2 |
| `packages/database/src/monthly-illustration-projection.ts` | live | có | GĐ2 |
| `packages/database/src/monthly-resource-approval-checks.ts` | live | có | GĐ2 |

## Cách khôi phục

1. **Xem hoặc chạy lại toàn bộ bản tháng:** `git checkout legacy/monthly-cycle`, hoặc checkout tag `legacy-monthly-cycle-2026-11-23`.
2. **Khôi phục một file đã cất:**
   - chép `legacy/monthly-cycle/<đường dẫn>.txt` về `<đường dẫn>` và bỏ đuôi `.txt`;
   - đăng ký lại route hoặc màn hình;
   - đổi trạng thái của file trong bảng về `live`.
3. **Khôi phục dữ liệu 4300:** dùng tệp sao lưu ở trên với `scripts/ops/e4s.ps1`.
