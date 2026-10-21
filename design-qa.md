# E4S visual QA

Ngày kiểm tra: 13/10/2026  
Phạm vi: năm màn đã được Thư xác định trong prototype; không thêm, bỏ, gộp hoặc đổi thứ tự màn.

## Ranh giới thiết kế đã chốt

- Giữ nguyên chức năng, màn hình và luồng người dùng của prototype.
- Được sắp xếp lại khối nội dung trong cùng màn để rõ hành động chính, thứ bậc và trạng thái.
- Avatar theo mùa, màu sắc, huy hiệu, biểu tượng và trạng thái đạt/chưa đạt là tài sản thiết kế của Thư; không tự thay hoặc cắt.
- Thay đổi công nghệ, route nội bộ, API và database không được làm thay đổi trải nghiệm nhìn thấy.

## Đối chiếu

| Màn | Nguồn tham chiếu | Bằng chứng bản chạy | Kết quả |
|---|---|---|---|
| Home | `evidence/task-04-learning/prototype-audit/01-home.png` | `evidence/task-04-learning/design-qa/home-pass-1.png` | Đạt; giữ lộ trình T2–T6 và hành động chính. |
| Onboard | `evidence/task-04-learning/prototype-audit/02-onboard.png` | `evidence/task-04-learning/design-qa/onboard-pass-1.png` | Đạt; một form, không tách thêm màn. |
| Profile | `evidence/task-04-learning/prototype-audit/03-profile.png` | `evidence/task-04-learning/design-qa/profile-pass-4.png` | Đạt sau khi khôi phục phần nhìn sinh động. |
| Avatar | Prototype `core.js`: 8 dấu mùa × 6 màu nét × 6 màu nền | `evidence/task-04-learning/design-qa/profile-avatar-picker-pass-1.png` | Đạt; lựa chọn được lưu và đọc lại từ PostgreSQL. |
| Lesson | `evidence/task-04-learning/prototype-audit/04-lesson.png` | `evidence/task-04-learning/design-qa/lesson-pass-3.png` | Đạt; Học/Bài tập vẫn trong cùng màn. |
| Mobile | Khung nhìn 390×844 | `evidence/task-04-learning/design-qa/mobile-390-pass-1.png` | Đạt; không thấy tràn ngang ở năm màn. |

## Kiểm tra hành vi liên quan phần nhìn

- Component avatar: mở hộp chọn bằng cả hình avatar và nút **Đổi avatar**.
- Hộp chọn có nhãn, trạng thái đang chọn và thao tác Huỷ/Lưu rõ ràng.
- API chấp nhận avatar, tăng version hồ sơ, đọc lại đúng sau lần GET tiếp theo.
- Dữ liệu mẫu được khôi phục về **Nắng · nét ô liu · nền 3** sau kiểm thử.
- Huy hiệu không chỉ dựa vào màu: mỗi thẻ có icon và chữ **Đã đạt/Chưa đạt**.

Kết luận: **passed** cho phạm vi visual QA hiện có. Các màn tiếp theo chỉ được phát triển trong screen contract đã chốt.

## Xem bài làm của bài test — 21/10/2026

- Nguồn đối chiếu: ba ảnh prototype `codex-clipboard-d3f01112…`, `codex-clipboard-e14309a0…`, `codex-clipboard-9d88312f…` do người dùng cung cấp.
- Modal bản chạy được kiểm tra ở viewport 1280×720 trên local `127.0.0.1:4182`.
- Đã xác nhận cấu trúc liền mạch, không còn hai card lớn “bằng chứng/chấm điểm”; Nghe và Đọc dùng danh sách câu dày, đáp án đúng/sai là chip nhỏ; Viết và Nói chứa rubric ngay trong từng phần; nút lưu nhỏ theo prototype.
- Nhật ký xử lý và nhật ký cảnh báo đứng ngoài, trước phần “Bài làm và bằng chứng”.
- Các nhóm Part của Nghe và Questions của Đọc là disclosure thật: mặc định thu gọn, vẫn hiện điểm đạt/tổng điểm trên dòng tiêu đề và bấm mở lại được. Viết/Nói giữ nội dung và rubric hiển thị trực tiếp.
- Dữ liệu hiển thị tiếp tục lấy từ assessment detail API; không thêm dữ liệu mẫu vào ứng dụng. Fixture trực quan tạm thời chỉ dùng để chụp đối chiếu và đã được xoá.

Final result: passed

## Hồ sơ trên thẻ chờ duyệt — 21/10/2026

- Nguồn đối chiếu: ảnh prototype `codex-clipboard-5af8340c-5274-4d67-ba9b-53f8a19b1cc5.png` do người dùng cung cấp.
- Trạng thái thu gọn là đúng một dòng disclosure “Hồ sơ: …”, không có nút “Hồ sơ” riêng và không có khung/card bao quanh.
- Dữ liệu thẻ chờ duyệt được lấy từ assessment-detail và learner-profile API đang chạy; không chèn dữ liệu demo.
- Đã kiểm tra trực quan trên local `127.0.0.1:4182`; kết quả: passed.
