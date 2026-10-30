# Thiết kế cơ chế học theo tháng (spec)

Nguồn: họp dev + PO ngày 30/10/2026. Các luật dưới đây là quyết định cuối của PO. Luật thuần nằm ở `packages/domain/src/calendar/index.ts` (có test `packages/domain/test/calendar.test.ts`).

## Lịch
- Múi giờ `Asia/Ho_Chi_Minh`. Không học T7/CN. Ngày học = T2–T6.
- Ngày thi tháng = ngày học cuối của tháng (10/2026: 30/10; 11/2026: 30/11; 12/2026: 31/12).
- Số bài = số ngày học − 1 (11/2026: 20 bài; 12/2026: 22 bài). Bài ngày k ứng với ngày học thứ k.
- Ngày hiệu lực = số ngày học − 1. Vắng tối đa = floor(30% × ngày hiệu lực): 20→6, 22→6, 25→7.
- Bỏ lịch pilot (`programs.start_date`, `week_count`, `current_week_override`): ngừng dùng, không xoá cột.

## Khung tháng và sinh bài
- `program_months` (mỗi tháng của tổ chức) và `month_frameworks` (tháng × level): trạng thái `draft`/`approved`, N từ vựng, Y chủ điểm ngữ pháp (kèm chuỗi scaffolding), Z âm, phiên bản, người/thời điểm duyệt.
- Mặc định N=60, Y=3, Z=4 trong `organization_settings`; ràng buộc N < 90 và N ≤ 3 × số bài.
- Vận hành thấy 3 tháng: trước (chỉ xem), này, sau (sinh/duyệt/soạn tay).
- "Sinh lại khung" bấm nhiều lần tới khi "Duyệt khung" (có hộp xác nhận: bài thi tháng sinh từ khung, phần soạn tay không đưa vào đề).
- Sau duyệt khung, job chia bài ngày: 3 từ/ngày theo thứ tự khung (hết từ mới thì lặp từ học lâu nhất), ngữ pháp chia Y chủ điểm theo scaffolding (lưu kế hoạch chia vào khung), phát âm Z âm lặp lại với ví dụ không trùng trong tháng.
- Sau chia chỉ soạn tay từng bài ngày; bỏ sinh lại một ngày bằng AI.
- Học viên chỉ thấy bài khi đủ: khung duyệt, mọi bài ngày duyệt, bài thi tháng duyệt. Chưa đủ → chỉ luyện Season (chủ đề ngẫu nhiên, không ô từ bí mật) và mini game keyword.
- Ảnh từ vựng: từ trừu tượng ẩn khung ảnh, chỉ ảnh Vận hành tải tay; tắt tự tra ảnh công cộng cho từ trừu tượng.
- Không có AI: có khung mẫu cố định cho từng level.
- Ngoài phạm vi 3 tháng: job xoá nội dung (khung, bài ngày, đề thi, payload); giữ báo cáo tiến độ, log kháng nghị, kết quả thi, và nội dung của kháng nghị còn chờ. Ghi `audit_events` trước khi xoá. Bật/tắt trong Cài đặt Quản lý, mặc định bật.

## Học bài, điểm danh, dự thi
- Học tuần tự; bài k mở từ ngày học thứ k. Học bù không ảnh hưởng điều kiện thi.
- 1 ngày điểm danh = ngày hiệu lực hoàn thành ≥ 1 bài. Ngày thi không tính.
- Vắng ≤ vắng tối đa thì đủ điều kiện. Không đủ → "Khiếu nại lên Quản lý"; 24 giờ không xử lý thì tự cho thi; từ chối thì không thi (log).

