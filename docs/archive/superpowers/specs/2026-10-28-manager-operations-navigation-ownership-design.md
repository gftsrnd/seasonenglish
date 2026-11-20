# Manager Operations Navigation and Ownership Design

## Intent

Quản lý cần một thanh điều hướng chung để mở toàn bộ các màn vận hành ở chế độ chỉ đọc, đồng thời bảng hiệu suất phải cho biết rõ phần việc nào do Operator nào soạn và phần việc nào do Operator nào duyệt.

## Goals

- Hiển thị một thanh chung trên `/mgr/ops` gồm: Duyệt mức, Chủ đề tuần, Bài học, Bài tuần, Bài kiểm tra.
- Giữ cùng thanh này trên mọi màn `/mgr/ops/*`.
- Tách số liệu người soạn và người duyệt; không gộp một bộ bài cho cả hai vai trò.
- Giữ các màn vận hành của Quản lý ở chế độ chỉ đọc.

## Non-goals

- Không tạo một bộ nút riêng cho từng Operator.
- Không cho Quản lý thao tác tạo, sửa, duyệt hoặc phát hành từ các màn chỉ đọc.
- Không thay đổi quyền của Operator.

## Chosen approach

Giữ một thanh điều hướng dùng chung và bảng hiệu suất theo từng Operator. Trong bảng, `created_by` quyết định số bộ/bài đã soạn; `approved_by` quyết định số bộ đã duyệt. Nếu hai người khác nhau, cùng một bộ xuất hiện trong hai trách nhiệm khác nhau nhưng không bị cộng gộp sai cho mỗi người.

## Display rules

- Tóm tắt Operator ghi rõ `Soạn: X bộ · Y bài` và `Duyệt: Z bộ`.
- Bảng theo tuần dùng cột `Bộ đã soạn`, `Số bài`, `Bộ đã duyệt`.
- Chất lượng qua kết quả học viên được quy cho người soạn nội dung.
- Các lượt duyệt mức, đọc mẫu và kiểm phản hồi Coach tiếp tục quy cho người thực hiện hành động.
- Dữ liệu cũ không có `created_by` hoặc `approved_by` không được tự gán cho một Operator.

## Constraints

- Không làm mất các thay đổi đang có trong worktree.
- Dùng contract hiện tại; chỉ đổi nghĩa truy vấn của các trường `sets`, `lessons`, `published` từ gộp vai trò sang tách vai trò.
- Có test hồi quy cho trường hợp Operator A soạn và Operator B duyệt.

