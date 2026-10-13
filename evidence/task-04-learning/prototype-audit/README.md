# Task 04 — audit nguyên mẫu learner

Ngày audit: 13/10/2026  
Nguồn: `research/seasonenglish`, dữ liệu sandbox do chính nguyên mẫu tạo.  
Phạm vi: chỉ ghi nhận màn và luồng đã có; không xem nguyên mẫu là quyết định về framework, API hay database.

## Màn được đối chiếu

| Màn đã có | Evidence | Nội dung bắt buộc giữ |
|---|---|---|
| Trang chủ | `01-home.png`, `05-home-week1.png` | Tuần hiện tại, bài hôm nay, lộ trình tuần, điểm danh, tiến độ/điều kiện lên mức và lối vào các chức năng learner |
| Hồ sơ ban đầu / sửa hồ sơ | `02-onboard.png` | Một form trong cùng route `/onboard`; thông tin cá nhân, bối cảnh dùng tiếng Anh, phong cách học và tự đánh giá |
| Tiến độ & hồ sơ | `03-profile.png` | Hồ sơ, điểm/huy hiệu, điều kiện lên mức, tiến độ theo tuần và kết quả đầu vào/cuối kỳ |
| Bài học | `04-lesson.png` | Hai trạng thái Học/Bài tập trong cùng màn; thứ tự mục tiêu → hướng dẫn → từ vựng → ngữ pháp → phát âm → bài tập → hoàn thành |
| Bài siêu ngắn | Kiểm tra source tại route `#/micro/:id` | Một màn gồm nội dung ngắn, thực hành, phản hồi và nút hoàn thành; dữ liệu do AI sinh nên sandbox chưa có bản ghi để chụp trước khi kết nối AI |

## Ràng buộc dùng khi triển khai

1. Không tách onboarding, kết quả hay trạng thái học/bài tập thành route mới.
2. Không thêm màn technical admin hoặc content review ngoài danh mục 29 màn đã khóa.
3. Mỗi nội dung có một primary action; hành động phụ giữ đúng chức năng nhưng giảm cạnh tranh thị giác.
4. Trạng thái loading, empty, error và resume nằm trong chính màn tương ứng.
5. Dữ liệu hồ sơ, bài học và tiến độ phải đến từ PostgreSQL; trình duyệt chỉ giữ session cookie.
6. Mọi cập nhật tiến độ phải có evidence lưu phía server để người học và người quản lý cùng kiểm tra được.

## Điểm cần cải thiện nhưng không đổi flow

- Trang chủ có nhiều khối cùng độ nổi; cần làm rõ bài hôm nay là hành động chính.
- Form hồ sơ dài; giữ một màn nhưng chia nhóm rõ, có trạng thái lưu và thông báo lỗi tại chỗ.
- Màn bài học cần giữ đúng thứ tự, đồng thời cho biết phần đã hoàn thành và khả năng tiếp tục từ lần trước.
- Trang tiến độ có nhiều số liệu; dùng heading, nhãn và progress semantics thay vì chỉ dựa vào màu.
- Các nút âm thanh và lựa chọn phải có tên truy cập được, focus rõ và vùng bấm đủ lớn.
