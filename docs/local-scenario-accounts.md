# Tài khoản tình huống E4S — local và Render

Danh sách bên dưới dùng chung cho local và bản demo Render. Mỗi tài khoản giữ đúng trạng thái kiểm thử; tài khoản chưa được duyệt mức vẫn chờ duyệt trước khi vào tuần học và Mini game.

Trên Render, `scripts/prepare-local.ts` tạo tài khoản khi API khởi động nếu có cả `E4S_SEED_SCENARIOS=true` và `E4S_ALLOW_REMOTE_SCENARIOS=true`. Hai biến này đã được khai báo trong `render.yaml`; service được cấu hình thủ công cần nhập chúng vào service API. Seeder chạy trong một transaction và chỉ reset dữ liệu của các ID scenario cố định.

Lệnh dưới đây dùng cho local; `prepare-local-scenarios.ts` vẫn từ chối production hoặc database ngoài local:

```powershell
$env:E4S_ALLOW_LOCAL_SCENARIOS = "true"
$env:DATABASE_URL = "postgres://e4s:e4s_password@127.0.0.1:5432/e4s"
pnpm prepare:local-scenarios
```

- PIN dùng chung cho toàn bộ learner: `246810`.
- Mật khẩu cho tài khoản vận hành và quản lý trong bảng: `review-pass`.
- Múi giờ nghiệp vụ của fixture: `Asia/Ho_Chi_Minh`.

## Tài khoản local cơ bản

| Vai trò | Họ tên | Email | PIN / mật khẩu |
| --- | --- | --- | --- |
| Learner | Nguyễn Minh Anh | `minh.anh.nguyen@e4s.local` | PIN `246810` |
| Operator | Trần Thu Hà | `thu.ha.tran@e4s.local` | `staff-pass` |
| Manager | Lê Quốc Bảo | `quoc.bao.le@e4s.local` | `manager-pass` |

## Ma trận tài khoản tình huống

| Khóa tình huống | Họ tên | Email | Trạng thái kiểm thử |
| --- | --- | --- | --- |
| `learner-onboarding-new` | Nguyễn Khánh Linh | `khanh.linh.nguyen@scenario.e4s.local` | Hồ sơ onboarding chưa hoàn tất |
| `learner-placement-new` | Trần Minh Quân | `minh.quan.tran@scenario.e4s.local` | Chưa bắt đầu test đầu vào |
| `learner-placement-listening` | Lê Hoàng Anh | `hoang.anh.le@scenario.e4s.local` | Đang ở phần Nghe |
| `learner-placement-reading` | Phạm Thu Trang | `thu.trang.pham@scenario.e4s.local` | Đang ở phần Đọc |
| `learner-placement-writing` | Vũ Đức Long | `duc.long.vu@scenario.e4s.local` | Đang ở phần Viết |
| `learner-placement-speaking` | Đỗ Ngọc Mai | `ngoc.mai.do@scenario.e4s.local` | Đang ở phần Nói |
| `learner-placement-submitted` | Bùi Gia Hân | `gia.han.bui@scenario.e4s.local` | Đã nộp, chưa vào hàng đợi chấm |
| `learner-placement-review` | Hồ Anh Tuấn | `anh.tuan.ho@scenario.e4s.local` | Đã có điểm AI; chờ vận hành duyệt mức |
| `learner-placement-borderline` | Dương Mỹ Linh | `my.linh.duong@scenario.e4s.local` | Đã chấm tay; điểm biên chờ vận hành quyết định |
| `learner-lesson-b1` | Võ Thành Nam | `thanh.nam.vo@scenario.e4s.local` | B1 đã duyệt; 5 bài publish và bộ từ Mini game B1; cuối tuần còn khóa khi chưa học đủ |
| `learner-lesson-attempts` | Nguyễn Quỳnh Anh | `quynh.anh.nguyen@scenario.e4s.local` | A2; bài đầu đang làm, phần Nghe có 2 lượt sai thật và đã hết lượt; có bộ từ Mini game |
| `learner-weekly` | Trương Hải Yến | `hai.yen.truong@scenario.e4s.local` | A2; 5/5 bài hoàn thành, bài cuối tuần mở để làm; có bộ từ Mini game |
| `learner-level-ready` | Đặng Quốc Việt | `quoc.viet.dang@scenario.e4s.local` | A2; hoàn thành bài, đúng lần đầu, bài cuối tuần đã chấm 100/100 và 6 lượt coach rubric 5/5; đủ điều kiện lên B1 theo ngưỡng mặc định |
| `learner-history` | Ngô Thanh Thảo | `thanh.thao.ngo@scenario.e4s.local` | A2; có lịch sử hoạt động và 5 bài hoàn thành; bài cuối tuần mở; có bộ từ Mini game |
| `learner-reminder` | Mai Đức Thịnh | `duc.thinh.mai@scenario.e4s.local` | A2 đã duyệt; có tuần học, bộ từ Mini game và nhắc học đang chờ gửi; chưa hoàn thành bài |
| `learner-appeal` | Tạ Bảo Trâm | `bao.tram.ta@scenario.e4s.local` | Có kháng nghị kết quả đang chờ xử lý |
| `operator-review` | Phan Minh Châu | `minh.chau.phan@scenario.e4s.local` | Vận hành chấm tay và duyệt mức |
| `manager-review` | Lý Quốc Hưng | `quoc.hung.ly@scenario.e4s.local` | Quản lý kiểm tra báo cáo, nhắc học và kháng nghị |

## Bộ từ và kiểm tra dữ liệu

Nhóm đã duyệt mức được tạo bộ từ riêng từ vocabulary của các bài đã publish đúng tuần/mức. Bộ từ có ID ổn định, được tạo lại sau khi reset và không lấy dữ liệu của người dùng thật. Người học vẫn có thể nhập topic tự nhiên để sinh bộ từ riêng qua chức năng hiện có. Tuần chưa publish bài đúng mức vẫn chờ nội dung; seeder không mở khóa các tài khoản onboarding/placement.

Tiến độ của Hải Yến và Quỳnh Anh bám tuần hiện tại khi tuần đó có bài đã publish. Quốc Việt có đủ bằng chứng cho toàn bộ các tuần A2 đã publish. Nếu đổi ngưỡng lên mức vượt cấu hình mặc định hoặc thu hồi đề thi B1, điều kiện thực tế trên màn hình có thể thay đổi.

Chạy đối soát trên PostgreSQL tạm (không dùng database ứng dụng):

```powershell
pnpm test scripts/local-scenario-accounts.integration.test.ts scripts/local-scenario-accounts.test.ts
```

Test kiểm tra cả 16 learner, điều kiện khóa/mở, bộ từ, lượt làm thật, khả năng lên mức, đổi tuần, khôi phục dữ liệu thiếu và tính ổn định khi seed nhiều lần.

Chạy lại seeder sẽ reset dữ liệu tình huống và thu hồi session cũ; trên Render điều này cũng xảy ra khi API khởi động lại với hai biến seed bật. Công cụ cleanup nhận diện để xóa cả tài khoản tình huống cũ và mới bằng UUID/email trong danh sách chính xác; một email người dùng bất kỳ không bị xóa chỉ vì dùng cùng domain. Ba tài khoản local cơ bản được giữ lại để nhận quyền sở hữu dữ liệu dùng chung. Luôn chạy dry-run và kiểm tra báo cáo trước khi dùng `--apply`.