## Cơ chế người mới
- Áp dụng: duyệt mức đầu vào, lên mức, khiếu nại đầu vào được duyệt, trượt pass course, được học tháng mới sau khiếu nại, level vừa được duyệt nội dung đủ.
- Tỉ lệ = ngày hiệu lực còn lại (tính cả ngày duyệt, T2–T6, không tính ngày thi) / ngày hiệu lực cả tháng. Duyệt T7/CN tính từ T2 kế tiếp.
- ≥ 75%: học tháng này từ bài 1; vắng tối đa = floor(30% × số ngày còn lại). < 75%: khoá tới tháng sau (chỉ Season + mini game), trang chủ báo ngày bắt đầu.
- Kiểm tra (11/2026): 02/11 100%; 09/11 75% (vắng tối đa 4); 10/11 70% khoá; 16/11 50% khoá; T7 07/11 → 75%.
- Thay `scheduled_level_changes` / `nextEffectiveMonday`.

## Bài thi tháng
- Thay bài thực hành cuối tuần và "cuối kỳ". Màn: báo cáo điểm danh + khu bài thi.
- Mở 00:00 ngày thi; khoá = 24:00 − thời lượng − 5 phút (60 phút → 22:55). Thời lượng trong `organization_settings`, mặc định 60, "tạm, chờ PO chốt".
- Dùng `assessment_*` với loại mới `monthly_exam`, cấu trúc 4 kỹ năng, đề sinh từ khung.
- Bỏ thi: khoá tháng sau; học viên gửi báo cáo xin mở; Quản lý mở thì vào thẳng tháng mới, tháng đó không tính vào số tháng xét lên mức.

## Khoá tài khoản
- Vắng 5 ngày học liên tiếp (T2–T6, bỏ ngày thi) thì khoá; Quản lý mở lại, ghi `audit_events`. Bỏ quy tắc "quá 4 buổi trong 2 tuần".

## Season, mini game, lên mức
- Ô từ bí mật và ngữ cảnh lấy từ bài đã học tới hôm nay. Tối đa 30 lượt/ngày; mục tiêu 100 lượt/tháng ("Tháng này n / 100 lượt"), đưa vào `buildLevelReadiness`.
- Mini game không keyword: dùng từ đã học, bỏ phụ thuộc `game_sets.program_week_id`.
- Điều kiện lên mức CHƯA CHỐT: giữ 4 tín hiệu, đổi đơn vị sang tháng, ngưỡng trong `organization_settings`, ghi chú "tạm".

## Kháng nghị đầu vào và pass course
- Học viên xem lại bài đầu vào; khiếu nại 1 lần trong 3 ngày kể từ khi được duyệt (Level đề xuất + Lý do); Vận hành duyệt/từ chối; duyệt thì sang mức mới theo cơ chế người mới. Áp dụng tương tự cho pass course.
- Pass course: `assessment_definitions` loại `course_pass`, cấu trúc như đầu vào, mở khi đủ Đường lên mức C1; C1 overall thì cấp chứng nhận, không đạt thì học mức Vận hành duyệt. Nhãn "cuối kỳ" → "bài kiểm tra pass course".

## Quản lý và báo cáo
- Báo cáo theo tháng (điểm danh/ngày hiệu lực, vắng/vắng tối đa, bài k/tổng). Nhắc học theo ngày học, dùng khung tháng. Thêm: khiếu nại thi tháng (đếm ngược 24 giờ), báo cáo xin mở khoá, tài khoản bị khoá vì vắng. KPI và mức rủi ro giữ cách tính, nhãn theo tháng, "chờ PO chốt".

## Ngừng dùng
Chủ đề tuần và gợi ý AI, sinh nhiều tuần, bài thực hành cuối tuần, `practice_appeals`, lịch pilot, bản hiện tại/nháp song song của tuần, sinh lại một ngày bằng AI, "hiệu lực từ Thứ Hai". Route cũ: trả 410 kèm thông báo rõ (quyết định, ghi trong bàn giao).

## Chỗ tự quyết
- Giờ khoá thi = 24:00 − thời lượng − 5 phút để khớp ví dụ 22:55 (công thức "23:59 − …" sẽ ra 22:54).
- Ngày theo chuỗi `YYYY-MM-DD` giờ Việt Nam, không dùng `Date` trong luật.
