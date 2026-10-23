# Tài khoản kịch bản local E4S

Các tài khoản này chỉ được tạo trong cơ sở dữ liệu local bằng Docker/WSL. Seeder từ chối môi trường production và database không phải local.

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
| `learner-lesson-b1` | Võ Thành Nam | `thanh.nam.vo@scenario.e4s.local` | Learner B1 đã duyệt mức |
| `learner-lesson-attempts` | Nguyễn Quỳnh Anh | `quynh.anh.nguyen@scenario.e4s.local` | Bài học đang làm, có lượt sai trước đó |
| `learner-weekly` | Trương Hải Yến | `hai.yen.truong@scenario.e4s.local` | Đủ 5 bài để mở bài cuối tuần |
| `learner-level-ready` | Đặng Quốc Việt | `quoc.viet.dang@scenario.e4s.local` | Tiến độ cao để kiểm thử điều kiện lên mức |
| `learner-history` | Ngô Thanh Thảo | `thanh.thao.ngo@scenario.e4s.local` | Có lịch sử hoàn thành bài |
| `learner-reminder` | Mai Đức Thịnh | `duc.thinh.mai@scenario.e4s.local` | Có nhắc học đang chờ gửi |
| `learner-appeal` | Tạ Bảo Trâm | `bao.tram.ta@scenario.e4s.local` | Có kháng nghị kết quả đang chờ xử lý |
| `operator-review` | Phan Minh Châu | `minh.chau.phan@scenario.e4s.local` | Vận hành chấm tay và duyệt mức |
| `manager-review` | Lý Quốc Hưng | `quoc.hung.ly@scenario.e4s.local` | Quản lý kiểm tra báo cáo, nhắc học và kháng nghị |

Chạy lại lệnh trên sẽ reset đúng dữ liệu tình huống và thu hồi session cũ. Công cụ cleanup nhận diện để xóa cả tài khoản tình huống cũ và mới bằng UUID/email trong danh sách chính xác; một email người dùng bất kỳ không bị xóa chỉ vì dùng cùng domain. Ba tài khoản local cơ bản được giữ lại để nhận quyền sở hữu dữ liệu dùng chung. Luôn chạy dry-run và kiểm tra báo cáo trước khi dùng `--apply`.
