# Task 04 — learner profile, home, lesson và progress

Ngày xác minh: 13/10/2026  
Phạm vi: 5 màn đã có trong screen contract của Thư: `/onboard`, `/home`, `/lesson/:id`, `/micro/:id`, `/profile`. Không thêm, bỏ, gộp hoặc đổi thứ tự màn.

## Kết luận

- Hồ sơ, avatar, tuần học, bài học, tiến độ, điểm, huy hiệu, readiness, placement snapshot và micro-practice đều đọc/ghi qua API và PostgreSQL.
- Phần nhận diện sinh động của prototype được bảo toàn: avatar có 8 biểu tượng, 6 màu nét, 6 màu nền; huy hiệu vẫn có biểu tượng, trạng thái đạt/chưa đạt và được nhóm theo mùa. Đây là phạm vi thiết kế của Thư, không tự ý giản lược.
- Lesson giữ hai trạng thái **Học / Bài tập trong cùng màn**, đúng thứ tự nội dung đã audit; tiến độ được resume từ server.
- Micro lesson giữ **nội dung → thực hành → phản hồi → hoàn thành trong cùng màn**; đáp án, phản hồi và thời điểm hoàn thành vẫn còn sau reload.
- Home giữ đủ bài hôm nay, lộ trình T2–T6, điểm danh, Coach, bài tuần, readiness và bài cuối kỳ. Sai lệch T1–T5 đã có test RED rồi sửa thành T2–T6.
- Responsive 390px đã kiểm tra cho cả 5 màn. Lỗi nav phải cuộn ngang đã được chụp RED, sửa thành lưới 3+2 và chụp GREEN.

## Đối chiếu từng màn

| Màn | Prototype của Thư | Bản chạy đã kiểm tra | Evidence chính |
|---|---|---|---|
| Home | `prototype-audit/01-home.png`, `05-home-week1.png` | Đủ dữ liệu tuần, T2–T6, primary action, activity, readiness, final | `implementation/07-home-fidelity-desktop.png`, `13-home-mobile-390-green.png`, `api-trace.json` |
| Onboard | `prototype-audit/02-onboard.png` | Một form; đủ bối cảnh, cách học, lịch, persona, trình độ, chứng chỉ | `implementation/09a-onboard-top-desktop.png`, `09b-onboard-mid-desktop.png`, `09c-onboard-bottom-desktop.png`, `14-onboard-mobile-390.png` |
| Profile | `prototype-audit/03-profile.png` | Hồ sơ, avatar tùy chỉnh, season, badge, readiness, tuần học, placement → final | `design-qa/profile-pass-4.png`, `design-qa/profile-avatar-picker-pass-1.png`, `implementation/14-profile-mobile-390.png` |
| Lesson | `prototype-audit/04-lesson.png` | Học/Bài tập trong cùng route; lưu/resume từng phần trên server | `implementation/10a-lesson-study-desktop.png`, `10b-lesson-exercises-top-desktop.png`, `10c-lesson-exercises-bottom-desktop.png`, `14-lesson-mobile-390.png` |
| Micro | Source route `#/micro/:id` trong prototype | Nội dung, lựa chọn, phản hồi, hoàn thành và reload trong cùng route | `implementation/11-micro-persisted-desktop.png`, `14-micro-mobile-390.png`, `api-trace.json` |

`implementation/12-home-mobile-390.png` là bằng chứng RED của nav cuộn ngang; `implementation/13-home-mobile-390-green.png` là bằng chứng sau sửa. Harness iframe 390px chỉ dùng trong lúc audit và đã được xoá khỏi source sản phẩm.

## Test và trace

- RED: `red.log`, `fidelity-red-api.log`, `fidelity-red-web.log`, `weekday-label-red.log`.
- GREEN mục tiêu: `targeted-green.log`, `fidelity-green-*.log`, `weekday-label-green.log`.
- Full regression gần nhất: 11 test files, 50/50 tests pass; gồm kiểm thử avatar qua UI và vòng ghi/đọc lại qua API.
- Typecheck: `fidelity-typecheck-2.log` — exit 0.
- Production build: `fidelity-build-2.log` — exit 0.
- API runtime trace: `api-trace.json`; không lưu cookie hoặc secret.

## Triple-check đã thực hiện

1. **Contract/code:** test screen contract và component/API/domain/repository.
2. **Runtime/data:** gọi API local có session learner, đối chiếu dữ liệu trả về và reload micro lesson.
3. **Visual:** xem trực tiếp desktop và khung 390px; đối chiếu ảnh prototype; chỉ nhận ảnh GREEN sau khi sửa nhãn thứ và mobile nav.
