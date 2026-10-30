# Kịch bản kiểm thử cơ chế học theo tháng

Cập nhật 31/10/2026 (nhánh `claude/co-che-thang`). Mọi kịch bản dùng **giờ giả lập** đặt trong Cài đặt Quản lý → "Cơ chế học theo tháng" → "Ngày giờ giả lập" (chỉ hiện ngoài production). Tài khoản mẫu và PIN/mật khẩu xem `docs/local-scenario-accounts.md` (dữ liệu mẫu local).

Chuẩn bị chung (Vận hành `thu.ha.tran@e4s.local`): mở **Bài học** → chọn **Tháng 11/2026 · A2** → Sinh khung → Duyệt khung → chờ chia 20 bài → duyệt 20 bài → Sinh bài thi tháng → Duyệt bài thi → thấy "Đủ điều kiện: học viên A2 đã thấy bài của Tháng 11/2026".

Cột "Kết quả" ghi theo lần chạy gần nhất trên máy dev Windows (Postgres nhúng, không AI). **Đạt** = đã bấm đúng các bước và thấy kết quả mong đợi; **Chưa chạy** = chưa có dữ liệu mẫu hoặc tính năng ở giai đoạn 4–5 chưa làm.

| # | Kịch bản | Tài khoản mẫu | Ngày giả lập | Bước bấm | Kết quả mong đợi | Kết quả |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Học đều, đủ điều kiện thi | `quynh.anh.nguyen@scenario.e4s.local` (A2) | 30/11/2026 09:00 | Học bài 1…k (hoặc seed điểm danh ≥ 14 ngày) → Trang chủ → Bài thi | Thẻ điểm danh "Đủ điều kiện thi"; màn `/exam` có nút **Vào bài thi**; `/test/monthly-exam` mở runtime như bài đầu vào | Đạt một phần: trang chủ + `/exam` + mở/khoá đúng giờ đã kiểm (10/11 → "mở sau 29 ngày"); chưa seed điểm danh đủ 14 ngày |
| 2 | Vắng đúng bằng vắng tối đa (6/20) | như trên, seed 14 ngày điểm danh | 30/11 09:00 | `/exam` | "Đủ điều kiện thi", vắng 6/6 | Chưa chạy (cần seed điểm danh ở `prepare-local-scenarios`) |
| 3 | Vắng hơn tối đa 1 ngày (7/20) | seed 13 ngày | 30/11 09:00 | `/exam` | "Chưa đủ điều kiện", form **Khiếu nại lên Quản lý** | Chưa chạy |
| 4 | Khiếu nại quá 24 giờ | như #3 rồi gửi khiếu nại | 01/12 09:01 | tải lại `/exam` | Trạng thái "Quá 24 giờ chưa xử lý: hệ thống tự cho thi" (`auto_approved`) | Chưa chạy (logic có trong `LearnerMonthlyRepository.examAppeal`) |
| 5a | Duyệt mức 09/11 (75%) | `anh.tuan.ho@scenario.e4s.local` (chờ duyệt) | 09/11 09:00 | Vận hành duyệt mức A2 → đăng nhập học viên | Trang chủ Tháng 11, bài 1 mở; `/exam` ghi "15 ngày hiệu lực, vắng tối đa 4" | Chưa chạy trên UI (có unit test `placeNewcomer`) |
| 5b | Duyệt mức 10/11 (70%) | `bao.tram.ta@scenario.e4s.local` | 10/11 09:00 | như trên | Thông báo "Bạn sẽ bắt đầu học từ ngày 01/12/2026"; chỉ Season + mini game | Chưa chạy trên UI (có unit test) |
| 6 | Vắng 5 ngày học liên tiếp → khoá tài khoản | — | — | — | Giai đoạn 4 | Chưa làm |
| 7 | Bỏ thi tháng trước → khoá tháng sau, báo cáo xin mở | — | — | — | Giai đoạn 4 | Chưa làm |
| 8 | Đủ Đường lên mức C1 → bài pass course | — | — | — | Giai đoạn 5 | Chưa làm |
| 9 | Khiếu nại bài đầu vào trong 3 ngày | — | — | — | Giai đoạn 5 (DB đã có cột `appeals.kind/proposed_level/expires_at`) | Chưa làm |
| 10 | Level có khung chưa duyệt đủ → chỉ Season + mini game | `thanh.nam.vo@scenario.e4s.local` (B1, chưa có khung B1 tháng 11) | 10/11 09:00 | Đăng nhập → trang chủ | Thông báo "Nội dung Tháng 11/2026 cho trình độ B1 chưa được Vận hành duyệt đủ…", không có lộ trình bài | Chưa chạy trên UI (logic `seasonOnlyReason = no_content`) |

## Đã chạy thật trên preview (31/10)
- Luồng Vận hành đầy đủ cho Tháng 11/2026 · A2 (sinh khung mẫu → duyệt → chia 20 bài → duyệt → sinh/duyệt đề → Xem đề).
- Học viên A2 với giờ giả lập 10/11/2026: trang chủ theo tháng (Bài 0/20, điểm danh 0/20, vắng 6/6 vẫn đủ điều kiện), mở Bài 1 (`/lesson/:id`) hiện "Tháng 11/2026 · Bài 1", `/exam` hiện báo cáo điểm danh và đếm ngược tới 00:00 30/11, khoá 23:25.

## Việc cần làm để chạy đủ 10 kịch bản
- Mở rộng `scripts/prepare-local-scenarios.ts`: seed `learner_month_enrollments` + `learner_attendance_days` cho các kịch bản 1–4, tài khoản chờ duyệt cho 5a/5b, tài khoản bỏ thi cho 7, tài khoản đủ Đường lên mức C1 cho 8.
- Giai đoạn 4–5 theo kế hoạch.
