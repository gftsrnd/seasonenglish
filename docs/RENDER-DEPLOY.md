# Deploy E4S lên Render

Blueprint `render.yaml` tạo API và static Web. API tự chạy migration, seed ba tài khoản demo và bộ tài khoản tình huống cố định trước khi khởi động. Việc seed tài khoản tình huống chỉ được mở rõ ràng bằng hai biến `E4S_SEED_SCENARIOS=true` và `E4S_ALLOW_REMOTE_SCENARIOS=true` trong blueprint; chạy lại là idempotent với các ID fixture cố định.

## Biến cần nhập trên Render

Trong service `e4s-api`, nhập các secret có `sync: false`:

- `DATABASE_URL`
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `ANTHROPIC_API_KEY` và/hoặc `GROQ_API_KEY`
- `RESEND_API_KEY`: key thật lấy từ Resend
- `RESEND_FROM_EMAIL`: địa chỉ gửi đã xác minh, ví dụ `E4S <hello@your-domain.com>`; chỉ dùng `onboarding@resend.dev` khi tài khoản Resend còn ở chế độ thử nghiệm

Không đặt các key này ở service Web và không commit giá trị thật vào Git.

## Sau deploy

1. Kiểm tra `https://e4s-api.onrender.com/api/readiness` trả trạng thái sẵn sàng.
2. Mở `https://e4s-web.onrender.com` và đăng nhập một tài khoản trong `docs/local-scenario-accounts.md`.
3. Kiểm tra quên PIN bằng email thật. Nếu Resend từ chối người nhận, xác minh domain gửi hoặc dùng email được Resend cho phép trong chế độ thử nghiệm.
