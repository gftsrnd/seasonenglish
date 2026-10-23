# Thiết kế đăng ký, PIN và khôi phục tài khoản người học

## Mục tiêu

- Người học chỉ dùng email và PIN đúng 6 chữ số; bỏ mật khẩu 8 ký tự của người học.
- Nhân sự (Operator và Manager) tiếp tục dùng mật khẩu tối thiểu 8 ký tự.
- Lỗi nhập liệu xuất hiện ngay dưới đúng trường, không gom thành bảng lỗi chung.
- Khôi phục PIN bằng OTP gửi email thật qua Resend; Manager chỉ nhận thông báo kiểm toán sau khi đổi PIN thành công.

## Phương án

### Đã chọn: một loại thông tin đăng nhập cho mỗi nhóm vai trò

- Người học: email + PIN 6 số.
- Operator/Manager: email + mật khẩu tối thiểu 8 ký tự.
- Ưu điểm: giao diện rõ ràng, không bắt người học nhớ cả mật khẩu và PIN, vẫn giữ bảo mật phù hợp hơn cho tài khoản nhân sự.

### Không chọn: mật khẩu lần đầu rồi chuyển sang PIN

Phải lưu và giải thích hai loại thông tin đăng nhập, khó hiểu khi khôi phục và dễ tạo trạng thái tài khoản không nhất quán.

### Không chọn: PIN 6 số cho mọi vai trò

PIN ngắn không phù hợp với tài khoản Operator/Manager có quyền quản trị cao.

## Đăng ký người học

1. Nhập họ tên, email, PIN 6 số và xác nhận PIN.
2. Họ tên phải có ít nhất hai thành phần; chỉ nhận chữ Unicode, khoảng trắng, dấu gạch nối và dấu nháy tên. Không nhận số.
3. Email sai định dạng báo dưới ô Email.
4. Email đã tồn tại hoặc không thể dùng báo chung: **“Email này không khả dụng. Hãy dùng email khác.”** Không tiết lộ trạng thái hoặc chủ tài khoản.
5. PIN chỉ nhận đúng 6 chữ số; xác nhận PIN phải trùng.
6. Sau khi dữ liệu hợp lệ, hệ thống gửi OTP tới email để xác minh trước khi kích hoạt tài khoản.

## Giao diện nhập liệu

- Placeholder họ tên: `Nguyễn Minh Anh`.
- Placeholder email: `ten@congty.com`.
- PIN và OTP dùng một input thật với `inputMode="numeric"`, nhưng trình bày thành 6 vị trí/chấm để dễ nhìn, dán mã và hỗ trợ trình đọc màn hình.
- Mỗi lỗi hiển thị ngay dưới trường liên quan và trường có `aria-invalid`/`aria-describedby`.
- Lỗi mạng hoặc lỗi hệ thống không gắn được với một trường sẽ hiển thị gần nút gửi.
- Cảnh báo Caps Lock áp dụng cho email và mật khẩu nhân sự; không hiển thị cho PIN/OTP chỉ gồm số.

## Quên PIN

1. Người học bấm **Quên PIN** và nhập email.
2. Hệ thống luôn trả thông báo trung tính: **“Nếu email hợp lệ, mã xác minh đã được gửi.”** để tránh dò tài khoản.
3. Resend gửi OTP 6 số. OTP hết hạn sau 10 phút, chỉ dùng một lần và không lưu dạng rõ trong cơ sở dữ liệu.
4. Người học nhập OTP, sau đó nhập PIN 6 số mới và xác nhận.
5. Khi đổi PIN thành công, mọi phiên đăng nhập cũ của người học bị thu hồi.
6. Manager nhận thông báo gồm người dùng, thời điểm và kết quả đổi PIN. Manager không duyệt, không nhận OTP và không xem PIN.

## Bảo mật và giới hạn

- Giới hạn số lần gửi OTP, xác minh OTP và đăng nhập PIN; khoá tạm thời khi thử sai liên tục.
- Không ghi PIN, OTP hoặc API key vào log.
- `RESEND_API_KEY` và địa chỉ gửi được đọc từ Environment của Render.
- Local dùng chế độ email test rõ ràng; production không được giả lập gửi thành công khi Resend lỗi.
- Manager vẫn có thể quản lý trạng thái tài khoản; thao tác khôi phục của người học không biến Manager thành bước phê duyệt.

## Kiểm thử chấp nhận

- Tên một chữ, có số hoặc chỉ ký tự đặc biệt bị chặn ở UI và API.
- Email trùng bị chặn ở API và hiện đúng lỗi ngay dưới Email.
- Người học không thể đăng ký hoặc đăng nhập bằng PIN khác đúng 6 số.
- Operator/Manager vẫn đăng nhập bằng mật khẩu tối thiểu 8 ký tự.
- OTP hết hạn, sai quá số lần hoặc đã dùng lại đều bị từ chối.
- Đổi PIN thành công thu hồi phiên cũ, đăng nhập được bằng PIN mới và tạo đúng một thông báo cho Manager.
- Resend lỗi phải báo có thể thử lại, không tạo tài khoản hoặc đổi PIN nửa chừng.

## Ngoài phạm vi

- Không cho Manager xem PIN hoặc OTP.
- Không dùng PIN 6 số cho Operator/Manager.
- Không thay đổi nội dung bài học hoặc các luồng sau đăng nhập trong hạng mục này.
