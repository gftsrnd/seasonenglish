# Thiết kế nhắc học hai kênh

## Mục đích

Quản lý có thể chủ động nhắc một học viên qua email Resend hoặc Base.vn và kiểm chứng từng kênh độc lập. Không gửi trùng ngoài ý muốn và không ghi nhận thành công nếu nhà cung cấp thực tế trả lỗi.

## Phạm vi đã chọn

- Mỗi học viên có hai nút riêng: **Gửi email** và **Gửi Base.vn**.
- Mỗi lần gửi tạo một bản ghi giao nhận riêng với kênh, trạng thái, thời điểm thử, kết quả và lỗi công khai an toàn.
- Thành công hoặc thất bại của một kênh không thay đổi kết quả của kênh còn lại.
- Chống bấm lặp theo từng học viên + kênh + ngày; vẫn cho phép gửi kênh còn lại.
- Cài đặt có phép thử riêng cho Resend và Base webhook. Phép thử phải gọi nhà cung cấp thật và hiển thị kết quả thật.
- Lịch sử nhắc hiển thị kênh và trạng thái riêng: đang gửi, đã gửi, đã giao (nếu nhà cung cấp có xác nhận), hoặc lỗi.

## Bảo mật và vận hành

- API key Resend và URL webhook Base không ghi cứng vào mã nguồn, không trả về trình duyệt và không xuất hiện trong log.
- Email dùng địa chỉ học viên đã lưu. Base dùng mẫu tin nhắc hiện có và webhook đã cấu hình.
- Nội dung lỗi trả cho giao diện không chứa secret hay phản hồi nhạy cảm của nhà cung cấp.

## Các cách đã cân nhắc

1. **Hai nút riêng** — đã chọn vì thử độc lập, lịch sử rõ và tránh gửi trùng.
2. Một nút gửi cả hai — loại vì dễ gửi hai tin ngoài ý muốn.
3. Base lỗi thì tự chuyển email — loại vì che lỗi kênh và không chứng minh cả hai kênh hoạt động.

## Tiêu chí hoàn thành

- Test tự động cho quyền Manager, chống lặp, trạng thái từng kênh và lỗi một phần.
- Test thật Base webhook trả HTTP thành công.
- Test thật Resend gửi tới địa chỉ thử do người dùng chỉ định hoặc một tài khoản học viên có email nhận được bên ngoài; không dùng địa chỉ `.local` để tuyên bố đã giao.
- Giao diện Manager hiển thị đúng hai nút và lịch sử theo kênh; Operator không thấy chức năng này.

## Ngoài phạm vi

- Không tự động gửi cả hai kênh.
- Không thay đổi quy tắc học viên nào đủ điều kiện nhắc.
- Không xem phản hồi HTTP 2xx là bằng chứng người dùng đã đọc tin.
